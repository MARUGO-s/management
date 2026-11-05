const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Exercise the actual page functions in Chrome, without page bootstrap or live I/O.
const source = fs.readFileSync(path.join(__dirname, '../pages/js/correction.js'), 'utf8');
const bootstrap = source.indexOf('// ページが完全に読み込まれた後に実行');
assert(bootstrap > 0, 'actual correction page bootstrap marker must exist');
const functions = source.slice(0, bootstrap);
const attack = '<img src="offline-missing" onerror="window.__xss=1"><svg onload="window.__xss=1"></svg>';
const literal = `日本語の名前 "引用符" '単引用符' & <文字>\n次の行`;
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { if (browser) await browser.close(); });

async function pageFixture(t, search = '') {
  const page = await browser.newPage();
  t.after(() => page.close());
  let requests = 0;
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest() && route.request().url().startsWith('https://correction.invalid/')) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8">
        <div id="debug-content" style="display:none"></div><ul id="confirm-list"></ul>
        <form id="correctionForm">
          <input id="date"><input id="name" list="nameList"><datalist id="nameList"></datalist>
          <select id="lender"><option value="店舗A">店舗A</option><option value="店舗B">店舗B</option></select>
          <select id="borrower"><option value="店舗A">店舗A</option><option value="店舗B">店舗B</option></select>
          <input id="category"><input id="item"><input id="quantity"><input id="unitPrice"><input id="amount">
          <button type="button" class="submit-btn"><span class="btn-text">修正送信</span></button>
        </form>
        <div id="successMessage"></div><div id="errorMessage"></div>
        <div id="progressModal"></div><div id="progress-bar"></div><span id="remaining-time"></span>
        <div id="step-validation" class="status-step"></div><div id="step-sending" class="status-step"></div>
        <div id="step-inserting" class="status-step"></div><div id="step-backup" class="status-step"></div>
        <div id="step-complete" class="status-step"></div>
        <div id="selectModal"><h2 id="selectTitle"></h2><input id="selectSearch"><div id="selectList"></div></div>` });
    }
    requests++;
    return route.abort();
  });
  await page.goto('https://correction.invalid/correction.html' + search);
  await page.addScriptTag({ content: functions });
  return { page, requests: () => requests };
}

async function assertInert(page, selector) {
  // Let error/load handlers run too; absence of parser-created nodes is checked independently.
  await page.waitForTimeout(30);
  const state = await page.evaluate(selector => {
    const target = document.querySelector(selector);
    return {
      injected: target.querySelectorAll('img,svg,script,iframe,object,[onerror],[onload],[onfocus]').length,
      executed: window.__xss || 0
    };
  }, selector);
  assert.deepEqual(state, { injected: 0, executed: 0 }, 'untrusted values must remain text, never elements/events');
}

test('debug messages and JSON remain literal text, keeping styles and last-ten behavior', async t => {
  const { page, requests } = await pageFixture(t);
  const result = await page.evaluate(({ attack, literal }) => {
    for (let i = 0; i < 12; i++) addDebugLog('過去ログ' + i);
    addDebugLog(literal + attack, { value: literal + attack });
    const target = document.getElementById('debug-content');
    const last = target.lastElementChild;
    return {
      count: target.children.length, first: target.firstElementChild.textContent,
      message: last.textContent, json: last.querySelector('pre').textContent,
      time: last.querySelector('strong').textContent, breaks: last.querySelectorAll('br').length,
      margin: last.style.marginBottom, padding: last.style.padding,
      border: last.style.borderBottom, preSize: last.querySelector('pre').style.fontSize,
      preMargin: last.querySelector('pre').style.margin,
      hidden: getComputedStyle(target).display === 'none'
    };
  }, { attack, literal });
  await assertInert(page, '#debug-content');
  assert.equal(requests(), 0);
  assert.equal(result.count, 10);
  assert.match(result.first, /過去ログ3/);
  assert(result.message.includes(literal + attack));
  assert.equal(result.json, JSON.stringify({ value: literal + attack }, null, 2));
  assert.match(result.time, /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(result.breaks, 2);
  assert.equal(result.margin, '10px');
  assert.equal(result.padding, '5px');
  assert.equal(result.border, '1px solid rgb(51, 51, 51)');
  assert.equal(result.preSize, '10px');
  assert.equal(result.preMargin, '5px 0px');
  assert.equal(result.hidden, true);
});

test('original-data confirmation displays all untrusted values as literal text', async t => {
  const { page, requests } = await pageFixture(t);
  const value = literal + attack;
  const result = await page.evaluate(value => {
    originalData = {
      date: value, name: value, lender: value, borrower: value, category: value,
      item: value, quantity: value, unitPrice: '１，２３４', amount: '',
      originalAmount: value, originalRowIndex: value
    };
    displayOriginalData();
    const list = document.getElementById('confirm-list');
    return {
      keys: Array.from(list.querySelectorAll('.confirm-key'), e => e.textContent),
      values: Array.from(list.querySelectorAll('.confirm-value'), e => e.textContent),
      count: list.children.length
    };
  }, value);
  await assertInert(page, '#confirm-list');
  assert.equal(requests(), 0);
  assert.equal(result.count, 10);
  assert.deepEqual(result.keys, ['📅 日付', '👤 入力者', '📤 貸主', '📥 借主', '🏷️ カテゴリー',
    '📝 品目', '📦 個/本/g', '💰 単価', '💵 金額', '📄 行番号']);
  assert.deepEqual(result.values, [value, value, value, value, value, value, value, '¥1,234', value, value]);
  await page.evaluate(() => { originalData.amount = '12345'; displayOriginalData(); });
  assert.equal(await page.locator('.confirm-value').nth(8).textContent(), '¥12,345');
  assert.equal(await page.locator('#confirm-list > li').count(), 10, 'rerender replaces previous rows');
});

test('datalist preserves quoted and Japanese names without creating markup or event attributes', async t => {
  const { page, requests } = await pageFixture(t);
  const quoted = `田中 "二郎" & '引用' <タグ>`;
  const names = [literal, quoted, `悪意" onfocus="window.__xss=1" data-probe="`, attack];
  const result = await page.evaluate(names => {
    renderNameList(names);
    const options = Array.from(document.getElementById('nameList').options);
    const quoted = names[1];
    document.getElementById('name').value = options.find(option => option.value === quoted)?.value || '';
    return {
      values: options.map(option => option.value),
      attributes: options.map(option => option.getAttributeNames()),
      selected: document.getElementById('name').value,
      inputNames: names
    };
  }, names);
  await assertInert(page, '#nameList');
  assert.equal(requests(), 0);
  assert.deepEqual([...result.values].sort(), [...names].sort());
  assert.deepEqual(result.attributes, names.map(() => ['value']));
  assert.equal(result.selected, quoted);
  assert.deepEqual(result.inputNames, names, 'rendering does not mutate cached values');
  const sorted = await page.evaluate(() => {
    renderNameList(['やまだ', 'あおき10', 'アオキ', 'あおき2']);
    return Array.from(document.getElementById('nameList').options, option => option.value);
  });
  assert.deepEqual(sorted, ['アオキ', 'あおき2', 'あおき10', 'やまだ']);
  await page.evaluate(() => renderNameList([]));
  assert.equal(await page.locator('#nameList > option').count(), 0);
});

for (const location of ['url', 'local', 'encoded-local', 'session']) {
  test(`${location} original-data loading keeps payload and auth intact with inert debug text`, async t => {
    const original = { item: literal + attack, name: literal, receiptId: 'original-receipt-fixture' };
    const { page, requests } = await pageFixture(t, location === 'url' ? '?data=' + encodeURIComponent(JSON.stringify(original)) : '');
    const result = await page.evaluate(({ location, original }) => {
      localStorage.setItem('auth-fixture', 'signed-session-fixture');
      sessionStorage.setItem('auth-fixture', 'session-fixture');
      document.getElementById('name').value = '未送信の入力';
      if (location === 'local' || location === 'encoded-local') {
        localStorage.setItem('correctionData', location === 'local' ? JSON.stringify(original) : encodeURIComponent(JSON.stringify(original)));
      } else if (location === 'session') {
        sessionStorage.setItem('correctionData', JSON.stringify(original));
      }
      const loaded = loadOriginalData();
      return {
        loaded, original: originalData,
        debug: document.getElementById('debug-content').textContent,
        localCorrection: localStorage.getItem('correctionData'),
        sessionCorrection: sessionStorage.getItem('correctionData'),
        localAuth: localStorage.getItem('auth-fixture'), sessionAuth: sessionStorage.getItem('auth-fixture'),
        unsentName: document.getElementById('name').value
      };
    }, { location, original });
    await assertInert(page, '#debug-content');
    assert.equal(requests(), 0);
    assert.equal(result.loaded, true);
    assert.deepEqual(result.original, original);
    assert(result.debug.includes(JSON.stringify(original, null, 2)));
    assert.equal(result.localCorrection, null);
    assert.equal(result.sessionCorrection, null);
    assert.equal(result.localAuth, 'signed-session-fixture');
    assert.equal(result.sessionAuth, 'session-fixture');
    assert.equal(result.unsentName, '未送信の入力');
  });
}

test('invalid storage preview and parse-error logging cannot interpret HTML', async t => {
  const { page, requests } = await pageFixture(t);
  const result = await page.evaluate(attack => {
    localStorage.setItem('correctionData', attack);
    const loaded = loadOriginalData();
    return { loaded, debug: document.getElementById('debug-content').textContent };
  }, attack);
  await assertInert(page, '#debug-content');
  assert.equal(requests(), 0);
  assert.equal(result.loaded, false);
  assert(result.debug.includes(JSON.stringify(attack)), 'rawData is displayed as JSON, including escaped quotes');
});

for (const unified of [false, true]) {
  test(`fetched names (${unified ? 'unified loader' : 'Sheets fallback'}) stay inert in debug and datalist`, async t => {
    const { page, requests } = await pageFixture(t);
    const name = literal + attack;
    const result = await page.evaluate(async ({ unified, name }) => {
      if (unified) window.unifiedDataLoader = { getNames: async () => [name] };
      else window.callSheetsAPI = async (range, method) => {
        if (range !== '貸借表!B:B' || method !== 'GET') throw new Error('unexpected API boundary');
        return { values: [['名前'], [name], [name]] };
      };
      await populateNameDatalist();
      return {
        cached: cachedNames,
        options: Array.from(document.getElementById('nameList').options, option => option.value),
        debug: document.getElementById('debug-content').textContent
      };
    }, { unified, name });
    await assertInert(page, '#debug-content');
    await assertInert(page, '#nameList');
    assert.equal(requests(), 0);
    assert.deepEqual(result.options, [name]);
    assert.deepEqual(result.cached, [name]);
    if (!unified) assert(result.debug.includes(JSON.stringify(name)));
  });
}

test('selection modal keeps literal text and exact selected value across search and close', async t => {
  const { page, requests } = await pageFixture(t);
  const name = `田中 "二郎" & '引用' ` + attack;
  const result = await page.evaluate(({ name, literal }) => {
    window.selectedName = null;
    openSelectionModal(literal, ['他の名前', name], value => { window.selectedName = value; });
    const search = document.getElementById('selectSearch');
    search.value = '田中';
    search.dispatchEvent(new Event('input'));
    return { title: document.getElementById('selectTitle').textContent,
      names: Array.from(document.querySelectorAll('#selectList .select-item'), item => item.textContent) };
  }, { name, literal });
  await assertInert(page, '#selectModal');
  assert.equal(requests(), 0);
  assert.equal(result.title, literal);
  assert.deepEqual(result.names, [name]);
  await page.locator('#selectList .select-item').click();
  assert.deepEqual(await page.evaluate(() => ({ selected: window.selectedName,
    open: document.getElementById('selectModal').classList.contains('show'),
    search: document.getElementById('selectSearch').value,
    count: document.getElementById('selectList').children.length })),
  { selected: name, open: false, search: '', count: 0 });
});

test('GAS response text and JSON are only debug text; connection check remains GET-only', async t => {
  const { page, requests } = await pageFixture(t);
  const response = { status: 'SUCCESS', idempotencyVersion: 1, message: literal + attack };
  const result = await page.evaluate(async response => {
    const methods = [], alerts = [];
    window.fetch = async (_, options) => {
      methods.push(options.method);
      return { status: 200, statusText: 'OK', ok: true, type: 'basic', text: async () => JSON.stringify(response) };
    };
    window.alert = message => alerts.push(message);
    await testGASConnection();
    return { methods, alerts, debugData: debugLogs.map(log => log.data) };
  }, response);
  await assertInert(page, '#debug-content');
  assert.equal(requests(), 0);
  assert.deepEqual(result.methods, ['GET']);
  assert.equal(result.alerts.length, 1);
  assert(result.alerts[0].includes(response.message));
  assert(result.debugData.includes(JSON.stringify(response, null, 2)));
  assert(result.debugData.includes(JSON.stringify(JSON.stringify(response), null, 2)));
});

for (const receiptId of ['original-receipt-fixture', '']) {
  test(`actual reverse autofill and submit preserve correction payload (${receiptId ? 'receipt' : 'legacy timestamp'} origin)`, async t => {
    const { page, requests } = await pageFixture(t);
    const item = '品目 "引用" & ' + attack;
    const name = '修正者 "引用" & ' + attack;
    const original = {
      date: '2026-09-29', name: '元入力者', lender: '店舗A', borrower: '店舗B', category: '飲料',
      item, quantity: '2.5', unitPrice: '１，２３４', amount: '3085', originalRowIndex: 42,
      inputDate: receiptId ? '2026/09/30 11:22:33' : '', originalCreatedAt: '2026/09/29 01:02:03', receiptId
    };
    const result = await page.evaluate(async ({ original, name }) => {
      originalData = original;
      localStorage.setItem('auth-fixture', 'signed-session-fixture');
      document.getElementById('name').value = name;
      displayOriginalData();
      autoFillReverseData();
      const ids = ['date', 'name', 'lender', 'borrower', 'category', 'item', 'quantity', 'unitPrice', 'amount'];
      const autofill = Object.fromEntries(ids.map(id => [id, document.getElementById(id).value]));
      const calls = [];
      let prepared, sent, endpoint;
      window.LoanReceipts = {
        withLock: async (url, callback) => { calls.push('lock'); endpoint = url; return callback(); },
        ensureServer: async url => { if (url !== endpoint) throw new Error('endpoint changed'); calls.push('ensureServer'); },
        prepare: (url, data) => {
          if (url !== endpoint) throw new Error('endpoint changed');
          calls.push('prepare'); prepared = structuredClone(data);
          return data.map(row => ({ ...row, receiptId: 'new-receipt-fixture', receiptVersion: 1 }));
        },
        send: async (url, data) => {
          if (url !== endpoint) throw new Error('endpoint changed');
          calls.push('send'); sent = structuredClone(data);
          return { status: 'SUCCESS', notifications: {} };
        },
        describeFailure: () => { throw new Error('submit unexpectedly failed'); }
      };
      window.showCustomAlertDialog = message => { throw new Error('unexpected validation: ' + message); };
      // Only clocks and the external receipt boundary are replaced; real validation/autofill/serialization run.
      delay = async () => {};
      startProgress = () => {};
      window.setTimeout = () => 0;
      await submitCorrectionData();
      return {
        autofill, prepared, sent, calls, original: originalData,
        auth: localStorage.getItem('auth-fixture'), success: document.getElementById('successMessage').textContent,
        enabled: !document.querySelector('.submit-btn').disabled,
        buttonText: document.querySelector('.btn-text').textContent
      };
    }, { original, name });
    await assertInert(page, '#debug-content');
    await assertInert(page, '#confirm-list');
    assert.equal(requests(), 0);
    assert.deepEqual(result.autofill, {
      date: original.date, name, lender: '店舗B', borrower: '店舗A', category: '飲料', item,
      quantity: '2.5', unitPrice: '1,234', amount: '3,085'
    });
    const expected = {
      date: original.date, name, lender: '店舗B', borrower: '店舗A', category: '飲料', item,
      quantity: '2.5', unitPrice: '1234', amount: '3085', isCorrection: true,
      correctionOnly: true, correctionMark: '✏️修正', sendType: 'CORRECTION', originalRowIndex: 42,
      originalCreatedAt: original.inputDate || original.originalCreatedAt,
      ...(receiptId ? { originalRowId: receiptId } : {})
    };
    assert.deepEqual(result.prepared, [expected]);
    assert.deepEqual(result.sent, { ...expected, receiptId: 'new-receipt-fixture', receiptVersion: 1 });
    assert.deepEqual(result.calls, ['lock', 'ensureServer', 'prepare', 'send']);
    assert.deepEqual(result.original, original, 'display and submit must not sanitize/mutate domain data');
    assert.equal(result.auth, 'signed-session-fixture');
    assert.equal(result.success, '✅ 修正データの送信が完了しました。');
    assert.equal(result.enabled, true);
    assert.equal(result.buttonText, '修正送信');
  });
}
