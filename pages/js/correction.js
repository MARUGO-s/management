const GAS_URL = "https://script.google.com/macros/s/AKfycbx2PqGo4P4AkZ5T9lczu4rtMnrrjVdbKirZPO52vvTTXnIT2BUJq-S5wGLyFV1CZS3o/exec"; // 日付修正版
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
let cachedNames = null;
let manualInputFields = [];

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

// B列（名前）を取得して datalist に反映
async function populateNameDatalist() {
  try {
    // 統合データローダーが利用可能な場合は使用
    if (window.unifiedDataLoader) {
      addDebugLog('統合データローダーを使用して名前リストを取得');
      const names = await window.unifiedDataLoader.getNames();
      cachedNames = names;
      renderNameList(names);
      return;
    }

    // フォールバック: 既に取得済みなら再利用
    if (cachedNames && Array.isArray(cachedNames)) {
      renderNameList(cachedNames);
      return;
    }

    const sheetName = '貸借表';
    const range = `${sheetName}!B:B`;

    addDebugLog('名前リスト取得開始（フォールバック）', { range });
    const data = await callSheetsAPI(range, 'GET');
    addDebugLog('名前リスト取得成功', data);
    // 先頭行ヘッダーを除外し、空でない値のみ
    const rows = (data.values || []).slice(1).map(r => (r && r[0]) ? r[0].trim() : '').filter(v => v);
    // 直近の入力から重複除去して最大50件取得
    const seen = new Set();
    const recent = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i];
      if (!seen.has(v)) {
        seen.add(v);
        recent.push(v);
        if (recent.length >= 50) break;
      }
    }
    const recentUnique = recent; // 既に重複排除済み（新しい順）
    cachedNames = recentUnique;
    renderNameList(recentUnique);
  } catch (e) {
    addDebugLog('名前リスト取得エラー', { message: e.message });
  }
}

function renderNameList(names) {
  const list = document.getElementById('nameList');
  if (!list) return;
  // アイウエオ順（日本語順）で整列 - かな正規化 + Collator
  const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base', numeric: true, ignorePunctuation: true });
  const normalizeKana = (s) => (s || '')
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/\s+/g, '')
    .trim();
  const sorted = [...names].sort((a, b) => {
    const na = normalizeKana(a);
    const nb = normalizeKana(b);
    const res = collator.compare(na, nb);
    return res !== 0 ? res : collator.compare(a, b);
  });
  list.innerHTML = sorted.map(n => `<option value="${n}"></option>`).join('');
}

function addManualInputField(config) {
  if (!config || !config.id) return;
  const exists = manualInputFields.some(field => field.id === config.id);
  if (!exists) {
    manualInputFields.push(config);
  }
}

function enableManualField(element) {
  if (!element) return;
  element.disabled = false;
  element.classList.add('requires-input');
  const group = element.closest('.form-group');
  if (group) {
    group.classList.add('force-visible');
  }

  if (!element.dataset.manualListenerAdded) {
    const handler = () => updateManualInputNotice();
    element.addEventListener('input', handler);
    element.addEventListener('change', handler);
    element.dataset.manualListenerAdded = 'true';
  }
}

function enableManualCategory() {
  const categoryInput = document.getElementById('category');
  if (!categoryInput) return;
  const group = categoryInput.closest('.form-group');
  if (group) {
    group.classList.add('force-visible');
  }
  const options = document.querySelectorAll('.category-option');
  options.forEach(option => {
    option.classList.remove('disabled');
    option.classList.add('manual-enabled');
    option.classList.add('manual-needs-input');
  });
}

