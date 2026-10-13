// 重複チェックの「問題なし（非表示）」確認状態のテスト
// - js/duplicate-check.js の groupKey（行の位置・並び順に依存しない候補キー）
// - GAS（docs/gas_scripts/gas_code_complete.gs）の listDuplicateReviews / setDuplicateReview
// - 月次報告（monthly_duplicate_report.gs）の【確認済み】表示
// - 画面の js/duplicate-review.js と pages/marugo.html の表示・非表示操作
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const KEY = /^dr1_[0-9a-f]{28}$/;

require(path.join(root, 'js/duplicate-check.js'));
const D = globalThis.DuplicateCheck;

const HEADER = ['›', '名前', '貸主', '借主', 'カテゴリー', '品目', '個/本', '単価', '金額', '入力日時', '修正'];
const line = (date, name, lender, borrower, item, amount, input, correction = '') =>
  [date, name, lender, borrower, '飲料', item, '1.00', amount.toLocaleString(), amount.toLocaleString(), input, correction];
const sheet = lines => D.rowsFromSheetValues([HEADER, ...lines]);

// 解析画面（marugo.html）の this.data と同じ形の行: 名前・品目は未トリム、数量の書式が違う、行番号も違う
const marugoRow = (l, originalRowIndex) => ({
  date: l[0].replace(/\//g, '-'), name: '  ' + l[1] + ' ', lender: l[2].replace(/-/g, '\u2011').trim(),
  borrower: l[3].replace(/-/g, '\u2011').trim(), category: l[4], item: ' ' + l[5] + '  ', quantity: '1',
  unitPrice: String(l[7]), amount: Number(String(l[8]).replace(/,/g, '')), originalAmount: l[8], inputDate: l[9],
  correction: l[10], receiptId: 'rid-' + originalRowIndex, originalRowIndex
});

const BASE = [
  line('2026/09/03', '庄司 友紀', '焼肉マルゴ', 'MARUGO-D', 'アサヒ シャンティ', 3948, '2026/09/14 22:06:46'),
  line('2026/09/03', '庄司 友紀', '焼肉マルゴ', 'MARUGO-D', 'シャンティ', 3948, '2026/09/14 22:10:58'),
  line('2026/09/25', '大塚', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 16:14:46'),
  line('2026/09/25', '野口', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 17:06:37'),
];
const keysOf = rows => D.findSuspects(rows).groups.map(group => `${group.level}|${group.kind}|${D.groupKey(group)}`).sort();

// ---------------------------------------------------------------- groupKey

test('groupKey は dr1_ + 28桁の16進で、同じ候補なら何度でも同じ', () => {
  const groups = D.findSuspects(sheet(BASE)).groups;
  assert.equal(groups.length, 2);
  groups.forEach(group => {
    assert.match(D.groupKey(group), KEY);
    assert.equal(D.groupKey(group), D.groupKey(group));
  });
  assert.notEqual(D.groupKey(groups[0]), D.groupKey(groups[1]));
  assert.equal(typeof D.groupMemberIdentity, 'function');
});

test('groupKey はシート行（GAS）と解析画面の行（未トリム・数量表記・行番号違い）で一致する', () => {
  const fromSheet = keysOf(sheet(BASE));
  const fromMarugo = keysOf(BASE.map((l, i) => marugoRow(l, 100 + i)));
  assert.deepEqual(fromMarugo, fromSheet);
});

test('groupKey は行の挿入（行番号のずれ）や並び順・受付IDに左右されない', () => {
  const base = keysOf(sheet(BASE));
  const shifted = keysOf(sheet([
    line('2026/10/01', '別人', 'A店', 'B店', '別の品', 111, '2026/10/01 10:00:00'),
    line('2026/10/02', '別人', 'C店', 'D店', '別の品2', 222, '2026/10/02 10:00:00'),
    ...BASE
  ]));
  assert.deepEqual(shifted, base);
  assert.deepEqual(keysOf(sheet(BASE.slice().reverse())), base);
  const withReceipt = D.rowsFromSheetValues([[...HEADER, '__receipt_id_v1'], ...BASE.map((l, i) => [...l, 'receipt-' + i])]);
  assert.deepEqual(keysOf(withReceipt), base);
});

test('groupKey は候補の構成が変わると変わる（重複行が増えた・内容が違う・確度が違う）', () => {
  const [high] = D.findSuspects(sheet(BASE)).groups.filter(g => g.level === 'high');
  const grown = D.findSuspects(sheet([...BASE,
    line('2026/09/03', '庄司 友紀', '焼肉マルゴ', 'MARUGO-D', 'シャンティ', 3948, '2026/09/14 22:12:00')]))
    .groups.find(g => g.level === 'high');
  assert.equal(grown.rows.length, 3);
  assert.notEqual(D.groupKey(grown), D.groupKey(high));
  assert.notEqual(D.groupKey({ ...high, level: 'medium' }), D.groupKey(high));
  assert.notEqual(D.groupKey({ ...high, kind: high.kind + '!' }), D.groupKey(high));
  const otherAmount = { ...high, rows: high.rows.map(r => ({ ...r, amount: r.amount + 1 })) };
  assert.notEqual(D.groupKey(otherAmount), D.groupKey(high));
  const otherTime = { ...high, rows: high.rows.map((r, i) => i ? { ...r, inputDate: '2026/09/14 22:10:59' } : r) };
  assert.notEqual(D.groupKey(otherTime), D.groupKey(high));
});

test('groupKey は TextEncoder・crypto のない環境（GAS V8 相当）でも同じ値になる', () => {
  const ctx = vm.createContext({});
  vm.runInContext(read('js/duplicate-check.js'), ctx);
  assert.equal(typeof ctx.TextEncoder, 'undefined');
  assert.equal(typeof ctx.crypto, 'undefined');
  const rows = ctx.DuplicateCheck.rowsFromSheetValues([HEADER, ...BASE]);
  const keys = ctx.DuplicateCheck.findSuspects(rows).groups.map(g => `${g.level}|${g.kind}|${ctx.DuplicateCheck.groupKey(g)}`).sort();
  assert.deepEqual(plain(keys), keysOf(sheet(BASE)));
});

// ---------------------------------------------------------------- GAS

function gas() {
  const sheets = new Map();
  let locked = false, busy = false, failReviewRead = false;
  let backups = 0, emails = 0;
  const sessionCache = new Map(), challengeCache = new Map();
  const makeSheet = (name, width) => {
    const rows = [Array(width).fill('')];
    return {
      rows, name,
      getName: () => name,
      getMaxColumns: () => width, getLastColumn: () => width,
      getLastRow: () => rows.filter(r => r.some(v => v !== '')).length ? rows.length : 0,
      hideColumns() {},
      insertRowBefore(index) { rows.splice(index - 1, 0, Array(width).fill('')); },
      insertRowAfter(index) { rows.splice(index, 0, Array(width).fill('')); },
      getRange(row, column, height = 1, w = 1) {
        if (name === '重複確認' && failReviewRead) throw new Error('read failure');
        return {
          getFormulas: () => Array.from({ length: height }, () => Array(w).fill('')),
          setNumberFormat() { return this; },
          setValue(value) { this.setValues([[value]]); return this; },
          getValues: () => Array.from({ length: height }, (_, i) =>
            Array.from({ length: w }, (_, j) => rows[row - 1 + i]?.[column - 1 + j] ?? '')),
          getDisplayValues() { return this.getValues().map(r => r.map(v => String(v))); },
          setValues(values) {
            values.forEach((l, i) => l.forEach((v, j) => {
              rows[row - 1 + i] ||= Array(width).fill('');
              rows[row - 1 + i][column - 1 + j] = v;
            }));
          },
          createTextFinder(id) {
            return { matchEntireCell() { return this; }, findNext() {
              const index = rows.findIndex((l, i) => i >= row - 1 && l[column - 1] === id);
              return index < 0 ? null : { getRow: () => index + 1 };
            } };
          }
        };
      },
      setFrozenRows() {}
    };
  };
  const loan = makeSheet('貸借表', 13);
  loan.rows[0] = [...HEADER, '__receipt_id_v1', '__receipt_hash_v1'];
  sheets.set('貸借表', loan);
  const spreadsheet = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet(name) {
      assert.equal(name, '重複確認', 'only the review sheet may be created');
      const created = makeSheet(name, 8);
      created.rows.length = 0;
      sheets.set(name, created);
      return created;
    }
  };
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Logger: { log() {} },
    SpreadsheetApp: { openById: () => spreadsheet, flush() {} },
    PropertiesService: { getScriptProperties: () => { const p = new Map(); return {
      getProperty: k => p.get(k) ?? null, setProperty(k, v) { p.set(k, v); }, deleteProperty(k) { p.delete(k); } }; } },
    LockService: { getScriptLock: () => ({
      tryLock() { if (busy) return false; assert(!locked); locked = true; return true; },
      waitLock() { if (busy) throw new Error('busy'); locked = true; },
      releaseLock() { locked = false; }, hasLock: () => locked }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: {
      formatDate(date, tz, pattern) {
        assert.equal(tz, 'Asia/Tokyo');
        const d = new Date(date.getTime() + 9 * 3600 * 1000);
        const pad = n => String(n).padStart(2, '0');
        return pattern.replace('yyyy', d.getUTCFullYear()).replace('MM', pad(d.getUTCMonth() + 1))
          .replace('dd', pad(d.getUTCDate())).replace('HH', pad(d.getUTCHours()))
          .replace('mm', pad(d.getUTCMinutes())).replace('ss', pad(d.getUTCSeconds()));
      },
      DigestAlgorithm: { SHA_256: 'sha256' }, getUuid: () => crypto.randomUUID(),
      computeDigest: (_, s) => Array.from(crypto.createHash('sha256').update(s).digest()),
      base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64url')
    },
    CacheService: { getScriptCache: () => ({ get: k => sessionCache.get(k) ?? challengeCache.get(k) ?? null,
      put(k, v) { (k.startsWith('similar-confirm:') ? challengeCache : sessionCache).set(k, v); },
      remove(k) { challengeCache.delete(k); } }) },
    UrlFetchApp: { fetch(_, options) {
      const token = JSON.parse(options.payload).token;
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ valid: token === 'valid-token' }) };
    } },
    MailApp: { sendEmail() { emails++; } }
  });
  vm.runInContext(read('docs/gas_scripts/gas_code_complete.gs'), ctx);
  ctx.createBackup = () => { backups++; };
  ctx.sendBorrowerEmail_ = () => { emails++; return 'completed'; };
  const post = data => ctx.doPost({ postData: { contents: JSON.stringify('sessionToken' in data ? data : { ...data, sessionToken: 'valid-token' }) } });
  return { ctx, sheets, loan, post, stats: () => ({ backups, emails, locked }),
    busy(v) { busy = v; }, failReviewRead(v) { failReviewRead = v; } };
}

