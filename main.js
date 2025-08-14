const GAS_URL = "https://script.google.com/macros/s/AKfycbw3eZ6eSNRLJTe6egUblf6CAq10HRlpHGoyZpCATGUDn4Vz0ul74F7P0KoyE6EPMeoi/exec"; // Google Apps ScriptのURL
const shops = [
  "MARUGO-D", "MARUGO-OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA-JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

// ======== 追加：ポップアップ(Modal)と既存リストを同時更新する薄いラッパ ========
function modalOpen(){ try{ window.StatusModal?.open(); window.StatusInline?.show?.(); }catch(e){} }
function modalSet(step){ try{ window.StatusModal?.set?.(step); window.StatusInline?.set?.(step); }catch(e){} }
function modalComplete(){ try{ window.StatusModal?.complete?.(); window.StatusInline?.complete?.(); }catch(e){} }
function modalClose(){ try{ window.StatusModal?.close?.(); }catch(e){} }
// ========================================================================

// 店舗データで貸主・借主のオプションを設定
function populateShops() {
  const lenderSelect = document.getElementById("lender");
  const borrowerSelect = document.getElementById("borrower");

  shops.forEach(shop => {
    const option1 = document.createElement("option");
    option1.value = shop;
    option1.textContent = shop;
    lenderSelect.appendChild(option1);

    const option2 = document.createElement("option");
    option2.value = shop;
    option2.textContent = shop;
    borrowerSelect.appendChild(option2);
  });
}

// ヘルパー関数: 指定ミリ秒待機
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 金額を半角数字に変換する関数 (カンマは含まない)
function convertToHalfWidthNumber(value) {
  if (!value) return '';
  let converted = value.replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  converted = converted.replace(/[^0-9]/g, '');
  return converted;
}

// プログレスステップを表示する関数
async function showStep(stepId, message) {
  const step = document.getElementById(stepId);
  const activeSteps = document.querySelectorAll('.status-step.active');
  activeSteps.forEach(s => {
    s.classList.remove('active');
    s.classList.add('completed');
  });
  step.classList.add('active');
  step.querySelector('span:last-child').textContent = message;

  const icon = step.querySelector('.status-icon');
  const originalIcon = icon.textContent;
  icon.innerHTML = '<span class="mini-loading-spinner"></span>';
  step.dataset.originalIcon = originalIcon;
}

// プログレスステップを完了状態にする関数
function completeStep(stepId, message) {
  const step = document.getElementById(stepId);
  step.classList.remove('active');
  step.classList.add('completed');
  step.querySelector('span:last-child').textContent = message;

  const icon = step.querySelector('.status-icon');
  if (step.dataset.originalIcon) {
    icon.textContent = step.dataset.originalIcon;
  }
}

// 全てのプログレスステップをリセットする関数
function resetSteps() {
  const steps = document.querySelectorAll('.status-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed', 'error');
  });
}

// メッセージ表示を非表示にする関数
function hideMessages() {
  document.getElementById('successMessage').classList.remove('show');
  const errorMessage = document.getElementById('errorMessage');
  if (errorMessage) {
    errorMessage.classList.remove('show');
  }
  const searchResult = document.getElementById('search-result');
  if (searchResult) {
    searchResult.classList.remove('show');
  }
}

/**
 * 貸主と借主が同じ店舗名でないことをチェックし、エラーメッセージを表示/非表示します。
 * @returns {boolean} バリデーションが成功した場合は true、失敗した場合は false。
 */
function checkLenderBorrowerMatch() {
  const lenderSelect = document.getElementById("lender");
  const borrowerSelect = document.getElementById("borrower");
  const errorMessageDiv = document.getElementById("lender-borrower-error");

  if (!lenderSelect || !borrowerSelect || !errorMessageDiv) {
    console.error("Lender/borrower select or error div not found for real-time validation.");
    return true;
  }
  if (lenderSelect.value && borrowerSelect.value && lenderSelect.value === borrowerSelect.value) {
    errorMessageDiv.textContent = '❌ 貸主と借主は異なる店舗を選択してください。';
    errorMessageDiv.style.display = 'block';
    return false;
  } else {
    errorMessageDiv.style.display = 'none';
    errorMessageDiv.textContent = '';
    return true;
  }
}