function prepareManualInputSupport() {
  manualInputFields = [];

  const lenderEl = document.getElementById('lender');
  if (lenderEl && !lenderEl.value) {
    addManualInputField({ id: 'lender', label: '貸主', type: 'select' });
    enableManualField(lenderEl);
  }

  const nameEl = document.getElementById('name');
  if (nameEl && !nameEl.value) {
    addManualInputField({ id: 'name', label: '名前', type: 'input' });
    enableManualField(nameEl);
  }

  const borrowerEl = document.getElementById('borrower');
  if (borrowerEl && !borrowerEl.value) {
    addManualInputField({ id: 'borrower', label: '借主', type: 'select' });
    enableManualField(borrowerEl);
  }

  const itemEl = document.getElementById('item');
  if (itemEl && !itemEl.value) {
    addManualInputField({ id: 'item', label: '品目', type: 'input' });
    enableManualField(itemEl);
  }

  const amountEl = document.getElementById('amount');
  if (amountEl && !convertToHalfWidthNumber(amountEl.value)) {
    addManualInputField({ id: 'amount', label: '金額', type: 'input' });
    enableManualField(amountEl);
  }

  const categoryInput = document.getElementById('category');
  if (categoryInput && !categoryInput.value) {
    addManualInputField({ id: 'category', label: 'カテゴリー', type: 'category' });
    enableManualCategory();
  }

  updateManualInputNotice();

  if (manualInputFields.length > 0) {
    addDebugLog('手動入力が必要な項目', {
      fields: manualInputFields.map(field => field.label)
    });
  }
}

