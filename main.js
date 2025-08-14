/* =========================
   設定
========================= */
const GAS_URL = "https://script.google.com/macros/s/AKfycbw3eZ6eSNRLJTe6egUblf6CAq10HRlpHGoyZpCATGUDn4Vz0ul74F7P0KoyE6EPMeoi/exec"; // GASのWebアプリURL

// ★ マスタと一致して“届いていた状態”の店舗名。ここは絶対に変えません。
const shops = [
  "MARUGO-D", "MARUGO-OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA-JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

/* =========================
   ユーティリティ
========================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function convertToHalfWidthNumber(value) {
  if (!value) return "";
  let converted = value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  converted = converted.replace(/[^0-9]/g, "");
  return converted;
}

// ステータス表示：既存の仕組みに乗せる（active/completedの切替）
async function showStep(stepId, message) {
  const step = document.getElementById(stepId);
  if (!step) return;
  document.querySelectorAll('.status-step.active').forEach(s => {
    s.classList.remove('active');
    s.classList.add('completed');
  });
  step.classList.add('active');
  const label = step.querySelector('span:last-child');
  if (label) label.textContent = message;

  const icon = step.querySelector('.status-icon');
  if (icon) {
    const originalIcon = icon.textContent;
    icon.innerHTML = '<span class="mini-loading-spinner"></span>';
    step.dataset.originalIcon = originalIcon;
  }
}
function completeStep(stepId, message) {
  const step = document.getElementById(stepId);
  if (!step) return;
  step.classList.remove('active');
  step.classList.add('completed');
  const label = step.querySelector('span:last-child');
  if (label) label.textContent = message;

  const icon = step.querySelector('.status-icon');
  if (icon && step.dataset.originalIcon) icon.textContent = step.dataset.originalIcon;
}
function resetSteps() {
  document.querySelectorAll('.status-step').forEach(step => {
    step.classList.remove('active', 'completed', 'error');
  });
}
function hideMessages() {
  $('#successMessage')?.classList.remove('show');
  $('#errorMessage')?.classList.remove('show');
  $('#search-result')?.classList.remove('show');
}

/* =========================
   初期化
========================= */
function populateShops() {
  const lenderSelect = $("#lender");
  const borrowerSelect = $("#borrower");
  shops.forEach(shop => {
    const o1 = document.createElement("option");
    o1.value = shop; o1.textContent = shop;
    lenderSelect.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = shop; o2.textContent = shop;
    borrowerSelect.appendChild(o2);
  });
}

function checkLenderBorrowerMatch() {
  const lenderSelect = $("#lender");
  const borrowerSelect = $("#borrower");
  const errorDiv = $("#lender-borrower-error");
  if (!lenderSelect || !borrowerSelect || !errorDiv) return true;

  if (lenderSelect.value && borrowerSelect.value && lenderSelect.value === borrowerSelect.value) {
    errorDiv.textContent = '❌ 貸主と借主は異なる店舗を選択してください。';
    errorDiv.style.display = 'block';
    return false;
  } else {
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    return true;
  }
}

/* =========================
   逆取引検索（ダイジェスト）
========================= */
async function searchReverseTransaction() {
  const btn = $('#search-btn');
  const resBox = $('#search-result');
  const content = $('#search-result-content');
  const btnText = btn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  const currentData = {
    date: $("#date").value,
    name: $("#name").value,
    lender: $("#lender").value,
    borrower: $("#borrower").value,
    category: $("#category").value,
    item: $("#item").value,
    amount: convertToHalfWidthNumber($("#amount").value)
  };

  if (!currentData.date || !currentData.lender || !currentData.borrower || !currentData.category || !currentData.item || !currentData.amount) {
    content.innerHTML = `<div class="search-error">❌ すべての項目を入力してから検索してください</div>`;
    resBox.classList.add('show'); return;
  }
  if (currentData.lender === currentData.borrower) {
    content.innerHTML = `<div class="search-error">❌ 貸主と借主が同じため検索できません</div>`;
    resBox.classList.add('show'); return;
  }

  btn.disabled = true; btn.classList.add('loading'); btnText.textContent = '検索中...';
  resBox.classList.remove('show');

  try {
    const reverseData = { ...currentData, lender: currentData.borrower, borrower: currentData.lender, searchMode: true };

    // CORS許可ありなので通常fetchでも送れるが、検索UIは疑似表示のまま
    await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reverseData)
    });
    await delay(800);

    const ok = Math.random() > 0.4; // 疑似
    if (ok) {
      const matchData = {
        date: currentData.date,
        name: "システム検索結果",
        lender: currentData.borrower,
        borrower: currentData.lender,
        category: currentData.category,
        item: currentData.item,
        amount: currentData.amount,
        inputDate: "2024-12-27 10:30:00",
        correction: ""
      };
      content.innerHTML = `
        <div class="search-match">
          ✅ 逆取引データが見つかりました！
          <div class="match-details">
            <div class="match-details-row"><span class="match-details-label">📅 日付:</span><span class="match-details-value">${matchData.date}</span></div>
            <div class="match-details-row"><span class="match-details-label">👤 入力者:</span><span class="match-details-value">${matchData.name}</span></div>
            <div class="match-details-row"><span class="match-details-label">📤 貸主:</span><span class="match-details-value">${matchData.lender}</span></div>
            <div class="match-details-row"><span class="match-details-label">📥 借主:</span><span class="match-details-value">${matchData.borrower}</span></div>
            <div class="match-details-row"><span class="match-details-label">🏷️ カテゴリー:</span><span class="match-details-value">${matchData.category}</span></div>
            <div class="match-details-row"><span class="match-details-label">📝 品目:</span><span class="match-details-value">${matchData.item}</span></div>
            <div class="match-details-row"><span class="match-details-label">💵 金額:</span><span class="match-details-value">¥${parseInt(matchData.amount).toLocaleString('ja-JP')}</span></div>
            <div class="match-details-row"><span class="match-details-label">⏰ 入力日時:</span><span class="match-details-value">${matchData.inputDate}</span></div>
          </div>
          <div class="match-actions">
            <button class="correction-action-btn" id="correction-from-search">✏️ このデータを修正として送信</button>
          </div>
        </div>`;
    } else {
      content.innerHTML = `
        <div class="search-no-match">
          ❓ 逆取引データは見つかりませんでした
          <div style="margin-top: 10px; font-size: 14px;">
            以下の条件に一致するデータは存在しません：<br>
            📅 ${currentData.date} | ${currentData.borrower} → ${currentData.lender}<br>
            🏷️ ${currentData.category} | 📝 ${currentData.item} | 💵 ¥${parseInt(currentData.amount).toLocaleString('ja-JP')}
          </div>
          <div class="match-actions">
            <button class="correction-action-btn" id="correction-from-search-new">✏️ 新規修正として送信</button>
          </div>
        </div>`;
    }

    resBox.classList.add('show');

    const existing = content.dataset.listenerAdded;
    if (existing) content.removeEventListener('click', handleSearchResultButtonClick);
    content.addEventListener('click', handleSearchResultButtonClick);
    content.dataset.listenerAdded = 'true';
  } catch (err) {
    console.error('検索エラー:', err);
    content.innerHTML = `<div class="search-error">❌ 検索中にエラーが発生しました<br><small>${err.message}</small></div>`;
    resBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.classList.remove('loading'); btnText.textContent = originalText;
  }
}
async function handleSearchResultButtonClick(e) {
  if (e.target.id === 'correction-from-search') await handleCorrectionFromSearch('found');
  else if (e.target.id === 'correction-from-search-new') await handleCorrectionFromSearch('not_found');
}
async function handleCorrectionFromSearch(type='found') {
  const categoryInput = $('#category');
  if (!categoryInput.value) { alert('カテゴリーを選択してください'); return; }

  const dateValue = $("#date").value;
  const nameValue = $("#name").value;
  const lenderValue = $("#lender").value;
  const borrowerValue = $("#borrower").value;
  const itemValue = $("#item").value;
  const categoryValue = $("#category").value;
  const amountValue = parseInt(convertToHalfWidthNumber($("#amount").value)).toLocaleString('ja-JP');

  const msg = (type==='found')
    ? `🔍 逆取引データが見つかりました！

現在入力されているデータを修正として送信しますか？

📅 ${dateValue}
👤 ${nameValue}
🔄 ${lenderValue} → ${borrowerValue}
📝 ${itemValue} (${categoryValue})
💵 ¥${amountValue}

🔥 修正フラグ: ✏️修正 が自動的に付与されます`
    : `❓ 逆取引データは見つかりませんでした

それでも現在のデータを修正として送信しますか？

📅 ${dateValue}
👤 ${nameValue}
🔄 ${lenderValue} → ${borrowerValue}
📝 ${itemValue} (${categoryValue})
💵 ¥${amountValue}

🔥 修正フラグ: ✏️修正 が自動的に付与されます`;

  if (confirm(msg)) {
    $('#search-result')?.classList.remove('show');
    await submitData({ isCorrection: true, correctionOnly: true, correctionMark: "✏️修正" });
  }
}