// 逆取引検索機能
async function searchReverseTransaction() {
  const searchBtn = document.getElementById('search-btn');
  const searchResult = document.getElementById('search-result');
  const searchResultContent = document.getElementById('search-result-content');
  const btnText = searchBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  const currentData = {
    date: document.getElementById("date").value,
    name: document.getElementById("name").value,
    lender: document.getElementById("lender").value,
    borrower: document.getElementById("borrower").value,
    category: document.getElementById("category").value,
    item: document.getElementById("item").value,
    amount: convertToHalfWidthNumber(document.getElementById("amount").value)
  };

  if (!currentData.date || !currentData.lender || !currentData.borrower || !currentData.category || !currentData.item || !currentData.amount) {
    searchResultContent.innerHTML = `
      <div class="search-error">
        ❌ すべての項目を入力してから検索してください
      </div>`;
    searchResult.classList.add('show');
    return;
  }
  if (currentData.lender === currentData.borrower) {
    searchResultContent.innerHTML = `
      <div class="search-error">
        ❌ 貸主と借主が同じため検索できません
      </div>`;
    searchResult.classList.add('show');
    return;
  }

  // ローディング状態開始
  searchBtn.disabled = true;
  searchBtn.classList.add('loading');
  btnText.textContent = '検索中...';
  searchResult.classList.remove('show');

  try {
    const reverseData = { ...currentData, lender: currentData.borrower, borrower: currentData.lender, searchMode: true };

    // （検索でもポップアップを使いたい場合は以下2行のコメントを外してください）
    // modalOpen();
    // modalSet('validation');

    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reverseData)
    });

    await delay(800);

    // 以下は疑似結果（実運用ではGASのレスポンスに置き換え）
    const searchSuccess = Math.random() > 0.4;

    if (searchSuccess) {
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

      searchResultContent.innerHTML = `
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
            ${matchData.correction ? `<div class="match-details-row"><span class="match-details-label">✏️ 修正:</span><span class="match-details-value">${matchData.correction}</span></div>` : ''}
          </div>
          <div class="match-actions">
            <button class="correction-action-btn" id="correction-from-search">✏️ このデータを修正として送信</button>
          </div>
        </div>`;
    } else {
      searchResultContent.innerHTML = `
        <div class="search-no-match">
          ❓ 逆取引データは見つかりませんでした
          <div style="margin-top: 10px; font-size: 14px; font-weight: normal;">
            以下の条件に一致するデータは存在しません：<br>
            📅 ${currentData.date} | ${currentData.borrower} → ${currentData.lender}<br>
            🏷️ ${currentData.category} | 📝 ${currentData.item} | 💵 ¥${parseInt(currentData.amount).toLocaleString('ja-JP')}
          </div>
          <div class="match-actions">
            <button class="correction-action-btn" id="correction-from-search-new">✏️ 新規修正として送信</button>
          </div>
        </div>`;
    }

    searchResult.classList.add('show');

    const existingListener = searchResultContent.dataset.listenerAdded;
    if (existingListener) {
      searchResultContent.removeEventListener('click', handleSearchResultButtonClick);
    }
    searchResultContent.addEventListener('click', handleSearchResultButtonClick);
    searchResultContent.dataset.listenerAdded = 'true';

  } catch (error) {
    console.error('検索エラー:', error);
    searchResultContent.innerHTML = `
      <div class="search-error">
        ❌ 検索中にエラーが発生しました<br>
        <small>${error.message}</small>
      </div>`;
    searchResult.classList.add('show');
  } finally {
    searchBtn.disabled = false;
    searchBtn.classList.remove('loading');
    btnText.textContent = originalText;
  }
}

async function handleSearchResultButtonClick(event) {
  if (event.target.id === 'correction-from-search') {
    await handleCorrectionFromSearch('found');
  } else if (event.target.id === 'correction-from-search-new') {
    await handleCorrectionFromSearch('not_found');
  }
}

