const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

function makeNode(tagName = 'div') {
  return {tagName, children: [], html: '', _text: '', className: '',
    set innerHTML(value) { this.html = value; this._text = value; },
    get innerHTML() { return this.html; },
    set textContent(value) { this._text = String(value); },
    get textContent() { return this.children.length ? this.children.map(n => n.textContent).join('') : this._text; },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; this.html = ''; this._text = ''; },
  };
}

test('Snyk ID20: every status-log branch treats messages as text while retaining the loading spinner', () => {
  const html = source('pages/marugo.html');
  const start = html.indexOf("                log(message, type = 'info') {");
  const end = html.indexOf('                // 他のシステムにデータを配布', start);
  assert.ok(start >= 0 && end > start);
  const doc = { createElement: tag => makeNode(tag), createTextNode: text => ({textContent: String(text)}) };
  const instance = vm.runInNewContext('({' + html.slice(start, end) + '})', {document: doc, Date, console: {log() {}}});
  const marker = '<img src=x onerror=untrusted()>日本語 & 引用';
  for (const type of ['loading', 'error', 'success', 'info']) {
    const node = makeNode();instance.statusDiv = node;instance.log(marker, type);
    assert.ok(!node.innerHTML.includes('<img'), type + ': message must never become HTML');
    assert.ok(node.textContent.includes(marker), type + ': preserve literal message text');
    if (type === 'loading') assert.ok(node.children.some(n => n.className === 'loading-spinner'), 'spinner is preserved');
  }
});

test('Snyk ID24/29/30: shipped client keys are public anon keys, not privileged service credentials', () => {
  for (const name of ['config.js','docs/gas_scripts/gas_code_complete.gs','docs/gas_scripts/gas_code_complete_updated.gs']) {
    const token = source(name).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    assert.ok(token, name + ': public token exists');
    const claims = JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url').toString());
    assert.ok(claims.role === 'anon', name + ': only a public anon role is allowed');
  }
});

test('Snyk ID26: mail fallback cannot turn a configured address into HTTP or javascript navigation', () => {
  const src = source('js/quota-alert-system.js');
  const start = src.indexOf('    openMailtoLink(level, type, usage) {');
  const end = src.indexOf('    // 成功通知の表示', start);assert.ok(start >= 0 && end > start);
  const opened = [];const instance = vm.runInNewContext('({' + src.slice(start,end) + '})', {window:{open: value => opened.push(value)},encodeURIComponent,console:{error(){}}});
  instance.generateEmailContent = () => ({subject:'確認 & 日本語',body:'本文 ?&=\n確認'});
  instance.showSuccessNotification = () => {};instance.showErrorNotification = () => {};
  for (const address of ['test@example.invalid','https://example.invalid','javascript:marker()','test@example.invalid?bcc=other@example.invalid']) {
    instance.ADMIN_EMAIL = address;instance.openMailtoLink('warning','test',1);
    const url = new URL(opened.at(-1));assert.equal(url.protocol,'mailto:');
    assert.ok(opened.at(-1).includes(encodeURIComponent('本文 ?&=\n確認')));
  }
});
