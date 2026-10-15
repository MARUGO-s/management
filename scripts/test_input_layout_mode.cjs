// 入力画面のスマホ表示 / PC表示 切替（index.html + js/input-layout-mode.js + css/input-layout-mode.css）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const css = read('css/input-layout-mode.css');
const moduleSource = read('js/input-layout-mode.js');

function classList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toString: () => Array.from(set).join(' '),
  };
}

function element(props = {}) {
  const attrs = new Map();
  const listeners = {};
  return Object.assign({
    classList: classList(props.classes || []),
    dataset: {},
    value: '',
    textContent: '',
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: k => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: k => attrs.delete(k),
    hasAttribute: k => attrs.has(k),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatch: type => (listeners[type] || []).forEach(fn => fn({ type, preventDefault() {} })),
    querySelector: () => null,
  }, props.extra || {});
}

function storage(initial = {}, { broken = false } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: k => { if (broken) throw new Error('denied'); return data.has(k) ? data.get(k) : null; },
    setItem: (k, v) => { if (broken) throw new Error('denied'); data.set(k, String(v)); },
  };
}

// 入力済みの画面を模した最小のDOM
function fakePage(stored) {
  const htmlEl = element();
  const byId = new Map();
  const add = (id, el) => { byId.set(id, el); return el; };
  add('layoutToggleBtn', element());
  add('pcSummaryRows', element({ extra: { textContent: '1' } }));
  add('pcSummaryTotal', element({ extra: { textContent: '¥0' } }));
  add('loanForm', element());
  for (const [id, v] of Object.entries({ date: '2026-10-14', name: '山田', lender: '本部', borrower: 'MARUGO' })) add(id, element({ extra: { value: v } }));
  const rows = [
    { category: '食材', item: '玉ねぎ', 'unit-price': '2,480', quantity: '2', amount: '4,960' },
    { category: '飲料', item: 'ワイン', 'unit-price': '3,300', quantity: '6', amount: '19,800' },
  ].map(values => {
    const inputs = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, element({ classes: [k], extra: { value: v } })]));
    return { inputs, querySelector: sel => inputs[sel.replace(/^\./, '')] || null };
  });
  const categoryOptions = [element({ classes: ['category-option'] }), element({ classes: ['category-option'] })];
  const docListeners = {};
  const document = {
    readyState: 'complete',
    documentElement: htmlEl,
    getElementById: id => byId.get(id) || null,
    querySelectorAll(sel) {
      if (sel === '#entriesContainer .entry-row, #extraGroups .entry-row') return rows;
      if (sel === '.entry-row .category-option') return categoryOptions;
      if (sel === '.entry-row .amount') return rows.map(r => r.inputs.amount);
      return [];
    },
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
  };
  const counters = { reload: 0, init: 0 };
  const win = {
    document,
    localStorage: storage(stored === undefined ? {} : { inputLayoutMode: stored }),
    setTimeout: fn => { fn(); return 0; },
    location: { reload() { counters.reload++; } },
    initializeElements() { counters.init++; },
  };
  win.window = win;
  const snapshot = () => JSON.stringify([...byId.entries()].map(([k, e]) => [k, e.value]).concat(rows.map(r => Object.values(r.inputs).map(i => i.value))));
  return { win, document, byId, rows, categoryOptions, counters, snapshot, docListeners };
}

function loadModule(win) {
  const context = vm.createContext(win);
  vm.runInContext(moduleSource, context);
  return win.InputLayoutMode;
}

function bootScript() {
  const m = html.match(/<script id="input-layout-mode-boot">([\s\S]*?)<\/script>/);
  assert.ok(m, 'boot script exists');
  return m[1];
}

test('boot script runs in <head> before the stylesheet and body (no flicker)', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  const bootAt = head.indexOf('id="input-layout-mode-boot"');
  const cssAt = head.indexOf('css/input-layout-mode.css');
  assert.ok(bootAt > 0, 'boot script is inside <head>');
  assert.ok(cssAt > bootAt, 'stylesheet is in <head> after the boot script');
  assert.doesNotMatch(html.match(/<html[^>]*>/)[0], /pc-mode/, 'default markup is smartphone mode');
});

for (const [stored, expected] of [['pc', true], ['sp', false], [null, false], ['PC', false], ['garbage', false]]) {
  test(`boot script applies pc-mode only when localStorage says "pc" (stored=${stored})`, () => {
    const htmlEl = element();
    const ctx = vm.createContext({ document: { documentElement: htmlEl }, localStorage: storage(stored == null ? {} : { inputLayoutMode: stored }) });
    vm.runInContext(bootScript(), ctx);
    assert.equal(htmlEl.classList.contains('pc-mode'), expected);
  });
}

test('boot script survives unavailable localStorage and stays in smartphone mode', () => {
  const htmlEl = element();
  const ctx = vm.createContext({ document: { documentElement: htmlEl }, localStorage: storage({}, { broken: true }) });
  assert.doesNotThrow(() => vm.runInContext(bootScript(), ctx));
  assert.equal(htmlEl.classList.contains('pc-mode'), false);
});

test('default is smartphone mode and nothing is written until the user toggles', () => {
  const page = fakePage(undefined);
  const api = loadModule(page.win);
  assert.equal(api.controller.mode(), 'sp');
  assert.equal(page.document.documentElement.classList.contains('pc-mode'), false);
  assert.equal(page.win.localStorage.data.has('inputLayoutMode'), false);
  assert.equal(page.byId.get('layoutToggleBtn').getAttribute('aria-pressed'), 'false');
});