// 検索結果からの修正送信処理
async function handleCorrectionFromSearch(type = 'found') {
  const categoryInput = document.getElementById('category');
  if (!categoryInput.value) {
    alert('カテゴリーを選択してください');
    return;
  }

  let confirmMessage;
  const dateValue = document.getElementById("date").value;
  const nameValue = document.getElementById("name").value;
  const lenderValue = document.getElementById("lender").value;
  const borrowerValue = document.getElementById("borrower").value;
  const itemValue = document.getElementById("item").value;
  const categoryValue = document.getElementById("category").value;
  const amountValue = parseInt(convertToHalfWidthNumber(document.getElementById("amount").value)).toLocaleString('ja-JP');

  if (type === 'found') {
    confirmMessage = `🔍 逆取引データが見つかりました！

現在入力されているデータを修正として送信しますか？

📅 ${dateValue}
👤 ${nameValue}
🔄 ${lenderValue} → ${borrowerValue}
📝 ${itemValue} (${categoryValue})
💵 ¥${amountValue}

🔥 修正フラグ: ✏️修正 が自動的に付与されます
※ 修正データとしてスプレッドシートに送信されます
※ 元のデータはそのまま保持されます`;
  } else {
    confirmMessage = `❓ 逆取引データは見つかりませんでした

それでも現在のデータを修正として送信しますか？

📅 ${dateValue}
👤 ${nameValue}
🔄 ${lenderValue} → ${borrowerValue}
📝 ${itemValue} (${categoryValue})
💵 ¥${amountValue}

🔥 修正フラグ: ✏️修正 が自動的に付与されます
※ 新規修正データとして送信されます`;
  }

  if (confirm(confirmMessage)) {
    const searchResult = document.getElementById('search-result');
    if (searchResult) searchResult.classList.remove('show');
    await submitData({ isCorrection: true, correctionOnly: true, correctionMark: "✏️修正" });
  }
}

// 共通の送信処理
async function submitData(options = {}) {
  const { isCorrection = false, correctionOnly = false, correctionMark = "" } = options;

  const statusDisplay = document.getElementById('status-display');
  const submitBtn = document.querySelector('.submit-btn:not(.search-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = submitBtn.dataset.originalText || btnText.textContent;
  submitBtn.dataset.originalText = originalText;

  const categoryInput = document.getElementById('category');
  const categoryOptions = document.querySelectorAll('.category-option');
  const form = document.getElementById('loanForm');

  hideMessages();
  resetSteps();

  if (!categoryInput.value) {
    alert('カテゴリーを選択してください');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = correctionOnly ? '修正送信中...' : '送信中...';

  if (statusDisplay) statusDisplay.classList.add('show');

  try {
    // ▼ 追加：ポップアップ開始 & 最初のステップ
    modalOpen();
    modalSet('validation');

    await showStep('step-validation', correctionOnly ? '📋 修正データを検証中...' : '📋 データを検証中...');
    await delay(600);

    const data = {
      date: document.getElementById("date").value,
      name: document.getElementById("name").value,
      lender: document.getElementById("lender").value,
      borrower: document.getElementById("borrower").value,
      category: document.getElementById("category").value,
      item: document.getElementById("item").value,
      amount: convertToHalfWidthNumber(document.getElementById("amount").value),
      isCorrection: isCorrection,
    };

    if (correctionOnly) {
      data.correctionOnly = true;
      data.correctionMark = correctionMark || "✏️修正";
      data.sendType = "CORRECTION";
    }

    if (!data.date || !data.name || !data.lender || !data.borrower || !data.category || !data.item || !data.amount) {
      throw new Error('すべての必須項目を入力してください。');
    }
    if (data.lender === data.borrower) {
      throw new Error('貸主と借主は異なる店舗を選択してください。');
    }
    const amountNumber = parseInt(data.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      throw new Error('正しい金額を入力してください。');
    }

    completeStep('step-validation', `✅ ${correctionOnly ? '修正データ' : 'データ'}検証完了`);

    // ▼ 送信
    modalSet('sending');
    await showStep('step-sending', `📤 ${correctionOnly ? '修正データ' : ''}スプレッドシートに送信中...`);
    await delay(400);

    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    completeStep('step-sending', `✅ ${correctionOnly ? '修正データ' : ''}送信完了`);

    // ▼ 挿入（概念上の表示）
    modalSet('inserting');
    await showStep('step-inserting', `💾 ${correctionOnly ? '修正データ' : ''}を挿入中...`);
    await delay(800);
    completeStep('step-inserting', `✅ ${correctionOnly ? '修正データ' : ''}挿入完了`);

    // ▼ 追加：メール送信ステップ
    modalSet('email-sending');
    await showStep('step-email-sending', '📧 借主へメール送信中...');
    await delay(500);
    completeStep('step-email-sending', '📧 借主へメール送信中...完了');

    modalSet('email-sent');
    await showStep('step-email-sent', '📧 借主へメール送信済み');
    completeStep('step-email-sent', '📧 借主へメール送信済み');

    // ▼ バックアップ
    modalSet('backup');
    await showStep('step-backup', '🔄 バックアップを作成中...');
    await delay(1000);
    completeStep('step-backup', '✅ バックアップ作成完了');

    // ▼ 完了
    await showStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : 'すべての処理'}が完了しました！`);
    completeStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : '送信'}完了！`);
    modalComplete();

    setTimeout(() => {
      submitBtn.classList.remove('loading');
      btnText.textContent = originalText;
      submitBtn.disabled = false;

      const message = document.getElementById('successMessage');
      message.textContent = correctionOnly ? '✅ 修正データの送信が完了しました！' : '✅ 送信完了しました！';
      message.classList.add('show');
      setTimeout(() => { message.classList.remove('show'); }, 3000);

      form.reset();
      document.getElementById('date').valueAsDate = new Date();
      document.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
      if (statusDisplay) statusDisplay.classList.remove('show');
    }, 500);

  } catch (error) {
    console.error('送信エラー:', error);

    const activeStep = document.querySelector('.status-step.active');
    if (activeStep) {
      activeStep.classList.remove('active');
      activeStep.classList.add('error');
      activeStep.querySelector('span:last-child').textContent = '❌ エラーが発生しました';
    }

    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
    submitBtn.disabled = false;

    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
      errorMessage.textContent = `❌ ${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`;
      errorMessage.classList.add('show');
      setTimeout(() => {
        errorMessage.classList.remove('show');
        const statusDisplay = document.getElementById('status-display');
        if (statusDisplay) statusDisplay.classList.remove('show');
      }, 5000);
    } else {
      alert(`${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`);
    }

    // ▼ 追加：失敗時はモーダルを閉じる（残したい場合はコメントアウト）
    modalClose();
  }
}

