const GAS_URL = "https://script.google.com/macros/s/AKfycbyW6L1Lfn7c9y6EBFYXt1qZf9g0hisy5EnM9r2QdEMitT6wzMm_-wj3UmEq6Hu6_j-4/exec";
const shops = [
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

let originalData = null;

function addDebugLog(message, data = null) {
  console.log(`[${new Date().toISOString()}] ${message}`, data);
}

function populateShops() {
  const lenderSelect = document.getElementById("lender");
  const borrowerSelect = document.getElementById("borrower");
  shops.forEach(shop => {
    lenderSelect.add(new Option(shop, shop));
    borrowerSelect.add(new Option(shop, shop));
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function convertToHalfWidthNumber(value) {
  if (!value) return '';
  return value.toString().replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
}

function loadOriginalData() {
  const dataSources = [
    new URLSearchParams(window.location.search).get('data'),
    localStorage.getItem('correctionData'),
    sessionStorage.getItem('correctionData')
  ];
  for (const dataSource of dataSources) {
    if (dataSource) {
      try {
        originalData = JSON.parse(decodeURIComponent(dataSource));
        localStorage.removeItem('correctionData');
        sessionStorage.removeItem('correctionData');
        return true;
      } catch (e) { /* continue */ }
    }
  }
  return false;
}

function autoFillReverseData() {
  if (!originalData) return;
  document.getElementById('date').value = originalData.date || '';
  document.getElementById('lender').value = originalData.borrower || '';
  document.getElementById('borrower').value = originalData.lender || '';
  document.getElementById('item').value = originalData.item || '';
  document.getElementById('quantity').value = originalData.quantity || '';
  document.getElementById('unitPrice').value = originalData.unitPrice ? parseInt(convertToHalfWidthNumber(originalData.unitPrice)).toLocaleString('ja-JP') : '';
  document.getElementById('amount').value = originalData.amount ? parseInt(originalData.amount).toLocaleString('ja-JP') : '';
  document.getElementById('category-display').value = originalData.category || '';
  document.getElementById('category').value = originalData.category || '';
  addDebugLog('逆取引データを自動入力完了');
}

// ========== 【ここから追加】ポップアップ制御の関数 ==========
const progressPopup = document.getElementById('progress-popup-backdrop');
const allSteps = progressPopup.querySelectorAll('.status-step');
const errorMessageDiv = document.getElementById('popup-error-message');

function showProgressPopup() {
    // Reset all steps to initial state
    allSteps.forEach(step => step.className = 'status-step');
    errorMessageDiv.style.display = 'none';
    errorMessageDiv.textContent = '';
    progressPopup.classList.add('show');
}

function hideProgressPopup() {
    progressPopup.classList.remove('show');
}

function updateProgressStep(stepId, status, message = '') {
    const step = document.getElementById(stepId);
    if (!step) return;

    // Reset other steps' active state
    if (status === 'active') {
        allSteps.forEach(s => s.classList.remove('active'));
    }
    
    step.className = 'status-step ' + status;

    if (status === 'error') {
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
    }
}
// ========== 【ここまで追加】 ==========


async function submitCorrectionData() {
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  submitBtn.disabled = true;
  
  // 【変更点】ポップアップを表示
  showProgressPopup();

  try {
    updateProgressStep('step-validation', 'active');
    await delay(500);

    const data = {
      date: document.getElementById("date").value,
      name: document.getElementById("name").value,
      lender: document.getElementById("lender").value,
      borrower: document.getElementById("borrower").value,
      category: document.getElementById("category").value,
      item: document.getElementById("item").value,
      quantity: document.getElementById("quantity").value,
      unitPrice: convertToHalfWidthNumber(document.getElementById("unitPrice").value),
      amount: convertToHalfWidthNumber(document.getElementById("amount").value),
      isCorrection: true, correctionOnly: true, correctionMark: "✏️修正",
      sendType: "CORRECTION", originalRowIndex: originalData.originalRowIndex
    };

    if (!data.name || !data.amount || !data.originalRowIndex) {
      throw new Error('必須項目（名前、金額、元の行番号）が不足しています。');
    }
    if (data.lender === data.borrower) {
      throw new Error('貸主と借主は異なる店舗を選択してください。');
    }
    updateProgressStep('step-validation', 'completed');

    updateProgressStep('step-sending', 'active');
    await fetch(GAS_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    addDebugLog('送信処理完了');
    updateProgressStep('step-sending', 'completed');

    updateProgressStep('step-complete', 'active');
    await delay(500);
    updateProgressStep('step-complete', 'completed');

    await delay(1000); // 完了表示をユーザーに見せる
    hideProgressPopup();
    
    await delay(400); // ポップアップが消えるのを待つ
    alert('✅ 修正データの送信が完了しました。');
    
    if (confirm('元のページに戻りますか？')) {
      window.location.href = `marugo.html?refresh=${new Date().getTime()}`;
    }

  } catch (error) {
    const activeStep = progressPopup.querySelector('.status-step.active');
    updateProgressStep(activeStep ? activeStep.id : 'step-validation', 'error', error.message);
    await delay(4000); // エラーメッセージをユーザーに見せる
    hideProgressPopup();
  } finally {
    submitBtn.disabled = false;
  }
}

function initializeElements() {
  document.getElementById('correctionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitCorrectionData();
  });
}

function initialize() {
  addDebugLog('=== correction.html 初期化開始 ===');
  populateShops();
  initializeElements();
  if (loadOriginalData()) {
    autoFillReverseData();
  } else {
    document.getElementById('error-notice')?.classList.add('show');
    document.getElementById('correctionForm')?.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', initialize);
