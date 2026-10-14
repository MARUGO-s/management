const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages/marugo.html'), 'utf8');
const inline = html.match(/<script>\s*(\/\/ ソート機能用の変数[\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'test the actual analysis controller, not a copy of its mapping');
const HEADER = ['›', '名前', '貸主', '借主', 'カテゴリー', '品目', '個/本', '単価', '金額', '入力日時', '修正', '__receipt_id_v1', '__receipt_hash_v1'];
const ROW = ['2026/09/29', 'テスト入力者', 'A店', 'B店', '飲料', '品目A', '1.00', '2851', '2851', '2026/10/14 16:11:35', '', 'origin-test-receipt', 'test-hash'];
const plain = value => JSON.parse(JSON.stringify(value));

function page(values, htmlSource = html) {
  const elements = new Map();
  const fields = { 'start-date': '2026-09-01', 'end-date': '2026-10-31', 'store-name': '' };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        value: fields[id] || '', style: {}, innerHTML: '', textContent: '',
        classList: { add() {}, remove() {} }
      });
      return elements.get(id);
    },
    querySelectorAll() { return []; }, addEventListener() {}
  };
  const context = vm.createContext({ document, console: { log() {}, warn() {}, error() {} },
    showSummary() {}, Papa: { unparse: records => JSON.stringify(records) } });
  context.window = context;
  context.unifiedDataLoader = { loadAllData: async () => ({ rawData: values, stats: {}, names: [], items: [], stores: new Set() }) };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/duplicate-check.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/duplicate-review.js'), 'utf8'), context);
  const actualScript = htmlSource.match(/<script>\s*(\/\/ ソート機能用の変数[\s\S]*?)<\/script>/)?.[1];
  assert.ok(actualScript, 'the selected version must include the actual analysis script');
  vm.runInContext(actualScript, context);
  const Analyzer = vm.runInContext('GoogleSheetsAPIAnalyzer', context);
  const analyzer = Object.create(Analyzer.prototype); // no authentication or business API calls
  const logs = [];
  analyzer.log = (message, type) => logs.push({ message, type });
  analyzer.debugLog = () => {};
  analyzer.showDebugInfo = () => {};
  analyzer.populateStoreDropdown = () => {};
  analyzer.distributeDataToOtherSystems = async () => {};
  analyzer.addRowClickEvents = () => {};
  analyzer.stores = new Set();
  analyzer.data = [];
  return { analyzer, context, logs, get: id => document.getElementById(id) };
}

function expectedRow(row = ROW, originalRowIndex = 2) {
  return {
    date: row[0].replace(/\//g, '-'), name: row[1], lender: row[2], borrower: row[3],
    category: row[4], item: row[5], quantity: row[6], unitPrice: row[7],
    amount: Number(String(row[8]).replace(/,/g, '')), originalAmount: row[8], inputDate: row[9],
    correction: row[10], receiptId: row[11] || '', originalRowIndex
  };
}

test('質問文に単価を含むA1でも取引日・数量・単価・金額を元の列から読む', async () => {
  const values = [['この貸借の履歴を見ると、単価と', ...HEADER.slice(1)], ROW.slice()];
  const original = JSON.stringify(values);
  const { analyzer } = page(values);
  await analyzer.processSheetData(values);
  assert.deepEqual(plain(analyzer.data), [expectedRow()]);
  assert.equal(JSON.stringify(values), original, 'raw sheet values must remain unchanged');
});

for (const firstHeader of ['›', '日付', '単価', '金額', '入力日時', '', null, '日付と単価と金額を確認']) {
  test(`既知の貸借表はA1=${JSON.stringify(firstHeader)}でも列と受付IDを維持する`, async () => {
    const values = [[firstHeader, ...HEADER.slice(1)], ROW.slice()];
    const { analyzer } = page(values);
    await analyzer.processSheetData(values);
    assert.deepEqual(plain(analyzer.data), [expectedRow()]);
  });
}

test('統合ローダー経由の本体接続でもA列の日付とH列の単価を読む', async () => {
  const values = [['この貸借の履歴を見ると、単価と', ...HEADER.slice(1)], ROW.slice()];
  const { analyzer, logs } = page(values);
  await analyzer.connectToGoogleSheets();
  assert.deepEqual(plain(analyzer.data), [expectedRow()]);
  assert.equal(logs.some(log => log.type === 'error'), false);
});

test('正しい列から読んだ一致行は金額不一致にせず、実際の不一致は検出する', async () => {
  const wrongAmount = ROW.slice(); wrongAmount[8] = '3000'; wrongAmount[5] = '品目B';
  const { analyzer, context } = page();
  await analyzer.processSheetData([['この貸借の履歴を見ると、単価と', ...HEADER.slice(1)], ROW.slice(), wrongAmount]);
  const groups = context.DuplicateCheck.findSuspects(analyzer.data).groups;
  const mismatches = groups.filter(group => group.kind === '金額が数量×単価と合わない');
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].rows[0].originalRowIndex, 3);
});

