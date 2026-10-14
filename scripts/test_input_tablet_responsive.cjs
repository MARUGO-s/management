const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname,'../css/input-layout-mode.css'),'utf8');
test('PC layout removes its fixed minimum without hiding business fields',()=>{
  assert.doesNotMatch(css,/min-width:\s*1100px/);
  assert.match(css,/html\.pc-mode \.container\s*\{[^}]*min-width:\s*0/);
  assert.match(css,/@media\s*\(max-width:\s*1279px\)/);
  assert.match(css,/html\.pc-mode \.entry-row label\s*\{\s*display:\s*block/);
  assert.doesNotMatch(css,/overflow-x:\s*hidden|(?:\.entry-row|input|select|\.form-group)\s*\{[^}]*display:\s*none/);
});