test('toggling switches class, button state and persists, without touching entered values or re-initializing', () => {
  const page = fakePage(undefined);
  const api = loadModule(page.win);
  const before = page.snapshot();
  const btn = page.byId.get('layoutToggleBtn');

  btn.dispatch('click');
  assert.equal(page.document.documentElement.classList.contains('pc-mode'), true);
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  assert.equal(btn.dataset.mode, 'pc');
  assert.equal(btn.getAttribute('title'), 'スマホ表示に切り替える');
  assert.equal(page.win.localStorage.data.get('inputLayoutMode'), 'pc');
  assert.equal(page.snapshot(), before, 'values preserved after switching to PC');

  btn.dispatch('click');
  assert.equal(page.document.documentElement.classList.contains('pc-mode'), false);
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
  assert.equal(btn.getAttribute('title'), 'PC表示に切り替える');
  assert.equal(page.win.localStorage.data.get('inputLayoutMode'), 'sp');
  assert.equal(page.snapshot(), before, 'values preserved after switching back');

  assert.equal(page.counters.reload, 0, 'no reload');
  assert.equal(page.counters.init, 0, 'initializeElements is not re-run');
  assert.equal(api.controller.mode(), 'sp');
});

test('stored PC mode is restored on load and keyboard helpers are added only in PC mode', () => {
  const page = fakePage('pc');
  page.document.documentElement.classList.add('pc-mode'); // <head> のスクリプトが付けた状態
  const api = loadModule(page.win);
  assert.equal(api.controller.mode(), 'pc');
  assert.equal(page.byId.get('layoutToggleBtn').getAttribute('aria-pressed'), 'true');
  assert.ok(page.categoryOptions.every(o => o.getAttribute('tabindex') === '0'), 'category buttons reachable by Tab');
  assert.ok(page.rows.every(r => r.inputs.amount.getAttribute('tabindex') === '-1'), 'auto-calculated amount skipped by Tab');
  api.controller.toggle();
  assert.ok(page.categoryOptions.every(o => !o.hasAttribute('tabindex')), 'smartphone DOM restored');
  assert.ok(page.rows.every(r => !r.inputs.amount.hasAttribute('tabindex')));
});

test('toggle still works when localStorage cannot be written', () => {
  const page = fakePage(undefined);
  page.win.localStorage = storage({}, { broken: true });
  const api = loadModule(page.win);
  assert.doesNotThrow(() => api.controller.toggle());
  assert.equal(api.controller.mode(), 'pc');
});

test('PC summary shows row count and the sum of displayed amounts (display only)', () => {
  const page = fakePage('pc');
  const api = loadModule(page.win);
  assert.equal(page.byId.get('pcSummaryRows').textContent, '2');
  assert.equal(page.byId.get('pcSummaryTotal').textContent, '¥24,760');
  assert.equal(api.parseAmount('¥1,234.5'), 1234.5);
  assert.equal(api.parseAmount(''), 0);
  assert.equal(api.parseAmount('自動計算'), 0);
  assert.equal(page.rows[0].inputs.amount.value, '4,960', 'amount fields are not rewritten');
});

test('Enter / Space on a focused category button triggers the existing click handler', () => {
  const page = fakePage('pc');
  loadModule(page.win);
  let clicks = 0, prevented = 0;
  const target = element({ classes: ['category-option'], extra: { click() { clicks++; } } });
  for (const key of ['Enter', ' ', 'a']) page.docListeners.keydown.forEach(fn => fn({ key, target, preventDefault() { prevented++; } }));
  assert.equal(clicks, 2);
  assert.equal(prevented, 2);
});

test('toggle button labels: 💻 PC表示 in smartphone mode, 📱 スマホ表示 in PC mode', () => {
  const btn = html.match(/<button[^>]*id="layoutToggleBtn"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(btn, 'toggle button exists');
  assert.match(btn[0], /type="button"/, 'never submits the form');
  assert.match(btn[1], /<span class="label-pc">💻 PC表示<\/span>/);
  assert.match(btn[1], /<span class="label-sp">📱 スマホ表示<\/span>/);
  assert.match(css, /\.layout-toggle-btn \.label-sp \{ display: none; \}/);
  assert.match(css, /html\.pc-mode \.layout-toggle-btn \.label-pc \{ display: none; \}/);
  assert.match(css, /html\.pc-mode \.layout-toggle-btn \.label-sp \{ display: inline; \}/);
  assert.ok(html.indexOf('id="layoutToggleBtn"') < html.indexOf('<form id="loanForm"'), 'toggle is outside the form');
});

test('every layout rule is scoped to html.pc-mode, so smartphone mode keeps the existing styles', () => {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  noComments.replace(/([^{}]+)\{[^{}]*\}/g, (_, sel) => { selectors.push(...sel.split(',').map(s => s.trim()).filter(Boolean)); });
  assert.ok(selectors.length > 30);
  const unscoped = selectors.filter(s => !s.startsWith('html.pc-mode'));
  for (const s of unscoped) assert.match(s, /^\.(layout-toggle-btn|pc-summary)\b/, `unscoped selector: ${s}`);
});

test('assets are cache-busted and the existing form selectors used by main.js are intact', () => {
  assert.match(html, /<link rel="stylesheet" href="css\/input-layout-mode\.css\?v=2026101405">/);
  assert.match(html, /<script src="js\/input-layout-mode\.js\?v=2026101503"><\/script>/);
  for (const sel of ['id="entriesContainer"', 'class="entry-row" data-index="0"', 'class="category" required', 'class="item" required',
    'class="unit-price" required', 'class="quantity" required', 'class="amount" required', 'id="add-row-btn"', 'id="add-full-row-btn"',
    'id="extraGroups"', 'type="submit" class="submit-btn"', 'class="btn-text"']) assert.ok(html.includes(sel), sel);
  // 送信ボタンは1つだけ（submitData は .submit-btn:not(.search-btn) を使う）
  assert.equal((html.match(/class="submit-btn/g) || []).length, 1);
});
