'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listPublicFiles, buildSite } = require('./build-pages-site.js');

const ROOT = path.resolve(__dirname, '..');

test('Pages site contains the screens but no server code, migrations, GAS copies or docs', () => {
  const files = listPublicFiles();
  for (const required of ['index.html', 'admin.html', 'config.js', 'favicon.ico', 'pages/correction.html', 'pages/marugo.html', 'pages/js/main.js', 'js/simple-auth.js', 'css/input-layout-mode.css']) {
    assert.ok(files.includes(required), `missing ${required}`);
  }
  for (const file of files) {
    assert.ok(!/^(supabase|docs|scripts|\.github)\//.test(file), `must not publish ${file}`);
    assert.ok(!/\.(sql|gs|ts|py|toml)$/.test(file), `must not publish ${file}`);
  }
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
  assert.match(workflow, /actions\/upload-pages-artifact@v3[\s\S]*path: site/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node --test scripts\/\*\.cjs/);
});
