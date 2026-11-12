const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.BALANCE_CATEGORY_SOURCE || path.join(root, 'pages/marugo.html'), 'utf8');
const inline = html.match(/<script>\s*(\/\/ ソート機能用の変数[\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);
function page(store = '店舗A') {
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {value: ({'start-date':'2026-10-01','end-date':'2026-10-31','store-name':store})[id] || '', style:{},innerHTML:'',textContent:'',classList:{add(){},remove(){}}});
    return nodes.get(id);
  },querySelectorAll(){return [];},addEventListener(){}};
  const sandbox = vm.createContext({document,console:{log(){},warn(){},error(){}},showSummary(){},Papa:{unparse:rows=>JSON.stringify(rows)}});sandbox.window=sandbox;
  vm.runInContext(fs.readFileSync(path.join(root,'js/duplicate-check.js'),'utf8'),sandbox);vm.runInContext(inline,sandbox);
  const Analyzer=vm.runInContext('GoogleSheetsAPIAnalyzer',sandbox), analyzer=Object.create(Analyzer.prototype);analyzer.log=()=>{};analyzer.addRowClickEvents=()=>{};
  return {analyzer,get:id=>document.getElementById(id)};
}
function row(category,amount,lender='店舗A',borrower='店舗B',i=2,item='テスト品') {
  return {date:'2026-10-15',inputDate:`2026/10/15 10:00:${String(i).padStart(2,'0')}`,name:'見本入力者',lender,borrower,category,item,amount,quantity:'1',unitPrice:String(amount),correction:'',originalRowIndex:i};
}
function cards(p) {return [...p.get('summary-cards').innerHTML.matchAll(/<div class="summary-card [^"]+">([\s\S]*?)(?=<div class="summary-card |$)/g)].map(m=>m[1]);}
function value(card,key) {const m=card.match(new RegExp(`data-category="${key}"[^>]*>[\\s\\S]*?<strong>¥([^<]+)</strong>`));assert.ok(m,`${key}内訳が存在する`);return Number(m[1].replaceAll(',',''));}

test('選択店舗の貸出・借入カード内にフードと飲料を別々に表示する',()=>{
  const p=page();p.analyzer.data=[row('食材',1200),row('飲料',300,'店舗A','店舗B',3),row('食材',800,'店舗B','店舗A',4),row('飲料',200,'店舗B','店舗A',5)];
  p.analyzer.analyzeStoreBalance();const c=cards(p);
  assert.equal(value(c[0],'food'),1200);assert.equal(value(c[0],'drink'),300);assert.equal(value(c[1],'food'),800);assert.equal(value(c[1],'drink'),200);
  assert.match(c[0],/フード/);assert.match(c[0],/¥1,500/);assert.match(c[1],/¥1,000/);assert.equal(c.length,4);
});

test('不明分類はその他として残し、ゼロのフードと飲料も表示して総額と一致する',()=>{
  const p=page();p.analyzer.data=[row('その他',50),row('飲料',200,'店舗B','店舗A',3)];p.analyzer.analyzeStoreBalance();const c=cards(p);
  assert.equal(value(c[0],'food'),0);assert.equal(value(c[0],'drink'),0);assert.equal(value(c[0],'other'),50);assert.equal(value(c[1],'food'),0);assert.equal(value(c[1],'drink'),200);assert.doesNotMatch(c[1],/data-category="other"/);
  p.analyzer.updateStoreBalanceSummaryCardsWithoutStoreDetails([]);for(const card of cards(p).slice(0,2)){assert.equal(value(card,'food'),0);assert.equal(value(card,'drink'),0);}
});

test('期間・店舗・相殺・M-martの向き補正は既存の有効明細に従う',()=>{
  const p=page();const original=row('飲料',600,'店舗A','店舗B',2,'取消対象');original.date='2026-09-30';original.inputDate='2026/09/30 10:00:00';
  const correction={...original,date:'2026-10-01',inputDate:'2026/10/01 11:00:00',lender:'店舗B',borrower:'店舗A',correction:'✏️修正',originalRowIndex:3};
  const outside={...row('食材',700,'店舗A','店舗B',4),date:'2026-09-01'};
  const mmart=row('M-mart',250,'店舗A','本部',5,'玉ねぎ');p.analyzer.data=[original,correction,outside,mmart,row('飲料',999,'店舗C','店舗D',6)];
  p.analyzer.analyzeStoreBalance();const c=cards(p);assert.equal(value(c[0],'food'),0);assert.equal(value(c[0],'drink'),0);assert.equal(value(c[1],'food'),250);assert.equal(value(c[1],'drink'),0);
  let csv;p.analyzer.downloadCsv=v=>csv=JSON.parse(v);p.analyzer.exportResults();assert.equal(csv.length,1);assert.equal(csv[0].借入金額,250);assert.equal(csv[0].貸出金額,0);
  assert.doesNotMatch(p.get('summary-cards').innerHTML,/¥600|¥700|¥999/);
});

test('全店舗と補助サマリー経路も同じ分類を使い元明細を変更しない',()=>{
  const p=page('');p.analyzer.data=[row('食材',1200),row('飲料',300,'店舗B','店舗C',3)];const before=JSON.stringify(p.analyzer.data);p.analyzer.analyzeStoreBalance();let c=cards(p);
  for(const card of c.slice(0,2)){assert.equal(value(card,'food'),1200);assert.equal(value(card,'drink'),300);assert.match(card,/¥1,500/);}
  const stores=[{storeName:'店舗A',lentAmount:1200,borrowedAmount:300,balance:900,totalTransactions:2,lentCount:1,borrowedCount:1,lentItems:[row('食材',1200)],borrowedItems:[row('飲料',300)]}];
  p.analyzer.updateStoreBalanceSummaryCards(stores);c=cards(p);assert.equal(value(c[0],'food'),1200);assert.equal(value(c[1],'drink'),300);assert.equal(JSON.stringify(p.analyzer.data),before);
});

test('既存のカテゴリー優先・品目推定を継承し新表示に任意HTMLを埋め込まない',()=>{
  const p=page();const items=[row('食材',100,'店舗A','店舗B',2,'ワイン'),row('飲料',200,'店舗A','店舗B',3,'肉'),row('M-mart',300,'店舗A','店舗B',4,'玉ねぎ'),row('',400,'店舗A','店舗B',5,'ワイン'),row('',-20,'店舗A','店舗B',6,'不明<img onerror=x>')];
  const rendered=p.analyzer.renderBalanceCategoryBreakdown([{lentItems:items}],'lentItems');assert.equal(value(rendered,'food'),400);assert.equal(value(rendered,'drink'),600);assert.equal(value(rendered,'other'),-20);assert.doesNotMatch(rendered,/<img|onerror/);
});

test('CSSの更新版を参照する',()=>{assert.match(html,/css\/styles\.css\?v=2026111201/);});
