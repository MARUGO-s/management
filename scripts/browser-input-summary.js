// Display-only empty-row summary checks. All requests use local responses.
const { chromium } = require('playwright');
const { open } = require('./browser-input-keyboard');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const OUT = path.resolve(process.argv[2] || 'dogfood-output/input-summary');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const [mode, width] of [['pc', 1440], ['pc', 820], ['sp', 390]]) {
      const f = await open(browser, { mode, width });
      try {
        const { page } = f;
        const check = async (step, rows, total) => {
          await page.waitForFunction(({ rows, total }) => document.getElementById('pcSummaryRows').textContent === String(rows) && document.getElementById('pcSummaryTotal').textContent === total, { rows, total });
          const current = await page.evaluate(() => ({ count: +document.getElementById('pcSummaryRows').textContent, total: document.getElementById('pcSummaryTotal').textContent, domRows: document.querySelectorAll('.entry-row').length }));
          assert.equal(current.count, rows); assert.equal(current.total, total);
          results.push({ mode, width, step, ...current, passed: true });
        };
        await check('initial-empty-presets', 0, '¥0');
        const initial = await page.locator('.entry-row').count();
        await page.locator('#add-row-btn').click();
        await check('manual-empty-item', 0, '¥0');
        await page.locator('#add-full-row-btn').click();
        await check('manual-empty-group', 0, '¥0');
        assert.equal(await page.locator('.entry-row').count(), initial + 2);
        const first = page.locator('#entriesContainer .entry-row').first();
        await first.locator('.item').fill('入力済みの確認用サンプル');
        await first.locator('.unit-price').fill('100');
        await first.locator('.quantity').fill('2');
        await check('one-entered-item', 1, '¥200');
        const extra = page.locator('.full-entry-group').last();
        await extra.locator('.full-name').fill('名前だけでは品目件数に加えない');
        await check('group-name-only', 1, '¥200');
        await extra.locator('.item').fill('追加グループの確認用サンプル');
        await extra.locator('.unit-price').fill('300');
        await extra.locator('.quantity').fill('1');
        await check('two-entered-items', 2, '¥500');
        await page.evaluate(() => document.querySelectorAll('.entry-row').forEach(row => calculateAmountForRow(row)));
        await check('untouched-calculated-zero-items', 2, '¥500');
        for (const selector of ['.item', '.unit-price', '.quantity']) await first.locator(selector).fill('');
        await check('clear-first-item', 1, '¥300');
        for (const selector of ['.item', '.unit-price', '.quantity']) await extra.locator(selector).fill('');
        await check('clear-both-items', 0, '¥0');
        await first.locator('.item').fill('0円の品目も入力行として数える');
        await first.locator('.unit-price').fill('0');
        await first.locator('.quantity').fill('1');
        await check('legitimate-zero-price-item', 1, '¥0');
        assert.equal(await page.locator('.entry-row').count(), initial + 2, 'summary must never delete blank rows');
        assert.equal(f.posts.length, 0);
        assert.deepEqual(f.errors, []);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await page.screenshot({ path: path.join(OUT, `${mode}-${width}-summary.png`) });
      } finally { await f.context.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify({ cases: results.length, passed: results.filter(r => r.passed).length, transactionPosts: 0 }));
})().catch(e => { console.error(e); process.exitCode = 1; });