function updateManualInputNotice() {
  const notice = document.getElementById('manual-input-notice');
  const textEl = document.getElementById('manual-input-text');
  if (!notice || !textEl) return;

  if (manualInputFields.length === 0) {
    notice.style.display = 'none';
    notice.classList.remove('complete');
    textEl.textContent = '';
    return;
  }

  const pendingIds = [];
  manualInputFields.forEach(field => {
    if (field.id === 'category') {
      const categoryValue = document.getElementById('category')?.value;
      if (!categoryValue) {
        pendingIds.push(field.id);
      }
    } else {
      const element = document.getElementById(field.id);
      if (!element) return;
      let value = element.value;
      if (field.id === 'amount') {
        value = convertToHalfWidthNumber(value);
      }
      if (!value) {
        pendingIds.push(field.id);
      }
    }
  });

  const pendingSet = new Set(pendingIds);

  if (pendingSet.size > 0) {
    const labels = manualInputFields
      .filter(field => pendingSet.has(field.id))
      .map(field => field.label);
    notice.style.display = 'block';
    notice.classList.remove('complete');
    if (pendingSet.has('name') || labels.includes('名前')) {
      textEl.textContent = '修正者の名前を入力してください。';
    } else {
      textEl.textContent = `元データに値が無かったため、${labels.join('・')}を入力してください。`;
    }
  } else {
    notice.style.display = 'block';
    notice.classList.add('complete');
    textEl.textContent = '不足していた項目の入力が完了しました。内容を確認して送信してください。';
  }

  manualInputFields.forEach(field => {
    if (field.id === 'category') {
      const categoryGroup = document.getElementById('category')?.closest('.form-group');
      if (categoryGroup) {
        if (pendingSet.has(field.id)) {
          categoryGroup.classList.add('requires-input-group');
        } else {
          categoryGroup.classList.remove('requires-input-group');
        }
      }
      document.querySelectorAll('.category-option').forEach(option => {
        if (pendingSet.has(field.id)) {
          option.classList.add('manual-needs-input');
        } else {
          option.classList.remove('manual-needs-input');
        }
      });
    } else {
      const element = document.getElementById(field.id);
      if (!element) return;
      if (pendingSet.has(field.id)) {
        element.classList.add('requires-input');
      } else {
        element.classList.remove('requires-input');
      }
    }
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

// URLパラメータまたはstorageから元データを読み込む（修正版）
function loadOriginalData() {
  addDebugLog('=== データ読み込み開始 ===');
  
  // まずURLパラメータをチェック
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
  
  // localStorageを最初にチェック（実際にデータがここにある可能性が高い）
  const localData = localStorage.getItem('correctionData');
  addDebugLog('localStorage確認', { 
    hasData: !!localData, 
    dataLength: localData ? localData.length : 0,
    dataPreview: localData ? localData.substring(0, 100) + '...' : null
  });
  
  if (localData) {
    try {
      // データがURLエンコードされている可能性があるため、デコードを試行
      let decodedData = localData;
      
      // %で始まる場合はURLエンコードされている
      if (localData.startsWith('%')) {
        try {
          decodedData = decodeURIComponent(localData);
          addDebugLog('localStorageデータをURLデコード成功', {
            original: localData.substring(0, 50),
            decoded: decodedData.substring(0, 50)
          });
        } catch (decodeError) {
          addDebugLog('URLデコードエラー、元データをそのまま使用', decodeError);
          decodedData = localData;
        }
      }
      
      originalData = JSON.parse(decodedData);
      addDebugLog('localStorageから元データを読み込み成功', originalData);
      
      // 使用後は削除
      localStorage.removeItem('correctionData');
      addDebugLog('localStorageからcorrectionDataを削除');
      
      return true;
    } catch (error) {
      addDebugLog('localStorageのデータ解析エラー', {
        error: error.message,
        rawData: localData.substring(0, 200),
        stack: error.stack
      });
      
      // パースエラーの場合、直接のJSONを試行
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
  
  // 詳細なデバッグ情報を出力
  addDebugLog('全てのストレージチェック完了 - データなし', {
    sessionKeys: Object.keys(sessionStorage),
    localKeys: Object.keys(localStorage),
    allLocalData: (() => {
      const result = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        result[key] = {
          length: value.length,
          preview: value.substring(0, 50) + (value.length > 50 ? '...' : ''),
          startsWithPercent: value.startsWith('%')
        };
      }
      return result;
    })(),
    allSessionData: (() => {
      const result = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        result[key] = {
          length: value.length,
          preview: value.substring(0, 50) + (value.length > 50 ? '...' : '')
        };
      }
      return result;
    })()
  });
  
  return false;
}

// 元データを表示する
function displayOriginalData() {
  if (!originalData) {
    addDebugLog('表示する元データがありません');
    return;
  }
  
  addDebugLog('元データ（確認リスト描画）', originalData);

  const confirmList = document.getElementById('confirm-list');
  if (!confirmList) return;

  const formattedAmount = originalData.amount ? `¥${parseInt(originalData.amount).toLocaleString('ja-JP')}` : originalData.originalAmount || '';
  const formattedUnitPrice = originalData.unitPrice ? `¥${parseInt(convertToHalfWidthNumber(originalData.unitPrice)).toLocaleString('ja-JP')}` : '';

  const rows = [
    { key: '📅 日付', value: originalData.date || '' },
    { key: '👤 入力者', value: originalData.name || '' },
    { key: '📤 貸主', value: originalData.lender || '' },
    { key: '📥 借主', value: originalData.borrower || '' },
    { key: '🏷️ カテゴリー', value: originalData.category || '' },
    { key: '📝 品目', value: originalData.item || '' },
    { key: '📦 個/本/g', value: originalData.quantity || '' },
    { key: '💰 単価', value: formattedUnitPrice },
    { key: '💵 金額', value: formattedAmount },
    { key: '📄 行番号', value: originalData.originalRowIndex || '' },
  ];

  confirmList.innerHTML = rows.map(r => `<li><span class="confirm-key">${r.key}</span><span class="confirm-value">${r.value}</span></li>`).join('');
}

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
  
  document.getElementById('quantity').value = originalData.quantity || '';
  const unitPriceValue = originalData.unitPrice ? 
    parseInt(convertToHalfWidthNumber(originalData.unitPrice)).toLocaleString('ja-JP') : '';
  document.getElementById('unitPrice').value = unitPriceValue;
  
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
  
  addDebugLog('逆取引データを自動入力完了', {
    date: document.getElementById('date').value,
    lender: document.getElementById('lender').value,
    borrower: document.getElementById('borrower').value,
    category: document.getElementById('category').value,
    item: document.getElementById('item').value,
    quantity: document.getElementById('quantity').value,
    unitPrice: document.getElementById('unitPrice').value,
    amount: document.getElementById('amount').value
  });

  prepareManualInputSupport();
}

// プログレス表示機能
function showProgressStep(stepId) {
  const steps = document.querySelectorAll('.status-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed', 'error');
  });
  
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
  // open modal
  const modal = document.getElementById('progressModal');
  if (modal) modal.classList.add('show');
}

function hideProgress() {
  const modal = document.getElementById('progressModal');
  if (modal) modal.classList.remove('show');
  // reset progress
  const bar = document.getElementById('progress-bar');
  const txt = document.getElementById('remaining-time');
  if (bar) bar.style.width = '0%';
  if (txt) txt.textContent = '残り 約—秒';
}

