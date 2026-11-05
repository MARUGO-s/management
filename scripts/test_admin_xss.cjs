'use strict';
// Offline regression: execute the actual admin functions, never page startup/API clients.
// The deliberately small DOM fixture records HTML/text sinks and implements modal events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sourcePath = process.env.ADMIN_XSS_SOURCE || path.join(__dirname, '..', 'admin.html');
const source = fs.readFileSync(sourcePath, 'utf8');
function functionSource(name) {
    const start = source.search(new RegExp('^        (?:async )?function ' + name + '\\(', 'm'));
    assert(start >= 0, `actual function missing: ${name}`);
    const tail = source.slice(start);
    const end = tail.search(/^        }\r?$/m);
    assert(end >= 0, `actual function end missing: ${name}`);
    return tail.slice(0, end + 9);
}
function harness(names) {
    const nodes = new Map(), timers = [], requests = [], alerts = [], downloads = [];
    const storage = new Map();
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag; this.style = {}; this.children = []; this.events = {};
            this._html = ''; this._text = ''; this.value = ''; this.classes = new Set();
            this.classList = {add: x => this.classes.add(x), remove: x => this.classes.delete(x)};
        }
        set innerHTML(value) { this._html = String(value); this._text = ''; this.children = []; }
        get innerHTML() { return this._html; }
        set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
        get textContent() { return this._text; }
        appendChild(child) { this.children.push(child); child.parent = this; return child; }
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
        remove() { if (this.parent) this.parent.removeChild(this); }
        addEventListener(type, fn) { this.events[type] = fn; }
        click() { downloads.push({href: this.href, download: this.download}); }
    }
    const body = new Element('body');
    const node = id => {
        const appended = body.children.find(n => n.id === id);
        if (appended) return appended;
        if (!nodes.has(id)) nodes.set(id, new Element());
        return nodes.get(id);
    };
    const sandbox = {
        document: {getElementById: node, createElement: tag => new Element(tag), body},
        window: {SUPABASE_CONFIG: {url: 'https://offline.invalid', anonKey: 'fixture-only'}},
        localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k)},
        console: {log() {}, warn() {}, error() {}},
        setTimeout: (fn, delay) => { timers.push({fn, delay}); },
        requestAnimationFrame: fn => fn(), alert: text => alerts.push(text), confirm: () => true,
        adminFetch: async (url, options) => {
            requests.push({url, options});
            if (!sandbox.response) throw new Error('UNEXPECTED_OFFLINE_API_CALL');
            if (sandbox.response instanceof Error) throw sandbox.response;
            return sandbox.response;
        },
        fetch: () => { throw new Error('NETWORK_DISABLED'); },
        ACCESS_EVENT_LABELS: {}, updatePendingAlertState() {}, setupAccessLogActionHandlers() {},
        Blob, URL: {createObjectURL: blob => { sandbox.csvBlob = blob; return 'blob:offline-fixture'; }, revokeObjectURL: url => { sandbox.revoked = url; }},
    };
    const context = vm.createContext(sandbox, {codeGeneration: {strings: false, wasm: false}});
    for (const name of ['escapeHtml', ...names]) vm.runInContext(functionSource(name), context, {timeout: 1000});
    const call = async (name, ...args) => {
        sandbox.args = args;
        return await vm.runInContext(`${name}(...args)`, context, {timeout: 1000});
    };
    return {sandbox, body, node, call, timers, requests, alerts, storage, downloads};
}
const attack = '<img src=x onerror="void(0)"><svg onload=void(0)></svg> & 日本語\n\'quotes"';
const encoded = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function safeHTML(html, expected = attack) {
    assert(!/<(?:img|svg|script|iframe)\b/i.test(html), 'data must not create executable elements');
    assert(html.includes(encoded(expected)), 'data must be displayed as escaped text, without double escaping');
}
const tests = [];
function test(group, name, run) { tests.push({group, name, run}); }
function reportFixture(value = attack) {
    return {id: 42, report_id: value, created_at: '2026-01-02T03:04:05Z',
        mismatch_count: value, sent_data_count: value, registered_data_count: value,
        environment_info: {browser: {name: value, version: value, language: value},
            screen: {width: value, height: value}, window: {innerWidth: value, innerHeight: value, devicePixelRatio: value},
            timezone: {timezone: value}, platform: {platform: value}, connection: {effectiveType: value}},
        mismatch_details: [{field: value, sent: {名前: value}, registered: [value]}],
        sent_data: [{名前: value}], registered_data: {名前: value}};
}
test('reports-list', 'report list escapes every data field and keeps numeric actions', async () => {
    const h = harness(['renderDataMismatchReports']);
    await h.call('renderDataMismatchReports', [reportFixture()]);
    const html = h.node('data-mismatch-list').innerHTML;
    safeHTML(html);
    assert.equal(html.split(encoded(attack)).length - 1, 10);
    assert(html.includes('data-report-id="42"'));
    assert(html.includes('onclick="viewReportDetails(42)"'));
    assert(html.includes('onclick="deleteReport(42)"'));
    assert.equal((html.match(/class="data-mismatch-item"/g) || []).length, 1);
});
test('reports-list', 'invalid report IDs cannot produce JS or attributes', async () => {
    const h = harness(['renderDataMismatchReports']);
    for (const id of ['1);void(0)//', '1)\" onmouseover=\"void(0)', '42', null, true, {}, [], NaN, Infinity, -1, 1.5, 9007199254740992]) {
        await h.call('renderDataMismatchReports', [{...reportFixture('通常値'), id}]);
        const html = h.node('data-mismatch-list').innerHTML;
        assert(!html.includes('onmouseover'), 'ID must not create attributes');
        for (const handler of html.matchAll(/onclick="([^"]*)"/g)) {
            assert(/^(?:viewReportDetails|deleteReport)\(\d+\)$/.test(handler[1]), 'ID must be a numeric literal, not executable text');
        }
        assert.equal((html.match(/disabled/g) || []).length, 2, 'invalid IDs keep both actions inert');
    }
    await h.call('renderDataMismatchReports', []);
    assert(h.node('data-mismatch-list').innerHTML.includes('まだありません'));
});
test('reports-detail', 'detail renders all text and JSON safely and retains modal close events', async () => {
    const h = harness(['showReportDetailModal', 'closeDetailModal']);
    const report = reportFixture();
    await h.call('showReportDetailModal', report);
    const overlay = h.body.children[0];
    safeHTML(overlay.innerHTML);
    for (const value of [report.sent_data, report.registered_data, report.environment_info,
        report.mismatch_details[0].sent, report.mismatch_details[0].registered]) {
        assert(overlay.innerHTML.includes(encoded(JSON.stringify(value, null, 2))), 'entire JSON text retained');
    }
    assert.equal((overlay.innerHTML.match(/class="detail-section"/g) || []).length, 6);
    assert(overlay.innerHTML.includes('onclick="closeDetailModal()"'));
    assert(overlay.classes.has('show'));
    overlay.events.click({target: {}});
    assert.equal(h.timers.length, 0, 'content click must not close modal');
    overlay.events.click({target: overlay});
    assert(!overlay.classes.has('show'));
    assert.equal(h.timers[0].delay, 300);
    h.timers[0].fn();
    assert.equal(h.body.children.length, 0);
    await h.call('showReportDetailModal', {id: 42, environment_info: {}});
    assert(h.body.children[0].innerHTML.includes('N/A'));
    await h.call('closeDetailModal');
    h.timers[1].fn();
    assert.equal(h.body.children.length, 0);
});
test('messages', 'password API status and error text retain fixed line breaks, not markup', async () => {
    const h = harness(['showPasswordStatus', 'checkCurrentSystemPassword', 'checkCurrentAdminPassword']);
    h.sandbox.response = {json: async () => ({passwords: {system: {status: attack}, admin: {status: attack}}})};
    for (const name of ['checkCurrentSystemPassword', 'checkCurrentAdminPassword']) {
        await h.call(name);
        const html = h.node('password-change-status').innerHTML;
        assert(!/<(?:img|svg)\b/i.test(html));
        assert(html.includes(encoded(attack).replace(/\n/g, '<br>')));
        assert(html.includes('<br>🕒 最終更新: 未登録'));
    }
    await h.call('showPasswordStatus', attack, 'error');
    assert(h.node('password-change-status').innerHTML.includes(encoded(attack).replace(/\n/g, '<br>')));
    await h.call('showPasswordStatus', '完了', 'success');
    assert.equal(h.timers.at(-1).delay, 3000);
    h.timers.at(-1).fn();
    assert.equal(h.node('password-change-status').innerHTML, '');
});
test('messages', 'monthly chart API error body is escaped with unchanged request', async () => {
    const h = harness(['getMonthlyChartData', 'loadMonthlyChart']);
    h.node('month-selector').value = '2026-01';
    h.sandbox.response = {ok: false, status: 400, text: async () => attack};
    await h.call('loadMonthlyChart');
    safeHTML(h.node('chart-summary').innerHTML);
    assert.equal(h.node('chart-container').style.opacity, '1');
    assert.deepEqual(JSON.parse(h.requests[0].options.body), {action: 'get_monthly_chart', targetMonth: '2026-01'});
});
test('messages', 'report API error body remains literal text', async () => {
    const h = harness(['loadDataMismatchReports']);
    h.sandbox.response = {ok: false, status: 400, text: async () => attack};
    await h.call('loadDataMismatchReports');
    safeHTML(h.node('data-mismatch-list').innerHTML);
    assert.deepEqual(JSON.parse(h.requests[0].options.body), {action: 'get_all'});
    h.sandbox.response = new Error('CORS fixture');
    await h.call('loadDataMismatchReports');
    assert(h.node('data-mismatch-list').innerHTML.includes('ローカルサーバーが必要'));
});
test('messages', 'alert and optimization exceptions cannot add elements', async () => {
    const h = harness(['testAlert', 'runSystemOptimization']);
    h.sandbox.window.testQuotaAlert = async () => { throw new Error(attack); };
    h.sandbox.window.testSimpleOptimization = async () => { throw new Error(attack); };
    await h.call('testAlert', 'first');
    safeHTML(h.node('alert-test-status').innerHTML);
    h.node('system-status-display').innerHTML = '<div>既存の状態</div>';
    await h.call('runSystemOptimization');
    safeHTML(h.node('system-status-display').innerHTML);
    assert(h.node('system-status-display').innerHTML.startsWith('<div>既存の状態</div>'));
});
test('retention', 'retention API dates and counts are text with existing sections retained', async () => {
    const h = harness(['displayDataRetentionStatus']);
    for (const part of ['daily', 'monthly']) {
        const data = {daily: {record_count: 1}, monthly: {record_count: 1}};
        data[part] = {record_count: attack, oldest_date: attack, newest_date: attack};
        await h.call('displayDataRetentionStatus', data);
        const html = h.node('data-retention-status').innerHTML;
        safeHTML(html);
        assert.equal(html.split(encoded(attack)).length - 1, 3);
        assert(html.includes('データ保持ポリシー'));
    }
    await h.call('displayDataRetentionStatus', {});
    assert(h.node('data-retention-status').innerHTML.includes('データがありません'));
});
test('retention', 'cleanup success response is text and button state is restored', async () => {
    const h = harness(['manualCleanupOldData']);
    const button = h.node('cleanup-button');
    button.textContent = '古いデータを削除';
    h.sandbox.event = {target: button};
    h.sandbox.response = {ok: true, json: async () => ({deleted_daily_count: attack,
        deleted_monthly_count: attack, deleted_device_count: attack, cutoff_date: attack})};
    await h.call('manualCleanupOldData');
    const html = h.node('cleanup-status').innerHTML;
    safeHTML(html);
    assert.equal(html.split(encoded(attack)).length - 1, 4);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, '古いデータを削除');
    assert.equal(h.timers.at(-1).delay, 1000);
    assert.deepEqual(JSON.parse(h.requests[0].options.body), {action: 'manual_cleanup'});
});
test('storage', 'stored history level and usage fields remain literal text', async () => {
    const h = harness(['loadAlertHistory', 'clearAlertHistory']);
    h.storage.set('alertHistory', JSON.stringify([{timestamp: '2026-01-02', level: attack,
        usage: {monthly: attack, monthlyPercentage: attack}}]));
    await h.call('loadAlertHistory');
    const html = h.node('alert-history-display').innerHTML;
    assert(!/<(?:img|svg)\b/i.test(html));
    assert(html.includes(encoded(attack.replace('_', ' ').toUpperCase())));
    assert.equal(html.split(encoded(attack)).length - 1, 2);
    await h.call('clearAlertHistory');
    assert(!h.storage.has('alertHistory'));
    assert(h.node('alert-history-display').innerHTML.includes('履歴はありません'));
});
test('storage', 'usage display escapes both local fallback and API-provider values', async () => {
    const h = harness(['loadSimpleUsageDisplay']);
    const today = new Date().toDateString(), month = new Date().toISOString().slice(0, 7);
    h.storage.set('dailyAPIStats', JSON.stringify({[today]: attack}));
    h.storage.set('monthlyAPIStats', JSON.stringify({[month]: attack}));
    h.storage.set('totalAPIStats', JSON.stringify({total: attack}));
    await h.call('loadSimpleUsageDisplay');
    safeHTML(h.node('simple-usage-display').innerHTML);
    assert.equal(h.node('simple-usage-display').innerHTML.split(encoded(attack)).length - 1, 3);
    h.sandbox.window.quotaAlertSystem = {getCurrentUsage: async () => ({daily: attack, monthly: attack, total: attack})};
    await h.call('loadSimpleUsageDisplay');
    safeHTML(h.node('simple-usage-display').innerHTML);
    assert.equal(h.node('simple-usage-display').innerHTML.split(encoded(attack)).length - 1, 3);
});
test('storage', 'API limit status escapes response and stored setting on success and fallback', async () => {
    const h = harness(['updateLimitStatus']);
    h.sandbox.response = {ok: true, json: async () => ({monthly: {total: attack}})};
    await h.call('updateLimitStatus', {apiLimit: attack});
    safeHTML(h.node('limit-status-content').innerHTML);
    assert.equal(h.node('limit-status-content').innerHTML.split(encoded(attack)).length - 1, 2);
    h.sandbox.response = {ok: false, status: 500};
    await h.call('updateLimitStatus', {apiLimit: attack});
    safeHTML(h.node('limit-status-content').innerHTML);
    assert(h.node('limit-status-content').innerHTML.includes('使用量の取得に失敗'));
    h.sandbox.response = {ok: true, json: async () => ({monthly: {total: 1000}})};
    await h.call('updateLimitStatus', {apiLimit: 2500});
    assert(h.node('limit-status-content').innerHTML.includes('2,500回'));
    assert(h.node('limit-status-content').innerHTML.includes('1,000回'));
    assert(h.node('limit-status-content').innerHTML.includes('40%'));
});
test('numeric-style', 'usage widths stay finite bounded numbers, never CSS or attribute text', async () => {
    const h = harness(['updateUsageDisplay']);
    for (const [value, expected] of [[40, '40%'], [150, '100%'], [-20, '0%'], ['75', '75%'],
        [attack, '0%'], [Infinity, '0%'], [NaN, '0%'], [null, '0%']]) {
        await h.call('updateUsageDisplay', {daily: attack, monthly: attack, dailyPercentage: value, monthlyPercentage: value});
        assert.equal(h.node('daily-usage-bar').style.width, expected);
        assert.equal(h.node('monthly-usage-bar').style.width, expected);
        assert.equal(h.node('daily-usage').textContent, `${attack}/300`);
        assert.equal(h.node('monthly-usage').textContent, `${attack}/3,000`);
        assert.equal(h.node('daily-usage').innerHTML, '');
    }
});
test('preservation', 'already-escaped access log fields remain text (ID 0)', async () => {
    const h = harness(['formatAccessDeviceInfo', 'renderAccessLogs']);
    await h.call('renderAccessLogs', [{id: 7, description: attack, actor: attack, event_type: attack,
        device_info: {platform: attack}, api_call_count: 5, acknowledged: true, acknowledged_by: attack,
        alert_flag: true, created_at: '2026-01-02'}]);
    const html = h.node('access-log-list').innerHTML;
    safeHTML(html);
    assert(html.includes('data-id="7"'));
    assert(html.includes('data-action="unack"'));
    assert(html.includes('API 5回'));
});
test('preservation', 'CSV still contains raw quoted data in a text/csv Blob (ID 7)', async () => {
    const h = harness(['exportAccessLogsCSV']);
    h.sandbox.window._accessLogCache = [{id: 7, actor: '担当者', description: attack}];
    await h.call('exportAccessLogsCSV');
    assert.equal(h.sandbox.csvBlob.type, 'text/csv;charset=utf-8;');
    const csv = await h.sandbox.csvBlob.text();
    assert(csv.includes('"' + attack.replace(/"/g, '""') + '"'));
    assert(!csv.includes('&lt;img'));
    assert.equal(h.downloads[0].href, 'blob:offline-fixture');
    assert(/^access-logs-.*\.csv$/.test(h.downloads[0].download));
    assert.equal(h.sandbox.revoked, 'blob:offline-fixture');
    assert.equal(h.body.children.length, 0);
});
test('preservation', 'cleanup HTTP error uses numeric status, never response body (ID 19)', async () => {
    const h = harness(['manualCleanupOldData']);
    const button = h.node('cleanup-button');
    button.textContent = '削除';
    h.sandbox.event = {target: button};
    h.sandbox.response = {ok: false, status: 403,
        text: async () => { throw new Error('ERROR_BODY_MUST_NOT_BE_READ'); }};
    await h.call('manualCleanupOldData');
    assert.equal(h.node('cleanup-status').innerHTML, '❌ クリーンアップに失敗しました: HTTP 403');
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, '削除');
});
test('preservation', 'numeric detail selection and existing delete placeholder keep their meaning', async () => {
    const h = harness(['viewReportDetails', 'showReportDetailModal', 'deleteReport']);
    h.sandbox.response = {ok: true, json: async () => ({reports: [reportFixture('日本語 \"quotes\"\n改行')]})};
    await h.call('viewReportDetails', 42);
    assert(h.body.children[0].innerHTML.includes(encoded('日本語 \"quotes\"\n改行')));
    assert.deepEqual(JSON.parse(h.requests[0].options.body), {action: 'get_all'});
    await h.call('deleteReport', 42);
    assert(h.alerts.includes('個別削除機能は今後実装予定です'));
    assert.equal(h.requests.length, 1);
});
test('preservation', 'local limit and alert setting buttons keep keys and stored payloads', async () => {
    const h = harness(['saveAPILimitSettings', 'loadAPILimitSettings', 'resetAPILimitSettings',
        'updateLimitStatus', 'saveAlertSettings']);
    h.sandbox.response = {ok: true, json: async () => ({monthly: {total: 1000}})};
    h.node('api-limit').value = '2600';
    await h.call('saveAPILimitSettings');
    const saved = JSON.parse(h.storage.get('apiLimitSettings'));
    assert.equal(saved.apiLimit, 2600);
    assert.equal(typeof saved.updated, 'string');
    assert.deepEqual(Object.keys(saved).sort(), ['apiLimit', 'updated']);
    await h.call('loadAPILimitSettings');
    assert.equal(h.node('api-limit').value, 2600);
    await h.call('resetAPILimitSettings');
    assert.equal(h.node('api-limit').value, 2500);
    assert(!h.storage.has('apiLimitSettings'));
    for (const [id, value] of [['first-warning-threshold', 1000], ['middle-warning-threshold', 2000], ['final-warning-threshold', 2800]]) h.node(id).value = String(value);
    h.sandbox.window.quotaAlertSystem = {WARNING_THRESHOLDS: {}};
    await h.call('saveAlertSettings');
    assert.deepEqual(JSON.parse(h.storage.get('alertThresholds')), {first: 1000, middle: 2000, final: 2800});
    assert.equal(h.sandbox.window.quotaAlertSystem.WARNING_THRESHOLDS.monthly.final, 2800);
});
test('access-id-boundary', 'access log ID attributes cannot inject markup', async () => {
    const h = harness(['formatAccessDeviceInfo', 'renderAccessLogs']);
    const id = '7\" onmouseover=\"marker()\"><img src=x>';
    await h.call('renderAccessLogs', [{id, description: '正常', actor: '担当者', event_type: 'admin_login', device_info: {}, api_call_count: 5, acknowledged: false, alert_flag: true, created_at: '2026-01-02'}]);
    const html = h.node('access-log-list').innerHTML;
    assert(!html.includes('<img'), 'ID must not create an element');
    assert(!html.includes('data-id="7" onmouseover='), 'ID must not create an attribute');
    assert(html.includes(encoded(id)), 'ID is safely represented as data');
});
test('cleanup-error-boundary', 'unexpected cleanup exceptions are still rendered as text', async () => {
    const h = harness(['manualCleanupOldData']);
    h.node('cleanup-button').textContent = '削除';
    h.sandbox.event = {target: h.node('cleanup-button')};
    h.sandbox.response = new Error(attack);
    await h.call('manualCleanupOldData');
    safeHTML(h.node('cleanup-status').innerHTML);
});
async function main() {
    const results = [];
    for (const t of tests.filter(t => !process.env.ADMIN_XSS_GROUP || t.group === process.env.ADMIN_XSS_GROUP)) {
        try { await t.run(); results.push({group: t.group, name: t.name, pass: true}); }
        catch (error) { results.push({group: t.group, name: t.name, pass: false, error: error.message}); }
    }
    assert(results.length > 0, 'no tests selected');
    console.log(JSON.stringify({source: path.basename(sourcePath), sha256: crypto.createHash('sha256').update(source).digest('hex'),
        execution: 'actual source functions in Node VM; inert DOM fixture; no application startup or live network', results,
        passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length}, null, 2));
    if (results.some(r => !r.pass)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
