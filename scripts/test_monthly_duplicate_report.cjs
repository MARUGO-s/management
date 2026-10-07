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
  // 9月: 同じ人の短時間の再送（高）
  line('2026/09/03', '庄司友紀', '焼肉マルゴ', 'MARUGO MARUNOUCHI', 'アサヒ　シャンティ', 3948, '2026/09/14 22:06:46'),
  line('2026/09/03', '庄司友紀', '焼肉マルゴ', 'MARUGO MARUNOUCHI', 'シャンティ', 3948, '2026/09/14 22:10:58'),
  // 9月: 両店が入力（中）
  line('2026/09/25', '大塚沙希子', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 16:14:46'),
  line('2026/09/25', '野口淳平', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 17:06:37'),
  // 9月: 向きの食い違い（要確認）
  line('2026/09/02', '名塚', '本部', '371BAR', 'La Tache16', 234916, '2026/09/21 21:31:25'),
  line('2026/09/02', '伊藤瑛介', '371BAR', '本部', 'La Tache16', 234916, '2026/09/23 12:06:26'),
  // 8月: 未処理の重複（前月より前）
  line('2026/08/05', '齋藤 弾', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/08/05 21:40:00'),
  line('2026/08/05', '齋藤 弾', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/08/05 21:45:01'),
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

test('前月分（1日 6時台に実行 → 前の月）を対象にし、1月は前年12月になる', () => {
  const { ctx } = context();
  const format = ctx.Utilities.formatDate.bind(null);
  const fmt = (date, pattern) => format(date, 'Asia/Tokyo', pattern);
  const sept = ctx.buildDuplicateReportPayload_(rows(ctx), jst(2026, 10, 1), fmt);
  assert.equal(sept.dedupe_key, 'loan-duplicate:2026-09');
  assert.equal(sept.title, '重複チェック（2026年9月分）');
  assert.match(sept.subtitle, /^2026\/09\/01〜2026\/09\/30 · 10\/1 06:10 作成$/);
  const dec = ctx.buildDuplicateReportPayload_(rows(ctx), jst(2027, 1, 1), fmt);
  assert.equal(dec.dedupe_key, 'loan-duplicate:2026-12');
  assert.match(dec.subtitle, /^2026\/12\/01〜2026\/12\/31/);
});

test('報告は受け口の上限に収まり、入力者名を含まない', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const payload = plain(ctx.buildDuplicateReportPayload_(rows(ctx), jst(2026, 10, 1), fmt));
  assert.match(payload.dedupe_key, /^[A-Za-z0-9:_.-]{8,112}$/);
  assert.ok(payload.sections.length >= 1 && payload.sections.length <= 4);
  for (const s of payload.sections) {
    assert.ok(s.heading.length <= 40);
    assert.ok(s.fields.length <= 8 && s.items.length <= 5);
    s.fields.forEach(f => assert.ok(f.label.length <= 24 && f.value.length <= 120, JSON.stringify(f)));
    s.items.forEach(i => assert.ok(i.length <= 200));
  }
  assert.deepEqual(payload.sections.map(s => s.heading), ['重複の疑いが強い', '重複の可能性', '要確認（入力ミスの可能性）', '前月より前の未処理']);
  assert.deepEqual(payload.sections[0].fields, [{ label: '重複', value: '1件（1グループ）' }, { label: '重複分', value: '¥3,948' }]);
  assert.match(payload.sections[0].items[0], /^2026-09-03 焼肉マルゴ→MARUGO MARUNOUCHI アサヒ　シャンティ ¥3,948 ×2$/);
  assert.deepEqual(payload.sections[3].fields[0], { label: '疑いが強い', value: '1件・¥7,677' });
  assert.equal(payload.links[0].url, 'https://marugo-s.github.io/management/pages/marugo.html');
  const json = JSON.stringify(payload);
  for (const name of ['庄司', '大塚', '野口', '名塚', '伊藤', '齋藤']) assert.ok(!json.includes(name), name);
});

test('疑いが無い月は「ありませんでした」を送る', () => {
  const { ctx } = context();
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const payload = plain(ctx.buildDuplicateReportPayload_(ctx.DuplicateCheck.rowsFromSheetValues([HEADER]), jst(2026, 10, 1), fmt));
  assert.deepEqual(payload.sections, [{ heading: '結果', fields: [{ label: '重複の疑い', value: 'ありませんでした' }], items: [] }]);
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