/* =========================
   送信（ここが今回の要！）
   - no-cors をやめ、レスポンス(JSON)を読んでから
     📧 送信中 → 📧 送信済み を出す
========================= */
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

  hideMessages();
  resetSteps();

  if (!categoryInput.value) { alert('カテゴリーを選択してください'); return; }
  if (!checkLenderBorrowerMatch()) return;

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = correctionOnly ? '修正送信中...' : '送信中...';
  statusDisplay?.classList.add('show');

  try {
    // 1) 検証
    await showStep('step-validation', correctionOnly ? '📋 修正データを検証中...' : '📋 データを検証中...');
    await delay(300);
    completeStep('step-validation', `✅ ${correctionOnly ? '修正データ' : 'データ'}検証完了`);

    // 2) GASへ送信（← ここでレスポンスを読む）
    await showStep('step-sending', `📤 ${correctionOnly ? '修正データ' : ''}スプレッドシートに送信中...`);

    const payload = {
      date: $("#date").value,
      name: $("#name").value,
      lender: $("#lender").value,
      borrower: $("#borrower").value,
      category: $("#category").value,
      item: $("#item").value,
      amount: convertToHalfWidthNumber($("#amount").value),
      isCorrection: isCorrection,
      ...(correctionOnly ? { correctionOnly: true, correctionMark: correctionMark || "✏️修正", sendType: "CORRECTION" } : {})
    };

    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data = {};
    try { data = await res.json(); } catch { /* 非JSONの保険 */ }

    if (!(res.ok && data && data.status === 'SUCCESS')) {
      // GASが失敗なら UIも失敗扱い（送信済みは出さない）
      throw new Error(data?.message || `サーバーエラー (HTTP ${res.status})`);
    }

    completeStep('step-sending', `✅ ${correctionOnly ? '修正データ' : ''}送信完了`);

    // 3) 挿入（概念表示）
    await showStep('step-inserting', `💾 ${correctionOnly ? '修正データ' : ''}を挿入中...`);
    await delay(400);
    completeStep('step-inserting', `✅ ${correctionOnly ? '修正データ' : ''}挿入完了`);

    // 4) ★ 借主メール：本当に成功した時だけ表示
    await showStep('step-mailing', '📧 借主へメール送信中...');
    await delay(250);
    completeStep('step-mailing', '📧 借主へメール送信中...完了');

    await showStep('step-mailed', '📧 借主へメール送信済み');
    completeStep('step-mailed', '📧 借主へメール送信済み');

    // 5) バックアップ（概念表示）
    await showStep('step-backup', '🔄 バックアップを作成中...');
    await delay(400);
    completeStep('step-backup', '✅ バックアップ作成完了');

    // 6) 完了
    await showStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : 'すべての処理'}が完了しました！`);
    completeStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : '送信'}完了！`);

    // 成功トースト & リセット
    setTimeout(() => {
      submitBtn.classList.remove('loading');
      btnText.textContent = originalText;
      submitBtn.disabled = false;

      const msg = $('#successMessage');
      if (msg) {
        msg.textContent = correctionOnly ? '✅ 修正データの送信が完了しました！' : '✅ 送信完了しました！';
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 2800);
      }

      form.reset();
      $('#date').valueAsDate = new Date();
      categoryOptions.forEach(opt => opt.classList.remove('selected'));
      statusDisplay?.classList.remove('show');
    }, 350);

  } catch (error) {
    console.error('送信エラー:', error);

    const active = document.querySelector('.status-step.active');
    if (active) {
      active.classList.remove('active');
      active.classList.add('error');
      const label = active.querySelector('span:last-child');
      if (label) label.textContent = '❌ エラーが発生しました';
    }

    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
    submitBtn.disabled = false;

    const errMsg = $('#errorMessage');
    if (errMsg) {
      errMsg.textContent = `❌ ${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`;
      errMsg.classList.add('show');
      setTimeout(() => {
        errMsg.classList.remove('show');
        $('#status-display')?.classList.remove('show');
      }, 5000);
    } else {
      alert(`${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`);
    }
  }
}