const groupFor = rows => D.findSuspects(sheet(rows)).groups[0];
const validKey = D.groupKey(groupFor(BASE.slice(0, 2)));
const setPayload = extra => ({ action: 'setDuplicateReview', key: validKey, hidden: true, reviewer: '確認 太郎',
  note: '両店の正当な取引', level: 'high', kind: '同じ人が短時間に同じ内容を繰り返し登録', summary: '2026-09-03 焼肉マルゴ→MARUGO‑D シャンティ ¥3,948 ×2', ...extra });

test('GAS: 確認状態の読み書きはログイン必須で、未ログインならシートを作らない', () => {
  const s = gas();
  const denied = s.post({ ...setPayload(), sessionToken: 'bad' });
  assert.equal(denied.code, 'SESSION_REQUIRED');
  assert.equal(s.post({ action: 'listDuplicateReviews', sessionToken: '' }).code, 'SESSION_REQUIRED');
  assert.equal(s.sheets.has('重複確認'), false);
});

test('GAS: シートが無ければ一覧は空、保存時に見出し付きで作成し、受付ID検証より先に処理する', () => {
  const s = gas();
  const before = plain(s.loan.rows);
  const empty = s.post({ action: 'listDuplicateReviews' });
  assert.equal(empty.status, 'SUCCESS');
  assert.equal(empty.duplicateReviewVersion, 1);
  assert.deepEqual(plain(empty.reviews), {});
  assert.equal(s.sheets.has('重複確認'), false, '一覧の取得ではシートを作らない');

  const saved = s.post(setPayload()); // receiptId / receiptVersion なし
  assert.equal(saved.status, 'SUCCESS', JSON.stringify(saved));
  assert.equal(saved.duplicateReviewVersion, 1);
  assert.equal(saved.review.hidden, true);
  assert.equal(saved.review.reviewer, '確認 太郎');
  assert.match(saved.review.reviewedAt, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  const review = s.sheets.get('重複確認');
  assert.deepEqual(plain(review.rows[0]), ['記録日時', '確認キー', '状態', '確認者', 'メモ', '確度', '種類', '対象の要約']);
  assert.equal(review.rows.length, 2);
  assert.deepEqual(plain(review.rows[1].slice(1)), [validKey, '非表示', '確認 太郎', '両店の正当な取引', 'high',
    '同じ人が短時間に同じ内容を繰り返し登録', '2026-09-03 焼肉マルゴ→MARUGO‑D シャンティ ¥3,948 ×2']);
  assert.deepEqual(plain(s.loan.rows), before, '貸借表には書き込まない');
  assert.deepEqual(s.stats(), { backups: 0, emails: 0, locked: false }, 'バックアップ・メールなし、ロック解放');

  const listed = s.post({ action: 'listDuplicateReviews' });
  assert.deepEqual(Object.keys(listed.reviews), [validKey]);
  assert.equal(listed.reviews[validKey].hidden, true);
  assert.equal(listed.reviews[validKey].note, '両店の正当な取引');
});

test('GAS: 履歴は追記のみで、キーごとに最後の記録が有効（表示に戻す）', () => {
  const s = gas();
  const otherKey = 'dr1_' + 'a'.repeat(28);
  assert.equal(s.post(setPayload()).status, 'SUCCESS');
  assert.equal(s.post(setPayload({ key: otherKey, reviewer: '別の人' })).status, 'SUCCESS');
  assert.equal(s.post(setPayload({ hidden: false, reviewer: '戻す人', note: '' })).status, 'SUCCESS');
  const review = s.sheets.get('重複確認');
  assert.equal(review.rows.length, 4);
  assert.equal(review.rows[3][2], '表示に戻す');
  const reviews = s.post({ action: 'listDuplicateReviews' }).reviews;
  assert.equal(reviews[validKey].hidden, false);
  assert.equal(reviews[validKey].reviewer, '戻す人');
  assert.equal(reviews[otherKey].hidden, true);
  assert.equal(s.post(setPayload({ reviewer: '再確認' })).status, 'SUCCESS');
  assert.equal(s.post({ action: 'listDuplicateReviews' }).reviews[validKey].hidden, true);
  // 手入力された日付（Date）や壊れた行も読める
  review.rows.push([new Date(Date.UTC(2026, 9, 14, 3, 5)), validKey, '表示に戻す', 'シート編集', '', 'high', '', '']);
  review.rows.push(['2026/10/14 12:00:00', 'not-a-key', '非表示', 'x', '', 'high', '', '']);
  const latest = s.ctx.latestDuplicateReviews_();
  assert.equal(latest[validKey].hidden, false);
  assert.equal(latest[validKey].reviewedAt, '2026/10/14 12:05');
  assert.equal(latest['not-a-key'], undefined);
});

test('GAS: 入力を検証し、不正なら書き込まない', () => {
  const s = gas();
  for (const bad of [
    { key: 'dr1_xyz' }, { key: validKey + '0' }, { key: 'DR1_' + 'a'.repeat(28) }, { hidden: 'true' }, { hidden: undefined },
    { reviewer: '   ' }, { reviewer: 'x'.repeat(41) }, { reviewer: 123 }, { note: 'x'.repeat(201) }, { level: 'low' }, { level: undefined }
  ]) {
    const result = s.post(setPayload(bad));
    assert.equal(result.status, 'ERROR', JSON.stringify(bad));
    assert.equal(result.written, false);
    assert.equal(result.code, 'INVALID_DUPLICATE_REVIEW');
  }
  assert.equal(s.sheets.has('重複確認'), false);
  assert.equal(s.post(setPayload({ reviewer: 'x'.repeat(40), note: 'y'.repeat(200) })).status, 'SUCCESS');
  const long = s.post(setPayload({ kind: 'k'.repeat(500), summary: 's'.repeat(1000) }));
  assert.equal(long.status, 'SUCCESS');
  const row = s.sheets.get('重複確認').rows.at(-1);
  assert.ok(row[6].length <= 120 && row[7].length <= 300, '種類・要約は長さを制限');
});

test('GAS: 数式として解釈される入力はエスケープし、一覧では元の文字で返す', () => {
  const s = gas();
  assert.equal(s.post(setPayload({ reviewer: '=HYPERLINK("x")', note: '+1', kind: '@k', summary: '-s' })).status, 'SUCCESS');
  const row = s.sheets.get('重複確認').rows[1];
  assert.equal(row[3], `'=HYPERLINK("x")`);
  assert.equal(row[4], "'+1");
  assert.equal(row[6], "'@k");
  assert.equal(row[7], "'-s");
  const review = s.post({ action: 'listDuplicateReviews' }).reviews[validKey];
  assert.equal(review.reviewer, '=HYPERLINK("x")');
  assert.equal(review.note, '+1');
});

test('GAS: 他の処理中はロックを取れず書き込まない。読み取り失敗はエラー応答', () => {
  const s = gas();
  s.busy(true);
  const result = s.post(setPayload());
  assert.equal(result.status, 'ERROR');
  assert.equal(result.written, false);
  assert.equal(s.sheets.has('重複確認'), false);
  s.busy(false);
  assert.equal(s.post(setPayload()).status, 'SUCCESS');
  s.failReviewRead(true);
  assert.equal(s.post({ action: 'listDuplicateReviews' }).status, 'ERROR');
});

test('GAS: 確認状態の追加後も登録・GETは従来どおり（GETは duplicateReviewVersion を返す）', () => {
  const s = gas();
  assert.equal(s.post(setPayload()).status, 'SUCCESS');
  const reviewRows = plain(s.sheets.get('重複確認').rows);
  const data = { date: '2026-09-29', name: 'テスト', lender: 'A', borrower: 'B', category: '飲料', item: '品A',
    quantity: '1', unitPrice: '100', amount: '100', isCorrection: false, receiptId: crypto.randomUUID(), receiptVersion: 1 };
  const registered = s.post(data);
  assert.equal(registered.status, 'SUCCESS', JSON.stringify(registered));
  assert.equal(registered.duplicate, false);
  assert.equal(s.loan.rows.length, 2);
  assert.equal(s.post(data).duplicate, true);
  assert.equal(s.post({ ...data, receiptId: crypto.randomUUID() }).code, 'SIMILAR_TRANSACTION');
  assert.equal(s.post({ date: '2026-09-29', item: 'legacy' }).status, 'ERROR', '受付IDなしの登録は従来どおり拒否');
  assert.deepEqual(plain(s.sheets.get('重複確認').rows), reviewRows, '登録で確認シートは変わらない');
  const get = s.ctx.doGet();
  assert.equal(get.duplicateReviewVersion, 1);
  assert.equal(get.idempotencyVersion, 1);
  assert.equal(get.similarityVersion, 1);
  assert.equal(get.duplicateRulesVersion, 2);
});

// ---------------------------------------------------------------- 月次報告

const MONTHLY = [HEADER,
  line('2026/09/03', '庄司友紀', '焼肉マルゴ', 'MARUGO MARUNOUCHI', 'アサヒ　シャンティ', 3948, '2026/09/14 22:06:46'),
  line('2026/09/03', '庄司友紀', '焼肉マルゴ', 'MARUGO MARUNOUCHI', 'シャンティ', 3948, '2026/09/14 22:10:58'),
  line('2026/08/05', '齋藤 弾', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/09/05 21:40:00'),
  line('2026/08/05', '齋藤 弾', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/09/05 21:45:01'),
  line('2026/09/25', '大塚沙希子', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 16:14:46'),
  line('2026/09/25', '野口淳平', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2026/09/25 17:06:37'),
  line('2026/09/02', '名塚', '本部', '371BAR', 'La Tache16', 234916, '2026/09/21 21:31:25'),
  line('2026/09/02', '伊藤瑛介', '371BAR', '本部', 'La Tache16', 234916, '2026/09/23 12:06:26'),
];
const NAMES = ['庄司', '齋藤', '大塚', '野口', '名塚', '伊藤', '確認者名', '個人メモ'];
const jst = (y, m, d, h = 6, min = 10) => new Date(Date.UTC(y, m - 1, d, h - 9, min));

function monthly(values = MONTHLY, options = {}) {
  const fetches = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    SPREADSHEET_ID: 'sheet-id', TARGET_SHEET_NAME: '貸借表',
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      formatDate(date, tz, pattern) {
        const d = new Date(date.getTime() + 9 * 3600 * 1000);
        const pad = n => String(n).padStart(2, '0');
        return pattern.replace('yyyy', d.getUTCFullYear()).replace('MM', pad(d.getUTCMonth() + 1))
          .replace('M/d', `${d.getUTCMonth() + 1}/${d.getUTCDate()}`)
          .replace('HH', pad(d.getUTCHours())).replace('mm', pad(d.getUTCMinutes()));
      },
      computeHmacSha256Signature: (message, key) => [...crypto.createHmac('sha256', key).update(message, 'utf8').digest()]
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ LOAN_MTALK_TOKEN: 'x'.repeat(64) })[k] ?? null }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => {
      assert.equal(name, '貸借表');
      return { getLastRow: () => values.length, getRange: () => ({ getDisplayValues: () => values }) };
    } }) },
    UrlFetchApp: { fetch(url, opts) { fetches.push(JSON.parse(opts.payload)); return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' }; } }
  });
  vm.runInContext(read('js/duplicate-check.js'), ctx);
  if (options.dropGroupKey) delete ctx.DuplicateCheck.groupKey;
  vm.runInContext(read('docs/gas_scripts/monthly_duplicate_report.gs'), ctx);
  if (options.reviews) ctx.latestDuplicateReviews_ = options.reviews;
  const fmt = (date, pattern) => ctx.Utilities.formatDate(date, 'Asia/Tokyo', pattern);
  const groups = ctx.DuplicateCheck.findSuspects(ctx.DuplicateCheck.rowsFromSheetValues(values)).groups;
  const keyOf = predicate => D.groupKey(groups.find(predicate));
  const build = reviews => plain(ctx.buildDuplicateReportPayload_(ctx.DuplicateCheck.rowsFromSheetValues(values), jst(2026, 10, 1), fmt, reviews));
  return { ctx, fetches, build, keyOf };
}
const hide = (...keys) => Object.fromEntries(keys.map(key => [key, { hidden: true, reviewer: '確認者名', reviewedAt: '2026/10/10 10:00', note: '個人メモ' }]));
const checkLimits = payload => {
  assert.ok(payload.sections.length <= 4);
  assert.ok(payload.note.length <= 300, payload.note.length);
  payload.sections.forEach(s => {
    assert.ok(s.fields.length <= 8 && s.items.length <= 5);
    s.fields.forEach(f => assert.ok(f.label.length <= 24 && f.value.length <= 120));
    s.items.forEach(i => assert.ok(i.length <= 200));
  });
  const json = JSON.stringify(payload);
  NAMES.forEach(name => assert.ok(!json.includes(name), name));
};

