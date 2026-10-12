const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');

const HEADER = ['›', '名前', '貸主', '借主', 'カテゴリー', '品目', '個/本', '単価', '金額', '入力日時', '修正'];
const line = (date, name, lender, borrower, item, amount, input, correction = '') =>
  [date, name, lender, borrower, '飲料', item, '1.00', amount.toLocaleString(), amount.toLocaleString(), input, correction];
const VALUES = [HEADER,
  // 9月: 同じ人の短時間の再送（高）。前月の主対象
  line('2026/09/03', '庄司友紀', '焼肉マルゴ', 'MARUGO MARUNOUCHI', 'アサヒ　シャンティ', 3948, '2026/09/14 22:06:46'),
  line('2026/09/03', '庄司友紀', '焼肉マルゴ', 'MARUGO MARUNOUCHI', 'シャンティ', 3948, '2026/09/14 22:10:58'),
  // 8月: 同じ人の短時間の再送（高）。追加基準より前の入力で、前々月の補足のみ
  line('2026/08/05', '齋藤 弾', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/08/05 21:40:00'),
  line('2026/08/05', '齋藤 弾', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/08/05 21:45:01'),
  // 9月: 両店が入力（中）
  line('2026/09/25', '大塚沙希子', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 16:14:46'),
  line('2026/09/25', '野口淳平', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 17:06:37'),
  // 9月: 向きの食い違い（要確認）
  line('2026/09/02', '名塚', '本部', '371BAR', 'La Tache16', 234916, '2026/09/21 21:31:25'),
  line('2026/09/02', '伊藤瑛介', '371BAR', '本部', 'La Tache16', 234916, '2026/09/23 12:06:26'),
  // 7月: 3か月前の候補（今回の主対象・補足のどちらにも入れない）
  line('2026/07/10', '木津美咲', 'MARUGO GRANDE', '371BAR', '瀬戸田レモン', 2800, '2026/07/10 11:27:21'),
  line('2026/07/10', '木津美咲', 'MARUGO GRANDE', '371BAR', '瀬戸田レモン', 2800, '2026/07/10 11:28:03'),
];

function context(overrides = {}) {
  const fetches = [];
  const triggers = [{ getHandlerFunction: () => 'monthlyDuplicateReport', id: 'old' }, { getHandlerFunction: () => 'dailyCleanupAndBackup', id: 'keep' }];
  const deleted = [];
  const created = [];
  const props = { LOAN_MTALK_TOKEN: 'x'.repeat(64), ...overrides.props };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    SPREADSHEET_ID: 'sheet-id',
    TARGET_SHEET_NAME: '貸借表',
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      formatDate(date, tz, pattern) {
        assert.equal(tz, 'Asia/Tokyo');
        const d = new Date(date.getTime() + 9 * 3600 * 1000);
        const pad = n => String(n).padStart(2, '0');
        return pattern
          .replace('yyyy', d.getUTCFullYear()).replace('MM', pad(d.getUTCMonth() + 1))
          .replace('M/d', `${d.getUTCMonth() + 1}/${d.getUTCDate()}`)
          .replace('HH', pad(d.getUTCHours())).replace('mm', pad(d.getUTCMinutes()));
      },
      computeHmacSha256Signature(message, key) {
        // GAS は符号付きバイト（-128〜127）の配列を返す
        return [...crypto.createHmac('sha256', key).update(message, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b));
      }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] ?? null }) },
    SpreadsheetApp: {
      openById(id) {
        assert.equal(id, 'sheet-id');
        return { getSheetByName: () => ({ getLastRow: () => VALUES.length, getRange: (r, c, h, w) => {
          assert.deepEqual([r, c, h, w], [1, 1, VALUES.length, 11]);
          return { getDisplayValues: () => VALUES };
        } }) };
      }
    },
    UrlFetchApp: {
      fetch(url, options) {
        fetches.push({ url, options });
        const status = overrides.status ?? 200;
        return { getResponseCode: () => status, getContentText: () => JSON.stringify({ ok: status === 200 }) };
      }
    },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: t => deleted.push(t.id),
      newTrigger(handler) {
        const spec = { handler };
        const chain = {
          timeBased: () => chain,
          onMonthDay: d => { spec.day = d; return chain; },
          atHour: h => { spec.hour = h; return chain; },
          inTimezone: tz => { spec.tz = tz; return chain; },
          create: () => { created.push(spec); return spec; }
        };
        return chain;
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/duplicate-check.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'docs/gas_scripts/monthly_duplicate_report.gs'), 'utf8'), ctx);
  return { ctx, fetches, deleted, created };
}