test('見出しを並べ替えた表は一意の完全一致で読み、質問文を見出しにしない', async () => {
  const order = [7, 9, 1, 2, 3, 4, 5, 6, 0, 8, 10, 11, 12];
  const values = [order.map(i => HEADER[i]), order.map(i => ROW[i])];
  const { analyzer } = page(values);
  await analyzer.processSheetData(values);
  assert.deepEqual(plain(analyzer.data), [expectedRow()]);
});

test('既知の構成でない表の不明な取引日見出しは入力日時で補わずエラーにする', async () => {
  const headers = HEADER.slice(); headers[0] = 'この貸借の履歴を見ると、単価と';
  [headers[1], headers[2]] = [headers[2], headers[1]];
  const row = ROW.slice(); [row[1], row[2]] = [row[2], row[1]];
  const values = [headers, row];
  const { analyzer } = page(values);
  await assert.rejects(() => analyzer.processSheetData(values), /列見出しを確認できません/);
  assert.equal(analyzer.data.length, 0);
});

test('未知の構成の重複した単価見出しは一方を勝手に選ばない', async () => {
  const headers = HEADER.slice(); headers[0] = '単価';
  [headers[1], headers[2]] = [headers[2], headers[1]];
  const { analyzer } = page();
  await assert.rejects(() => analyzer.processSheetData([headers, ROW.slice()]), /列見出しが重複/);
});

test('列判定不能の本体接続は成功表示や誤読データを作らない', async () => {
  const headers = HEADER.slice(); headers[7] = 'この列は単価か確認する';
  const { analyzer, logs } = page([headers, ROW.slice()]);
  await analyzer.connectToGoogleSheets();
  assert.equal(analyzer.data.length, 0);
  assert.ok(logs.some(log => log.type === 'error' && /列見出しを確認できません/.test(log.message)));
  assert.equal(logs.some(log => /データ読み込み完了/.test(log.message)), false);
});

test('ヘッダーの全角英字・前後空白は値を変えず同じ列として読む', async () => {
  const headers = [' ｄａｔｅ ', ' name ', 'lender', 'borrower', 'category', 'item', 'quantity', ' ＵｎｉｔＰｒｉｃｅ ', 'amount', 'inputDate', 'correction', '__receipt_id_v1'];
  const { analyzer } = page();
  await analyzer.processSheetData([headers, ROW.slice()]);
  assert.deepEqual(plain(analyzer.data), [expectedRow()]);
});

test('旧データの空取引日は既存の入力日時補完を維持する', async () => {
  const row = ROW.slice(); row[0] = '';
  const { analyzer } = page();
  await analyzer.processSheetData([HEADER, row]);
  assert.equal(analyzer.data[0].date, '2026-10-14');
  assert.equal(analyzer.data[0].unitPrice, ROW[7]);
});