test('月次: 非表示にされた候補は【確認済み】を付けて残し、件数・参考額は変えない', () => {
  const m = monthly();
  const highKey = m.keyOf(g => g.level === 'high' && g.rows[0].date === '2026-09-03');
  const none = m.build({});
  const marked = m.build(hide(highKey));
  checkLimits(marked);
  assert.equal(marked.dedupe_key, none.dedupe_key);
  assert.equal(marked.title, none.title);
  assert.deepEqual(marked.sections[0].fields, [
    { label: '候補行', value: '1件（1グループ）' }, { label: '参考候補額', value: '¥3,948' },
    { label: 'うち確認済み', value: '1グループ' }]);
  assert.deepEqual(marked.sections[0].items, ['【確認済み】2026-09-03 焼肉マルゴ→MARUGO MARUNOUCHI アサヒ　シャンティ ¥3,948 ×2']);
  assert.deepEqual(none.sections[0].fields.map(f => f.label), ['候補行', '参考候補額'], '確認済みがなければ欄を足さない');
  assert.deepEqual(marked.sections.slice(1), none.sections.slice(1));
  assert.match(marked.note, /【確認済み】/);
  assert.match(marked.note, /判定/);
  assert.doesNotMatch(marked.note, /確認済み状態は管理していない/);
  // hidden:false（表示に戻した）は確認済みにしない
  assert.deepEqual(m.build({ [highKey]: { hidden: false, reviewer: '確認者名' } }).sections, none.sections);
});