// 送信中の概算残り時間メーター（単純進行）
let progressTimer = null;
function startProgress(durationMs = 4500) {
  const bar = document.getElementById('progress-bar');
  const txt = document.getElementById('remaining-time');
  if (!bar || !txt) return;
  const start = Date.now();
  const end = start + durationMs;
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    const now = Date.now();
    const ratio = Math.min(1, (now - start) / durationMs);
    bar.style.width = `${Math.floor(ratio * 100)}%`;
    const remain = Math.max(0, Math.ceil((end - now) / 1000));
    txt.textContent = `残り 約${remain}秒`;
    if (ratio >= 1) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }, 200);
}

function showProgressError(stepId) {
  const step = document.getElementById(stepId);
  step.classList.remove('active');
  step.classList.add('error');
}

// GAS接続テスト関数
async function testGASConnection() {
  addDebugLog('=== GAS接続テスト開始 ===');
  
  try {
    // テスト用のシンプルなデータを送信
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      message: "テスト送信 from correction.html"
    };
    
    addDebugLog('テストデータ送信中', testData);
    
    // 通常のfetchでテスト（CORSエラーが発生する可能性があるが、それで正常）
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(testData)
    });
    
    addDebugLog('GASレスポンス情報', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      type: response.type
    });
    
    // レスポンス本文を読み取り試行
    try {
      const responseText = await response.text();
      addDebugLog('レスポンステキスト取得成功', responseText);
      
      // JSON解析試行
      try {
        const responseJson = JSON.parse(responseText);
        addDebugLog('GASレスポンスJSON', responseJson);
        
        if (responseJson.status === 'SUCCESS') {
          alert('✅ GAS接続テスト成功！\n\n' + 
                'レスポンス: ' + responseJson.message + '\n' +
                'タイムスタンプ: ' + responseJson.timestamp);
        } else {
          alert('⚠️ GAS接続はできたが処理エラー\n\n' + 
                'エラー: ' + responseJson.message + '\n' +
                'デバッグ情報: ' + JSON.stringify(responseJson.debug, null, 2));
        }
      } catch (jsonError) {
        addDebugLog('JSON解析エラー', jsonError);
        alert('⚠️ GAS接続はできたがJSON解析エラー\n\n' + 
              'レスポンステキスト: ' + responseText.substring(0, 200));
      }
    } catch (textError) {
      addDebugLog('レスポンス本文読み取りエラー', textError);
      alert('⚠️ レスポンス本文読み取りエラー\n\n' + textError.message);
    }
    
  } catch (error) {
    addDebugLog('GAS接続テストエラー', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    alert('❌ GAS接続テストエラー\n\n' + 
          'エラー: ' + error.message + '\n' +
          'GAS URLを確認してください。');
  }
}

