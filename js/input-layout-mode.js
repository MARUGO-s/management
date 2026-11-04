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

    // 表示集計だけの判定。空行の自動計算で入る金額0は、入力済みとは数えない。
    // 検証・送信・プリセット整理の空行判定は変更しない。
    function rowHasSummaryInput(row) {
      var fields = ['.category', '.item', '.unit-price', '.quantity'];
      for (var i = 0; i < fields.length; i++) {
        var field = row.querySelector(fields[i]);
        if (field && String(field.value == null ? '' : field.value).trim() !== '') return true;
      }
      if (row.querySelector('.category-option.selected')) return true;
      var amount = row.querySelector('.amount');
      var text = String(amount && amount.value != null ? amount.value : '').replace(/[¥,，\s]/g, '');
      // 金額だけの手入力も失わない。不正な途中入力も空行扱いにはしない。
      return text !== '' && (!isFinite(Number(text)) || Number(text) !== 0);
    }

    // 表示のみの集計（送信内容には使わない）。入力のある品目行だけを件数・合計の対象にする。
    function summarize() {
      var rows = doc.querySelectorAll('#entriesContainer .entry-row, #extraGroups .entry-row');
      var total = 0;
      var count = 0;
      for (var i = 0; i < rows.length; i++) {
        if (!rowHasSummaryInput(rows[i])) continue;
        count++;
        var amount = rows[i].querySelector('.amount');
        if (amount) total += parseAmount(amount.value);
      }
      return { rows: count, total: total };
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

    // ---- PC表示の初期行（品目3行＋追加グループ2行）----
    // 既存の「＋ 品目を追加」「＋ 全データを追加」ボタンを押すのと同じ操作で行を作る（送信処理は無変更）。
    // 自動で作った行には data-pc-preset を付け、何も入力されないまま残った行は送信直前とスマホ表示への
    // 切替時に取り除く（「行を削除」を押したのと同じ）。最初からある1行目と、手で追加した行は対象外。
    var PRESET_ATTR = 'data-pc-preset';

    function rowIsBlank(row) {
      var fields = ['.category', '.item', '.unit-price', '.quantity', '.amount'];
      for (var i = 0; i < fields.length; i++) {
        var el = row.querySelector(fields[i]);
        if (el && String(el.value || '').trim() !== '') return false;
      }
      return !row.querySelector('.category-option.selected');
    }

    function groupIsBlank(group) {
      var carryover = group.querySelector('.carryover-toggle');
      if (carryover && carryover.getAttribute('aria-pressed') === 'true') return false;
      var fields = ['.full-lender', '.full-borrower', '.full-name', '.original-date'];
      for (var i = 0; i < fields.length; i++) {
        var el = group.querySelector(fields[i]);
        if (el && String(el.value || '').trim() !== '') return false;
      }
      var rows = group.querySelectorAll('.entry-row');
      for (var j = 0; j < rows.length; j++) if (!rowIsBlank(rows[j])) return false;
      return true;
    }

    function formIsPristine() {
      var main = doc.querySelectorAll('#entriesContainer .entry-row');
      if (main.length !== 1 || !rowIsBlank(main[0])) return false;
      if (doc.querySelectorAll('#extraGroups .full-entry-group').length) return false;
      var top = ['name', 'lender', 'borrower'];
      for (var i = 0; i < top.length; i++) {
        var el = doc.getElementById(top[i]);
        if (el && String(el.value || '').trim() !== '') return false;
      }
      return true;
    }

    function markNew(selector, before) {
      var all = doc.querySelectorAll(selector);
      for (var i = 0; i < all.length; i++) if (before.indexOf(all[i]) < 0) all[i].setAttribute(PRESET_ATTR, '1');
    }

    function list(selector) { return Array.prototype.slice.call(doc.querySelectorAll(selector)); }

    function addPresetRows() {
      if (!formIsPristine()) return false;
      var addRow = doc.getElementById('add-row-btn');
      var addFull = doc.getElementById('add-full-row-btn');
      if (!addRow || !addFull) return false;
      var before = list('#entriesContainer .entry-row');
      addRow.click();
      addRow.click();
      markNew('#entriesContainer .entry-row', before);
      var groupsBefore = list('#extraGroups .full-entry-group');
      addFull.click();
      markNew('#extraGroups .full-entry-group', groupsBefore);
      var group = doc.querySelector('#extraGroups .full-entry-group[' + PRESET_ATTR + ']');
      var addItem = doc.querySelector('#extraGroups .group-add-item');
      if (group && addItem) {
        var rowsBefore = list('#extraGroups .entry-row');
        addItem.click();
        markNew('#extraGroups .entry-row', rowsBefore);
      }
      refresh();
      return true;
    }

    function removeBlankPresets() {
      var groups = list('#extraGroups .full-entry-group[' + PRESET_ATTR + ']');
      for (var g = 0; g < groups.length; g++) {
        if (!groupIsBlank(groups[g])) continue;
        var removeBtn = groups[g].querySelector('.remove-full-row');
        if (removeBtn) removeBtn.click(); else groups[g].remove();
      }
      var rows = list('.entry-row[' + PRESET_ATTR + ']');
      for (var r = 0; r < rows.length; r++) {
        if (!rows[r].isConnected || !rowIsBlank(rows[r])) continue;
        var container = rows[r].parentNode;
        if (container && container.querySelectorAll('.entry-row').length <= 1) continue; // 最後の1行は残す
        rows[r].remove();
      }
      var view = doc.defaultView;
      if (view && typeof view.refreshRemoveButtonsVisibility === 'function') view.refreshRemoveButtonsVisibility();
      refresh();
    }

    function apply(next) {
      var pc = next === 'pc';
      if (pc) root.classList.add(PC_CLASS);
      else root.classList.remove(PC_CLASS);
      if (pc) addPresetRows();
      else removeBlankPresets();
      refresh();
      return mode();
    }

    function toggle() {
      var next = mode() === 'pc' ? 'sp' : 'pc';
      apply(next);
      saveMode(storage, next);
      return next;
    }

    return { mode: mode, apply: apply, toggle: toggle, refresh: refresh, summarize: summarize, updateSummary: updateSummary,
      addPresetRows: addPresetRows, removeBlankPresets: removeBlankPresets };
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

    // Tabは横取りせず、標準のフォーカス移動後に合計バーの遮蔽だけを補正する。
    // 委譲により手動追加した行も対象。値・選択・プリセット整理には触れない。
    doc.addEventListener('focusin', function (e) {
      var target = e.target;
      if (controller.mode() !== 'pc') return;
      var defer = win.requestAnimationFrame || win.setTimeout;
      defer.call(win, function () {
        // フレーム待ちの間に別の欄へ移動・削除・表示切替された場合は動かさない。
        if (controller.mode() !== 'pc' || !target || !target.isConnected || doc.activeElement !== target) return;
        var form = target.closest('#loanForm');
        if (!form) return;
        var bar = form.querySelector(':scope > .button-group');
        if (!bar || bar.contains(target) || !bar.getClientRects().length) return;
        var barRect = bar.getBoundingClientRect();
        if (barRect.top >= win.innerHeight || barRect.bottom <= 0) return;
        var top = 8;
        var bottom = Math.min(win.innerHeight, barRect.top) - 8;
        if (bottom <= top) return;
        var rect = target.getBoundingClientRect();
        var row = target.closest('.entry-row');
        if (row) {
          var rowRect = row.getBoundingClientRect();
          // 折返し行が画面より高い場合は、選択中の入力欄を優先する。
          if (rowRect.height <= bottom - top) rect = rowRect;
        }
        var delta = rect.bottom > bottom ? rect.bottom - bottom : rect.top < top ? rect.top - top : 0;
        if (delta) win.scrollBy({ top: delta, left: 0, behavior: 'instant' });
      });
    });

    // 送信直前（main.js の送信処理より先＝キャプチャ段階）に、未入力のまま残った自動作成の行だけを取り除く
    doc.addEventListener('submit', function (e) {
      if (e.target && e.target.id === 'loanForm') controller.removeBlankPresets();
    }, true);

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