// DOM要素の初期化
function initializeElements() {
  document.getElementById('date').valueAsDate = new Date();

  const categoryOptions = document.querySelectorAll('.category-option');
  const categoryInput = document.getElementById('category');
  categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
      categoryOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      categoryInput.value = option.dataset.value;
    });
  });

  const amountInput = document.getElementById('amount');
  amountInput.addEventListener('input', (e) => {
    let value = e.target.value;
    value = convertToHalfWidthNumber(value);
    e.target.value = value;
  });
  amountInput.addEventListener('blur', (e) => {
    let value = e.target.value;
    if (value) value = parseInt(value).toLocaleString('ja-JP');
    e.target.value = value;
  });
  amountInput.addEventListener('focus', (e) => {
    let value = e.target.value;
    if (value) value = value.replace(/,/g, '');
    e.target.value = value;
  });

  const lenderSelect = document.getElementById("lender");
  const borrowerSelect = document.getElementById("borrower");

  let lenderBorrowerErrorDiv = document.getElementById("lender-borrower-error");
  if (!lenderBorrowerErrorDiv) {
    lenderBorrowerErrorDiv = document.createElement('div');
    lenderBorrowerErrorDiv.id = 'lender-borrower-error';
    lenderBorrowerErrorDiv.style.color = '#e53e3e';
    lenderBorrowerErrorDiv.style.fontSize = '0.875rem';
    lenderBorrowerErrorDiv.style.marginTop = '8px';
    lenderBorrowerErrorDiv.style.display = 'none';
    const borrowerFormGroup = borrowerSelect.closest('.form-group');
    if (borrowerFormGroup) borrowerFormGroup.appendChild(lenderBorrowerErrorDiv);
  }

  if (lenderSelect) lenderSelect.addEventListener('change', checkLenderBorrowerMatch);
  if (borrowerSelect) borrowerSelect.addEventListener('change', checkLenderBorrowerMatch);
  checkLenderBorrowerMatch();

  const form = document.getElementById('loanForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkLenderBorrowerMatch()) return;
    await submitData({ isCorrection: false, correctionOnly: false });
  });

  const searchBtn = document.getElementById('search-btn');
  searchBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await searchReverseTransaction();
  });
}

// 初期化処理
function initialize() {
  populateShops();
  initializeElements();
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
