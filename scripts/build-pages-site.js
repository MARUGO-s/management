#!/usr/bin/env node
// GitHub Pages に載せるファイルだけを site/ にコピーする。
// ここに無いもの（supabase/, docs/, scripts/, README など）は公開しない。
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 画面が読み込むファイルだけ。新しい画面用フォルダを足すときはここにも追加する。
const PUBLIC_FILES = ['index.html', 'admin.html', 'config.js', 'favicon.ico'];
const PUBLIC_DIRS = ['pages', 'js', 'css', 'assets', 'dome'];

// 公開してはいけない場所。誤って上の一覧に入れたときに止める。
const FORBIDDEN_PREFIXES = ['supabase/', 'docs/', 'scripts/', '.github/', '.git/', 'output/', 'node_modules/'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() ? [full] : [];
  });
}

function listPublicFiles(root = ROOT) {
  const files = [];
  for (const file of PUBLIC_FILES) {
    const full = path.join(root, file);
    if (!fs.statSync(full).isFile()) throw new Error(`公開ファイルがありません: ${file}`);
    files.push(file);
  }
  for (const dir of PUBLIC_DIRS) {
    for (const full of walk(path.join(root, dir))) files.push(path.relative(root, full).split(path.sep).join('/'));
  }
  const unique = [...new Set(files)].sort();
  for (const file of unique) {
    if (FORBIDDEN_PREFIXES.some((prefix) => file.startsWith(prefix))) throw new Error(`公開してはいけない場所です: ${file}`);
    if (file.split('/').some((part) => part.startsWith('.'))) throw new Error(`隠しファイルは公開しません: ${file}`);
    if (/\.(sql|gs|ts|py|toml|env|pem|key)$/i.test(file)) throw new Error(`サーバー用・設定用の形式は公開しません: ${file}`);
  }
  return unique;
}

function buildSite(outDir, root = ROOT) {
  fs.rmSync(outDir, { recursive: true, force: true });
  const files = listPublicFiles(root);
  for (const file of files) {
    const target = path.join(outDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  // 公開物はJekyllを通さずそのまま配信する。
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  return files;
}

module.exports = { PUBLIC_FILES, PUBLIC_DIRS, FORBIDDEN_PREFIXES, listPublicFiles, buildSite };

if (require.main === module) {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
  const files = buildSite(outDir);
  console.log(`site: ${files.length} files -> ${outDir}`);
}
