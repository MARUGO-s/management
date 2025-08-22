const GAS_URL = "https://script.google.com/macros/s/AKfycbyW6L1Lfn7c9y6EBFYXt1qZf9g0hisy5EnM9r2QdEMitT6wzMm_-wj3UmEq6Hu6_j-4/exec";
const shops = [
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

// 元データを格納する変数
let originalData = null;

// デバッグログを保存する配列
let debugLogs = [];

// デバッグログ追加関数
function addDebugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data);
}

// 店舗データでプルダウンのオプションを設定
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

// ヘルパー関数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 金額を半角数字に変換する関数
function convertToHalfWidthNumber(value) {
  if (!value) return '';
  let converted = value.toString().replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  converted = converted.replace(/[^0-9]/g, '');
  return converted;
}

// URLパラメータまたはstorageから元データを読み込む
function loadOriginalData() {
  addDebugLog('=== データ読み込み開始 ===');
  const urlParams = new URLSearchParams(window.location.search);
  const dataParam = urlParams.get('data');
  if (dataParam) {
    try {
      originalData = JSON.parse(decodeURIComponent(dataParam));
      return true;
    } catch (e) { /* continue */ }
  }
  
  const localData = localStorage.getItem('correctionData');
  if (localData) {
    try {
      originalData = JSON.parse(decodeURIComponent(localData));
      localStorage.removeItem('correctionData');
      return true;
    } catch (e) { /* continue */ }
  }

  const savedData = sessionStorage.getItem('correctionData');
  if (savedData) {
    try {
      originalData = JSON.parse(savedData);
      sessionStorage.removeItem('correctionData');
      return true;
    } catch (e) { /* continue */ }
  }
  
  return false;
}

// フォームに逆取引データを自動入力
function autoFillReverseData() {
  if (!originalData) return;
  
  document.getElementById('date').value = originalData.date || '';
  document.getElementById('lender').value = originalData.borrower || '';
  document.getElementById('borrower').value = originalData.lender || '';
  document.getElementById('item').value = originalData.item || '';
  document.getElementById('quantity').value = originalData.quantity || '';
  
  const unitPriceValue = originalData.unitPrice ? parseInt(convertToHalfWidthNumber(originalData.unitPrice)).toLocaleString('ja-JP') : '';
  document.getElementById('unitPrice').value = unitPriceValue;
  
  const amountValue = originalData.amount ? parseInt(originalData.amount).toLocaleString('ja-JP') : '';
  document.getElementById('amount').value = amountValue;

  document.getElementById('category-display').value = originalData.category || '';
  document.getElementById('category').value = originalData.category || '';
  
  addDebugLog('逆取引データを自動入力完了');
}

// 【変更点 1/3】エラーの原因となるため、進捗表示関連の関数をすべて削除
/*
function showProgressStep(stepId) { ... }
function hideProgress() { ... }
function showProgressError(stepId) { ... }
*/

// 修正データを送信
async function submitCorrectionData() {
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  addDebugLog('=== 修正データ送信開始 ===');

  if (!document.getElementById('category').value) {
    alert('カテゴリーが読み込めていません。再度お試しください。');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = '送信中...';

  try {
    // 【変更点 2/3】進捗表示の呼び出しを削除
    // showProgressStep('step-validation');
    await delay(100); // 処理中の体感を出すための短い待機

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
      isCorrection: true,
      correctionOnly: true,
      correctionMark: "✏️修正",
      sendType: "CORRECTION",
      originalRowIndex: originalData.originalRowIndex
    };

    const validationErrors = [];
    if (!data.date) validationErrors.push('日付');
    if (!data.name) validationErrors.push('名前');
    if (!data.lender) validationErrors.push('貸主');
    if (!data.borrower) validationErrors.push('借主');
    if (!data.category) validationErrors.push('カテゴリー');
    if (!data.item) validationErrors.push('品目');
    if (!data.amount) validationErrors.push('金額');
    if (!data.originalRowIndex) validationErrors.push('元の行番号');

    if (validationErrors.length > 0) {
      throw new Error(`入力情報が不足しています: ${validationErrors.join(', ')}`);
    }
    if (data.lender === data.borrower) {
        throw new Error('貸主と借主は異なる店舗を選択してください。');
    }
    if (isNaN(parseInt(data.amount)) || parseInt(data.amount) <= 0) {
        throw new Error('正しい金額を入力してください。');
    }

    addDebugLog('送信データ', data);

    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors", // no-corsモードで送信
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    
    // no-corsモードではレスポンスの詳細が確認できないが、送信自体は試行される
    addDebugLog('送信処理完了');

    // 成功したと仮定してUIを更新
    alert('✅ 修正データの送信が完了しました。');
    setTimeout(() => {
        if (confirm('元のページに戻りますか？')) {
            // marugo.htmlは一つ上の階層にあると仮定
            window.location.href = `../marugo.html?refresh=${new Date().getTime()}`;
        }
    }, 500);

  } catch (error) {
    addDebugLog('送信エラー', { message: error.message });
    // 【変更点 3/3】エラー時の進捗表示関連コードを削除
    alert(`❌ 送信エラー: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
  }
}

// DOM要素の初期化とイベントリスナー設定
function initializeElements() {
  document.getElementById('correctionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitCorrectionData();
  });
}

// 初期化処理
function initialize() {
  addDebugLog('=== correction.html 初期化開始 ===');
  
  populateShops();
  initializeElements();
  
  if (loadOriginalData()) {
    autoFillReverseData();
  } else {
    addDebugLog('データ読み込み失敗');
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) errorNotice.classList.add('show');
    
    const form = document.getElementById('correctionForm');
    if (form) form.style.display = 'none';
  }
}

// ページ読み込み完了時に実行
document.addEventListener('DOMContentLoaded', initialize);