const rows = ctx => ctx.DuplicateCheck.rowsFromSheetValues(VALUES);
// vm の中で作った配列・オブジェクトは別の realm なので、比べる前に普通の値にする
const plain = value => JSON.parse(JSON.stringify(value));
const jst = (y, m, d, h = 6, min = 10) => new Date(Date.UTC(y, m - 1, d, h - 9, min));

test('前月を主対象にし、年またぎ・うるう年・JST境界でも正しく、旧キーを維持する', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  for (const [now, title, range, key, supplementaryStart, supplementaryEnd] of [
    [jst(2026, 10, 1), '2026年9月分', '2026/09/01〜2026/09/30', '2026-08_2026-09', '2026-08-01', '2026-08-31'],
    [jst(2027, 1, 1), '2026年12月分', '2026/12/01〜2026/12/31', '2026-11_2026-12', '2026-11-01', '2026-11-30'],
    [jst(2027, 2, 1), '2027年1月分', '2027/01/01〜2027/01/31', '2026-12_2027-01', '2026-12-01', '2026-12-31'],
    [jst(2028, 3, 1), '2028年2月分', '2028/02/01〜2028/02/29', '2028-01_2028-02', '2028-01-01', '2028-01-31'],
    [new Date('2026-09-30T15:00:00Z'), '2026年9月分', '2026/09/01〜2026/09/30', '2026-08_2026-09', '2026-08-01', '2026-08-31'],
  ]) {
    const payload = ctx.buildDuplicateReportPayload_(rows(ctx), now, fmt);
    assert.equal(payload.title, '重複チェック（' + title + '）');
    assert.ok(payload.subtitle.startsWith(range + ' · '));
    assert.equal(payload.dedupe_key, 'loan-duplicate:' + key);
    const period = ctx.duplicateReportPeriod_(now, fmt);
    assert.equal(period.supplementaryStart, supplementaryStart);
    assert.equal(period.supplementaryEnd, supplementaryEnd);
  }
  assert.equal(ctx.duplicateReportPeriod_(jst(2026, 10, 1), fmt).previousReport, '2026/09/01 06:00:00');
});

test('前月の候補を先に表示し、前々月は別枠だけに載せ、参考額・未確認状態を誤認させない', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const payload = plain(ctx.buildDuplicateReportPayload_(rows(ctx), jst(2026, 10, 1), fmt));
  assert.match(payload.dedupe_key, /^[A-Za-z0-9:_.-]{8,112}$/);
  assert.ok(payload.title.length <= 120 && payload.subtitle.length <= 120);
  assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') <= 64 * 1024);
  assert.ok(payload.note.length <= 300);
  assert.ok(payload.sections.length >= 1 && payload.sections.length <= 4);
  for (const s of payload.sections) {
    assert.ok(s.heading.length <= 40);
    assert.ok(s.fields.length <= 8 && s.items.length <= 5);
    s.fields.forEach(f => assert.ok(f.label.length <= 24 && f.value.length <= 120, JSON.stringify(f)));
    s.items.forEach(i => assert.ok(i.length <= 200));
  }
  assert.deepEqual(payload.sections.map(s => s.heading), ['前月：重複の疑いが強い', '前月：重複の可能性', '前月：要確認（入力ミスの可能性）', '補足：2026年8月の追加・未確認候補']);
  assert.deepEqual(payload.sections[0].fields, [
    { label: '候補行', value: '1件（1グループ）' }, { label: '参考候補額', value: '¥3,948' },
  ]);
  assert.deepEqual(payload.sections[0].items, [
    '2026-09-03 焼肉マルゴ→MARUGO MARUNOUCHI アサヒ　シャンティ ¥3,948 ×2',
  ]);
  assert.deepEqual(payload.sections[1].fields, [
    { label: '候補行', value: '1件（1グループ）' }, { label: '参考候補額', value: '¥7,040' },
  ]);
  assert.deepEqual(payload.sections[2].fields, [
    { label: '貸主と借主が逆の登録が打ち消し合っている', value: '1件' },
  ]);
  assert.deepEqual(payload.sections[3].fields, [
    { label: '疑いが強い候補', value: '1件（1グループ）・参考¥7,677' },
    { label: '可能性の候補', value: '0件（0グループ）・参考¥0' },
    { label: '要確認候補', value: '0グループ' },
    { label: '追加の目安', value: '0グループ' },
  ]);
  assert.deepEqual(payload.sections[3].items, ['2026-08-05 MITAN→鮨こるり ホールケーキ ¥7,677 ×2']);
  assert.match(payload.note, /参考候補額は確定損失ではありません/);
  assert.match(payload.note, /確認済み状態は管理していない/);
  assert.ok(!JSON.stringify(payload).includes('未処理'));
  assert.ok(!JSON.stringify(payload).includes('瀬戸田レモン'));
  assert.equal(payload.links[0].url, 'https://marugo-s.github.io/management/pages/marugo.html');
  const json = JSON.stringify(payload);
  for (const name of ['庄司', '大塚', '野口', '名塚', '伊藤', '齋藤', '木津']) assert.ok(!json.includes(name), name);
});

