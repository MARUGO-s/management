const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// CI stays Node/stdlib-only. Real Chrome integration is scripts/browser_correction_xss.js.
const file = process.env.CORRECTION_XSS_SOURCE || path.join(__dirname, '../pages/js/correction.js');
const source = fs.readFileSync(file, 'utf8');
const end = source.indexOf('// ページが完全に読み込まれた後に実行');
assert.ok(end > 0);
function fixture(search = '') {
  let htmlWrites = 0;
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.value = ''; this.className = ''; this._text = ''; }
    set textContent(value) { this.children = []; this._text = String(value); }
    get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
    set innerHTML(value) { if (String(value)) htmlWrites++; this.children = []; this._text = String(value); }
    get innerHTML() { return ''; }
    appendChild(child) { this.children.push(child); return child; }
  }
  const nodes = new Map();
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Node('div')); return nodes.get(id); },createElement: tag => new Node(tag),createTextNode: value => {const n = new Node('#text');n.textContent = value;return n;} };
  const storage = () => {const data = new Map();return {getItem: key => data.get(key) ?? null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),key:i=>[...data.keys()][i],get length(){return data.size;}};};
  const sandbox = {document,window:{location:{search}},URLSearchParams,localStorage:storage(),sessionStorage:storage(),console:{log(){},error(){},warn(){}},fetch(){throw Error('NETWORK_DISABLED');}};
  const context = vm.createContext(sandbox);
  vm.runInContext(source.slice(0,end),context);
  return {sandbox,document,nodes,run: code => vm.runInContext(code,context),writes:()=>htmlWrites};
}
const literal = '<img src=x onerror=marker()>日本語 "引用" & <文字>\n改行';
test('correction debug log preserves literal text and never calls a dynamic HTML sink', () => {
  const h=fixture();h.sandbox.value=literal;h.run('addDebugLog(value,{value})');
  assert.equal(h.writes(),0);assert.ok(h.nodes.get('debug-content').textContent.includes(literal));
  assert.equal(h.nodes.get('debug-content').children[0].tagName,'div');
  assert.equal(h.nodes.get('debug-content').children[0].children[0].tagName,'strong');
});
test('URL, local and session original data stay literal through confirmation rendering', () => {
  for (const origin of ['url','local','session']) {
    const data=JSON.stringify({name:literal,item:literal,lender:literal,borrower:literal,date:'2026-11-05',category:'その他',quantity:'2',unitPrice:'100',amount:'200',originalRowIndex:12});
    const h=fixture(origin==='url'?'?data='+encodeURIComponent(data):'');
    if(origin==='local')h.sandbox.localStorage.setItem('correctionData',data);
    if(origin==='session')h.sandbox.sessionStorage.setItem('correctionData',data);
    assert.equal(h.run('loadOriginalData()'),true);h.run('displayOriginalData()');
    assert.equal(h.writes(),0,origin);assert.ok(h.nodes.get('confirm-list').textContent.includes(literal));assert.equal(h.nodes.get('confirm-list').children.length,10);
  }
});
test('datalist values remain exact strings without generating option markup from input', () => {
  const h=fixture();h.sandbox.names=[literal,'板川 与志人','あいう'];h.run('renderNameList(names)');
  assert.equal(h.writes(),0);const options=h.nodes.get('nameList').children;
  assert.equal(options.length,3);assert.ok(options.every(n=>n.tagName==='option'));
  assert.deepEqual(options.map(n=>n.value).sort(),[...h.sandbox.names].sort());
});
