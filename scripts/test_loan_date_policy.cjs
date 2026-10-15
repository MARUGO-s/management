const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/loan-date-policy.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const P = ctx.LoanDatePolicy;
const now = new Date('2026-09-30T23:59:59+09:00');

test('通常入力は日本時間で当月1日から今日まで。月末・未来・不正日付を判定する', () => {
  for (const date of ['2026-09-01', '2026-09-29', '2026-09-30']) assert.equal(P.validate({ date }, now), '');
  for (const date of ['2026-08-31', '2026-10-01', '2026-09-31', '2026-9-1', '', null]) {
    assert.match(P.validate({ date }, now), /入力可能な期間/);
  }
  assert.match(P.validate({ date: '2026-09-16' }, new Date('2026-09-15T12:00:00+09:00')), /今日/);
});

test('繰越は前月の実日付と当月の計上日が必要。通常・修正の偽装を拒否する', () => {
  const data = { date: '2026-09-01', isCarryover: true, originalDate: '2026-08-31' };
  assert.equal(P.validate(data, now), '');
  assert.equal(P.validate({ ...data, originalDate: '2026-08-01' }, now), '');
  assert.match(P.mark(data), /繰越.*2026-08-31/);
  for (const originalDate of ['2026-07-31', '2026-09-01', '2026-10-01', '2026-08-32', '']) {
    assert.match(P.validate({ ...data, originalDate }, now), /前月/);
  }
  assert.match(P.validate({ ...data, date: '2026-08-31' }, now), /当月/);
  assert.match(P.validate({ ...data, isCarryover: 'true' }, now), /不正/);
  assert.match(P.validate({ ...data, isCarryover: false }, now), /繰越/);
  assert.match(P.validate({ ...data, isCorrection: true }, now), /同時/);
});

test('端末のタイムゾーンに関係なく日本の月替わり・年替わり・うるう年を扱う', () => {
  const before = P.bounds(new Date('2026-09-30T14:59:59Z'));
  const after = P.bounds(new Date('2026-09-30T15:00:00Z'));
  assert.equal(before.max, '2026-09-30');
  assert.equal(after.min, '2026-09-01');
  assert.equal(after.currentMin, '2026-10-01');
  assert.equal(after.max, '2026-10-01');
  assert.equal(after.previousMax, '2026-09-30');
  const january = P.bounds(new Date('2027-01-01T00:00:00+09:00'));
  assert.equal(january.previousMin, '2026-12-01');
  assert.equal(january.previousMax, '2026-12-31');
  assert.equal(P.bounds(new Date('2028-03-01T00:00:00+09:00')).previousMax, '2028-02-29');
});

test('画面と両GASソースが同じ日付規則を使う', () => {
  for (const file of ['gas_code_complete.gs', 'gas_code_complete_updated.gs']) {
    assert.ok(fs.readFileSync(path.join(root, 'docs/gas_scripts', file), 'utf8').endsWith(source), file);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/loan-date-policy.js?') < html.indexOf('pages/js/main.js?'));
});

test('前月の通常入力は翌月5日の日本時間23:59:59まで、6日0時から締め切る', () => {
  const last = new Date('2026-10-05T23:59:59+09:00');
  const closed = new Date('2026-10-06T00:00:00+09:00');
  for (const date of ['2026-09-01', '2026-09-30', '2026-10-01', '2026-10-05']) {
    assert.equal(P.validate({ date }, last), '');
  }
  for (const date of ['2026-08-31', '2026-10-06']) assert.match(P.validate({ date }, last), /入力可能な期間/);
  assert.match(P.validate({ date: '2026-09-30' }, closed), /翌月5日/);
  assert.equal(P.validate({ date: '2026-10-01' }, closed), '');
  assert.equal(P.bounds(last).min, '2026-09-01');
  assert.equal(P.bounds(closed).min, '2026-10-01');
  for (let day = 1; day <= 5; day++) {
    assert.equal(P.validate({ date: '2026-09-01' }, new Date(`2026-10-0${day}T12:00:00+09:00`)), '');
  }
});

test('年またぎ・うるう年の前月も5日まで開き、繰越の計上日は常に当月に限定する', () => {
  const jan = new Date('2027-01-05T23:59:59+09:00');
  assert.equal(P.validate({ date: '2026-12-01' }, jan), '');
  assert.match(P.validate({ date: '2026-12-31' }, new Date('2027-01-06T00:00:00+09:00')), /翌月5日/);
  assert.equal(P.validate({ date: '2028-02-29' }, new Date('2028-03-05T12:00:00+09:00')), '');
  const carryover = { date: '2026-12-31', isCarryover: true, originalDate: '2026-12-30' };
  assert.match(P.validate(carryover, jan), /繰越の計上日は当月/);
  assert.equal(P.validate({ ...carryover, date: '2027-01-05' }, jan), '');
});