// 修正データを送信（CORS対応強化版）
async function submitCorrectionData() {
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn):not([onclick])');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  addDebugLog('=== 修正データ送信開始 ===');

  // バリデーション
  const categoryInput = document.getElementById('category');
  if (!categoryInput.value) {
    addDebugLog('バリデーションエラー: カテゴリーが未選択');
    showCustomAlertDialog('カテゴリーを選択してください');
    return;
  }

  // ボタンを無効化
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = '送信中...';

  try {
    // ステップ1: データ検証
    showProgressStep('step-validation');
    startProgress(15000);
    await delay(500);

    // 送信直前の安全補完: 無効化やUI状態に関わらず値を確実にセット
    const lenderEl = document.getElementById('lender');
    const borrowerEl = document.getElementById('borrower');
    const ensureOption = (selectEl, value) => {
      if (!selectEl || !value) return;
      const exists = Array.from(selectEl.options).some(o => o.value === value);
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        selectEl.appendChild(opt);
      }
      selectEl.value = value;
    };
    // originalData からのフォールバック
    if (originalData) {
      if (lenderEl && !lenderEl.value && originalData.borrower) {
        addDebugLog('lender が空のため originalData から補完', { from: originalData.borrower });
        ensureOption(lenderEl, originalData.borrower);
      }
      if (borrowerEl && !borrowerEl.value && originalData.lender) {
        addDebugLog('borrower が空のため originalData から補完', { from: originalData.lender });
        ensureOption(borrowerEl, originalData.lender);
      }
    }

    updateManualInputNotice();

    const data = {
      date: document.getElementById("date").value?.trim(),
      name: document.getElementById("name").value?.trim(),
      lender: document.getElementById("lender").value?.trim(),
      borrower: document.getElementById("borrower").value?.trim(),
      category: document.getElementById("category").value?.trim(),
      item: document.getElementById("item").value?.trim(),
      quantity: document.getElementById("quantity").value?.trim(),
      unitPrice: convertToHalfWidthNumber(document.getElementById("unitPrice").value),
      amount: convertToHalfWidthNumber(document.getElementById("amount").value),
      isCorrection: true,
      correctionOnly: true, // 🔥 修正専用送信として明確に指定
      correctionMark: "✏️修正",
      sendType: "CORRECTION",
      originalRowIndex: originalData.originalRowIndex // 🔥 追加: 元のデータの行番号を送信
    };

    addDebugLog('送信データ準備完了', data);

    // バリデーション
    const validationErrors = [];
    if (!data.date) validationErrors.push('日付');
    if (!data.name) validationErrors.push('名前');
    if (!data.lender) validationErrors.push('貸主');
    if (!data.borrower) validationErrors.push('借主');
    if (!data.category) validationErrors.push('カテゴリー');
    if (!data.item) validationErrors.push('品目');
    if (!data.amount) validationErrors.push('金額');
    if (!data.originalRowIndex) validationErrors.push('元の行番号'); // 🔥 追加: 行番号のバリデーション

    if (validationErrors.length > 0) {
      showCustomAlertDialog(`以下の項目が入力されていません: ${validationErrors.join(', ')}`);
      return;
    }

    if (data.lender === data.borrower) {
      showCustomAlertDialog('貸主と借主は異なる店舗を選択してください。');
      return;
    }

    const amountNumber = parseFloat(data.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      showCustomAlertDialog('正しい金額を入力してください。');
      return;
    }

    addDebugLog('バリデーション完了', { valid: true });

    // ステップ2: データ送信
    showProgressStep('step-sending');
    await delay(500);

    addDebugLog('GAS送信開始', {
      url: GAS_URL,
      method: 'POST',
      data: data
    });

    // 🔥 改良されたCORS対応送信
    let sendSuccess = false;
    let responseData = null;
    let sendError = null;

    // 方法1: 通常のfetchを試行（CORS完全対応）
    try {
      addDebugLog('通常fetchを試行中...');
      
      const response = await fetch(GAS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(data)
      });

      addDebugLog('通常fetch成功', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        type: response.type,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (response.ok) {
        try {
          const responseText = await response.text();
          addDebugLog('レスポンステキスト取得成功', responseText);
          
          if (responseText.trim()) {
            responseData = JSON.parse(responseText);
            addDebugLog('JSON解析成功', responseData);
            
            if (responseData.status === 'SUCCESS') {
              sendSuccess = true;
              addDebugLog('✅ 送信成功確認');
            } else {
              sendError = responseData.message || '不明なエラー';
              addDebugLog('❌ サーバーエラー', responseData);
            }
          } else {
            // 空のレスポンスでもステータスが200なら成功とみなす
            sendSuccess = true;
            addDebugLog('✅ 空のレスポンスだが200なので成功');
          }
        } catch (parseError) {
          addDebugLog('レスポンス解析エラー', parseError);
          // ステータスが200なら解析エラーでも成功とみなす
          if (response.status === 200) {
            sendSuccess = true;
            addDebugLog('✅ 解析エラーだが200なので成功とみなす');
          }
        }
      } else {
        sendError = `HTTPエラー: ${response.status} ${response.statusText}`;
        addDebugLog('❌ HTTPエラー', { status: response.status, statusText: response.statusText });
      }

    } catch (fetchError) {
      addDebugLog('通常fetchエラー', fetchError);
      
      // 方法2: no-corsモードでフォールバック送信
      try {
        addDebugLog('no-corsモードでフォールバック送信...');
        
        const corsResponse = await fetch(GAS_URL, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(data)
        });

        addDebugLog('no-cors送信完了', {
          status: corsResponse.status,
          statusText: corsResponse.statusText,
          ok: corsResponse.ok,
          type: corsResponse.type
        });

        // no-corsでは詳細レスポンスが分からないが、送信は完了している
        sendSuccess = true;
        responseData = {
          status: 'SUCCESS',
          message: '送信完了（no-corsモード）',
          note: 'レスポンス詳細は確認できませんが、データは送信されました'
        };
        addDebugLog('✅ no-cors送信完了（詳細不明だが送信済み）');

      } catch (corsError) {
        addDebugLog('❌ no-cors送信もエラー', corsError);
        sendError = `送信エラー: ${corsError.message}`;
      }
    }

    // ステップ3: データ挿入
    showProgressStep('step-inserting');
    await delay(1000);

    // ステップ4: バックアップ
    showProgressStep('step-backup');
    await delay(500);

    // ステップ5: 完了
    showProgressStep('step-complete');
    await delay(500);

    // 🔥 結果判定と表示
    if (sendSuccess) {
      addDebugLog('✅ 全体処理成功', responseData);
      
      // シンプルな成功メッセージ
      const successMessage = '✅ 修正データの送信が完了しました。';

      // 成功メッセージ表示
      const successMsg = document.getElementById('successMessage');
      successMsg.textContent = successMessage;
      successMsg.classList.add('show');
      
      setTimeout(() => {
        successMsg.classList.remove('show');
      }, 5000);

      // フォームリセット
      document.getElementById('correctionForm').reset();
      const categoryOptions = document.querySelectorAll('.category-option');
      categoryOptions.forEach(opt => opt.classList.remove('selected'));
      
      // プログレス即時完了表示にしてすぐ閉じる
      const bar = document.getElementById('progress-bar');
      const txt = document.getElementById('remaining-time');
      if (bar) bar.style.width = '100%';
      if (txt) txt.textContent = '残り 約0秒';
      if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
      setTimeout(() => { hideProgress(); }, 200);
      
      addDebugLog('送信完了処理終了');
      
      // 戻る確認
      setTimeout(() => {
        // confirm() の代わりにカスタムモーダルを使用することを検討してください
        if (confirm('修正データの送信が完了しました。元のページに戻りますか？')) {
          // 🔥 修正: marugo.htmlページを強制リロードして戻る
          const currentPath = window.location.pathname;
          let marugoUrl;
          
          if (currentPath.includes('/pages/')) {
            marugoUrl = 'marugo.html';
          } else {
            marugoUrl = 'pages/marugo.html';
          }
          
          addDebugLog('marugo.htmlにリロードして戻る', { url: marugoUrl });
          
          // 強制リロードのため、タイムスタンプを追加
          const timestamp = new Date().getTime();
          window.location.href = `${marugoUrl}?refresh=${timestamp}`;
        }
      }, 3000);

    } else {
      // 送信失敗
      throw new Error(sendError || '送信に失敗しました');
    }

  } catch (error) {
    addDebugLog('送信エラー', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    // エラーが発生したステップを表示
    const activeStep = document.querySelector('.status-step.active');
    if (activeStep) {
      showProgressError(activeStep.id);
    }
    
    // エラーメッセージ表示
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = `❌ 送信エラー: ${error.message}`;
    errorMessage.classList.add('show');
    
    setTimeout(() => {
      errorMessage.classList.remove('show');
      hideProgress();
    }, 5000);
  } finally {
    // ボタン状態を復元
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
  }
}