test('月次: 要確認・補足にも確認済みの数を出し、補足は【追加】【確認済み】の順', () => {
  const m = monthly();
  const checkKey = m.keyOf(g => g.level === 'check');
  const augustKey = m.keyOf(g => g.rows[0].date === '2026-08-05');
  const payload = m.build(hide(checkKey, augustKey));
  checkLimits(payload);
  const check = payload.sections.find(s => s.heading.startsWith('前月：要確認'));
  assert.deepEqual(check.fields.at(-1), { label: 'うち確認済み', value: '1グループ' });
  const supplement = payload.sections.find(s => s.heading.startsWith('補足'));
  assert.deepEqual(supplement.fields.at(-1), { label: 'うち確認済み', value: '1グループ' });
  assert.equal(supplement.fields[0].value, '1件（1グループ）・参考¥7,677', '参考額は確認済みも含む');
  assert.deepEqual(supplement.items, ['【追加】【確認済み】2026-08-05 MITAN→鮨こるり ホールケーキ ¥7,677 ×2']);
});

test('月次: 限られた要点の枠は未確認の候補を優先する', () => {
  const values = [HEADER];
  for (let i = 0; i < 6; i++) {
    const amount = 1000 * (i + 1);
    values.push(line('2026/09/1' + i, '非送信', 'MITAN', '鮨こるり', '品' + i, amount, `2026/09/1${i} 10:00:00`));
    values.push(line('2026/09/1' + i, '非送信', 'MITAN', '鮨こるり', '品' + i, amount, `2026/09/1${i} 10:01:00`));
  }
  const m = monthly(values);
  const biggest = m.keyOf(g => g.rows[0].item === '品5');
  const none = m.build({});
  assert.ok(none.sections[0].items[0].includes('品5'), '確認がなければ金額の大きい順');
  const payload = m.build(hide(biggest));
  checkLimits(payload);
  assert.equal(payload.sections[0].items.length, 5);
  assert.ok(payload.sections[0].items.every(item => !item.includes('品5')), '確認済みは未確認の後ろ');
  assert.equal(payload.sections[0].fields[0].value, '6件（6グループ）');
  assert.equal(payload.sections[0].fields[1].value, '¥21,000');
  const smallFirst = m.build(hide(m.keyOf(g => g.rows[0].item === '品0'), m.keyOf(g => g.rows[0].item === '品1')));
  assert.deepEqual(smallFirst.sections[0].items.map(item => item.startsWith('【確認済み】')), [false, false, false, false, true]);
  assert.ok(smallFirst.sections[0].items[4].includes('品1'));
  assert.ok(smallFirst.sections[0].items.every(item => !item.includes('品0')));
  assert.deepEqual(smallFirst.sections[0].fields.at(-1), { label: 'うち確認済み', value: '2グループ' });
});