test('前月ゼロでも前月の結果を先に示し、前々月の要確認だけの補足に候補額を付けない', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const checkRows = ctx.DuplicateCheck.rowsFromSheetValues([HEADER,
    line('2026/08/02', '個人名A', '本部', '371BAR', '要確認品', 234916, '2026/09/01 06:00:00'),
    line('2026/08/02', '個人名B', '371BAR', '本部', '要確認品', 234916, '2026/08/23 12:06:26'),
  ]);
  const payload = plain(ctx.buildDuplicateReportPayload_(checkRows, jst(2026, 10, 1), fmt));
  assert.equal(payload.sections[0].heading, '前月：結果');
  assert.equal(payload.sections[0].fields[0].value, 'ありませんでした');
  assert.equal(payload.sections[1].heading, '補足：2026年8月の追加・未確認候補');
  assert.deepEqual(payload.sections[1].fields[2], { label: '要確認候補', value: '1グループ' });
  assert.deepEqual(payload.sections[1].fields[3], { label: '追加の目安', value: '1グループ' });
  assert.match(payload.sections[1].items[0], /^【追加】.*要確認品.*要確認/);
  assert.ok(!payload.sections[1].items[0].includes('¥'), '要確認には参考候補額を算定しない');
  assert.ok(!JSON.stringify(payload).includes('個人名'));
});

test('疑いが無い月は「ありませんでした」を送る', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const payload = plain(ctx.buildDuplicateReportPayload_(ctx.DuplicateCheck.rowsFromSheetValues([HEADER]), jst(2026, 10, 1), fmt));
  assert.deepEqual(payload.sections, [{ heading: '前月：結果', fields: [{ label: '重複の疑い', value: 'ありませんでした' }], items: [] }]);
});

test('長い品目も受け口の200文字上限を守り、切り詰め前に個人情報を除外する', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const values = [HEADER];
  for (const month of ['08', '09']) {
    for (const item of ['長い品目'.repeat(80), '別品目'.repeat(80) + 'a.b@example.com']) {
      values.push(line(`2026/${month}/15`, '名前非送信', 'MITAN', '鮨こるり', item, 1000, `2026/${month}/15 10:00:00`));
      values.push(line(`2026/${month}/15`, '名前非送信', 'MITAN', '鮨こるり', item, 1000, `2026/${month}/15 10:01:00`));
    }
  }
  const payload = plain(ctx.buildDuplicateReportPayload_(ctx.DuplicateCheck.rowsFromSheetValues(values), jst(2026, 10, 1), fmt));
  for (const section of payload.sections) {
    assert.equal(section.items.length, 1, 'メールを含む要点は全体を落とす');
    assert.ok(section.items[0].length <= 200, section.items[0].length);
    assert.ok(section.items[0].endsWith('…'));
    assert.ok(!section.items[0].includes('別品目'));
  }
});

test('月またぎ候補は前月だけに計上し、当月・3か月前の候補を追加しない', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const values = [HEADER, ...['A', 'B', 'C'].flatMap((item, i) => [
    line('2026/08/31', '同じ名前', 'MITAN', '鮨こるり', item, 1000 + i, '2026/09/02 10:00:00'),
    line('2026/09/01', '同じ名前', 'MITAN', '鮨こるり', item, 1000 + i, '2026/09/02 10:01:00'),
  ]),
    ...['07', '10'].flatMap(month => [
      line(`2026/${month}/01`, '対象外名前', '本部', '371BAR', '対象外', 10000, `2026/${month}/01 10:00:00`),
      line(`2026/${month}/01`, '対象外名前', '本部', '371BAR', '対象外', 10000, `2026/${month}/01 10:01:00`),
    ]),
  ];
  const payload = plain(ctx.buildDuplicateReportPayload_(ctx.DuplicateCheck.rowsFromSheetValues(values), jst(2026, 10, 1), fmt));
  assert.equal(payload.sections.length, 1);
  assert.deepEqual(payload.sections[0].fields, [
    { label: '候補行', value: '3件（1グループ）' }, { label: '参考候補額', value: '¥3,003' },
  ]);
  assert.ok(!JSON.stringify(payload).includes('対象外'));
});