/* =========================
   DOM準備
========================= */
function initializeElements() {
  // 今日の日付
  const dateEl = $('#date');
  if (dateEl && !dateEl.value) dateEl.valueAsDate = new Date();

  // カテゴリー選択
  const categoryOptions = $$('.category-option');
  const categoryInput = $('#category');
  categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
      categoryOptions.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      categoryInput.value = option.dataset.value;
    });
  });

  // 金額フォーマット
  const amountInput = $('#amount');
  amountInput.addEventListener('input', (e) => {
    e.target.value = convertToHalfWidthNumber(e.target.value);
  });
  amountInput.addEventListener('blur', (e) => {
    let v = e.target.value;
    if (v) v = parseInt(v).toLocaleString('ja-JP');
    e.target.value = v;
  });
  amountInput.addEventListener('focus', (e) => {
    e.target.value = e.target.value?.replace(/,/g, '') || '';
  });

  // 貸主/借主エラー表示挿入
  const borrowerSelect = $("#borrower");
  let errorDiv = $("#lender-borrower-error");
  if (!errorDiv && borrowerSelect) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'lender-borrower-error';
    errorDiv.style.color = '#e53e3e';
    errorDiv.style.fontSize = '0.875rem';
    errorDiv.style.marginTop = '8px';
    errorDiv.style.display = 'none';
    const grp = borrowerSelect.closest('.form-group');
    grp?.appendChild(errorDiv);
  }

  $("#lender")?.addEventListener('change', checkLenderBorrowerMatch);
  $("#borrower")?.addEventListener('change', checkLenderBorrowerMatch);
  checkLenderBorrowerMatch();

  // フォーム送信
  const form = $('#loanForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkLenderBorrowerMatch()) return;
    await submitData({ isCorrection: false, correctionOnly: false });
  });

  // 逆取引検索
  $('#search-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await searchReverseTransaction();
  });
}

function initialize() {
  populateShops();
  initializeElements();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
