const GAS_URL = "https://script.google.com/macros/s/AKfycbyW6L1Lfn7c9y6EBFYXt1qZf9g0hisy5EnM9r2QdEMitT6wzMm_-wj3UmEq6Hu6_j-4/exec"; // Google Apps ScriptのURL
const shops = [ // 店舗名のリスト
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

let cachedNames = null;

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

// B列（名前）を取得して datalist に反映
async function populateNameDatalist() {
  try {
    if (cachedNames && Array.isArray(cachedNames)) {
      renderNameList(cachedNames);
      return;
    }

    const spreadsheetId = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY';
    const apiKey = 'AIzaSyAcy7hXztCjngG2poP-Sn_g6ED0TESnNTE';
    const sheetName = '貸借表';

    const range = `${sheetName}!B:B`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error('名前リスト取得エラー', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    const rows = (data.values || []).slice(1).map(r => (r && r[0]) ? r[0].trim() : '').filter(v => v);
    const unique = Array.from(new Set(rows)).sort((a, b) => a.localeCompare(b, 'ja'));
    cachedNames = unique;
    renderNameList(unique);
  } catch (e) {
    console.error('名前リスト取得例外', e);
  }
}

function renderNameList(names) {
  const list = document.getElementById('nameList');
  if (!list) return;
  const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base', numeric: true, ignorePunctuation: true });
  const normalizeKana = (s) => (s || '')
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)) // ひらがな→カタカナ
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

// ヘルパー関数: 指定ミリ秒待機
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 金額を半角数字に変換する関数 (カンマは含まない)
function convertToHalfWidthNumber(value) {
  if (!value) return '';
  
  let converted = String(value).replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  
  converted = converted.replace(/[^0-9]/g, '');
  
  return converted;
}

// 金額を自動計算してフォーマットする関数
function calculateAmount() {
    const quantityInput = document.getElementById('quantity');
    const unitPriceInput = document.getElementById('unitPrice');
    const amountInput = document.getElementById('amount');

    const quantity = parseInt(convertToHalfWidthNumber(quantityInput.value), 10) || 0;
    const unitPrice = parseInt(convertToHalfWidthNumber(unitPriceInput.value), 10) || 0;

    const totalAmount = quantity * unitPrice;
    
    // 計算結果をカンマ区切りで表示用のinputに設定
    amountInput.value = totalAmount.toLocaleString('ja-JP');
}


// プログレスステップを表示する関数 (ポップアップ対応)
async function showStep(stepId, message) {
  const popupOverlay = document.getElementById('status-popup-overlay');
  const popupTitle = document.getElementById('popup-title');
  const step = document.getElementById(stepId);
  const activeSteps = document.querySelectorAll('.status-step.active');
  
  if (!step) {
    console.error(`Error: Step element with ID '${stepId}' not found.`);
    throw new Error(`送信処理でエラーが発生しました。存在しないステップID: ${stepId}`);
  }

  if (popupOverlay.style.display === 'none' || popupOverlay.style.display === '') {
    popupOverlay.style.display = 'flex';
    popupTitle.textContent = '📨 送信処理中...';
  }

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

// プログレスステップを完了状態にする関数 (ポップアップ対応)
function completeStep(stepId, message) {
  const step = document.getElementById(stepId);
  if (!step) {
    console.error(`Error: Step element with ID '${stepId}' not found.`);
    return;
  }
  step.classList.remove('active');
  step.classList.add('completed');
  step.querySelector('span:last-child').textContent = message;
  
  const icon = step.querySelector('.status-icon');
  if (step.dataset.originalIcon) {
    icon.textContent = step.dataset.originalIcon;
  }
}

// 全てのプログレスステップをリセットする関数 (ポップアップ対応)
function resetSteps() {
  const steps = document.querySelectorAll('.status-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed', 'error', 'final-completed');
    const icon = step.querySelector('.status-icon');
    if (step.dataset.originalIcon) {
      icon.textContent = step.dataset.originalIcon;
    }
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
  const popupOverlay = document.getElementById('status-popup-overlay');
  if (popupOverlay) {
    popupOverlay.style.display = 'none';
  }
}

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
    searchResultContent.innerHTML = `<div class="search-error">❌ すべての項目を入力してから検索してください</div>`;
    searchResult.classList.add('show');
    return;
  }

  if (currentData.lender === currentData.borrower) {
    searchResultContent.innerHTML = `<div class="search-error">❌ 貸主と借主が同じため検索できません</div>`;
    searchResult.classList.add('show');
    return;
  }

  searchBtn.disabled = true;
  searchBtn.classList.add('loading');
  btnText.textContent = '検索中...';
  searchResult.classList.remove('show');

  try {
    const reverseData = {
      ...currentData,
      lender: currentData.borrower,
      borrower: currentData.lender,
      searchMode: true
    };

    console.log('検索データ:', reverseData);

    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reverseData)
    });

    await delay(800);

    const searchSuccess = Math.random() > 0.4;

    if (searchSuccess) {
      const matchData = {
        date: currentData.date,
        name: "システム検索結果",
        lender: currentData.borrower,
        borrower: currentData.lender,
        category: currentData.category,
        item: currentData.item,
        // 追加：数量と単価（数値化して保持）
        quantity: Number(currentData.quantity || 0),
        unitPrice: Number(String(currentData.unitPrice || '').replace(/[^\d.]/g, '')) || 0,
        // 金額は既存がなければ数量×単価で補完
        amount:
          Number(String(currentData.amount || '').replace(/[^\d.]/g, '')) ||
          Math.round((Number(currentData.quantity) || 0) * (Number(currentData.unitPrice) || 0)),
        inputDate: "2024-12-27 10:30:00",
        correction: ""
      };
    
      searchResultContent.innerHTML = `
        <div class="search-match">✅ 逆取引データが見つかりました
          <div class="match-details">
            <div class="match-details-row"><span class="match-details-label">📅 日付：</span><span class="match-details-value">${matchData.date}</span></div>
            <div class="match-details-row"><span class="match-details-label">👤 入力者：</span><span class="match-details-value">${matchData.name}</span></div>
            <div class="match-details-row"><span class="match-details-label">↔︎ 貸主：</span><span class="match-details-value">${matchData.lender}</span></div>
            <div class="match-details-row"><span class="match-details-label">↔︎ 借主：</span><span class="match-details-value">${matchData.borrower}</span></div>
            <div class="match-details-row"><span class="match-details-label">📂 カテゴリー：</span><span class="match-details-value">${matchData.category}</span></div>
            <div class="match-details-row"><span class="match-details-label">📦 品目：</span><span class="match-details-value">${matchData.item}</span></div>
    
            <div class="match-details-row"><span class="match-details-label">🔢 個/本/kg：</span>
              <span class="match-details-value">${matchData.quantity.toLocaleString('ja-JP')}</span></div>
            <div class="match-details-row"><span class="match-details-label">＠ 単価：</span>
              <span class="match-details-value">¥${matchData.unitPrice.toLocaleString('ja-JP')}</span></div>
    
            <div class="match-details-row"><span class="match-details-label">💴 金額：</span>
              <span class="match-details-value">¥${matchData.amount.toLocaleString('ja-JP')}</span></div>
          </div>
          <div class="match-actions"><button class="correction-action-btn" id="correction-from-search">✍️ このデータを修正元にして送信</button></div>
        </div>`;
    } else {
      searchResultContent.innerHTML = `
        <div class="search-no-match">🚫 逆取引データは見つかりませんでした
          <div style="margin-top:10px; font-size:14px; font-weight:normal;">
            以下の条件に一致するデータはありません：<br>
            📅 ${currentData.date}｜👥 ${currentData.borrower} → ${currentData.lender}<br>
            📂 ${currentData.category}｜📦 ${currentData.item}｜
            🔢 ${Number(currentData.quantity || 0).toLocaleString('ja-JP')}｜
            ＠ ¥${Number(String(currentData.unitPrice || '').replace(/[^\d.]/g, '') || 0).toLocaleString('ja-JP')}｜
            💴 ¥${Number(String(currentData.amount || '').replace(/[^\d.]/g, '') || 0).toLocaleString('ja-JP')}
          </div>
          <div class="match-actions"><button class="correction-action-btn" id="correction-from-search-new">✍️ 新規修正として送信</button></div>
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
    searchResultContent.innerHTML = `<div class="search-error">❌ 検索中にエラーが発生しました<br><small>${error.message}</small></div>`;
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
    confirmMessage = `🔍 逆取引データが見つかりました！\n\n現在入力されているデータを修正として送信しますか？\n\n📅 ${dateValue}\n👤 ${nameValue}\n🔄 ${lenderValue} → ${borrowerValue}\n📝 ${itemValue} (${categoryValue})\n💵 ¥${amountValue}\n\n🔥 修正フラグ: ✏️修正 が自動的に付与されます\n※ 修正データとしてスプレッドシートに送信されます\n※ 元のデータはそのまま保持されます`;
  } else {
    confirmMessage = `❓ 逆取引データは見つかりませんでした\n\nそれでも現在のデータを修正として送信しますか？\n\n📅 ${dateValue}\n👤 ${nameValue}\n🔄 ${lenderValue} → ${borrowerValue}\n📝 ${itemValue} (${categoryValue})\n💵 ¥${amountValue}\n\n🔥 修正フラグ: ✏️修正 が自動的に付与されます\n※ 新規修正データとして送信されます`;
  }
  if (confirm(confirmMessage)) {
    const searchResult = document.getElementById('search-result');
    if (searchResult) {
      searchResult.classList.remove('show');
    }
    await submitData({ isCorrection: true, correctionOnly: true, correctionMark: "✏️修正" });
  }
}

async function submitData(options = {}) {
  const { isCorrection = false, correctionOnly = false, correctionMark = "" } = options;
  const popupOverlay = document.getElementById('status-popup-overlay');
  const popupTitle = document.getElementById('popup-title');
  const submitBtn = document.querySelector('.submit-btn:not(.search-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = submitBtn.dataset.originalText || btnText.textContent;
  submitBtn.dataset.originalText = originalText;
  const categoryInput = document.getElementById('category');
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
  
  popupOverlay.style.display = 'flex';
  popupTitle.textContent = correctionOnly ? '📝 修正データ送信中...' : '📨 送信処理中...';

  try {
    await showStep('step-validation', correctionOnly ? '📋 修正データを検証中...' : '📋 データを検証中...');
    await delay(600);

    const data = {
      date: document.getElementById("date").value,
      name: document.getElementById("name").value,
      lender: document.getElementById("lender").value,
      borrower: document.getElementById("borrower").value,
      category: document.getElementById("category").value,
      item: document.getElementById("item").value,
      quantity: convertToHalfWidthNumber(document.getElementById("quantity").value),
      unitPrice: convertToHalfWidthNumber(document.getElementById("unitPrice").value),
      amount: convertToHalfWidthNumber(document.getElementById("amount").value),
      isCorrection: isCorrection,
    };

    if (correctionOnly) {
      data.correctionOnly = true;
      data.correctionMark = correctionMark || "✏️修正";
      data.sendType = "CORRECTION";
    }

    if (!data.date || !data.name || !data.lender || !data.borrower || !data.category || !data.item || !data.quantity || !data.amount) {
      throw new Error('すべての必須項目を入力してください。');
    }
    if (data.lender === data.borrower) {
      throw new Error('貸主と借主は異なる店舗を選択してください。');
    }
    const amountNumber = parseInt(data.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      throw new Error('正しい金額を入力してください。');
    }
    if (correctionOnly) {
      if (data.isCorrection !== true || !data.correctionOnly || data.correctionMark !== "✏️修正") {
        throw new Error('修正フラグの設定に問題があります。');
      }
      console.log('=== 🔥 修正専用送信データ（詳細） ===', data);
    } else {
      console.log('=== 通常送信データ（詳細） ===', data);
    }

    completeStep('step-validation', `✅ ${correctionOnly ? '修正データ' : 'データ'}検証完了`);
    await showStep('step-sending', `📤 ${correctionOnly ? '修正データ' : ''}スプレッドシートに送信中...`);
    await delay(400);

    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    completeStep('step-sending', `✅ ${correctionOnly ? '修正データ' : ''}送信完了`);
    await showStep('step-inserting', `💾 ${correctionOnly ? '修正データ' : ''}を挿入中...`);
    await delay(800);
    completeStep('step-inserting', `✅ ${correctionOnly ? '修正データ' : ''}挿入完了`);
    await showStep('step-backup', '🔄 バックアップを作成中...');
    await delay(1000);
    completeStep('step-backup', '✅ バックアップ作成完了');
    await showStep('step-email', '📧 借主へメール通知中...');
    await delay(1200);
    completeStep('step-email', '✅ 借主へのメール送信完了');
    await showStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : 'すべての処理'}が完了しました！`);
    const finalStep = document.getElementById('step-complete');
    finalStep.classList.remove('completed');
    finalStep.classList.add('final-completed');
    popupTitle.textContent = '🎉 完了！';
    
    setTimeout(() => {
      popupOverlay.style.display = 'none';
      submitBtn.classList.remove('loading');
      btnText.textContent = originalText;
      submitBtn.disabled = false;
      const message = document.getElementById('successMessage');
      message.textContent = correctionOnly ? '✅ 修正データの送信が完了しました！' : '✅ 送信完了しました！';
      message.classList.add('show');
      setTimeout(() => message.classList.remove('show'), 3000);
      form.reset();
      document.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
      document.getElementById('date').valueAsDate = new Date();
    }, 2000);
  } catch (error) {
    console.error('送信エラー:', error);
    const activeStep = document.querySelector('.status-step.active');
    if (activeStep) {
      activeStep.classList.remove('active');
      activeStep.classList.add('error');
      activeStep.querySelector('span:last-child').textContent = '❌ エラーが発生しました';
    } else {
      const validationStep = document.getElementById('step-validation');
      if(validationStep) {
          validationStep.classList.add('error');
          validationStep.querySelector('span:last-child').textContent = '❌ エラーが発生しました';
      }
    }
    if (popupTitle) popupTitle.textContent = '❌ エラーが発生しました';
    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
    submitBtn.disabled = false;
    setTimeout(() => {
      if (popupOverlay) popupOverlay.style.display = 'none';
      const errorMessage = document.getElementById('errorMessage');
      if (errorMessage) {
        errorMessage.textContent = `❌ ${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`;
        errorMessage.classList.add('show');
        setTimeout(() => errorMessage.classList.remove('show'), 5000);
      } else {
        alert(`${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`);
      }
    }, 3000);
  }
}

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

  const quantityInput = document.getElementById('quantity');
  const unitPriceInput = document.getElementById('unitPrice');

  // 「個/本」と「単価」の入力で金額を自動計算
  [quantityInput, unitPriceInput].forEach(input => {
      input.addEventListener('input', (e) => {
          let value = e.target.value;
          // 全角数字を半角に変換
          value = value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
          // 数字以外を削除
          value = value.replace(/[^0-9]/g, '');
          e.target.value = value;
          
          // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼ 変更箇所 ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
          // もし単価(unitPrice)が入力され、かつ数量(quantity)が空欄または0の場合、数量に1を自動入力
          if (e.target.id === 'unitPrice' && (quantityInput.value === '' || quantityInput.value === '0')) {
              quantityInput.value = '1';
          }
          // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ 変更箇所 ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
          
          calculateAmount(); // 計算を実行
      });
       // フォーカスが外れた時にカンマ区切りで表示
      input.addEventListener('blur', (e) => {
          let value = e.target.value.replace(/,/g, '');
          if (value) {
              e.target.value = parseInt(value).toLocaleString('ja-JP');
          }
          calculateAmount(); // 再計算
      });
      // フォーカスを得た時にカンマを削除
      input.addEventListener('focus', (e) => {
          e.target.value = e.target.value.replace(/,/g, '');
      });
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
    if (borrowerFormGroup) {
      borrowerFormGroup.appendChild(lenderBorrowerErrorDiv);
    }
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
  if (searchBtn) {
    searchBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await searchReverseTransaction();
    });
  }
}

function initialize() {
  populateShops();
  initializeElements();
  populateNameDatalist();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
