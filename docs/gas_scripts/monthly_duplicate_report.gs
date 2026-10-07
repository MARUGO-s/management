// 月次「重複チェック」報告（本番GASの MonthlyDuplicateReport.js と同じ内容。判定は DuplicateCheck.js =
// リポジトリの js/duplicate-check.js をそのまま置いたもの）。
//
// 毎月1日 6時台（日本時間）に前月分の重複・入力ミスの疑いを集計し、LINE Report の mtalk-loan-report へ送る。
// M-talk の「貸借管理 報告」Bot として、全権管理者との1対1と Bot を招待したルームに届く。
// 入力者名は送らない（日付・店舗・品目・金額・件数だけ）。
//
// スクリプトプロパティ:
//   LOAN_MTALK_TOKEN  LINE Report の secret と同じ値（32文字以上）。コード・ログには書かない
//   LOAN_MTALK_URL    省略時は LOAN_REPORT_URL_DEFAULT
//
// 使い方（GAS の画面で関数を選んで実行）:
//   setupMonthlyDuplicateReport  毎月1日 6時台の予約を登録し直し、送らずに送り先とカードを確認する（初回は権限の許可が出る）
//   testMonthlyDuplicateReport   送らずに確認する（dry_run）
//   monthlyDuplicateReport       予約から呼ばれる本番の送信

const LOAN_REPORT_URL_DEFAULT = 'https://hocbnifuactbvmyjraxy.supabase.co/functions/v1/mtalk-loan-report';
const LOAN_REPORT_PATH = '/report';
const LOAN_REPORT_APP_URL = 'https://marugo-s.github.io/management/pages/marugo.html';
const LOAN_REPORT_TIME_ZONE = 'Asia/Tokyo';
const LOAN_REPORT_HANDLER = 'monthlyDuplicateReport';

function monthlyDuplicateReport() {
  return sendDuplicateReport_(false);
}

function testMonthlyDuplicateReport() {
  return sendDuplicateReport_(true);
}

function setupMonthlyDuplicateReport() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === LOAN_REPORT_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(LOAN_REPORT_HANDLER).timeBased().onMonthDay(1).atHour(6).inTimezone(LOAN_REPORT_TIME_ZONE).create();
  console.log('毎月1日 6時台の予約を登録しました');
  return testMonthlyDuplicateReport();
}

function sendDuplicateReport_(dryRun) {
  const properties = PropertiesService.getScriptProperties();
  const token = String(properties.getProperty('LOAN_MTALK_TOKEN') || '').trim();
  if (token.length < 32) throw new Error('スクリプトプロパティ LOAN_MTALK_TOKEN が未設定です');
  const url = String(properties.getProperty('LOAN_MTALK_URL') || LOAN_REPORT_URL_DEFAULT).replace(/\/+$/, '') + LOAN_REPORT_PATH;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TARGET_SHEET_NAME);
  const values = sheet.getRange(1, 1, sheet.getLastRow(), 11).getDisplayValues();
  const payload = buildDuplicateReportPayload_(DuplicateCheck.rowsFromSheetValues(values), new Date(), formatJst_);
  payload.dry_run = dryRun === true;

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: body,
    headers: {
      Authorization: 'Bearer ' + token,
      'X-Mtalk-Timestamp': timestamp,
      'X-Mtalk-Signature': signLoanReport_(token, timestamp, body)
    },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  console.log('重複チェック報告 ' + (dryRun ? '（確認のみ）' : '') + status + ': ' + text.slice(0, 3000));
  // 失敗は例外にして、予約の失敗通知（GAS の通知メール）で気付けるようにする。同じ月をやり直しても二重には届かない
  if (status !== 200) throw new Error('重複チェック報告を送れませんでした（' + status + '）');
  return JSON.parse(text);
}

function formatJst_(date, pattern) {
  return Utilities.formatDate(date, LOAN_REPORT_TIME_ZONE, pattern);
}

// mtalk-external-post / mtalk-loan-report と同じ署名: v1=HMAC-SHA256(token, "v1:<ts>:POST:/report:<body>") の16進
function signLoanReport_(token, timestamp, body) {
  const message = 'v1:' + timestamp + ':POST:' + LOAN_REPORT_PATH + ':' + body;
  const bytes = Utilities.computeHmacSha256Signature(message, token, Utilities.Charset.UTF_8);
  return 'v1=' + bytes.map(b => ((b & 0xff) + 0x100).toString(16).slice(1)).join('');
}