test('月次: 確認状態を読めない・判定に groupKey が無いときも送信し、誤った【確認済み】を付けない', () => {
  const failing = monthly(MONTHLY, { reviews: () => { throw new Error('sheet unavailable'); } });
  failing.ctx.testMonthlyDuplicateReport();
  assert.equal(failing.fetches.length, 1);
  const sent = failing.fetches[0];
  checkLimits(sent);
  assert.ok(!JSON.stringify(sent.sections).includes('【確認済み】'));
  assert.match(sent.note, /確認状態を読み取れなかった/);

  const missing = monthly(); // latestDuplicateReviews_ がない（コード.js が旧版）
  missing.ctx.testMonthlyDuplicateReport();
  assert.match(missing.fetches[0].note, /確認状態を読み取れなかった/);

  const highKey = D.groupKey(D.findSuspects(D.rowsFromSheetValues(MONTHLY)).groups.find(g => g.level === 'high' && g.rows[0].date === '2026-09-03'));
  const ok = monthly(MONTHLY, { reviews: () => hide(highKey) });
  ok.ctx.monthlyDuplicateReport();
  assert.equal(ok.fetches[0].dry_run, false);
  assert.ok(ok.fetches[0].sections[0].items[0].startsWith('【確認済み】'));
  assert.doesNotMatch(ok.fetches[0].note, /読み取れなかった/);
  checkLimits(ok.fetches[0]);

  const old = monthly(MONTHLY, { dropGroupKey: true, reviews: () => hide(highKey) });
  old.ctx.testMonthlyDuplicateReport();
  assert.ok(!JSON.stringify(old.fetches[0].sections).includes('【確認済み】'));
  assert.match(old.fetches[0].note, /確認状態を読み取れなかった/);
});

// ---------------------------------------------------------------- js/duplicate-review.js

const MAIN_GAS_URL = read('pages/js/main.js').match(/const GAS_URL = "([^"]+)"/)[1];

function reviewModule(responses, session = { token: 'session-token' }) {
  const fetches = [];
  const calls = { clear: 0, requireLogin: 0 };
  const queue = responses.slice();
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout: fn => { fn(); return 0; },
    LoanSession: { get: () => session, clear() { calls.clear++; }, requireLogin() { calls.requireLogin++; } },
    fetch: async (url, options) => {
      fetches.push({ url, options, body: JSON.parse(options.body) });
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return { ok: next.status ? next.status === 200 : true, status: next.status || 200, text: async () => next.text ?? JSON.stringify(next) };
    }
  });
  ctx.window = ctx;
  vm.runInContext(read('js/duplicate-review.js'), ctx);
  return { api: ctx.DuplicateReview, fetches, calls };
}
const echo404 = { status: 404, text: '<html><body>Sorry, unable to open the file at this time.</body></html>' };

