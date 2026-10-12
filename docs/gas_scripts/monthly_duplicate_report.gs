// 月次「重複チェック」報告（GASの MonthlyDuplicateReport.js 用ソース。反映・予約有効化は別途確認）。
// 判定は DuplicateCheck.js = リポジトリの js/duplicate-check.js をそのまま置いたもの。
//
// 毎月1日 6時台（日本時間）に前月を主対象として報告し、前々月の追加・未確認候補を別枠で補足する。
// LINE Report の mtalk-loan-report へ送る（管理アプリのSupabaseとは別プロジェクト）。
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

// 主対象は前月1日〜末日（例: 11/1 → 10/1〜10/31）。前々月は別枠の補足。
// previousReport は前月1日 6:00 の固定基準で、前回の実送信日時ではない。
function duplicateReportPeriod_(now, format) {
  const parts = format(now, 'yyyy-MM').split('-').map(Number);
  const shift = back => {
    const total = parts[0] * 12 + (parts[1] - 1) - back;
    return { year: Math.floor(total / 12), month: total % 12 + 1 };
  };
  const first = shift(2);
  const last = shift(1);
  const pad = n => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(last.year, last.month, 0)).getUTCDate();
  return {
    first: first,
    last: last,
    start: last.year + '-' + pad(last.month) + '-01',
    end: last.year + '-' + pad(last.month) + '-' + pad(lastDay),
    supplementaryStart: first.year + '-' + pad(first.month) + '-01',
    supplementaryEnd: first.year + '-' + pad(first.month) + '-' + pad(new Date(Date.UTC(first.year, first.month, 0)).getUTCDate()),
    // 旧2か月版と同じキーを維持し、同じ回の再実行・切替で二重送信しない。
    key: first.year + '-' + pad(first.month) + '_' + last.year + '-' + pad(last.month),
    label: last.year + '年' + last.month + '月分',
    previousReport: last.year + '/' + pad(last.month) + '/01 06:00:00'
  };
}

// 前月優先の報告（M-talk のカードに載せる見出し・項目・要点）を組み立てる。
// rows は DuplicateCheck.rowsFromSheetValues の結果、format(date, pattern) は日本時間の書式化。
// 月をまたぐグループは前月を優先して1回だけ載せる。確認済みの状態は持たない。
function buildDuplicateReportPayload_(rows, now, format) {
  const period = duplicateReportPeriod_(now, format);
  const start = period.start;
  const end = period.end;
  const previousReportTime = DuplicateCheck.parseInputTime(period.previousReport);

  const result = DuplicateCheck.findSuspects(rows);
  const inPeriod = DuplicateCheck.filterGroupsByPeriod(result.groups, start, end);
  const summary = DuplicateCheck.summarize(inPeriod);
  const supplementary = DuplicateCheck.filterGroupsByPeriod(result.groups, period.supplementaryStart, period.supplementaryEnd)
    .filter(group => inPeriod.indexOf(group) < 0);
  const supplementarySummary = DuplicateCheck.summarize(supplementary);
  const isNew = group => group.rows.some(row => DuplicateCheck.parseInputTime(row.inputDate) >= previousReportTime);

  const yen = value => '¥' + Math.round(value).toLocaleString('ja-JP');
  const safe = text => !looksLikePersonalInfo_(text);
  const describe = (group, isSupplementary) => {
    const row = group.rows[0];
    const mark = isSupplementary && isNew(group) ? '【追加】' : '';
    if (group.level === 'check') return mark + row.date + ' ' + row.lender + '→' + row.borrower + ' ' + row.item + ' 要確認：' + group.kind;
    if (group.eitherSide) return mark + group.kind + '・' + group.duplicateRows.length + '品 ' + yen(group.extraAmount);
    return mark + row.date + ' ' + row.lender + '→' + row.borrower + ' ' + row.item + ' ' + yen(row.amount) +
      (group.rows.length > 1 ? ' ×' + group.rows.length : '');
  };
  const topItems = (groups, count, isSupplementary) => groups.slice()
    .sort((a, b) => b.extraAmount - a.extraAmount || String(b.rows[0].date).localeCompare(String(a.rows[0].date)))
    .map(group => describe(group, isSupplementary)).filter(safe).slice(0, count)
    .map(text => text.length > 200 ? text.slice(0, 199) + '…' : text);
  const levelGroups = level => inPeriod.filter(group => group.level === level);

  const sections = [];
  if (summary.high.groups > 0) {
    sections.push({
      heading: '前月：重複の疑いが強い',
      fields: [
        { label: '候補行', value: summary.high.duplicateRows + '件（' + summary.high.groups + 'グループ）' },
        { label: '参考候補額', value: yen(summary.high.extraAmount) }
      ],
      items: topItems(levelGroups('high'), 5)
    });
  }
  if (summary.medium.groups > 0) {
    sections.push({
      heading: '前月：重複の可能性',
      fields: [
        { label: '候補行', value: summary.medium.duplicateRows + '件（' + summary.medium.groups + 'グループ）' },
        { label: '参考候補額', value: yen(summary.medium.extraAmount) }
      ],
      items: topItems(levelGroups('medium'), 3)
    });
  }
  if (summary.check.groups > 0) {
    const kinds = {};
    levelGroups('check').forEach(group => { kinds[group.kind] = (kinds[group.kind] || 0) + 1; });
    sections.push({
      heading: '前月：要確認（入力ミスの可能性）',
      fields: Object.keys(kinds).slice(0, 8).map(kind => ({ label: kind.replace(/（.*$/, '').slice(0, 24), value: kinds[kind] + '件' })),
      items: []
    });
  }
  if (!sections.length) {
    sections.push({ heading: '前月：結果', fields: [{ label: '重複の疑い', value: 'ありませんでした' }], items: [] });
  }
  if (supplementary.length > 0) {
    sections.push({
      heading: '補足：' + period.first.year + '年' + period.first.month + '月の追加・未確認候補',
      fields: [
        { label: '疑いが強い候補', value: supplementarySummary.high.duplicateRows + '件（' + supplementarySummary.high.groups + 'グループ）・参考' + yen(supplementarySummary.high.extraAmount) },
        { label: '可能性の候補', value: supplementarySummary.medium.duplicateRows + '件（' + supplementarySummary.medium.groups + 'グループ）・参考' + yen(supplementarySummary.medium.extraAmount) },
        { label: '要確認候補', value: supplementarySummary.check.groups + 'グループ' },
        { label: '追加の目安', value: supplementary.filter(isNew).length + 'グループ' }
      ],
      items: topItems(supplementary, 5, true)
    });
  }

  return {
    dedupe_key: 'loan-duplicate:' + period.key,
    title: '重複チェック（' + period.label + '）',
    subtitle: start.replace(/-/g, '/') + '〜' + end.replace(/-/g, '/') + ' · ' + format(now, 'M/d HH:mm') + ' 作成',
    sections: sections.slice(0, 4),
    note: '主対象は前月、前々月は別枠の補足です。【追加】は前月1日6:00以降の入力を含む候補（前回の実送信との差分ではありません）。確認済み状態は管理していないため、補足は未取消の候補です。参考候補額は確定損失ではありません。重複と確認できた行だけ「店舗別貸借分析」→「重複チェック」で選び、逆取引修正で取り消してください（行は削除しません）。',
    links: [{ label: '重複チェックを開く', url: LOAN_REPORT_APP_URL }]
  };
}