// メールアドレス・電話番号らしき文字列か（LINE Report の looksLikePersonalInfo と同じ判定。該当する要点は載せない。
// 受け口でも同じ判定で 422 になるため、品目名に紛れていても報告全体が止まらないようにする）
function looksLikePersonalInfo_(text) {
  const s = String(text || '').normalize('NFKC');
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)) return true;
  const m = /(?:^|[^\d])(?:0\d{1,4}[-‐‑–—−ー－\s]?\d{1,4}[-‐‑–—−ー－\s]?\d{3,4}|\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})(?:[^\d]|$)/.exec(s);
  if (!m) return false;
  const digits = m[0].replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 12;
}

// 前月分の報告（M-talk のカードに載せる見出し・項目・要点）を組み立てる。
// rows は DuplicateCheck.rowsFromSheetValues の結果、format(date, pattern) は日本時間の書式化。
function buildDuplicateReportPayload_(rows, now, format) {
  const thisMonth = format(now, 'yyyy-MM').split('-').map(Number);
  const year = thisMonth[1] === 1 ? thisMonth[0] - 1 : thisMonth[0];
  const month = thisMonth[1] === 1 ? 12 : thisMonth[1] - 1;
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = year + '-' + mm + '-01';
  const end = year + '-' + mm + '-' + String(lastDay).padStart(2, '0');

  const result = DuplicateCheck.findSuspects(rows);
  const inMonth = DuplicateCheck.filterGroupsByPeriod(result.groups, start, end);
  const summary = DuplicateCheck.summarize(inMonth);
  const older = result.groups.filter(group => group.level !== 'check' && inMonth.indexOf(group) < 0 &&
    group.rows.every(row => row.date < start));
  const olderSummary = DuplicateCheck.summarize(older);

  const yen = value => '¥' + Math.round(value).toLocaleString('ja-JP');
  const safe = text => !looksLikePersonalInfo_(text);
  const describe = group => {
    const row = group.rows[0];
    const head = row.date + ' ' + row.lender + '→' + row.borrower + ' ' + row.item;
    if (group.eitherSide) return group.kind + '・' + group.duplicateRows.length + '品 ' + yen(group.extraAmount);
    return head + ' ' + yen(row.amount) + (group.rows.length > 1 ? ' ×' + group.rows.length : '');
  };
  const topItems = (groups, count) => groups.slice()
    .sort((a, b) => b.extraAmount - a.extraAmount || String(b.rows[0].date).localeCompare(String(a.rows[0].date)))
    .map(describe).filter(safe).slice(0, count);
  const levelGroups = level => inMonth.filter(group => group.level === level);

  const sections = [];
  if (summary.high.groups > 0) {
    sections.push({
      heading: '重複の疑いが強い',
      fields: [
        { label: '重複', value: summary.high.duplicateRows + '件（' + summary.high.groups + 'グループ）' },
        { label: '重複分', value: yen(summary.high.extraAmount) }
      ],
      items: topItems(levelGroups('high'), 5)
    });
  }
  if (summary.medium.groups > 0) {
    sections.push({
      heading: '重複の可能性',
      fields: [
        { label: '重複', value: summary.medium.duplicateRows + '件（' + summary.medium.groups + 'グループ）' },
        { label: '重複分', value: yen(summary.medium.extraAmount) }
      ],
      items: topItems(levelGroups('medium'), 3)
    });
  }
  if (summary.check.groups > 0) {
    const kinds = {};
    levelGroups('check').forEach(group => { kinds[group.kind] = (kinds[group.kind] || 0) + 1; });
    sections.push({
      heading: '要確認（入力ミスの可能性）',
      fields: Object.keys(kinds).slice(0, 8).map(kind => ({ label: kind.replace(/（.*$/, '').slice(0, 24), value: kinds[kind] + '件' })),
      items: []
    });
  }
  if (!sections.length) {
    sections.push({ heading: '結果', fields: [{ label: '重複の疑い', value: 'ありませんでした' }], items: [] });
  }
  if (olderSummary.high.groups + olderSummary.medium.groups > 0) {
    sections.push({
      heading: '前月より前の未処理',
      fields: [
        { label: '疑いが強い', value: olderSummary.high.duplicateRows + '件・' + yen(olderSummary.high.extraAmount) },
        { label: '可能性', value: olderSummary.medium.duplicateRows + '件・' + yen(olderSummary.medium.extraAmount) }
      ],
      items: []
    });
  }

  return {
    dedupe_key: 'loan-duplicate:' + year + '-' + mm,
    title: '重複チェック（' + year + '年' + month + '月分）',
    subtitle: start.replace(/-/g, '/') + '〜' + end.replace(/-/g, '/') + ' · ' + format(now, 'M/d HH:mm') + ' 作成',
    sections: sections.slice(0, 4),
    note: '重複と確認できた行は、貸借管理の「店舗別貸借分析」→「重複チェック」で行を選び、逆取引修正で取り消してください（行は削除しません）。修正で取り消し済みの行は数えていません。',
    links: [{ label: '重複チェックを開く', url: LOAN_REPORT_APP_URL }]
  };
}
