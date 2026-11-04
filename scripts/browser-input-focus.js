// Offline real-keyboard focus geometry. Reuses the fully intercepted real-page fixture.
const { chromium } = require('playwright');
const { open } = require('./browser-input-keyboard');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const OUT = path.resolve(process.argv[2] || 'dogfood-output/input-focus');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const [mode, width, height, manualRows = 0] of [['pc', 1440, 900], ['pc', 1440, 900, 7], ['pc', 1440, 520], ['pc', 1280, 800], ['pc', 1024, 600], ['pc', 820, 900], ['pc', 390, 720], ['sp', 390, 720]]) {
      const f = await open(browser, { mode, width, height });
      try {
        const { page } = f;
        const key = `${mode}-${width}x${height}${manualRows ? '-many' : ''}`;
        for (let i = 0; i < manualRows; i++) await page.locator('#add-row-btn').click();
        await page.locator('#name').fill('キーボード確認用サンプル（送信なし）');
        await page.locator('#entriesContainer .item').first().fill('入力途中の内容を保持する確認');
        await page.locator('#entriesContainer .unit-price').first().fill('1250');
        await page.locator('#entriesContainer .quantity').first().fill('2');
        await page.locator('#add-full-row-btn').click();
        await page.locator('.full-entry-group').last().locator('.full-name').fill('追加グループの途中入力');
        // Existing blur handlers normalize empty calculated amounts to 0. Settle
        // that pre-existing calculation before comparing navigation-only changes.
        await page.evaluate(() => document.querySelectorAll('.entry-row').forEach(row => calculateAmountForRow(row)));
        await page.evaluate(() => { window.__focusNodes = [...document.querySelectorAll('#loanForm input, #loanForm select')]; });
        const snapshot = () => page.evaluate(() => ({ fields: window.__focusNodes.map(el => ({ value: el.value, connected: el.isConnected })), receipts: Object.keys(localStorage).filter(k => k.startsWith('loan-receipt-v1:')) }));
        const before = await snapshot();
        const observations = [];
        await page.locator('#date').focus();
        for (const direction of ['forward', 'backward']) {
          for (let step = 0; step < 400; step++) {
            await page.keyboard.press(direction === 'forward' ? 'Tab' : 'Shift+Tab');
            await page.waitForTimeout(35);
            const view = await page.evaluate(() => {
              const el = document.activeElement, form = document.getElementById('loanForm');
              if (!el || !form.contains(el) || !el.getClientRects().length) return null;
              const bar = form.querySelector(':scope > .button-group');
              const field = el.getBoundingClientRect(), b = bar.getBoundingClientRect();
              const inBar = bar.contains(el), fixed = ['sticky', 'fixed'].includes(getComputedStyle(bar).position);
              const overlap = !inBar && fixed && b.top < innerHeight && b.bottom > 0 && field.left < b.right && field.right > b.left && field.top < b.bottom && field.bottom > b.top;
              const guarded = !inBar && fixed && b.top < innerHeight && b.bottom > 0;
              const safeBottom = Math.min(innerHeight, b.top) - 8;
              const row = el.closest('.entry-row')?.getBoundingClientRect();
              const rowFits = guarded && row && row.height <= safeBottom - 8;
              return { id: el.id, cls: el.className, inBar, fixed, field: { top: field.top, bottom: field.bottom }, bar: { top: b.top, bottom: b.bottom }, overlap, withinViewport: field.top >= -1 && field.bottom <= innerHeight + 1,
                fieldSafe: !guarded || (field.top >= 7.5 && field.bottom <= safeBottom + 0.5),
                rowSafe: !rowFits || (row.top >= 7.5 && row.bottom <= safeBottom + 0.5),
                submit: el.matches('button[type=submit]') };
            });
            if (!view) continue;
            observations.push({ direction, step, ...view });
            if (direction === 'forward' && step === 45) await page.screenshot({ path: path.join(OUT, `${key}-tab45.png`) });
            if (view.overlap && !observations.slice(0, -1).some(v => v.overlap)) await page.screenshot({ path: path.join(OUT, `${key}-first-overlap.png`) });
            if ((direction === 'forward' && view.submit) || (direction === 'backward' && view.id === 'date')) break;
          }
        }
        assert.deepEqual(await snapshot(), before, 'keyboard navigation must not change values, rows, DOM or receipts');
        assert.deepEqual(f.errors, []);
        assert.equal(f.posts.length, 0, 'no submission on Tab navigation');
        const issues = observations.filter(v => v.overlap || !v.withinViewport || !v.fieldSafe || !v.rowSafe);
        results.push({ mode, width, height, manualRows, rows: await page.locator('.entry-row').count(), observations, issues, passed: issues.length === 0, valuesRetained: true, posts: 0, errors: f.errors });
        await page.screenshot({ path: path.join(OUT, `${key}-last.png`) });
      } finally { await f.context.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results.map(({ observations, issues, ...r }) => ({ ...r, observed: observations.length, issueCount: issues.length, firstIssue: issues[0] || null })), null, 2));
  assert.equal(results.filter(r => !r.passed).length, 0, 'Tab/Shift+Tab inputs must stay visible above the sticky summary');
})().catch(error => { console.error(error); process.exitCode = 1; });