test('DuplicateReview.list は入力画面と同じGASへログイン情報付きで送り、正しいキーだけ返す', async () => {
  const m = reviewModule([{ status: 'SUCCESS', duplicateReviewVersion: 1, reviews: {
    [validKey]: { hidden: true, reviewer: '確認 太郎', reviewedAt: '2026/10/14 10:00', note: 'メモ' },
    'bad-key': { hidden: true }, ['dr1_' + 'b'.repeat(28)]: { hidden: 'yes' } } }]);
  const reviews = await m.api.list();
  assert.equal(m.fetches.length, 1);
  assert.equal(m.fetches[0].url, MAIN_GAS_URL);
  assert.equal(m.fetches[0].options.method, 'POST');
  assert.equal(m.fetches[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(m.fetches[0].options.redirect, 'follow');
  assert.deepEqual(m.fetches[0].body, { action: 'listDuplicateReviews', sessionToken: 'session-token' });
  assert.deepEqual(plain(reviews), { [validKey]: { hidden: true, reviewer: '確認 太郎', reviewedAt: '2026/10/14 10:00', note: 'メモ' },
    ['dr1_' + 'b'.repeat(28)]: { hidden: false, reviewer: '', reviewedAt: '', note: '' } });
});

test('DuplicateReview は読めない応答（Googleの404 HTML）だけ1回再送し、JSONのエラーは再送しない', async () => {
  const retried = reviewModule([echo404, { status: 'SUCCESS', duplicateReviewVersion: 1, reviews: {} }]);
  assert.deepEqual(plain(await retried.api.list()), {});
  assert.equal(retried.fetches.length, 2);

  const twice = reviewModule([echo404, echo404, { status: 'SUCCESS', duplicateReviewVersion: 1, reviews: {} }]);
  await assert.rejects(twice.api.list(), /応答を読み取れませんでした/);
  assert.equal(twice.fetches.length, 2);

  const network = reviewModule([new Error('Failed to fetch'), { status: 'SUCCESS', duplicateReviewVersion: 1, reviews: {} }]);
  assert.deepEqual(plain(await network.api.list()), {});
  assert.equal(network.fetches.length, 2);

  const error = reviewModule([{ status: 'ERROR', written: false, duplicateReviewVersion: 1, code: 'INVALID_DUPLICATE_REVIEW', message: '確認者の名前を入力してください。' }]);
  await assert.rejects(error.api.set({ key: validKey, hidden: true, reviewer: 'a', note: '', level: 'high', kind: 'k', summary: 's' }), /確認者の名前/);
  assert.equal(error.fetches.length, 1);
});

test('DuplicateReview はログイン切れ・未対応のGASを分かるエラーにする', async () => {
  const expired = reviewModule([{ status: 'ERROR', written: false, code: 'SESSION_REQUIRED', message: 'ログインの有効期限が切れました。' }]);
  await assert.rejects(expired.api.list(), error => error.code === 'SESSION_REQUIRED');
  assert.deepEqual(expired.calls, { clear: 1, requireLogin: 1 });

  const noSession = reviewModule([], null);
  await assert.rejects(noSession.api.list(), error => error.code === 'SESSION_REQUIRED');
  assert.equal(noSession.fetches.length, 0);
  assert.equal(noSession.calls.requireLogin, 1);

  // 旧GASは登録として扱い、受付IDの検証で書き込まずにエラーを返す
  const old = reviewModule([{ status: 'ERROR', written: false, message: 'サーバーエラー: 二重登録防止のため、画面を再読み込みしてから送信してください。' }]);
  await assert.rejects(old.api.list(), /未対応/);
});

test('DuplicateReview.set は送信前に入力を確かめ、保存結果を返す', async () => {
  const review = { hidden: true, reviewer: '確認 太郎', reviewedAt: '2026/10/14 10:00', note: 'メモ' };
  const m = reviewModule([{ status: 'SUCCESS', duplicateReviewVersion: 1, key: validKey, review }]);
  for (const bad of [{ key: 'x' }, { hidden: 'true' }, { reviewer: ' ' }, { reviewer: 'x'.repeat(41) }, { note: 'x'.repeat(201) }]) {
    await assert.rejects(m.api.set({ key: validKey, hidden: true, reviewer: '確認 太郎', note: '', level: 'high', ...bad }));
  }
  assert.equal(m.fetches.length, 0);
  const saved = await m.api.set({ key: validKey, hidden: true, reviewer: ' 確認 太郎 ', note: ' メモ ', level: 'high', kind: '種類', summary: '要約' });
  assert.deepEqual(plain(saved), review);
  assert.deepEqual(m.fetches[0].body, { action: 'setDuplicateReview', key: validKey, hidden: true, reviewer: '確認 太郎',
    note: 'メモ', level: 'high', kind: '種類', summary: '要約', sessionToken: 'session-token' });
});

// ---------------------------------------------------------------- pages/marugo.html

const html = read('pages/marugo.html');
const inline = html.match(/<script>\s*(\/\/ ソート機能用の変数[\s\S]*?)<\/script>/)[1];

function page(options = {}) {
  const fields = { 'start-date': '2026-09-01', 'end-date': '2026-09-30', 'store-name': options.store || '' };
  const elements = new Map();
  const listeners = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, value: fields[id] || '', style: {}, innerHTML: '', textContent: '', classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  // 描画したボタンを、HTML の属性からクリックできる要素として返す
  const buttons = selector => {
    const source = element('details-table').innerHTML;
    const cls = selector.replace(/^\./, '');
    return [...source.matchAll(/<button\b([^>]*)>/g)].filter(([, attrs]) => new RegExp(`class="[^"]*\\b${cls}\\b`).test(attrs))
      .map(([, attrs]) => {
        const dataset = {};
        for (const [, name, value] of attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
          dataset[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        }
        const btn = { dataset, addEventListener(type, fn) { listeners.push({ type, fn, btn }); } };
        return btn;
      });
  };
  const document = {
    getElementById: element,
    querySelectorAll: selector => selector.startsWith('.dup-') ? buttons(selector) : [],
    addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} }
  };
  const storage = new Map(options.storage || []);
  const prompts = (options.prompts || []).slice();
  const calls = { list: 0, set: [], prompts: [], confirms: [], alerts: [], logs: [] };
  const context = vm.createContext({
    document, console: { log() {}, warn() {}, error() {} }, showSummary() {},
    Papa: { unparse: records => JSON.stringify(records) },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    prompt: (message, value) => { calls.prompts.push({ message, value }); return prompts.length ? prompts.shift() : null; },
    confirm: message => { calls.confirms.push(message); return options.confirm !== false; }
  });
  context.window = context;
  vm.runInContext(read('js/duplicate-check.js'), context);
  if (options.api !== false) {
    context.DuplicateReview = {
      list: async () => { calls.list++; if (options.listError) throw new Error(options.listError); return plain(options.reviews || {}); },
      set: async payload => {
        calls.set.push(plain(payload));
        if (options.setError) throw new Error(options.setError);
        return { hidden: payload.hidden, reviewer: payload.reviewer, reviewedAt: '2026/10/14 11:22', note: payload.note };
      }
    };
  }
  vm.runInContext(inline, context);
  const Analyzer = vm.runInContext('GoogleSheetsAPIAnalyzer', context);
  const analyzer = Object.create(Analyzer.prototype);
  analyzer.log = (message, type) => calls.logs.push({ message, type });
  analyzer.addRowClickEvents = () => {};
  analyzer.showCustomAlertDialog = message => calls.alerts.push(message);
  return { analyzer, get: element, calls, storage, listeners, context };
}

const row = (date, lender, borrower, amount, time, originalRowIndex, item = '同じ品目') => ({
  date, lender, borrower, amount, inputDate: time, originalRowIndex,
  name: '入力者', item, category: '飲料', quantity: '1', unitPrice: String(amount), correction: ''
});
const DATA = [
  row('2026-09-13', 'BISTRO CAVACAVA', 'MARUGO2', 100, '2026/09/21 20:54:25', 2),
  row('2026-09-13', 'BISTRO CAVACAVA', 'MARUGO2', 100, '2026/09/21 20:55:06', 3),
  row('2026-09-14', 'Claudia2', 'MARUGO2', 300, '2026/09/21 20:54:25', 4, '別の品目'),
  row('2026-09-14', 'Claudia2', 'MARUGO2', 300, '2026/09/21 20:55:06', 5, '別の品目')
];
const keyForLender = lender => D.groupKey(D.findSuspects(DATA.map(r => ({ ...r }))).groups.find(g => g.rows[0].lender === lender));
const hiddenReview = (extra = {}) => ({ hidden: true, reviewer: '確認 花子', reviewedAt: '2026/10/14 09:30', note: '両店の正当な取引', ...extra });

async function checked(options) {
  const p = page(options);
  p.analyzer.data = DATA.map(r => ({ ...r }));
  await p.analyzer.checkDuplicates();
  return p;
}

test('画面: 問題なしとして非表示にした候補は既定で隠し、件数と切替ボタンを表示する', async () => {
  const claudia = keyForLender('Claudia2');
  const p = await checked({ reviews: { [claudia]: hiddenReview() } });
  const table = p.get('details-table').innerHTML;
  assert.equal(p.calls.list, 1);
  assert.equal(p.analyzer.duplicateGroups.length, 1);
  assert.deepEqual(plain(p.analyzer.searchResults.map(r => r.originalRowIndex).sort()), [2, 3]);
  assert.doesNotMatch(table, /Claudia2/);
  assert.match(table, /問題なしとして非表示: 1グループ（判定は残っています）/);
  assert.match(table, /非表示にした候補も表示/);
  assert.match(table, /✓ 問題なし（非表示）/);
  assert.match(p.get('summary-cards').innerHTML, /¥100/);
  assert.doesNotMatch(p.get('summary-cards').innerHTML, /¥300/, '集計は表示中の候補だけ');
  assert.match(p.get('summary-cards').innerHTML, /問題なしとして非表示: 1グループ/);
  // ボタンは見出し行（dup-group-row）にあり、逆取引修正の行（data-row）には置かない
  for (const rowHtml of table.split('<tr').filter(part => /class="data-row/.test(part))) {
    assert.doesNotMatch(rowHtml, /<button/);
  }
});

test('画面: 切替で非表示の候補も表示し、確認者・日時・メモと「表示に戻す」を出す', async () => {
  const claudia = keyForLender('Claudia2');
  const p = await checked({ reviews: { [claudia]: hiddenReview({ reviewer: '<img src=x onerror=alert(1)>', note: '"&メモ' }) } });
  p.analyzer.toggleHiddenDuplicates();
  const table = p.get('details-table').innerHTML;
  assert.match(table, /Claudia2/);
  assert.match(table, /確認済み：&lt;img src=x onerror=alert\(1\)&gt;・2026\/10\/14 09:30・&quot;&amp;メモ/);
  assert.doesNotMatch(table, /<img/);
  assert.match(table, /表示に戻す/);
  assert.match(table, /非表示の候補を隠す/);
  assert.equal(p.calls.list, 1, '切替では読み込み直さない');
  assert.deepEqual(plain(p.analyzer.searchResults.map(r => r.originalRowIndex).sort()), [2, 3, 4, 5]);
  assert.match(p.get('summary-cards').innerHTML, /¥100/);
  assert.doesNotMatch(p.get('summary-cards').innerHTML, /¥300/, '表示しても集計は未確認の候補だけ');
  p.analyzer.toggleHiddenDuplicates();
  assert.doesNotMatch(p.get('details-table').innerHTML, /Claudia2/);
});

test('画面: 「問題なし（非表示）」は名前・メモ・確認の後に保存し、再読み込みせずに隠す', async () => {
  const p = await checked({ prompts: [' 確認 花子 ', ' 両店の正当な取引 '], storage: [['duplicateReviewer', '前回の人']] });
  const claudia = keyForLender('Claudia2');
  // 見出しのボタンのクリックは行のクリック（逆取引修正）に伝えない
  p.analyzer.bindDuplicateReviewButtons();
  const listener = p.listeners.find(l => l.btn.dataset.groupKey === claudia && l.btn.dataset.reviewAction === 'hide');
  assert.ok(listener, 'hide button bound');
  let stopped = 0;
  await listener.fn({ preventDefault() {}, stopPropagation() { stopped++; } });
  assert.equal(stopped, 1);
  assert.equal(p.calls.prompts[0].value, '前回の人', '前回の名前を初期値にする');
  assert.equal(p.calls.confirms.length, 1);
  assert.match(p.calls.confirms[0], /表示を隠すだけ/);
  assert.match(p.calls.confirms[0], /判定/);
  assert.equal(p.calls.set.length, 1);
  const sent = p.calls.set[0];
  assert.equal(sent.key, claudia);
  assert.equal(sent.hidden, true);
  assert.equal(sent.reviewer, '確認 花子');
  assert.equal(sent.note, '両店の正当な取引');
  assert.equal(sent.level, 'high');
  assert.ok(sent.kind.length > 0);
  assert.match(sent.summary, /Claudia2/);
  assert.doesNotMatch(sent.summary, /入力者/, '要約に入力者名を入れない');
  assert.equal(p.storage.get('duplicateReviewer'), '確認 花子');
  assert.equal(p.calls.list, 1, '保存後に読み込み直さない');
  assert.doesNotMatch(p.get('details-table').innerHTML, /Claudia2/);
  assert.match(p.get('details-table').innerHTML, /問題なしとして非表示: 1グループ/);

  // 表示に戻す（メモは聞かない）
  p.analyzer.toggleHiddenDuplicates();
  p.calls.prompts.length = 0;
  p.context.prompt = () => '戻す 人';
  await p.analyzer.reviewDuplicateGroup(claudia, false);
  assert.equal(p.calls.set.length, 2);
  assert.equal(p.calls.set[1].hidden, false);
  assert.equal(p.calls.set[1].note, '');
  assert.equal(p.analyzer.duplicateGroups.length, 2);
  assert.doesNotMatch(p.get('details-table').innerHTML, /問題なしとして非表示: \d/);
});

test('画面: 名前なし・取消・保存失敗では状態を変えない', async () => {
  const claudia = keyForLender('Claudia2');
  const blank = await checked({ prompts: ['   '] });
  await blank.analyzer.reviewDuplicateGroup(claudia, true);
  assert.equal(blank.calls.set.length, 0);
  assert.equal(blank.analyzer.duplicateGroups.length, 2);

  const cancelled = await checked({ prompts: ['確認 花子', ''], confirm: false });
  await cancelled.analyzer.reviewDuplicateGroup(claudia, true);
  assert.equal(cancelled.calls.set.length, 0);
  assert.equal(cancelled.analyzer.duplicateGroups.length, 2);

  const noName = await checked({ prompts: [null] });
  await noName.analyzer.reviewDuplicateGroup(claudia, true);
  assert.equal(noName.calls.set.length, 0);

  const failed = await checked({ prompts: ['確認 花子', ''], setError: 'サーバーエラー' });
  await failed.analyzer.reviewDuplicateGroup(claudia, true);
  assert.equal(failed.calls.set.length, 1);
  assert.equal(failed.analyzer.duplicateGroups.length, 2, '失敗したら表示を変えない');
  assert.match(failed.get('details-table').innerHTML, /Claudia2/);
  assert.ok(failed.calls.alerts.some(m => /保存できませんでした.*サーバーエラー/.test(m)));
});

test('画面: 確認状態を読めなくても全候補を表示し、その旨を表示する', async () => {
  const failed = await checked({ listError: 'network' });
  assert.equal(failed.analyzer.duplicateGroups.length, 2);
  assert.match(failed.get('details-table').innerHTML, /確認状態を読み込めませんでした/);
  const missing = page({ api: false });
  missing.analyzer.data = DATA.map(r => ({ ...r }));
  await missing.analyzer.checkDuplicates();
  assert.equal(missing.analyzer.duplicateGroups.length, 2);
  assert.match(missing.get('details-table').innerHTML, /確認状態を読み込めませんでした/);
});

test('画面: 店舗の絞り込みを保ち、CSVは非表示の候補も確認状態付きで出す', async () => {
  const claudia = keyForLender('Claudia2');
  const cava = keyForLender('BISTRO CAVACAVA');
  const filtered = await checked({ store: 'BISTRO CAVACAVA', reviews: { [claudia]: hiddenReview() } });
  assert.equal(filtered.analyzer.duplicateGroups.length, 1);
  assert.doesNotMatch(filtered.get('details-table').innerHTML, /問題なしとして非表示: 1/, '選択店舗に関係しない確認済みは数えない');

  const p = await checked({ reviews: { [claudia]: hiddenReview({ reviewer: '=cmd' }), [cava]: hiddenReview() } });
  assert.equal(p.analyzer.searchResults.length, 0);
  assert.match(p.get('details-table').innerHTML, /問題なしとして非表示: 2グループ/);
  let exported;
  p.analyzer.downloadCsv = csv => { exported = JSON.parse(csv); };
  p.get('details-title').textContent = '重複チェック - 重複・入力ミスの疑い';
  p.analyzer.exportResults();
  assert.ok(exported, '表示中が0件でもCSVを出す');
  assert.equal(exported.length, 4);
  assert.deepEqual([...new Set(exported.map(r => r.確認状態))], ['確認済み（非表示）']);
  const claudiaRow = exported.find(r => r.貸主 === 'Claudia2');
  assert.equal(claudiaRow.確認者, "'=cmd", 'CSVの数式を無効化');
  assert.equal(claudiaRow.確認日時, '2026/10/14 09:30');
  assert.equal(claudiaRow.確認メモ, '両店の正当な取引');

  const none = await checked({});
  let all;
  none.analyzer.downloadCsv = csv => { all = JSON.parse(csv); };
  none.analyzer.exportDuplicateCheck();
  assert.deepEqual([...new Set(all.map(r => r.確認状態))], ['未確認']);
  assert.deepEqual([...new Set(all.map(r => r.確認者))], ['']);
});

test('画面: 確認状態の読み込みスクリプトと判定スクリプトの版番号を更新する', () => {
  assert.match(html, /<script src="\.\.\/js\/duplicate-review\.js\?v=2026101401"><\/script>/);
  assert.match(html, /<script src="\.\.\/js\/duplicate-check\.js\?v=2026101401"><\/script>/);
  assert.ok(html.indexOf('duplicate-review.js') > html.indexOf('config.js'), 'LoanSession の後に読み込む');
  for (const file of ['index.html', 'pages/marugo.html']) {
    assert.doesNotMatch(read(file), /duplicate-check\.js\?v=(?!2026101401)/, file);
  }
});

test('画面: 一覧の数字列は集計カードと同じ書体（¥ の字形をそろえる）で、桁は等幅数字', () => {
  const css = read('pages/css/styles.css');
  const numeric = css.match(/\/\* --- 数字列のスタイル \(PC\) --- \*\/[^{]*\{([^}]*)\}/)[1];
  const amount = css.match(/\n\.amount \{([^}]*)\}/)[1];
  for (const rule of [numeric, amount]) {
    assert.match(rule, /font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif/);
    assert.match(rule, /font-variant-numeric: tabular-nums/);
    assert.doesNotMatch(rule, /Courier/);
  }
  assert.match(css, /body \{\s*font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;/, '集計カードは body の書体を継承');
  assert.match(html, /css\/styles\.css\?v=2026101401/);
  assert.match(html, /¥\$\{row\.amount\.toLocaleString\(\)\}/, '円記号は U+00A5 のまま');
});
