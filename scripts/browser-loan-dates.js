// Offline browser checks: all network requests are fulfilled locally, never sent.
// NODE_PATH=<runtime node_modules> node scripts/browser-loan-dates.js <output-dir>
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2]);
const BASE = 'http://127.0.0.1:18764';
const testDay = process.argv[3] || '2026-10-15';
const grace = Number(testDay.slice(8)) <= 5;
const nextDay = new Date(Date.parse(testDay + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const [mode, width, height] of [['sp', 390, 844], ['pc', 820, 1180], ['pc', 1440, 1000]]) {
      const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
      const posts = [], errors = [];
      await context.addInitScript(({ mode, testDay }) => {
        const NativeDate = Date;
        const fixed = NativeDate.parse(testDay + 'T12:00:00+09:00');
        window.Date = class extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [fixed])); }
          static now() { return fixed; }
        };
        if (mode === 'pc') localStorage.setItem('inputLayoutMode', mode);
        sessionStorage.setItem('loanSession', JSON.stringify({ token: 'offline-session', expiresAt: Date.now() + 3600000 }));
        sessionStorage.setItem('simpleAuth', JSON.stringify({ authenticated: true, timestamp: new Date().toISOString() }));
      }, { mode, testDay });
      await context.route('**/*', async route => {
        const request = route.request(), u = new URL(request.url());
        if (u.origin === BASE) {
          const file = path.resolve(ROOT, '.' + decodeURIComponent(u.pathname));
          if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
          return route.fulfill({ status: 200, contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream', body: fs.readFileSync(file) });
        }
        let body = {}; try { body = JSON.parse(request.postData() || '{}'); } catch {}
        let response = { success: true, status: 'SUCCESS', monthly: { total: 0 }, daily: { total: 0 }, total: { total: 0 }, devices: { count: 0 }, data: [] };
        if (u.hostname === 'script.google.com') {
          if (request.method() === 'GET') response = { status: 'SUCCESS', idempotencyVersion: 1, similarityVersion: 1, duplicateRulesVersion: 2, datePolicyVersion: 1, receiptColumnsReady: true };
          else { posts.push(body); response = { status: 'SUCCESS', idempotencyVersion: 1, receiptId: body.receiptId, notifications: { backup: 'completed', email: 'completed' } }; }
        } else if (u.pathname.endsWith('sheets-api')) response = { values: [['日付', '名前', '貸主', '借主', 'カテゴリー', '品目', '個/本', '単価', '金額', '入力日時', '修正', '受付']] };
        else if (u.pathname.endsWith('password-manager')) response = { success: true, passwords: { system: { status: '設定済み' } } };
        else if (!u.hostname.endsWith('supabase.co')) return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(BASE + '/index.html');
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#date').inputValue(), testDay, 'Japan date even on an overseas device');
      assert.equal(await page.locator('#date').getAttribute('min'), grace ? '2026-09-01' : '2026-10-01');
      assert.equal(await page.locator('#date').getAttribute('max'), testDay);
      await page.locator('#name').fill('OFFLINE-DATE-TEST');
      await page.locator('#lender').selectOption({ index: 1 });
      await page.locator('#borrower').selectOption({ index: 2 });
      if (mode === 'sp') await page.locator('#add-full-row-btn').click();
      const extra = page.locator('.full-entry-group').first();
      await extra.locator('.full-name').fill('OFFLINE-EXTRA');
      await extra.locator('.full-lender').selectOption({ index: 1 });
      await extra.locator('.full-borrower').selectOption({ index: 2 });
      const rows = page.locator('.entry-row');
      for (let i = 0; i < await rows.count(); i++) {
        const row = rows.nth(i);
        await row.locator('[data-value="その他"]').click();
        await row.locator('.item').fill('OFFLINE-ITEM-' + i);
        await row.locator('.unit-price').fill('100');
        await row.locator('.quantity').fill('1');
      }
      for (const selector of ['#date', '.full-date']) {
        for (const invalid of [grace ? '2026-08-31' : '2026-09-30', nextDay]) {
          await page.locator(selector).first().fill(invalid);
          await page.evaluate(() => submitData());
          assert.equal(posts.length, 0, 'invalid main/extra date must not POST');
          assert.match(await page.locator('#errorModalBody').textContent(), /入力可能な期間/);
          await page.locator('#errorModalCloseBtn').click();
        }
        await page.locator(selector).first().fill(testDay);
      }
      if (grace) {
        await page.locator('#date').fill('2026-09-30');
        assert.equal(await page.locator('#date').evaluate(el => el.validity.rangeUnderflow), false);
        await page.locator('#date').fill(testDay);
      }
      const primary = page.locator('#date').locator('..').locator('..');
      for (const group of [primary, extra]) {
        const date = await group.locator('.posting-date-row > input').boundingBox();
        const button = await group.locator('.carryover-toggle').boundingBox();
        assert(date && button);
        assert(Math.abs(date.y - button.y) < 1, 'date and carryover button share a row');
        assert(Math.abs(date.height - button.height) < 1, 'matching control heights');
        assert(button.x >= date.x + date.width + 7, 'carryover sits to the right with a gap');
      }
      await primary.locator('.carryover-toggle').click();
      assert.equal(await primary.locator('.carryover-toggle').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#date').getAttribute('min'), '2026-10-01', 'carryover always posts to the current month');
      assert.equal(await primary.locator('.original-date').getAttribute('min'), '2026-09-01');
      assert.equal(await primary.locator('.original-date').getAttribute('max'), '2026-09-30');
      await primary.locator('.original-date').fill('2026-08-31');
      await page.evaluate(() => submitData());
      assert.equal(posts.length, 0);
      assert.match(await page.locator('#errorModalBody').textContent(), /前月1日から前月末日/);
      await page.locator('#errorModalCloseBtn').click();
      await primary.locator('.original-date').fill('2026-09-30');
      // Toggle off and on preserves the original date, while disabling it in ordinary mode.
      await primary.locator('.carryover-toggle').click();
      assert.equal(await primary.locator('.original-date').isDisabled(), true);
      await primary.locator('.carryover-toggle').click();
      assert.equal(await primary.locator('.original-date').inputValue(), '2026-09-30');
      await extra.locator('.carryover-toggle').click();
      await extra.locator('.original-date').fill('2026-09-01');
      assert.equal(await page.locator('#date').evaluate(el => el.classList.contains('input-error')), false);
      assert.equal(await extra.locator('.full-date').evaluate(el => el.classList.contains('input-error')), false);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        bad: [...document.querySelectorAll('#loanForm input:not([type=hidden]), #loanForm button')].filter(el => {
          if (!el.getClientRects().length) return false;
          const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
        }).map(el => el.id || el.className) }));
      assert.equal(layout.scroll, width);
      assert.deepEqual(layout.bad, []);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(OUT, `carryover-${mode}-${width}.png`), fullPage: true });
      await page.evaluate(() => submitData());
      assert.equal(posts.length, await rows.count());
      assert(posts.every(p => p.isCarryover === true && p.date === testDay));
      assert(posts.some(p => p.originalDate === '2026-09-30'));
      assert(posts.some(p => p.originalDate === '2026-09-01'));
      assert.deepEqual(errors, []);
      results.push({ mode, width, posts: posts.length, layout, errors });
      await context.close();
    }
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