for (const correctionHeader of ['修正内容', '', null, undefined]) {
  for (const method of ['processSheetData', 'connectToGoogleSheets']) {
    test(`修正列が${String(correctionHeader)}の場合は逆取引を一般取引として読まない: ${method}`, async () => {
      const headers = HEADER.slice();
      if (correctionHeader === undefined) headers.length = 10;
      else headers[10] = correctionHeader;
      const correction = ROW.slice();
      [correction[2], correction[3]] = [correction[3], correction[2]];
      correction[9] = '2026/10/15 10:00:00'; correction[10] = '✏️修正';
      correction[11] = 'correction-test-receipt';
      const values = [headers, ROW.slice(), correction];
      const { analyzer, logs } = page(values);
      if (method === 'processSheetData') {
        await assert.rejects(() => analyzer.processSheetData(values), /列見出しを確認できません/);
      } else {
        await analyzer.connectToGoogleSheets();
        assert.ok(logs.some(log => log.type === 'error' && /列見出しを確認できません/.test(log.message)));
        assert.equal(logs.some(log => /データ読み込み完了/.test(log.message)), false);
      }
      assert.equal(analyzer.data.length, 0, 'do not publish uncancelled rows from an unknown correction column');
    });
  }
}

test('正しい修正列では逆取引フラグと相殺ペアを両読み込み経路で維持する', async () => {
  const correction = ROW.slice();
  [correction[2], correction[3]] = [correction[3], correction[2]];
  correction[9] = '2026/10/15 10:00:00'; correction[10] = '✏️修正';
  correction[11] = 'correction-test-receipt';
  const values = [HEADER.slice(), ROW.slice(), correction];
  for (const method of ['processSheetData', 'connectToGoogleSheets']) {
    const { analyzer, context } = page(values);
    if (method === 'processSheetData') await analyzer.processSheetData(values);
    else await analyzer.connectToGoogleSheets();
    assert.equal(analyzer.data[1].correction, '✏️修正');
    assert.equal(context.DuplicateCheck.findCorrectionPairs(analyzer.data).pairs.length, 1);
    assert.equal(analyzer.data[1].receiptId, 'correction-test-receipt');
  }
});

test('A1が受付IDと同名でも既知の貸借表のL列から元IDを読む', async () => {
  const values = [['__receipt_id_v1', ...HEADER.slice(1)], ROW.slice()];
  for (const method of ['processSheetData', 'connectToGoogleSheets']) {
    const { analyzer } = page(values);
    if (method === 'processSheetData') await analyzer.processSheetData(values);
    else await analyzer.connectToGoogleSheets();
    assert.deepEqual(plain(analyzer.data), [expectedRow()]);
  }
});

test('未知の構成で受付ID見出しが重複している場合は元IDを推測しない', async () => {
  const headers = HEADER.slice(); [headers[0], headers[1]] = [headers[1], headers[0]];
  headers.push('__receipt_id_v1');
  const row = ROW.slice(); [row[0], row[1]] = [row[1], row[0]]; row.push('other-receipt');
  const { analyzer } = page();
  await assert.rejects(() => analyzer.processSheetData([headers, row]), /受付ID.*重複/);
  assert.equal(analyzer.data.length, 0);
});

test('旧データに受付ID列がない場合はA列の日付をIDとして補わない', async () => {
  const row = ROW.slice(0, 11);
  const values = [['__receipt_id_v1', ...HEADER.slice(1, 11)], row];
  for (const method of ['processSheetData', 'connectToGoogleSheets']) {
    const { analyzer } = page(values);
    if (method === 'processSheetData') await analyzer.processSheetData(values);
    else await analyzer.connectToGoogleSheets();
    assert.deepEqual(plain(analyzer.data), [expectedRow(row)]);
  }
});

module.exports = { page, expectedRow, HEADER, ROW, plain };
