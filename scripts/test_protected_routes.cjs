const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const name of ['access-logs', 'data-mismatch-reports', 'api-usage-tracker', 'indicator-settings', 'send-alert-email']) {
  test(`${name} checks the signed loan session before using privileged capabilities`, () => {
    const code = source(`supabase/functions/${name}/index.ts`);
    assert.ok(code.includes('authorizeLoanSession(req, '), 'signed session is checked');
    assert.ok(code.includes('if (auth.error) return auth.error'), 'authorization failure is returned');
    const guard = code.indexOf('if (auth.error) return auth.error');
    const privileged = code.indexOf(name === 'send-alert-email' ? 'console.log(\'📧 Alert email function called\')' : 'createClient(', code.indexOf('serve(async'));
    assert.ok(guard >= 0 && guard < privileged, 'reject before privileged action');
    assert.match(code, /x-loan-session/); // CORS preflight must allow browser header
  });
}

test('admin UI retains a signed admin token and sends it to protected functions', () => {
  const html = source('admin.html');
  assert.match(html, /AdminSession\.set\(result\.token, result\.expiresAt\)/);
  assert.match(html, /async function adminFetch\(/);
  for (const name of ['access-logs', 'data-mismatch-reports', 'api-usage-tracker', 'indicator-settings', 'send-alert-email']) {
    assert.match(html, new RegExp('adminFetch\\(`[^`]*functions/v1/' + name));
  }
});

test('normal UI supplies its login token to usage, settings, and mismatch APIs', () => {
  for (const file of ['config.js', 'js/usage-indicator.js', 'js/quota-alert-system.js', 'pages/js/main.js']) {
    const code = source(file);
    assert.match(code, /['"]x-loan-session['"]\s*:/, file);
  }
});

test('password changes require an admin session in addition to the current password', () => {
  const code = source('supabase/functions/password-manager/index.ts');
  const at = code.indexOf("case 'change':");
  assert.ok(at > 0);
  const change = code.slice(at, code.indexOf("case 'get':", at));
  assert.match(change, /authorizeLoanSession\(req, 'admin'\)/);
  assert.match(change, /currentInputHash !== currentPasswordData\.password_hash/);
});

test('first-time system password setup verifies the admin password and sends its signed token', () => {
  const ui = source('js/simple-auth.js');
  const html = source('pages/marugo.html');
  const endpoint = source('supabase/functions/password-manager/index.ts');
  assert.match(html, /id="setup-admin-password"/);
  assert.match(ui, /passwordType: 'admin',[\s\S]*?currentPassword: adminPassword/);
  assert.match(ui, /'x-loan-session': result\.token/);
  assert.match(endpoint, /case 'change':[\s\S]*?authorizeLoanSession\(req, 'admin'\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(endpoint, /case 'change':[\s\S]*?\.insert\(\{/);
});

test('admin usage monitor uses admin token when no system login exists', () => {
  assert.match(source('admin.html'), /window\.AdminSession = AdminSession/);
  assert.match(source('js/quota-alert-system.js'), /window\.AdminSession\?\.get\(\)\?\.token/);
});

test('wrong current password does not clear a valid admin session', () => {
  const html = source('admin.html');
  assert.match(html, /response\.status === 401[\s\S]*?SESSION_REQUIRED/);
});

test('sheet reads fail closed when session requirement environment variable is missing', () => {
  const code = source('supabase/functions/sheets-api/index.ts');
  assert.doesNotMatch(code, /SHEETS_REQUIRE_SESSION/);
  assert.match(code, /if \(!session \|\| !\['system', 'admin'\]\.includes\(session\.typ\)\)\s*\{/);
});

test('changed client scripts have cache-busted references on all entry pages', () => {
  for (const page of ['index.html', 'admin.html', 'pages/marugo.html', 'pages/cost.html', 'pages/ingredients.html', 'pages/correction.html']) {
    const html = source(page);
    for (const match of html.matchAll(/<script[^>]*src="(?:\.\.\/)?(?:config\.js|js\/(?:simple-auth|quota-alert-system|usage-indicator)\.js|pages\/js\/main\.js)([^\"]*)"/g)) {
      const unchanged = match[0].includes('quota-alert-system.js');
      const expected = unchanged ? '?v=2026101201' : match[0].includes('pages/js/main.js') ? '?v=2026101501' : '?v=2026101404';
      assert.equal(match[1], expected, `${page}: ${match[0]}`);
    }
  }
});
