const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages/marugo.html'), 'utf8');
const inline = html.match(/<script>\s*(\/\/ ソート機能用の変数[\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'actual analysis page script must be available');
assert.match(html, /id="duplicate-check-btn"/);
assert.match(html, /id="store-balance-btn"/);

function page(selectedStore) {
  const fields = { 'start-date': '2026-09-01', 'end-date': '2026-09-30', 'store-name': selectedStore };
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        value: fields[id] || '', style: {}, innerHTML: '', textContent: '',
        classList: { add() {}, remove() {} }
      });
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const context = vm.createContext({
    document, console: { log() {}, warn() {}, error() {} }, showSummary() {},
    Papa: { unparse: records => JSON.stringify(records) } // serialize only; use the actual export aggregation
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'js/duplicate-check.js'), 'utf8'), context);
  vm.runInContext(inline, context);
  const Analyzer = vm.runInContext('GoogleSheetsAPIAnalyzer', context);
  const analyzer = Object.create(Analyzer.prototype); // no login/network in constructor
  analyzer.log = () => {};
  analyzer.addRowClickEvents = () => {};
  return { analyzer, fields, get: id => document.getElementById(id) };
}

function row(date, lender, borrower, amount, time, originalRowIndex) {
  return {
    date, lender, borrower, amount, inputDate: time, originalRowIndex,
    name: '入力者', item: '同じ品目', category: '飲料', quantity: '1', unitPrice: String(amount), correction: ''
  };
}

test('重複チェックは選択店舗が関係するグループだけを表示し、未選択なら全店舗を表示する', () => {
  const { analyzer, fields, get } = page('BISTRO CAVACAVA');
  analyzer.data = [
    row('2026-09-13', 'BISTRO CAVACAVA', 'MARUGO2', 100, '2026/09/21 20:54:25', 2),
    row('2026-09-13', 'BISTRO CAVACAVA', 'MARUGO2', 100, '2026/09/21 20:55:06', 3),
    row('2026-09-13', 'Claudia2', 'MARUGO2', 300, '2026/09/21 20:54:25', 4),
    row('2026-09-13', 'Claudia2', 'MARUGO2', 300, '2026/09/21 20:55:06', 5)
  ];
  analyzer.checkDuplicates();
  assert.equal(analyzer.duplicateGroups.length, 1);
  assert.equal(analyzer.searchResults.length, 2);
  assert.match(get('details-table').innerHTML, /BISTRO CAVACAVA/);
  assert.doesNotMatch(get('details-table').innerHTML, /Claudia2/);
  assert.match(get('summary-cards').innerHTML, /¥100/);
  assert.doesNotMatch(get('summary-cards').innerHTML, /¥400/);

  fields['store-name'] = '';
  get('store-name').value = '';
  analyzer.checkDuplicates();
  assert.equal(analyzer.duplicateGroups.length, 2);
  assert.match(get('details-table').innerHTML, /Claudia2/);

  get('store-name').value = 'MARUGO2';
  analyzer.checkDuplicates();
  assert.equal(analyzer.duplicateGroups.length, 2, '借主側の選択でも該当する両グループを表示');

  get('store-name').value = '該当なし';
  analyzer.checkDuplicates();
  assert.equal(analyzer.duplicateGroups.length, 0);
  assert.equal(analyzer.searchResults.length, 0);
  assert.match(get('details-table').innerHTML, /疑いは見つかりませんでした/);
});

