const GAS_URL = "https://script.google.com/macros/s/AKfycbxxhL81ThLnXuoDFfid2n9S7gzLMq_V-s5FxH8WqoBIUq2jCtKAa9_ZU-ovGC5r8qBZ/exec";
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
  const logEntry = {
    timestamp,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
  };
  debugLogs.push(logEntry);
  console.log(`[${timestamp}] ${message}`, data);
  
  // デバッグ表示エリアに追加
  updateDebugDisplay();
}

// デバッグ表示を更新
function updateDebugDisplay() {
  const debugContent = document.getElementById('debug-content');
  if (debugContent) {
    debugContent.innerHTML = debugLogs.slice(-10).map(log => 
      `<div style="margin-bottom: 10px; padding: 5px; border-bottom: 1px solid #333;">
        <strong>${log.timestamp.split('T')[1].split('.')[0]}</strong><br>
        ${log.message}<br>
        ${log.data ? `<pre style="font-size: 10px; margin: 5px 0;">${log.data}</pre>` : ''}
      </div>`
    ).join('');
    debugContent.scrollTop = debugContent.scrollHeight;
  }
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
  
  // 全角数字を半角数字に変換
  let converted = value.replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  
  // カンマと数字以外を除去
  converted = converted.replace(/[^0-9]/g, '');
  
  return converted;
}

// [修正点 1/2] データの読み込み処理を、初期の安定したバージョンに戻しました。
function loadOriginalData() {
  addDebugLog('=== データ読み込み開始 ===');
  
  // URLパラメータをチェック
  const urlParams = new URLSearchParams(window.location.search);
  const dataParam = urlParams.get('data');
  
  addDebugLog('URLパラメータ確認', { hasData: !!dataParam });
  
  if (dataParam) {
    try {
      originalData = JSON.parse(decodeURIComponent(dataParam));
      addDebugLog('URLパラメータから元データを読み込み', originalData);
      return true;
    } catch (error) {
      addDebugLog('URLパラメータのデータ解析エラー', error);
    }
  }
  
  // localStorageをチェック
  const localData = localStorage.getItem('correctionData');
  addDebugLog('localStorage確認', { 
    hasData: !!localData, 
    dataLength: localData ? localData.length : 0,
    dataPreview: localData ? localData.substring(0, 100) + '...' : null
  });
  
  if (localData) {
    try {
      let decodedData = localData;
      if (localData.startsWith('%')) {
        try {
          decodedData = decodeURIComponent(localData);
        } catch (decodeError) {
          decodedData = localData;
        }
      }
      originalData = JSON.parse(decodedData);
      addDebugLog('localStorageから元データを読み込み成功', originalData);
      localStorage.removeItem('correctionData');
      return true;
    } catch (error) {
      addDebugLog('localStorageのデータ解析エラー', error);
      try {
        originalData = JSON.parse(localData);
        addDebugLog('localStorageから直接JSON解析成功', originalData);
        localStorage.removeItem('correctionData');
        return true;
      } catch (directError) {
        addDebugLog('直接JSON解析も失敗', directError);
      }
    }
  }
  
  // sessionStorageをチェック
  const savedData = sessionStorage.getItem('correctionData');
  addDebugLog('sessionStorage確認', { hasData: !!savedData });
  
  if (savedData) {
    try {
      originalData = JSON.parse(savedData);
      addDebugLog('sessionStorageから元データを読み込み', originalData);
      sessionStorage.removeItem('correctionData');
      return true;
    } catch (error) {
      addDebugLog('sessionStorageのデータ解析エラー', error);
    }
  }
  
  addDebugLog('全てのストレージチェック完了 - データなし');
  return false;
}

// [修正点 2/2] 受け取った全てのデータを画面に表示する最終版の処理です。
function displayOriginalData() {
  if (!originalData) {
    addDebugLog('表示する元データがありません');
    return;
  }
  
  addDebugLog('元データ表示中', originalData);
  
  const originalDataGrid = document.getElementById('original-data-grid');
  
  const formattedAmount = originalData.amount ? 
    `¥${parseInt(originalData.amount).toLocaleString('ja-JP')}` : 
    originalData.originalAmount || '不明';

  const unitPrice = originalData.unitPrice ? String(originalData.unitPrice) : '';
  const formattedUnitPrice = unitPrice && !isNaN(parseInt(unitPrice.replace(/[,¥]/g, ''))) ?
    `¥${parseInt(unitPrice.replace(/[,¥]/g, '')).toLocaleString('ja-JP')}` :
    (unitPrice || '---');

  originalDataGrid.innerHTML = `
    <div class="original-data-item">
      <span class="original-data-label">📅 日付:</span>
      <span class="original-data-value">${originalData.date || '不明'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">👤 入力者:</span>
      <span class="original-data-value">${originalData.name || '不明'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">📤 貸主:</span>
      <span class="original-data-value">${originalData.lender || '不明'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">📥 借主:</span>
      <span class="original-data-value">${originalData.borrower || '不明'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">🏷️ カテゴリー:</span>
      <span class="original-data-value">${originalData.category || '不明'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">📝 品目:</span>
      <span class="original-data-value">${originalData.item || '不明'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">🔢 個/本/g:</span>
      <span class="original-data-value">${originalData.quantity || '---'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">💰 単価:</span>
      <span class="original-data-value">${formattedUnitPrice}</span>
    </div>
    <div class="original-data-item" style="grid-column: 1 / -1;">
      <span class="original-data-label">💵 金額:</span>
      <span class="original-data-value">${formattedAmount}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">⏰ 入力日時:</span>
      <span class="original-data-value">${originalData.inputDate || '不明'}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">⭐ 修正:</span>
      <span class="original-data-value">${originalData.correction || 'なし'}</span>
    </div>
    <div class="original-data-item" style="grid-column: 1 / -1;">
      <span class="original-data-label">📄 行番号:</span>
      <span class="original-data-value">${originalData.originalRowIndex || '不明'}</span>
    </div>
  `;
}

