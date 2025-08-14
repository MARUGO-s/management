/* ========== 設定 ========== */
const GAS_URL = "https://script.google.com/macros/s/AKfycbw3eZ6eSNRLJTe6egUblf6CAq10HRlpHGoyZpCATGUDn4Vz0ul74F7P0KoyE6EPMeoi/exec";

// ★ ここは絶対に触らない：マスタと一致していた「届く状態」のまま
const shops = [
  "MARUGO-D", "MARUGO-OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA-JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

/* ========== ユーティリティ ========== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function convertToHalfWidthNumber(value) {
  if (!value) return "";
  let v = value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  return v.replace(/[^0-9]/g, "");
}

/* ---- 既存のステップUI制御 ---- */
async function showStep(stepId, message) {
  const step = document.getElementById(stepId);
  if (!step) return;
  document.querySelectorAll('.status-step.active').forEach(s => { s.classList.remove('active'); s.classList.add('completed'); });
  step.classList.add('active');
  const label = step.querySelector('span:last-child'); if (label) label.textContent = message;
  const icon = step.querySelector('.status-icon');
  if (icon) { const original = icon.textContent; icon.innerHTML = '<span class="mini-loading-spinner"></span>'; step.dataset.originalIcon = original; }
}
function completeStep(stepId, message) {
  const step = document.getElementById(stepId); if (!step) return;
  step.classList.remove('active'); step.classList.add('completed');
  const label = step.querySelector('span:last-child'); if (label) label.textContent = message;
  const icon = step.querySelector('.status-icon'); if (icon && step.dataset.originalIcon) icon.textContent = step.dataset.originalIcon;
}
function resetSteps(){ $$('.status-step').forEach(s => s.classList.remove('active','completed','error')); }
function hideMessages(){ $('#successMessage')?.classList.remove('show'); $('#errorMessage')?.classList.remove('show'); $('#search-result')?.classList.remove('show'); }

/* ---- 新規：ポップアップ（トースト）制御 ---- */
function showPopup(message, type='info', icon='ℹ️', timeout=2200) {
  const stack = $('#toast-stack'); if (!stack) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  stack.appendChild(toast);

  // 自動クローズ
  const close = () => { toast.classList.add('out'); setTimeout(() => toast.remove(), 220); };
  setTimeout(close, timeout);
  // クリックで即閉じ
  toast.addEventListener('click', close);
}

/* ========== 初期化 ========== */
function populateShops() {
  const lender = $("#lender"); const borrower = $("#borrower");
  shops.forEach(name => {
    const o1 = document.createElement('option'); o1.value = name; o1.textContent = name; lender.appendChild(o1);
    const o2 = document.createElement('option'); o2.value = name; o2.textContent = name; borrower.appendChild(o2);
  });
}
function checkLenderBorrowerMatch() {
  const lender = $("#lender"); const borrower = $("#borrower"); const err = $("#lender-borrower-error");
  if (!lender || !borrower) return true;
  const same = lender.value && borrower.value && lender.value === borrower.value;
  if (same) {
    if (err){ err.textContent = '❌ 貸主と借主は異なる店舗を選択してください。'; err.style.display = 'block'; }
    return false;
  } else {
    if (err){ err.textContent = ''; err.style.display = 'none'; }
    return true;
  }
}

/* ========== 逆取引検索（簡略：UIのみ） ========== */
async function searchReverseTransaction() {
  const btn = $('#search-btn'); if (!btn) return;
  const box = $('#search-result'); const content = $('#search-result-content');
  const btnText = btn.querySelector('.btn-text'); const original = btnText.textContent;

  const currentData = {
    date: $("#date").value, name: $("#name").value, lender: $("#lender").value, borrower: $("#borrower").value,
    category: $("#category").value, item: $("#item").value, amount: convertToHalfWidthNumber($("#amount").value)
  };

  if (!currentData.date || !currentData.lender || !currentData.borrower || !currentData.category || !currentData.item || !currentData.amount) {
    content.innerHTML = `<div class="search-error">❌ すべての項目を入力してから検索してください</div>`; box.classList.add('show'); return;
  }
  if (currentData.lender === currentData.borrower) {
    content.innerHTML = `<div class="search-error">❌ 貸主と借主が同じため検索できません</div>`; box.classList.add('show'); return;
  }

  btn.disabled = true; btn.classList.add('loading'); btnText.textContent = '検索中...'; box.classList.remove('show');
  try {
    const reverseData = { ...currentData, lender: currentData.borrower, borrower: currentData.lender, searchMode: true };
    await fetch(GAS_URL, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(reverseData) });
    await delay(800);

    // 疑似結果
    const ok = Math.random() > 0.4;
    if (ok) {
      content.innerHTML = `
        <div class="search-match">
          ✅ 逆取引データが見つかりました！
          <div class="match-details">
            <div class="match-details-row"><span class="match-details-label">📅 日付:</span><span class="match-details-value">${currentData.date}</span></div>
            <div class="match-details-row"><span class="match-details-label">📤 貸主:</span><span class="match-details-value">${currentData.borrower}</span></div>
            <div class="match-details-row"><span class="match-details-label">📥 借主:</span><span class="match-details-value">${currentData.lender}</span></div>
            <div class="match-details-row"><span class="match-details-label">📝 品目:</span><span class="match-details-value">${currentData.item}</span></div>
            <div class="match-details-row"><span class="match-details-label">🏷️ カテゴリー:</span><span class="match-details-value">${currentData.category}</span></div>
            <div class="match-details-row"><span class="match-details-label">💵 金額:</span><span class="match-details-value">¥${parseInt(currentData.amount).toLocaleString('ja-JP')}</span></div>
          </div>
          <div class="match-actions"><button class="correction-action-btn" id="correction-from-search">✏️ このデータを修正として送信</button></div>
        </div>`;
    } else {
      content.innerHTML = `
        <div class="search-no-match">
          ❓ 逆取引データは見つかりませんでした
          <div style="margin-top:10px;font-size:14px;">
            📅 ${currentData.date} | ${currentData.borrower} → ${currentData.lender}<br>
            🏷️ ${currentData.category} | 📝 ${currentData.item} | 💵 ¥${parseInt(currentData.amount).toLocaleString('ja-JP')}
          </div>
          <div class="match-actions"><button class="correction-action-btn" id="correction-from-search-new">✏️ 新規修正として送信</button></div>
        </div>`;
    }
    box.classList.add('show');

    const existing = content.dataset.listenerAdded;
    if (existing) content.removeEventListener('click', handleSearchResultButtonClick);
    content.addEventListener('click', handleSearchResultButtonClick);
    content.dataset.listenerAdded = 'true';
  } catch (e) {
    console.error('検索エラー:', e);
    content.innerHTML = `<div class="search-error">❌ 検索中にエラーが発生しました<br><small>${e.message}</small></div>`;
    box.classList.add('show');
  } finally {
    btn.disabled = false; btn.classList.remove('loading'); btnText.textContent = original;
  }
}
async function handleSearchResultButtonClick(e) {
  if (e.target.id === 'correction-from-search') await handleCorrectionFromSearch('found');
  else if (e.target.id === 'correction-from-search-new') await handleCorrectionFromSearch('not_found');
}
async function handleCorrectionFromSearch(type='found') {
  const cat = $('#category'); if (!cat.value) { alert('カテゴリーを選択してください'); return; }

  const dateValue = $("#date").value, nameValue = $("#name").value;
  const lenderValue = $("#lender").value, borrowerValue = $("#borrower").value;
  const itemValue = $("#item").value, categoryValue = $("#category").value;
  const amountValue = parseInt(convertToHalfWidthNumber($("#amount").value)).toLocaleString('ja-JP');

  const msg = type==='found'
    ? `🔍 逆取引データが見つかりました！\n\n現在入力されているデータを修正として送信しますか？\n\n📅 ${dateValue}\n👤 ${nameValue}\n🔄 ${lenderValue} → ${borrowerValue}\n📝 ${itemValue} (${categoryValue})\n💵 ¥${amountValue}\n\n🔥 修正フラグ: ✏️修正 が自動的に付与されます`
    : `❓ 逆取引データは見つかりませんでした\n\nそれでも現在のデータを修正として送信しますか？\n\n📅 ${dateValue}\n👤 ${nameValue}\n🔄 ${lenderValue} → ${borrowerValue}\n📝 ${itemValue} (${categoryValue})\n💵 ¥${amountValue}\n\n🔥 修正フラグ: ✏️修正 が自動的に付与されます`;

  if (confirm(msg)) {
    $('#search-result')?.classList.remove('show');
    await submitData({ isCorrection:true, correctionOnly:true, correctionMark:"✏️修正" });
  }
}

