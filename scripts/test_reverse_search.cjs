const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages/js/main.js'), 'utf8');
const search = source.slice(source.indexOf('async function searchReverseTransaction()'),
  source.indexOf('// 送信完了後:', source.indexOf('async function searchReverseTransaction()')));
const checker = fs.readFileSync(path.join(root, 'js/duplicate-check.js'), 'utf8');
function fixture(values) {
  const elements = new Map();
  const inputs = { date: '2026-10-12', name: '入力者', lender: '店舗B', borrower: 'MARUGO',
    category: '飲料', item: '品A', quantity:'1', unitPrice:'100', amount: '100' };
  for (const [id, value] of Object.entries(inputs)) elements.set(id, { value });
  const btnText = { textContent: '検索' };
  elements.set('search-btn', { disabled: false, classList: { add() {}, remove() {} }, querySelector: () => btnText });
  elements.set('search-result', { classList: { add() {}, remove() {} } });
  elements.set('search-result-content', { innerHTML: '', dataset: {}, addEventListener() {}, removeEventListener() {} });
  let reads = 0, posts = 0, submissions = 0, alerts = 0;
  const context = vm.createContext({
    console: { log() {}, error() {} },
    document: { getElementById: id => elements.get(id) },
    convertToHalfWidthNumber: v => v,
    GAS_URL: 'no-write',
    confirm: () => true,
    alert() { alerts++; },
    async submitData() { submissions++; },
    delay: async () => {},
    handleSearchResultButtonClick() {},
    Math: Object.assign(Object.create(Math), { random() { throw new Error('random search is forbidden'); } }),
    fetch() { posts++; throw new Error('search must not POST'); },
    async callSheetsAPI(range, method) { reads++; assert.equal(range, '貸借表!A:K'); assert.equal(method, 'GET');
      if (values instanceof Error) throw values; return { values }; }
  });
  vm.runInContext(checker, context);
  vm.runInContext(search, context);
  vm.runInContext(source.slice(source.indexOf('async function handleSearchResultButtonClick('),
    source.indexOf('async function submitData(options', source.indexOf('async function handleSearchResultButtonClick('))), context);
  return { run: () => context.searchReverseTransaction(), context, elements,
    reads: () => reads, posts: () => posts, submissions: () => submissions, alerts: () => alerts };
}
const header = ['日付','名前','貸主','借主','分類','品目','数量','単価','金額','入力日時','修正'];
const row = [ '2026/10/12', '実在の入力者', 'マルゴ', '店舗B', '飲料', '品A', '1', '100', '100', '2026/10/12 10:00:00', '' ];
test('reverse search reads actual sheet, never writes or invents a result', async () => {
  const found=fixture([header,row]);
  await found.run();
  assert.equal(found.reads(),1); assert.equal(found.posts(),0);
  assert.match(found.elements.get('search-result-content').innerHTML,/実在の入力者/);
  assert.doesNotMatch(found.elements.get('search-result-content').innerHTML,/システム検索結果/);
  const missing=fixture([header]);
  await missing.run();
  assert.equal(missing.posts(),0);
  assert.doesNotMatch(missing.elements.get('search-result-content').innerHTML,/correction-from-search-new/);
});
test('editing the form after a matching search cannot submit a stale correction', async () => {
  const found=fixture([header,row]);
  await found.run();
  found.elements.get('amount').value='200';
  await found.context.handleSearchResultButtonClick({target:{id:'correction-from-search'}});
  assert.equal(found.submissions(),0);
  assert.equal(found.alerts(),1);
});

test('editing any correction field after a matching search requires another search', async () => {
  for (const field of ['name','quantity','unitPrice']) {
    const found=fixture([header,row]);
    await found.run();
    found.elements.get(field).value='changed';
    await found.context.handleSearchResultButtonClick({target:{id:'correction-from-search'}});
    assert.equal(found.submissions(),0,field);
    assert.equal(found.alerts(),1,field);
  }
});

test('reverse search read failure shows an error and no correction action', async () => {
  const failed=fixture(new Error('read unavailable'));
  await failed.run();
  assert.equal(failed.posts(),0);
  assert.match(failed.elements.get('search-result-content').innerHTML,/エラー/);
  assert.doesNotMatch(failed.elements.get('search-result-content').innerHTML,/correction-from-search/);
});