function autoFillReverseData() {
  if (!originalData) return;
  document.getElementById('date').value = originalData.date || '';
  document.getElementById('lender').value = originalData.borrower || '';
  document.getElementById('borrower').value = originalData.lender || '';
  document.getElementById('category').value = originalData.category || '';
  document.getElementById('item').value = originalData.item || '';
  const amountValue = originalData.amount ? parseInt(originalData.amount).toLocaleString('ja-JP') : '';
  document.getElementById('amount').value = amountValue;
  const categoryOptions = document.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    option.classList.remove('selected');
    if (option.dataset.value === originalData.category) {
      option.classList.add('selected');
    }
  });
}

async function submitCorrectionData() {
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn):not([onclick])');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;
  if (!document.getElementById('category').value) {
    alert('カテゴリーを選択してください');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = '送信中...';
  try {
    showProgressStep('step-validation');
    await delay(500);
    const data = {
      date: document.getElementById("date").value,
      name: document.getElementById("name").value,
      lender: document.getElementById("lender").value,
      borrower: document.getElementById("borrower").value,
      category: document.getElementById("category").value,
      item: document.getElementById("item").value,
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
    if (validationErrors.length > 0) throw new Error(`入力不足: ${validationErrors.join(', ')}`);
    if (data.lender === data.borrower) throw new Error('貸主と借主は異なる店舗を選択してください。');
    const amountNumber = parseInt(data.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) throw new Error('正しい金額を入力してください。');
    
    showProgressStep('step-sending');
    await delay(500);
    
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) throw new Error(`サーバーエラー: ${response.statusText}`);
    
    const responseData = await response.json();
    if (responseData.status !== 'SUCCESS') throw new Error(responseData.message || '不明なエラー');
    
    showProgressStep('step-inserting'); await delay(1000);
    showProgressStep('step-backup'); await delay(500);
    showProgressStep('step-complete'); await delay(500);
    
    const successMsg = document.getElementById('successMessage');
    successMsg.classList.add('show');
    setTimeout(() => successMsg.classList.remove('show'), 5000);
    document.getElementById('correctionForm').reset();
    document.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
    
    setTimeout(() => {
      if (confirm('修正が完了しました。データ一覧ページに戻りますか？')) {
        let marugoUrl = 'data/marugo.html';
        if (window.location.pathname.includes('/data/')) marugoUrl = '../data/marugo.html';
        window.location.href = `${marugoUrl}?refresh=${new Date().getTime()}`;
      }
    }, 1000);

  } catch (error) {
    const activeStep = document.querySelector('.status-step.active');
    if (activeStep) showProgressError(activeStep.id);
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = `❌ 送信エラー: ${error.message}`;
    errorMessage.classList.add('show');
    setTimeout(() => errorMessage.classList.remove('show'), 5000);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
    setTimeout(() => hideProgress(), 2000);
  }
}

function initializeElements() {
  const categoryOptions = document.querySelectorAll('.category-option');
  const categoryInput = document.getElementById('category');
  categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
      if (option.classList.contains('disabled')) return;
      categoryOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      categoryInput.value = option.dataset.value;
    });
  });
  const amountInput = document.getElementById('amount');
  amountInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
    if (value) e.target.value = parseInt(value).toLocaleString('ja-JP');
  });
  document.getElementById('correctionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitCorrectionData();
  });
}

function hideMessages() {
  document.getElementById('successMessage').classList.remove('show');
  document.getElementById('errorMessage').classList.remove('show');
}

function fixBackButtonPath() {
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    const currentPath = window.location.pathname;
    if (currentPath.includes('/data/')) backBtn.href = 'marugo.html';
    else backBtn.href = 'data/marugo.html';
  }
}

function showProgressStep(stepId) {
    const steps = document.querySelectorAll('.status-step');
    steps.forEach(step => step.classList.remove('active', 'completed', 'error'));
    const stepOrder = ['step-validation', 'step-sending', 'step-inserting', 'step-backup', 'step-complete'];
    const currentIndex = stepOrder.indexOf(stepId);
    stepOrder.forEach((id, index) => {
        const step = document.getElementById(id);
        if (index < currentIndex) step.classList.add('completed');
        else if (index === currentIndex) step.classList.add('active');
    });
    document.getElementById('status-display').classList.add('show');
}

function hideProgress() {
    document.getElementById('status-display').classList.remove('show');
}

function showProgressError(stepId) {
    const step = document.getElementById(stepId);
    if(step) {
      step.classList.remove('active');
      step.classList.add('error');
    }
}

function initialize() {
  addDebugLog('=== correction.html 初期化開始 ===');
  hideMessages();
  fixBackButtonPath();
  populateShops();
  initializeElements();
  if (loadOriginalData()) {
    displayOriginalData();
    autoFillReverseData();
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) errorNotice.style.display = 'none';
  } else {
    addDebugLog('データ読み込み失敗');
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) errorNotice.classList.add('show');
    const form = document.getElementById('correctionForm');
    const originalDataSection = document.getElementById('original-data-section');
    if (form) form.style.display = 'none';
    if (originalDataSection) originalDataSection.style.display = 'none';
    setTimeout(() => {
      if (document.referrer) history.back();
      else window.location.href = 'data/marugo.html';
    }, 3000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