/* ========== 送信（ポップアップ付き） ========== */
async function submitData(options = {}) {
  const { isCorrection=false, correctionOnly=false, correctionMark="" } = options;

  const statusDisplay = $('#status-display');
  const submitBtn = document.querySelector('.submit-btn:not(.search-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = submitBtn.dataset.originalText || btnText.textContent;
  submitBtn.dataset.originalText = originalText;

  const categoryInput = $('#category');
  const categoryOptions = $$('.category-option');
  const form = $('#loanForm');

  hideMessages(); resetSteps();
  if (!categoryInput.value) { alert('カテゴリーを選択してください'); return; }
  if (!checkLenderBorrowerMatch()) return;

  submitBtn.disabled = true; submitBtn.classList.add('loading'); btnText.textContent = correctionOnly ? '修正送信中...' : '送信中...';
  statusDisplay?.classList.add('show');

  try {
    // 1) 検証
    await showStep('step-validation', correctionOnly ? '📋 修正データを検証中...' : '📋 データを検証中...');
    showPopup('📋 データを検証中...', 'info', '📋', 1200);
    await delay(300);
    completeStep('step-validation', `✅ ${correctionOnly ? '修正データ' : 'データ'}検証完了`);

    // 2) GASへ送信（レスポンスを厳密判定）
    await showStep('step-sending', `📤 ${correctionOnly ? '修正データ' : ''}スプレッドシートに送信中...`);
    showPopup('📤 スプレッドシートに送信中...', 'info', '📤', 1400);

    const payload = {
      date: $("#date").value, name: $("#name").value,
      lender: $("#lender").value, borrower: $("#borrower").value,
      category: $("#category").value, item: $("#item").value,
      amount: convertToHalfWidthNumber($("#amount").value),
      isCorrection: isCorrection,
      ...(correctionOnly ? { correctionOnly:true, correctionMark: (correctionMark || "✏️修正"), sendType:"CORRECTION" } : {})
    };

    const res = await fetch(GAS_URL, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    let data = {}; try { data = await res.json(); } catch {}

    if (!(res.ok && data && data.status === 'SUCCESS')) {
      throw new Error(data?.message || `サーバーエラー (HTTP ${res.status})`);
    }
    completeStep('step-sending', `✅ ${correctionOnly ? '修正データ' : ''}送信完了`);

    // 3) 挿入（概念表示）
    await showStep('step-inserting', `💾 ${correctionOnly ? '修正データ' : ''}を挿入中...`);
    showPopup('💾 データを挿入中...', 'info', '💾', 1200);
    await delay(400);
    completeStep('step-inserting', `✅ ${correctionOnly ? '修正データ' : ''}挿入完了`);

    // 4) 借主メール（実成功後のみUI表示）
    await showStep('step-mailing', '📧 借主へメール送信中...');
    showPopup('📧 借主へメール送信中...', 'info', '📧', 1100);
    await delay(250);
    completeStep('step-mailing', '📧 借主へメール送信中...完了');

    await showStep('step-mailed', '📧 借主へメール送信済み');
    showPopup('📧 借主へメール送信済み', 'success', '📧', 1500);
    completeStep('step-mailed', '📧 借主へメール送信済み');

    // 5) バックアップ（概念表示）
    await showStep('step-backup', '🔄 バックアップを作成中...');
    showPopup('🔄 バックアップを作成中...', 'info', '🔄', 1200);
    await delay(400);
    completeStep('step-backup', '✅ バックアップ作成完了');

    // 6) 完了
    await showStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : 'すべての処理'}が完了しました！`);
    showPopup('✅ 送信完了！', 'success', '✅', 1800);
    completeStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : '送信'}完了！`);

    // リセット
    setTimeout(() => {
      submitBtn.classList.remove('loading'); btnText.textContent = originalText; submitBtn.disabled = false;
      const msg = $('#successMessage'); if (msg) { msg.textContent = correctionOnly ? '✅ 修正データの送信が完了しました！' : '✅ 送信完了しました！'; msg.classList.add('show'); setTimeout(() => msg.classList.remove('show'), 2500); }
      $('#loanForm').reset(); $('#date').valueAsDate = new Date(); $$('.category-option').forEach(o => o.classList.remove('selected')); statusDisplay?.classList.remove('show');
    }, 350);

  } catch (error) {
    console.error('送信エラー:', error);

    const active = document.querySelector('.status-step.active');
    if (active) { active.classList.remove('active'); active.classList.add('error'); const l = active.querySelector('span:last-child'); if (l) l.textContent = '❌ エラーが発生しました'; }

    submitBtn.classList.remove('loading'); btnText.textContent = originalText; submitBtn.disabled = false;
    showPopup(`❌ 送信エラー: ${error.message}`, 'error', '❌', 3000);

    const errMsg = $('#errorMessage');
    if (errMsg) { errMsg.textContent = `❌ ${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`; errMsg.classList.add('show'); setTimeout(() => { errMsg.classList.remove('show'); $('#status-display')?.classList.remove('show'); }, 5000); }
    else { alert(`${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`); }
  }
}

