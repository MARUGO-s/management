const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('correction entry loads the XSS-hardened script with a new cache key', () => {
  const html = fs.readFileSync(path.join(__dirname, '../pages/correction.html'), 'utf8');
  assert.ok(/<script src="js\/correction\.js\?v=2026110502"><\/script>/.test(html), 'correction script cache key must be 2026110502');
});
