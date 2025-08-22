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
  let converted = value.toString().replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  
  // カンマと数字以外を除去
  converted = converted.replace(/[^0-9]/g, '');
  
  return converted;
}

// URLパラメータまたはstorageから元データを読み込む
function loadOriginalData() {
  addDebugLog('=== データ読み込み開始 ===');
  
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
          addDebugLog('localStorageデータをURLデコード成功');
        } catch (decodeError) {
          addDebugLog('URLデコードエラー、元データをそのまま使用', decodeError);
          decodedData = localData;
        }
      }
      
      originalData = JSON.parse(decodedData);
      addDebugLog('localStorageから元データを読み込み成功', originalData);
      localStorage.removeItem('correctionData');
      addDebugLog('localStorageからcorrectionDataを削除');
      return true;
    } catch (error) {
      addDebugLog('localStorageのデータ解析エラー', { error: error.message, rawData: localData.substring(0, 200), stack: error.stack });
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

// 【元のデータを表示する関数は新しいHTMLでは不要なため、呼び出さないようにします】
// function displayOriginalData() { ... }

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
  document.getElementById('item').value = originalData.item || '';
  document.getElementById('quantity').value = originalData.quantity || '';
  
  const unitPriceValue = originalData.unitPrice ? parseInt(convertToHalfWidthNumber(originalData.unitPrice)).toLocaleString('ja-JP') : '';
  document.getElementById('unitPrice').value = unitPriceValue;
  
  const amountValue = originalData.amount ? parseInt(originalData.amount).toLocaleString('ja-JP') : '';
  document.getElementById('amount').value = amountValue;

  // 【変更点 2/2】表示用のカテゴリ欄(category-display)と、送信用で非表示のカテゴリ欄(category)の両方に値を設定
  document.getElementById('category-display').value = originalData.category || '';
  document.getElementById('category').value = originalData.category || '';
  
  addDebugLog('逆取引データを自動入力完了');
}

// プログレス表示機能
function showProgressStep(stepId) {
  const steps = document.querySelectorAll('.status-step');
  steps.forEach(step => step.classList.remove('active', 'completed', 'error'));
  
  const stepOrder = ['step-validation', 'step-sending', 'step-inserting', 'step-backup', 'step-complete'];
  const currentIndex = stepOrder.indexOf(stepId);
  
  stepOrder.forEach((id, index) => {
    const step = document.getElementById(id);
    if (index < currentIndex) {
      step.classList.add('completed');
    } else if (index === currentIndex) {
      step.classList.add('active');
    }
  });
  
  const statusDisplay = document.getElementById('status-display');
  if (statusDisplay) statusDisplay.classList.add('show');
}

function hideProgress() {
  const statusDisplay = document.getElementById('status-display');
  if (statusDisplay) statusDisplay.classList.remove('show');
}

function showProgressError(stepId) {
  const step = document.getElementById(stepId);
  if (step) {
    step.classList.remove('active');
    step.classList.add('error');
  }
}

// 修正データを送信
async function submitCorrectionData() {
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  addDebugLog('=== 修正データ送信開始 ===');

  const categoryInput = document.getElementById('category');
  if (!categoryInput.value) {
    addDebugLog('バリデーションエラー: カテゴリーが未選択');
    alert('カテゴリーが読み込めていません。再度お試しください。');
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
      quantity: document.getElementById("quantity").value,
      unitPrice: convertToHalfWidthNumber(document.getElementById("unitPrice").value),
      amount: convertToHalfWidthNumber(document.getElementById("amount").value),
      isCorrection: true,
      correctionOnly: true,
      correctionMark: "✏️修正",
      sendType: "CORRECTION",
      originalRowIndex: originalData.originalRowIndex
    };

    addDebugLog('送信データ準備完了', data);

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
    if (data.lender === data.borrower) throw new Error('貸主と借主は異なる店舗を選択してください。');
    if (isNaN(parseInt(data.amount)) || parseInt(data.amount) <= 0) throw new Error('正しい金額を入力してください。');

    addDebugLog('バリデーション完了');
    showProgressStep('step-sending');
    await delay(500);

    let sendSuccess = false;
    let responseData = null;
    let sendError = null;

    try {
      addDebugLog('通常fetchを試行中...');
      const response = await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(data) });
      if (response.ok) {
        const responseText = await response.text();
        if (responseText.trim()) {
          responseData = JSON.parse(responseText);
          if (responseData.status === 'SUCCESS') sendSuccess = true;
          else sendError = responseData.message || '不明なエラー';
        } else {
          sendSuccess = true;
        }
      } else {
        sendError = `HTTPエラー: ${response.status} ${response.statusText}`;
      }
    } catch (fetchError) {
      try {
        addDebugLog('no-corsモードでフォールバック送信...');
        await fetch(GAS_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        sendSuccess = true;
        responseData = { status: 'SUCCESS', message: '送信完了（no-corsモード）' };
      } catch (corsError) {
        sendError = `送信エラー: ${corsError.message}`;
      }
    }

    showProgressStep('step-inserting');
    await delay(1000);
    showProgressStep('step-backup');
    await delay(500);
    showProgressStep('step-complete');
    await delay(500);

    if (sendSuccess) {
      addDebugLog('✅ 全体処理成功', responseData);
      alert('✅ 修正データの送信が完了しました。');
      setTimeout(() => {
        if (confirm('元のページに戻りますか？')) {
          const timestamp = new Date().getTime();
          window.location.href = `marugo.html?refresh=${timestamp}`;
        }
      }, 1000);
    } else {
      throw new Error(sendError || '送信に失敗しました');
    }
  } catch (error) {
    addDebugLog('送信エラー', { message: error.message, stack: error.stack });
    const activeStep = document.querySelector('.status-step.active');
    if (activeStep) showProgressError(activeStep.id);
    alert(`❌ 送信エラー: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
    hideProgress();
  }
}

// DOM要素の初期化
function initializeElements() {
  const form = document.getElementById('correctionForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitCorrectionData();
  });
}

// バックボタンのパス修正
function fixBackButtonPath() {
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    // history.back()を使うため、hrefの動的設定は不要
    backBtn.href = "#"; // デフォルトのリンク動作を無効化
    backBtn.onclick = (e) => {
        e.preventDefault();
        history.back();
    };
  }
}

// 初期化処理
function initialize() {
  addDebugLog('=== correction.html 初期化開始 ===');
  
  fixBackButtonPath();
  populateShops();
  initializeElements();
  
  if (loadOriginalData()) {
    addDebugLog('データ読み込み成功 - 表示処理開始');
    // 【変更点 1/2】エラーの原因となるため、この行を削除またはコメントアウト
    // displayOriginalData(); 
    autoFillReverseData();
    
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) errorNotice.style.display = 'none';
  } else {
    addDebugLog('データ読み込み失敗');
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) errorNotice.classList.add('show');
    
    const form = document.getElementById('correctionForm');
    if (form) form.style.display = 'none';
    
    setTimeout(() => {
      if (document.referrer) history.back();
      else window.location.href = 'marugo.html';
    }, 3000);
  }
  
  addDebugLog('=== correction.html 初期化完了 ===');
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}