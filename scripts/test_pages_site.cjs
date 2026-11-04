'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listPublicFiles, buildSite } = require('./build-pages-site.js');

const ROOT = path.resolve(__dirname, '..');

// 公開物の一覧（2026-11-05時点、公開サイトとバイト一致を確認済み。dome/ は所有者の判断で削除）。
// 画面用ファイルを足す・消すときは、この一覧も意図して更新する。
const EXPECTED_PUBLIC_FILES = [
  "admin.html",
  "assets/css/drawer.vertical.css",
  "assets/css/style.css",
  "assets/css/styles-form.css",
  "assets/icons/favicon-v2.ico",
  "assets/icons/favicon.ico",
  "assets/icons/icon-16x16.png",
  "assets/icons/icon-180x180-v2.png",
  "assets/icons/icon-180x180.png",
  "assets/icons/icon-192x192.png",
  "assets/icons/icon-32x32.png",
  "assets/icons/icon-512x512.png",
  "assets/images/finger.png",
  "assets/site.webmanifest",
  "config.js",
  "css/input-layout-mode.css",
  "css/loan-date-policy.css",
  "favicon.ico",
  "index.html",
  "js/duplicate-check.js",
  "js/duplicate-review.js",
  "js/input-layout-mode.js",
  "js/loan-date-policy.js",
  "js/quota-alert-system.js",
  "js/simple-auth.js",
  "js/simple-optimization.js",
  "js/submission-receipts.js",
  "js/unified-data-loader.js",
  "js/usage-indicator.js",
  "pages/correction.html",
  "pages/cost.html",
  "pages/css/styles.css",
  "pages/ingredients.html",
  "pages/js/correction.js",
  "pages/js/ingredients.js",
  "pages/js/main.js",
  "pages/js/scripts.js",
  "pages/marugo.html",
];

test('Pages site publishes exactly the expected screen files', () => {
  assert.deepEqual(listPublicFiles(), EXPECTED_PUBLIC_FILES);
});

test('Pages site contains the screens but no server code, migrations, GAS copies or docs', () => {
  const files = listPublicFiles();
  for (const required of ['index.html', 'admin.html', 'config.js', 'favicon.ico', 'pages/correction.html', 'pages/marugo.html', 'pages/js/main.js', 'js/simple-auth.js', 'css/input-layout-mode.css']) {
    assert.ok(files.includes(required), `missing ${required}`);
  }
  for (const file of files) {
    assert.ok(!/^(supabase|docs|scripts|\.github)\//.test(file), `must not publish ${file}`);
    assert.ok(!/\.(sql|gs|ts|py|toml)$/.test(file), `must not publish ${file}`);
  }
  assert.ok(!files.some((f) => f.startsWith('dome/')), 'dome/ was removed by the owner');
  for (const secretish of ['supabase/migrations/20250918000147_create_password_management.sql', 'supabase/config.toml', 'docs/gas_scripts/gas_code_complete.gs', 'scripts/insert_october_data_sql.sql', 'README.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, secretish)) === false || !files.includes(secretish), `${secretish} is published`);
  }
});

test('every local file referenced by a published page is also published', () => {
  const files = new Set(listPublicFiles());
  const missing = [];
  for (const file of files) {
    if (!/\.(html|css)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const refs = [...text.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)["']|url\(\s*["']?([^"')?#]+)["']?\s*\)/g)].map((m) => m[1] || m[2]);
    for (const ref of refs) {
      if (/^(https?:|data:|mailto:|tel:|javascript:|\/\/|#)/.test(ref) || ref.includes('${')) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref));
      if (!files.has(resolved) && fs.existsSync(path.join(ROOT, resolved))) missing.push(`${file} -> ${resolved}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('buildSite copies the files byte-for-byte and disables Jekyll', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-site-'));
  try {
    const files = buildSite(out);
    assert.ok(fs.existsSync(path.join(out, '.nojekyll')));
    for (const file of files) assert.deepEqual(fs.readFileSync(path.join(out, file)), fs.readFileSync(path.join(ROOT, file)), file);
    assert.ok(!fs.existsSync(path.join(out, 'supabase')));
    assert.ok(!fs.existsSync(path.join(out, 'docs')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('the Pages workflow builds with this script and uploads only site/', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  assert.match(workflow, /node scripts\/build-pages-site\.js site/);
  assert.match(workflow, /actions\/upload-pages-artifact@[0-9a-f]{40} # v3[\s\S]*path: site/);
  assert.match(workflow, /actions\/deploy-pages@[0-9a-f]{40} # v4/);
  assert.match(workflow, /node --test scripts\/\*\.cjs/);
  const topPermissions = (workflow.match(/^permissions:\n((?:  .*\n)+)/m) || [])[1] || '';
  assert.equal(topPermissions.trim(), 'contents: read', 'pages/id-token write must be job-level, not workflow-level');
  assert.match(workflow, /deploy:[\s\S]*permissions:\n\s+pages: write\n\s+id-token: write/);
  assert.doesNotMatch(workflow, /uses: [^@\s]+@v\d/, 'actions must be pinned to a commit SHA');
});
