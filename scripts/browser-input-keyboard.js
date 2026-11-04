// Real native date/keyboard checks. Every URL is fulfilled locally; no production I/O.
// NODE_PATH=<Playwright node_modules> node scripts/browser-input-keyboard.js <out>
// BASELINE_REF=<git ref> selects the shipped source without changing the worktree.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'dogfood-output/input-keyboard');
const BASE = 'http://127.0.0.1:18765';
const REF = process.env.BASELINE_REF;
const files = new Map();
fs.mkdirSync(OUT, { recursive: true });
function source(file) {
  if (!REF) return fs.readFileSync(file);
  if (!files.has(file)) files.set(file, execFileSync('git', ['show', `${REF}:${path.relative(ROOT, file)}`], { cwd: ROOT }));
  return files.get(file);
}
async function open(browser, { mode = 'pc', width = 1440, height = 900, day = '2026-10-31' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'ja-JP', timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  const errors = [], requests = [], posts = [];
  await context.addInitScript(({ mode, day }) => {
    const NativeDate = Date, fixed = NativeDate.parse(day + 'T12:00:00+09:00');
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    };
    localStorage.setItem('inputLayoutMode', mode);
    sessionStorage.setItem('loanSession', JSON.stringify({ token: 'offline-keyboard-fixture', expiresAt: Date.now() + 3_600_000 }));
    sessionStorage.setItem('simpleAuth', JSON.stringify({ authenticated: true, timestamp: new Date().toISOString() }));
  }, { mode, day });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === BASE) {
      assert.equal(request.method(), 'GET');
      const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: type, body: source(file) });
    }
    const endpoint = url.hostname === 'script.google.com' ? 'GAS' : url.pathname.split('/').pop();
    requests.push({ endpoint, method: request.method(), intercepted: true });
    let response = { success: true, status: 'SUCCESS', monthly: { total: 0 }, daily: { total: 0 }, total: { total: 0 }, devices: { count: 0 }, data: [] };
    if (endpoint === 'GAS') {
      if (request.method() === 'GET') response = { status: 'SUCCESS', idempotencyVersion: 1, similarityVersion: 1, duplicateRulesVersion: 2, datePolicyVersion: 1, receiptColumnsReady: true };
      else {
        const { sessionToken, ...business } = JSON.parse(request.postData() || '{}');
        posts.push({ ...business, authenticated: !!sessionToken });
        response = { status: 'SUCCESS', idempotencyVersion: 1, receiptId: business.receiptId, notifications: { backup: 'completed', email: 'completed' } };
      }
    } else if (endpoint === 'sheets-api') response = { values: [['日付', '名前', '貸主', '借主', 'カテゴリー', '品目', '個/本', '単価', '金額', '入力日時', '修正', '受付']] };
    else if (endpoint === 'password-manager') response = { success: true, passwords: { system: { status: '設定済み' } } };
    else if (!url.hostname.endsWith('supabase.co')) return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(900);
  const cdp = await context.newCDPSession(page);
  async function clickDatePart(selector, part) {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map(n => [n.nodeId, n]));
    const owner = nodes.find(n => n.backendDOMNodeId === node.backendNodeId);
    assert(owner, `date accessibility owner: ${selector}`);
    const descendants = [];
    function visit(n) { descendants.push(n); for (const id of n.childIds || []) if (byId.has(id)) visit(byId.get(id)); }
    visit(owner);
    const field = descendants.find(n => n.role?.value === 'spinbutton' && n.name?.value.includes(part));
    assert(field, `native date segment: ${selector} ${part}`);
    const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: field.backendDOMNodeId });
    const q = model.content;
    await page.mouse.click((q[0] + q[2]) / 2, (q[1] + q[5]) / 2);
  }
  return { context, page, clickDatePart, errors, requests, posts };
}
module.exports = { open };
if (require.main === module) (async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const [mode, width] of [['pc', 1440], ['pc', 820], ['sp', 390]]) {
      const f = await open(browser, { mode, width });
      try {
        if (mode === 'sp') await f.page.locator('#add-full-row-btn').click();
        for (const selector of ['#date', '.full-date']) {
          for (const day of ['10', '11', '19', '20', '21', '29', '30', '31']) {
            // Reset the scenario only, then enter BOTH digits with real keyboard events.
            // locator.press() between digits refocuses the native control and is NOT human typing.
            await f.page.locator(selector).first().fill('2026-10-31');
            await f.clickDatePart(selector, '日');
            await f.page.keyboard.type(day, { delay: 25 });
            const actual = await f.page.locator(selector).first().inputValue();
            const expected = '2026-10-' + day;
            const passed = actual === expected;
            results.push({ kind: 'day', mode, width, selector, typed: day, expected, actual, passed });
            if (day === '11') await f.page.screenshot({ path: path.join(OUT, `${mode}-${width}-${selector === '#date' ? 'main' : 'extra'}-day11.png`) });
          }
        }
        for (const [selector, toggle] of [['#original-date', '#loanForm > .form-group:first-child .carryover-toggle'], ['.full-entry-group .original-date', '.full-entry-group .carryover-toggle']]) {
          await f.page.locator(toggle).first().click();
          await f.page.locator(selector).first().fill('2026-09-30');
          await f.clickDatePart(selector, '日');
          await f.page.keyboard.type('11', { delay: 25 });
          const actual = await f.page.locator(selector).first().inputValue();
          results.push({ kind: 'original-day', mode, width, selector, expected: '2026-09-11', actual, passed: actual === '2026-09-11' });
        }
        assert.deepEqual(f.errors, []);
        assert.equal(f.posts.length, 0);
      } finally { await f.context.close(); }
      const g = await open(browser, { mode, width, day: '2026-11-04' });
      try {
        if (mode === 'sp') await g.page.locator('#add-full-row-btn').click();
        for (const selector of ['#date', '.full-date']) {
          assert.equal(await g.page.locator(selector).first().inputValue(), '2026-11-04');
          await g.clickDatePart(selector, '月');
          await g.page.keyboard.type('10', { delay: 25 });
          const actual = await g.page.locator(selector).first().inputValue();
          results.push({ kind: 'month-from-today', mode, width, selector, expected: '2026-10-04', actual, passed: actual === '2026-10-04' });
        }
        assert.deepEqual(g.errors, []);
        assert.equal(g.posts.length, 0);
      } finally { await g.context.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  }
  const failed = results.filter(r => !r.passed);
  console.log(JSON.stringify({ baseline: REF || null, total: results.length, passed: results.length - failed.length, failed }, null, 2));
  assert.equal(failed.length, 0, 'native consecutive digits must preserve the selected day/month');
})().catch(error => { console.error(error); process.exitCode = 1; });