// DOM要素の初期化
function initializeElements() {
  // カテゴリー選択の処理
  const categoryOptions = document.querySelectorAll('.category-option');
  const categoryInput = document.getElementById('category');

  categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
      if (option.classList.contains('disabled')) {
        return;
      }
      
      categoryOptions.forEach(opt => {
        opt.classList.remove('selected');
        opt.classList.remove('manual-needs-input');
      });
      option.classList.add('selected');
      categoryInput.value = option.dataset.value;
      
      addDebugLog('カテゴリー選択', { category: option.dataset.value });

      updateManualInputNotice();
    });
  });

  // 金額入力の自動フォーマット（Safari対応、カンマ付与はblur時に限定）
  const amountInput = document.getElementById('amount');
  amountInput.addEventListener('input', (e) => {
    // Safari対応: compositionendまで待つ
    if (e.isComposing || e.target.dataset.composing === 'true') return;
    let value = e.target.value || '';
    // 全角→半角
    value = value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    // 数字以外除去
    value = value.replace(/[^0-9]/g, '');
    e.target.value = value;
    updateManualInputNotice();
  });
  amountInput.addEventListener('compositionstart', (e) => {
    e.target.dataset.composing = 'true';
  });
  amountInput.addEventListener('compositionend', (e) => {
    e.target.dataset.composing = 'false';
    // 確定後に処理
    let value = e.target.value || '';
    value = value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    value = value.replace(/[^0-9]/g, '');
    e.target.value = value;
    updateManualInputNotice();
  });
  amountInput.addEventListener('blur', (e) => {
    let value = (e.target.value || '').replace(/,/g, '');
    if (value) {
      e.target.value = parseInt(value, 10).toLocaleString('ja-JP');
    }
    updateManualInputNotice();
  });
  amountInput.addEventListener('focus', (e) => {
    e.target.value = (e.target.value || '').replace(/,/g, '');
  });

  // フォーム送信処理
  const form = document.getElementById('correctionForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitCorrectionData();
  });
}