test('店舗別貸借り合計は選択店舗が関係する期間内取引だけを集計・表示する', () => {
  const { analyzer, get } = page('BISTRO CAVACAVA');
  analyzer.data = [
    row('2026-09-13', 'BISTRO CAVACAVA', 'MARUGO2', 100, '2026/09/13 10:00:00', 2),
    row('2026-09-14', 'Claudia2', 'BISTRO CAVACAVA', 50, '2026/09/14 10:00:00', 3),
    row('2026-09-15', 'Claudia2', 'MARUGO2', 999, '2026/09/15 10:00:00', 4),
    row('2026-08-01', 'BISTRO CAVACAVA', 'MARUGO2', 600, '2026/08/01 10:00:00', 5)
  ];
  analyzer.analyzeStoreBalance();
  assert.equal(analyzer.searchResults.length, 2);
  const names = [...get('details-table').innerHTML.matchAll(/class="store-balance-summary-row" data-store-name="([^"]+)"/g)]
    .map(match => match[1]);
  assert.deepEqual(names, ['BISTRO CAVACAVA']);
  assert.match(get('details-table').innerHTML, /貸: ¥100 \(1件\)/);
  assert.match(get('details-table').innerHTML, /借: ¥50 \(1件\)/);
  assert.match(get('summary-cards').innerHTML, /¥100/);
  assert.match(get('summary-cards').innerHTML, /¥50/);
  assert.doesNotMatch(get('summary-cards').innerHTML, /¥999/);
  assert.doesNotMatch(get('summary-cards').innerHTML, /全店舗合計/);
  assert.match(get('summary-cards').innerHTML, /選択店舗合計/);

  let selectedExport;
  analyzer.downloadCsv = csv => { selectedExport = JSON.parse(csv); };
  get('store-name').value = 'MARUGO2'; // 値を変えただけなら表示済みの結果を出力する
  analyzer.exportResults();
  assert.deepEqual(selectedExport.map(store => store.店舗名), ['BISTRO CAVACAVA']);
  assert.equal(selectedExport[0].貸出金額, 100);
  assert.equal(selectedExport[0].借入金額, 50);

  const all = page('');
  all.analyzer.data = analyzer.data;
  all.analyzer.analyzeStoreBalance();
  assert.equal(all.analyzer.searchResults.length, 3);
  const allStores = [...all.get('details-table').innerHTML.matchAll(/class="store-balance-summary-row" data-store-name="([^"]+)"/g)]
    .map(match => match[1]);
  assert.deepEqual(allStores.sort(), ['BISTRO CAVACAVA', 'Claudia2', 'MARUGO2'].sort());
  assert.match(all.get('summary-cards').innerHTML, /全店舗合計/);
  let allExport;
  all.analyzer.downloadCsv = csv => { allExport = JSON.parse(csv); };
  all.analyzer.exportResults();
  assert.deepEqual(allExport.map(store => store.店舗名).sort(), allStores.sort());

  const missing = page('取引なし店舗');
  missing.analyzer.data = analyzer.data;
  missing.analyzer.analyzeStoreBalance();
  assert.equal(missing.analyzer.searchResults.length, 0);
  assert.equal(missing.get('details-table').innerHTML, '');
  assert.match(missing.get('summary-cards').innerHTML, /<div class="value">0<\/div>/);
});

test('期間外の元行を取り消す修正行は店舗合計にもCSVにも残さない', () => {
  const { analyzer, get } = page('BISTRO CAVACAVA');
  const correction = row('2026-09-01', 'MARUGO2', 'BISTRO CAVACAVA', 100, '2026/09/01 11:00:00', 3);
  correction.correction = '✏️修正';
  analyzer.data = [
    row('2026-08-31', 'BISTRO CAVACAVA', 'MARUGO2', 100, '2026/08/31 11:00:00', 2),
    correction
  ];
  analyzer.analyzeStoreBalance();
  assert.equal(analyzer.searchResults.length, 1, '期間内には修正行がある');
  assert.equal(get('details-table').innerHTML, '', '相殺ペアは残高に現れない');
  let exported;
  analyzer.downloadCsv = csv => { exported = JSON.parse(csv); };
  analyzer.exportResults();
  assert.deepEqual(exported, []);
});

test('M-martの貸借向き補正と旧店舗名を選択店舗の集計・CSVでも守る', () => {
  const { analyzer, get } = page('BISTRO CAVACAVA');
  const loan = row('2026-09-13', analyzer.normalizeStoreName('BISTRO CAVA-CAVA'), '本部', 250,
    '2026/09/13 10:00:00', 2);
  loan.category = 'M-mart';
  analyzer.data = [loan, row('2026-09-13', 'Claudia2', 'MARUGO2', 999, '2026/09/13 10:00:00', 3)];
  analyzer.analyzeStoreBalance();
  assert.equal(analyzer.searchResults.length, 1);
  assert.match(get('details-table').innerHTML, /借: ¥250 \(1件\)/);
  assert.doesNotMatch(get('details-table').innerHTML, /store-balance-summary-row" data-store-name="本部"/);
  let exported;
  analyzer.downloadCsv = csv => { exported = JSON.parse(csv); };
  analyzer.exportResults();
  assert.deepEqual(exported.map(store => store.店舗名), ['BISTRO CAVACAVA']);
  assert.equal(exported[0].借入金額, 250);
});

test('解析画面の行は元行の受付ID（L列）を持ち、修正画面へ渡せる', async () => {
  const { analyzer } = page('');
  analyzer.debugLog = () => {};
  analyzer.stores = new Set();
  await analyzer.processSheetData([
    ['›', '名前', '貸主', '借主', 'カテゴリー', '品目', '個/本', '単価', '金額', '入力日時', '修正', '__receipt_id_v1'],
    ['2026/09/29', '田中', 'A', 'B', '飲料', '品A', '1', '100', '100', '2026/09/29 09:00:00', '', 'origin-receipt'],
    ['2026/09/29', '田中', 'A', 'B', '飲料', '品B', '1', '100', '100', '2026/09/29 09:00:00', '']
  ]);
  assert.deepEqual(analyzer.data.map(row => row.receiptId), ['origin-receipt', '']);
  assert.deepEqual(analyzer.data.map(row => row.name), ['田中', '田中']);
});