test('前々月の追加目安は6時境界を含み、修正済み候補は両月とも報告しない', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const values = [HEADER];
  for (const [item, latest] of [['境界前', '05:59:59'], ['境界ちょうど', '06:00:00'], ['境界後', '06:00:01']]) {
    values.push(line('2026/08/05', '非送信名', 'MITAN', '鮨こるり', item, 1000, '2026/09/01 05:59:00'));
    values.push(line('2026/08/05', '非送信名', 'MITAN', '鮨こるり', item, 1000, '2026/09/01 ' + latest));
  }
  for (const month of ['08', '09']) {
    values.push(line(`2026/${month}/20`, '非送信名', '本部', '371BAR', '取消済み', 2000, `2026/${month}/20 10:00:00`));
    values.push(line(`2026/${month}/20`, '非送信名', '本部', '371BAR', '取消済み', 2000, `2026/${month}/20 10:01:00`));
    values.push(line(`2026/${month}/20`, '非送信名', '371BAR', '本部', '取消済み', 2000, `2026/${month}/20 10:02:00`, '✏️修正'));
  }
  const payload = plain(ctx.buildDuplicateReportPayload_(ctx.DuplicateCheck.rowsFromSheetValues(values), jst(2026, 10, 1), fmt));
  assert.equal(payload.sections[0].heading, '前月：結果');
  const supplement = payload.sections[1];
  assert.deepEqual(supplement.fields[3], { label: '追加の目安', value: '2グループ' });
  assert.equal(supplement.items.filter(item => item.startsWith('【追加】')).length, 2);
  assert.ok(supplement.items.some(item => item.includes('境界前') && !item.startsWith('【追加】')));
  assert.ok(!JSON.stringify(payload).includes('取消済み'));
  const rerun = ctx.buildDuplicateReportPayload_(ctx.DuplicateCheck.rowsFromSheetValues(values), jst(2026, 10, 20), fmt);
  assert.equal(rerun.dedupe_key, payload.dedupe_key, '同月の再実行は同じキー');
  assert.deepEqual(plain(rerun.sections), payload.sections);
});

test('電話番号・メールらしき要点は落とすが、日付と店舗名の並びは落とさない', () => {
  const { ctx } = context();
  assert.equal(ctx.looksLikePersonalInfo_('2026-08-13 371BAR→X&C サンレオナルド'), false);
  assert.equal(ctx.looksLikePersonalInfo_('連絡 090-1234-5678'), true);
  assert.equal(ctx.looksLikePersonalInfo_('a.b@example.com'), true);
});

test('署名は LINE Report の受け口と同じ（v1=HMAC-SHA256 の16進）で、送信・確認・失敗を扱う', () => {
  const { ctx, fetches } = context();
  const result = ctx.testMonthlyDuplicateReport();
  assert.equal(result.ok, true);
  assert.equal(fetches.length, 1);
  const { url, options } = fetches[0];
  assert.equal(url, 'https://hocbnifuactbvmyjraxy.supabase.co/functions/v1/mtalk-loan-report/report');
  assert.equal(options.method, 'post');
  assert.equal(JSON.parse(options.payload).dry_run, true);
  const ts = options.headers['X-Mtalk-Timestamp'];
  assert.match(ts, /^\d{10}$/);
  assert.equal(options.headers.Authorization, 'Bearer ' + 'x'.repeat(64));
  const want = 'v1=' + crypto.createHmac('sha256', 'x'.repeat(64)).update(`v1:${ts}:POST:/report:${options.payload}`, 'utf8').digest('hex');
  assert.equal(options.headers['X-Mtalk-Signature'], want);

  const sent = context();
  sent.ctx.monthlyDuplicateReport();
  assert.equal(JSON.parse(sent.fetches[0].options.payload).dry_run, false);

  assert.throws(() => context({ status: 502 }).ctx.monthlyDuplicateReport(), /送れませんでした（502）/);
  assert.throws(() => context({ props: { LOAN_MTALK_TOKEN: 'short' } }).ctx.monthlyDuplicateReport(), /LOAN_MTALK_TOKEN/);
  const custom = context({ props: { LOAN_MTALK_URL: 'https://example.supabase.co/functions/v1/mtalk-loan-report/' } });
  custom.ctx.testMonthlyDuplicateReport();
  assert.equal(custom.fetches[0].url, 'https://example.supabase.co/functions/v1/mtalk-loan-report/report');
});

test('予約は毎月1日 6時台（日本時間）に1つだけ登録し直し、ほかの予約は消さない', () => {
  const { ctx, deleted, created, fetches } = context();
  ctx.setupMonthlyDuplicateReport();
  assert.deepEqual(deleted, ['old']);
  assert.deepEqual(created, [{ handler: 'monthlyDuplicateReport', day: 1, hour: 6, tz: 'Asia/Tokyo' }]);
  assert.equal(JSON.parse(fetches[0].options.payload).dry_run, true);
});