// メッセージ非表示処理
function hideMessages() {
  document.getElementById('successMessage').classList.remove('show');
  document.getElementById('errorMessage').classList.remove('show');
}

// バックボタンのパス修正
function fixBackButtonPath() {
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    const currentPath = window.location.pathname;
    addDebugLog('パス修正', { currentPath });
    
    if (currentPath.includes('/pages/')) {
      backBtn.href = 'marugo.html';
    } else {
      backBtn.href = 'pages/marugo.html';
    }
    
    addDebugLog('戻るボタンのリンク設定', { href: backBtn.href });
  }
}

// 初期化処理
function initialize() {
  addDebugLog('=== correction.html 初期化開始 ===');
  
  hideMessages();
  fixBackButtonPath();
  populateShops();
  initializeElements();
  populateNameDatalist();
  setupSelectionModal();
  
  if (loadOriginalData()) {
    addDebugLog('データ読み込み成功 - 表示処理開始');
    displayOriginalData();
    autoFillReverseData();
    
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) {
      errorNotice.style.display = 'none';
    }
  } else {
    addDebugLog('データ読み込み失敗');
    
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) {
      errorNotice.classList.add('show');
    }
    
    const form = document.getElementById('correctionForm');
    const originalDataSection = document.getElementById('original-data-section');
    if (form) form.style.display = 'none';
    if (originalDataSection) originalDataSection.style.display = 'none';
    
    setTimeout(() => {
      if (document.referrer) {
        addDebugLog('Referrerから戻る', { referrer: document.referrer });
        history.back();
      } else {
        const currentPath = window.location.pathname;
        let redirectPath = currentPath.includes('/pages/') ? 'marugo.html' : 'pages/marugo.html';
        addDebugLog('フォールバックリダイレクト', { redirectPath });
        window.location.href = redirectPath;
      }
    }, 3000);
  }
  
  addDebugLog('=== correction.html 初期化完了 ===');
}

// 選択モーダルの設定
function setupSelectionModal() {
  const nameSelectBtn = document.getElementById('name-select-btn');
  if (nameSelectBtn) {
    nameSelectBtn.addEventListener('click', () => {
      if (cachedNames && cachedNames.length > 0) {
        openSelectionModal('名前を選択', cachedNames, (selectedName) => {
          document.getElementById('name').value = selectedName;
        });
      }
    });
  }
}

// 共用選択モーダル
function openSelectionModal(title, items, onSelect) {
  const modal = document.getElementById('selectModal');
  const titleEl = document.getElementById('selectTitle');
  const searchEl = document.getElementById('selectSearch');
  const listEl = document.getElementById('selectList');
  if (!modal || !titleEl || !searchEl || !listEl) return;

  titleEl.textContent = title;
  const render = (query = '') => {
    const q = (query || '').trim().toLowerCase();
    listEl.innerHTML = '';
    items
      .filter(v => !q || v.toLowerCase().includes(q))
      .slice(0, 200)
      .forEach(v => {
        const div = document.createElement('div');
        div.className = 'select-item';
        div.textContent = v;
        div.onclick = () => { close(); onSelect(v); };
        listEl.appendChild(div);
      });
  };
  const close = () => { modal.classList.remove('show'); searchEl.value = ''; listEl.innerHTML=''; };
  modal.onclick = (e) => { if (e.target === modal) close(); };
  searchEl.oninput = (e) => render(e.target.value);
  render('');
  modal.classList.add('show');
  // searchEl.focus(); // フォーカスを外してキーボード表示を防ぐ
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
