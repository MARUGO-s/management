const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'pages/js/main.js'), 'utf8');
const start = main.indexOf('function refreshPostingDate(input) {');
const end = main.indexOf('function refreshPostingDates()', start);
assert(start >= 0 && end > start, 'exercise the actual posting-date controller');

function fixture() {
  let now = new Date('2026-11-04T12:00:00+09:00');
  const changes = [];
  const classes = { remove() {} };
  function dateField(name, value) {
    const field = { value, classList: classes };
    for (const attr of ['min', 'max']) {
      let saved = '';
      Object.defineProperty(field, attr, {
        get: () => saved,
        set: next => { saved = next; changes.push(`${name}.${attr}=${next}`); }
      });
    }
    return field;
  }
  const input = dateField('posting', '2026-11-04');
  const original = dateField('original', '2026-10-31');
  const toggle = { active: false, getAttribute: () => String(toggle.active) };
  const elements = { '.original-date': original, '.carryover-toggle': toggle, '.date-help': {}, '.carryover-details': {}, '.carryover-help': {} };
  const group = { classList: classes, querySelector: selector => elements[selector] };
  input.closest = () => group;
  const context = vm.createContext({ pendingErrorQueue: [], input });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/loan-date-policy.js'), 'utf8'), context);
  const policy = context.LoanDatePolicy;
  context.LoanDatePolicy = { bounds: () => policy.bounds(now), validate: data => policy.validate(data, now) };
  vm.runInContext(main.slice(start, end), context);
  const refresh = () => context.refreshPostingDate(input);
  return { input, original, toggle, changes, refresh, setNow: value => { now = new Date(value); } };
}

test('日付の再描画で同じmin/maxを書き戻さず、ネイティブの日・月の連続数字入力を妨げない', () => {
  const f = fixture();
  f.refresh();
  assert.equal(f.changes.length, 4, 'initial date limits are still installed');
  f.changes.length = 0;
  f.refresh();
  assert.deepEqual(f.changes, [], 'unchanged constraints must not reset the native segment edit buffer');
  assert.equal(f.input.value, '2026-11-04');
  assert.equal(f.original.value, '2026-10-31');
});

test('繰越の切替では計上日の下限だけを更新し、入力日付と前月の実日付を保持する', () => {
  const f = fixture();
  f.refresh();
  f.changes.length = 0;
  f.toggle.active = true;
  f.refresh();
  assert.deepEqual(f.changes, ['posting.min=2026-11-01']);
  assert.equal(f.original.disabled, false);
  assert.equal(f.original.required, true);
  f.changes.length = 0;
  f.refresh();
  assert.deepEqual(f.changes, []);
  f.toggle.active = false;
  f.refresh();
  assert.deepEqual(f.changes, ['posting.min=2026-10-01']);
  assert.equal(f.original.disabled, true);
  assert.equal(f.input.value, '2026-11-04');
  assert.equal(f.original.value, '2026-10-31');
});

test('5日から6日の締め切りと日付変更では必要な制限だけを更新し、入力値を書き換えない', () => {
  const f = fixture();
  f.setNow('2026-11-05T23:59:59+09:00');
  f.refresh();
  f.changes.length = 0;
  f.setNow('2026-11-06T00:00:00+09:00');
  f.refresh();
  assert.deepEqual(f.changes, ['posting.min=2026-11-01', 'posting.max=2026-11-06']);
  assert.equal(f.input.value, '2026-11-04');
  assert.equal(f.original.value, '2026-10-31');
});

test('年またぎでは新しい月の制限へ切り替え、編集中の空欄や過去値を自動補完しない', () => {
  const f = fixture();
  f.setNow('2026-12-31T23:59:59+09:00');
  f.refresh();
  f.input.value = '';
  f.changes.length = 0;
  f.setNow('2027-01-01T00:00:00+09:00');
  f.refresh();
  assert.equal(f.input.min, '2026-12-01');
  assert.equal(f.input.max, '2027-01-01');
  assert.equal(f.original.min, '2026-12-01');
  assert.equal(f.original.max, '2026-12-31');
  assert.equal(f.input.value, '');
  assert.equal(f.original.value, '2026-10-31');
});