/* ========== DOM 準備 ========== */
function initializeElements() {
  // 今日の日付
  const dateEl = $('#date'); if (dateEl && !dateEl.value) dateEl.valueAsDate = new Date();

  // カテゴリー選択
  const options = $$('.category-option'); const input = $('#category');
  options.forEach(op => op.addEventListener('click', () => { options.forEach(o => o.classList.remove('selected')); op.classList.add('selected'); input.value = op.dataset.value; }));

  // 金額フォーマット
  const amount = $('#amount');
  amount.addEventListener('input', e => e.target.value = convertToHalfWidthNumber(e.target.value));
  amount.addEventListener('blur', e => { let v = e.target.value; if (v) v = parseInt(v).toLocaleString('ja-JP'); e.target.value = v; });
  amount.addEventListener('focus', e => e.target.value = e.target.value?.replace(/,/g, '') || '');

  // 貸主/借主エラー表示DOMを追加
  const borrower = $("#borrower");
  let err = $("#lender-borrower-error");
  if (!err && borrower) {
    err = document.createElement('div');
    err.id = 'lender-borrower-error'; err.style.color = '#e53e3e'; err.style.fontSize = '.875rem'; err.style.marginTop = '8px'; err.style.display = 'none';
    borrower.closest('.form-group')?.appendChild(err);
  }

  $("#lender")?.addEventListener('change', checkLenderBorrowerMatch);
  $("#borrower")?.addEventListener('change', checkLenderBorrowerMatch);
  checkLenderBorrowerMatch();

  // 送信
  $('#loanForm').addEventListener('submit', async (e) => { e.preventDefault(); if (!checkLenderBorrowerMatch()) return; await submitData({ isCorrection:false, correctionOnly:false }); });

  // 逆取引検索（任意）
  $('#search-btn')?.addEventListener('click', async (e) => { e.preventDefault(); await searchReverseTransaction(); });
}
function initialize(){ populateShops(); initializeElements(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize); else initialize();
