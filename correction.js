const GAS_URL = "https://script.google.com/macros/s/AKfycbxxhL81ThLnXuoDFfid2n9S7gzLMq_V-s5FxH8WqoBIUq2jCtKAa_ZU-ovGC5r8qBZ/exec";
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

// URLパラメータまたはstorageから元データを読み込む
function loadOriginalData() {
  addDebugLog('=== データ読み込み開始 ===');
  
  // localStorageを最初にチェック
  const localData = localStorage.getItem('correctionData');
  addDebugLog('localStorage確認', { 
    hasData: !!localData, 
    dataLength: localData ? localData.length : 0,
    dataPreview: localData ? localData.substring(0, 100) + '...' : null
  });
  
  if (localData) {
    try {
      originalData = JSON.parse(localData);
      addDebugLog('localStorageから元データを読み込み成功', originalData);
      localStorage.removeItem('correctionData');
      addDebugLog('localStorageからcorrectionDataを削除');
      return true;
    } catch (error) {
      addDebugLog('localStorageのデータ解析エラー', error);
    }
  }
  
  // 次にsessionStorageをチェック
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

  // 最終手段としてURLパラメータをチェック
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
  
  addDebugLog('全てのストレージチェック完了 - データなし');
  return false;
}

// ▼▼▼▼▼【修正箇所】▼▼▼▼▼
// この関数で、受け取った全てのデータを画面に表示するようにします。
function displayOriginalData() {
  if (!originalData) {
    addDebugLog('表示する元データがありません');
    return;
  }
  
  addDebugLog('元データ表示中', originalData);
  
  const originalDataGrid = document.getElementById('original-data-grid');
  
  // 金額と単価を読みやすくフォーマット
  const formattedAmount = originalData.amount ? 
    `¥${parseInt(originalData.amount).toLocaleString('ja-JP')}` : 
    originalData.originalAmount || '不明';

  const unitPrice = originalData.unitPrice ? String(originalData.unitPrice) : '';
  const formattedUnitPrice = unitPrice && !isNaN(parseInt(unitPrice.replace(/[,¥]/g, ''))) ?
    `¥${parseInt(unitPrice.replace(/[,¥]/g, '')).toLocaleString('ja-JP')}` :
    (unitPrice || '---');

  // **行番号、個/本/g、単価など全ての項目を表示するHTML**
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
// ▲▲▲▲▲【修正はここまでです】▲▲▲▲▲


// フォームに逆取引データを自動入力
function autoFillReverseData() {
  if (!originalData) {
    addDebugLog('自動入力する元データがありません');
    return;
  }
  
  addDebugLog('逆取引データを自動入力中', originalData);
  
  document.getElementById('date').value = originalData.date || '';
  document.getElementById('lender').value = originalData.borrower || '';
  document.getElementById('borrower').value = originalData.lender || '';
  document.getElementById('category').value = originalData.category || '';
  document.getElementById('item').value = originalData.item || '';
  
  const amountValue = originalData.amount ? 
    parseInt(originalData.amount).toLocaleString('ja-JP') : '';
  document.getElementById('amount').value = amountValue;
  
  const categoryOptions = document.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    option.classList.remove('selected');
    if (option.dataset.value === originalData.category) {
      option.classList.add('selected');
    }
  });
  
  addDebugLog('逆取引データを自動入力完了');
}

// 以下、変更なし
// ... (submitCorrectionDataやinitializeElementsなどの残りの関数) ...
// (省略)
