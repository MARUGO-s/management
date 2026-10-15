// Shared verbatim with the GAS sources. All business dates use Japan time.
var LoanDatePolicy = (function () {
  'use strict';
  function today(now) {
    return new Date((now || new Date()).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  function valid(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  }
  function bounds(now) {
    var end = today(now), start = end.slice(0, 7) + '-01';
    var previousEnd = new Date(Date.parse(start + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    var previousMin = previousEnd.slice(0, 7) + '-01';
    // The previous month stays open through the fifth, inclusive, in Japan time.
    return { min: Number(end.slice(8)) <= 5 ? previousMin : start, currentMin: start,
      max: end, previousMin: previousMin, previousMax: previousEnd };
  }
  function validate(data, now) {
    var range = bounds(now);
    var min = data.isCarryover === true ? range.currentMin : range.min;
    if (!valid(data.date) || data.date < min || data.date > range.max) {
      return data.isCarryover === true
        ? '繰越の計上日は当月1日から今日までの日付を指定してください。'
        : '計上日は入力可能な期間から今日までの日付を指定してください。前月分の通常入力は翌月5日までです。6日以降の入力漏れは「繰越」で登録してください。';
    }
    if (data.isCarryover != null && typeof data.isCarryover !== 'boolean') return '繰越の指定が不正です。';
    if (data.isCarryover === true) {
      if (data.isCorrection === true) return '繰越と逆取引修正は同時に登録できません。';
      if (!valid(data.originalDate) || data.originalDate < range.previousMin || data.originalDate > range.previousMax) {
        return '繰越の実際の取引日は、前月1日から前月末日までを指定してください。';
      }
    } else if (data.originalDate != null && data.originalDate !== '') {
      return '前月の取引日を指定する場合は「繰越」を選んでください。';
    }
    return '';
  }
  function mark(data) {
    return data.isCarryover === true ? '↪繰越（前月取引日: ' + data.originalDate + '）' : '';
  }
  return { today: today, valid: valid, bounds: bounds, validate: validate, mark: mark };
})();
