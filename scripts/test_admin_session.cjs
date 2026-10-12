const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAdminFetch(status, errorCode) {
  const html = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  const start = html.indexOf('const AdminSession = {');
  const end = html.indexOf('// 管理者認証システム', start);
  assert.ok(start > 0 && end > start);
  const saved = new Map();
  let logouts = 0;
  let outgoingHeader;
  const window = { adminAuth: { logout: () => { logouts++; } } };
  const context = {
    window,
    sessionStorage: {
      getItem: key => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: key => saved.delete(key)
    },
    fetch: async (_, options) => {
      outgoingHeader = options.headers['x-loan-session'];
      return { status, clone: () => ({ json: async () => ({ code: errorCode }) }) };
    }
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  vm.runInContext("AdminSession.set('signed-test-token', Date.now() + 60000)", context);
  return {
    request: () => vm.runInContext("adminFetch('https://example.invalid/api')", context),
    state: () => ({ logouts, outgoingHeader, session: vm.runInContext('AdminSession.get()', context) })
  };
}

test('wrong current password 401 preserves administrator session', async () => {
  const app = loadAdminFetch(401, undefined);
  await app.request();
  assert.equal(app.state().logouts, 0);
  assert.equal(app.state().outgoingHeader, 'signed-test-token');
  assert.ok(app.state().session);
});

test('signed session failure 401 clears administrator session', async () => {
  const app = loadAdminFetch(401, 'SESSION_REQUIRED');
  await app.request();
  assert.equal(app.state().logouts, 1);
});

test('non-admin role 403 clears administrator session', async () => {
  const app = loadAdminFetch(403, 'ADMIN_REQUIRED');
  await app.request();
  assert.equal(app.state().logouts, 1);
});

test('admin usage monitor sends admin session when system session is absent', async () => {
  const code = fs.readFileSync(path.join(__dirname, '../js/quota-alert-system.js'), 'utf8');
  const start = code.indexOf('async getCurrentUsage()');
  const end = code.indexOf('// クォータ制限のチェック', start);
  assert.ok(start >= 0 && end > start);
  let sentToken;
  const context = {
    window: {
      SUPABASE_CONFIG: { url: 'https://example.invalid', anonKey: 'public-test-key' },
      AdminSession: { get: () => ({ token: 'signed-admin-test-token' }) },
      LoanSession: { get: () => null }
    },
    fetch: async (_, options) => {
      sentToken = options.headers['x-loan-session'];
      return { ok: true, json: async () => ({
        daily: { total: 1 }, monthly: { total: 2 }, total: { total: 3, api_calls: 3, data_submissions: 0 },
        devices: { count: 1 }, timestamp: 'test'
      }) };
    },
    console
  };
  vm.createContext(context);
  const monitor = vm.runInContext(`({ ${code.slice(start, end)} })`, context);
  const usage = await monitor.getCurrentUsage.call({ DAILY_LIMIT: 300, MONTHLY_LIMIT: 3000 });
  assert.equal(sentToken, 'signed-admin-test-token');
  assert.equal(usage.total, 3);
});
