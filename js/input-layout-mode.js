// 入力画面（index.html）のスマホ表示 / PC表示 切替。
// 見た目（html.pc-mode クラス）だけを切り替える。入力値・送信処理・イベント登録には触れないため、
// 切り替えても入力内容は消えず、再読み込みや初期化のやり直しも起きない。
// 初回描画前のクラス付与は index.html の <head> 内の小さなスクリプト（id="input-layout-mode-boot"）が行う。
(function (global) {
  'use strict';

  var STORAGE_KEY = 'inputLayoutMode';
  var PC_CLASS = 'pc-mode';

  function readMode(storage) {
    try {
      return storage && storage.getItem(STORAGE_KEY) === 'pc' ? 'pc' : 'sp';
    } catch (_) {
      return 'sp'; // プライベートモード等で読めない場合はスマホ表示
    }
  }

  function saveMode(storage, mode) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, mode);
    } catch (_) { /* 保存できなくても切替自体は行う */ }
  }

  function parseAmount(value) {
    var n = parseFloat(String(value == null ? '' : value).replace(/[¥,，\s]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function create(options) {
    var doc = options.document;
    var storage = options.storage;
    var root = doc.documentElement;

    function mode() {
      return root.classList.contains(PC_CLASS) ? 'pc' : 'sp';
    }

    function syncButton() {
      var btn = doc.getElementById('layoutToggleBtn');
      if (!btn) return;
      var pc = mode() === 'pc';
      btn.setAttribute('aria-pressed', pc ? 'true' : 'false');
      btn.setAttribute('title', pc ? 'スマホ表示に切り替える' : 'PC表示に切り替える');
      btn.dataset.mode = mode();
    }

    // PC表示ではキーボードで操作しやすくする（カテゴリーにTabで移動、自動計算の金額はTabで飛ばす）。
    // スマホ表示では付けた属性を外し、従来と同じDOM状態に戻す。
    function syncKeyboard() {
      var pc = mode() === 'pc';
      var options = doc.querySelectorAll('.entry-row .category-option');
      for (var i = 0; i < options.length; i++) {
        if (pc) options[i].setAttribute('tabindex', '0');
        else options[i].removeAttribute('tabindex');
      }
      var amounts = doc.querySelectorAll('.entry-row .amount');
      for (var j = 0; j < amounts.length; j++) {
        if (pc) amounts[j].setAttribute('tabindex', '-1');
        else amounts[j].removeAttribute('tabindex');
      }
    }

    // 表示のみの集計（送信内容には使わない）。各行の金額欄（calculateAmountForRow の結果）を合計する。
    function summarize() {
      var rows = doc.querySelectorAll('#entriesContainer .entry-row, #extraGroups .entry-row');
      var total = 0;
      for (var i = 0; i < rows.length; i++) {
        var amount = rows[i].querySelector('.amount');
        if (amount) total += parseAmount(amount.value);
      }
      return { rows: rows.length, total: total };
    }

    function updateSummary() {
      var rowsEl = doc.getElementById('pcSummaryRows');
      var totalEl = doc.getElementById('pcSummaryTotal');
      if (!rowsEl || !totalEl) return;
      var s = summarize();
      var rowsText = String(s.rows);
      var totalText = '¥' + Math.round(s.total).toLocaleString('ja-JP');
      // 変化がないときは書き換えない（MutationObserver の無限ループ防止）
      if (rowsEl.textContent !== rowsText) rowsEl.textContent = rowsText;
      if (totalEl.textContent !== totalText) totalEl.textContent = totalText;
    }

    function refresh() {
      syncButton();
      syncKeyboard();
      updateSummary();
    }

    function apply(next) {
      var pc = next === 'pc';
      if (pc) root.classList.add(PC_CLASS);
      else root.classList.remove(PC_CLASS);
      refresh();
      return mode();
    }

    function toggle() {
      var next = mode() === 'pc' ? 'sp' : 'pc';
      apply(next);
      saveMode(storage, next);
      return next;
    }

    return { mode: mode, apply: apply, toggle: toggle, refresh: refresh, summarize: summarize, updateSummary: updateSummary };
  }

  function install(win) {
    var doc = win.document;
    var storage = null;
    try { storage = win.localStorage; } catch (_) { storage = null; }
    var controller = create({ document: doc, storage: storage });
    // 保存値とクラスを一致させる（<head> のスクリプトが付けたクラスをそのまま尊重）
    controller.apply(readMode(storage) === 'pc' || doc.documentElement.classList.contains(PC_CLASS) ? 'pc' : 'sp');

    var btn = doc.getElementById('layoutToggleBtn');
    if (btn && !btn._layoutToggleBound) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        controller.toggle();
      });
      btn._layoutToggleBound = true;
    }

    // カテゴリー（div）を Enter / Space で選択できるようにする（クリックと同じ処理を呼ぶだけ）
    doc.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('category-option')) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        t.click();
      }
    });

    // 行の追加・削除や金額の再計算に合わせて、属性と集計を更新（表示のみ）
    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      win.setTimeout(function () { pending = false; controller.refresh(); }, 0);
    }
    ['input', 'change', 'click', 'focusout'].forEach(function (type) {
      doc.addEventListener(type, schedule, true);
    });
    var form = doc.getElementById('loanForm');
    if (form && typeof win.MutationObserver === 'function') {
      new win.MutationObserver(schedule).observe(form, { childList: true, subtree: true });
    }

    win.InputLayoutMode.controller = controller;
    return controller;
  }

  var api = { STORAGE_KEY: STORAGE_KEY, PC_CLASS: PC_CLASS, readMode: readMode, create: create, install: install, parseAmount: parseAmount };
  global.InputLayoutMode = api;

  if (global.document && global.document.getElementById) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { install(global); });
    } else {
      install(global);
    }
  }
})(typeof window !== 'undefined' ? window : this);
