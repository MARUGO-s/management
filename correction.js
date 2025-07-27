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

// URLパラメータまたはstorageから元データを読み込む（修正版）
function loadOriginalData() {
  console.log('=== データ読み込み開始 ===');
  
  // まずURLパラメータをチェック
  const urlParams = new URLSearchParams(window.location.search);
  const dataParam = urlParams.get('data');
  
  console.log('URLパラメータ確認:', dataParam ? '有り' : '無し');
  
  if (dataParam) {
    try {
      originalData = JSON.parse(decodeURIComponent(dataParam));
      console.log('URLパラメータから元データを読み込み:', originalData);
      return true;
    } catch (error) {
      console.error('URLパラメータのデータ解析エラー:', error);
    }
  }
  
  // sessionStorageをチェック（修正：最優先でsessionStorageを確認）
  console.log('sessionStorage確認中...');
  const savedData = sessionStorage.getItem('correctionData');
  console.log('sessionStorageデータ:', savedData ? '有り' : '無し');
  
  if (savedData) {
    try {
      originalData = JSON.parse(savedData);
      console.log('sessionStorageから元データを読み込み:', originalData);
      // 使用後は削除
      sessionStorage.removeItem('correctionData');
      return true;
    } catch (error) {
      console.error('sessionStorageのデータ解析エラー:', error);
    }
  }
  
  // localStorageもチェック（フォールバック）
  console.log('localStorage確認中...');
  const localData = localStorage.getItem('correctionData');
  console.log('localStorageデータ:', localData ? '有り' : '無し');
  
  if (localData) {
    try {
      originalData = JSON.parse(localData);
      console.log('localStorageから元データを読み込み:', originalData);
      // 使用後は削除
      localStorage.removeItem('correctionData');
      return true;
    } catch (error) {
      console.error('localStorageのデータ解析エラー:', error);
    }
  }
  
  // デバッグ: 利用可能なstorageキーを表示
  console.log('利用可能なsessionStorageキー:', Object.keys(sessionStorage));
  console.log('利用可能なlocalStorageキー:', Object.keys(localStorage));
  
  // 詳細なデバッグ情報
  console.log('sessionStorage全内容:');
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    console.log(`  ${key}: ${sessionStorage.getItem(key)?.substring(0, 100)}...`);
  }
  
  console.error('元データが見つかりません');
  return false;
}

// 元データを表示する
function displayOriginalData() {
  if (!originalData) {
    console.error('表示する元データがありません');
    return;
  }
  
  console.log('元データ表示中:', originalData);
  
  const originalDataGrid = document.getElementById('original-data-grid');
  
  // 金額のフォーマット
  const formattedAmount = originalData.amount ? 
    `¥${parseInt(originalData.amount).toLocaleString('ja-JP')}` : 
    originalData.originalAmount || '不明';
  
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
    <div class="original-data-item" style="grid-column: 1 / -1;">
      <span class="original-data-label">💵 金額:</span>
      <span class="original-data-value">${formattedAmount}</span>
    </div>
  `;
}

// フォームに逆取引データを自動入力
function autoFillReverseData() {
  if (!originalData) {
    console.error('自動入力する元データがありません');
    return;
  }
  
  console.log('逆取引データを自動入力中:', originalData);
  
  // 日付はそのまま
  document.getElementById('date').value = originalData.date || '';
  
  // 貸主と借主を入れ替え
  document.getElementById('lender').value = originalData.borrower || '';
  document.getElementById('borrower').value = originalData.lender || '';
  
  // その他の項目はそのまま
  document.getElementById('category').value = originalData.category || '';
  document.getElementById('item').value = originalData.item || '';
  
  // 金額（数値のみに変換）
  const amountValue = originalData.amount ? 
    parseInt(originalData.amount).toLocaleString('ja-JP') : 
    '';
  document.getElementById('amount').value = amountValue;
  
  // カテゴリー選択状態を更新
  const categoryOptions = document.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    option.classList.remove('selected');
    if (option.dataset.value === originalData.category) {
      option.classList.add('selected');
    }
  });
  
  console.log('逆取引データを自動入力完了');
}

// プログレス表示機能
function showProgressStep(stepId) {
  // 全てのステップをリセット
  const steps = document.querySelectorAll('.status-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed', 'error');
  });
  
  // 指定されたステップまでを完了状態にし、現在のステップをアクティブに
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
  
  // プログレス表示を表示
  const statusDisplay = document.getElementById('status-display');
  statusDisplay.classList.add('show');
}

function hideProgress() {
  const statusDisplay = document.getElementById('status-display');
  statusDisplay.classList.remove('show');
}

function showProgressError(stepId) {
  const step = document.getElementById(stepId);
  step.classList.remove('active');
  step.classList.add('error');
}

// 修正データを送信
async function submitCorrectionData() {
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  // バリデーション
  const categoryInput = document.getElementById('category');
  if (!categoryInput.value) {
    alert('カテゴリーを選択してください');
    return;
  }

  // ボタンを無効化
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = '送信中...';

  try {
    // ステップ1: データ検証
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
      sendType: "CORRECTION"
    };

    // バリデーション
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

    console.log('修正データ送信:', data);

    // ステップ2: データ送信
    showProgressStep('step-sending');
    await delay(500);

    // Google Apps Scriptにデータを送信
    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    // ステップ3: データ挿入
    showProgressStep('step-inserting');
    await delay(1000);

    // ステップ4: バックアップ
    showProgressStep('step-backup');
    await delay(500);

    // ステップ5: 完了
    showProgressStep('step-complete');
    await delay(500);

    // 成功メッセージ表示
    const successMessage = document.getElementById('successMessage');
    successMessage.textContent = '✅ 修正データの送信が完了しました！';
    successMessage.classList.add('show');
    
    setTimeout(() => {
      successMessage.classList.remove('show');
    }, 3000);

    // フォームリセット
    document.getElementById('correctionForm').reset();
    const categoryOptions = document.querySelectorAll('.category-option');
    categoryOptions.forEach(opt => opt.classList.remove('selected'));
    
    // プログレス非表示
    setTimeout(() => {
      hideProgress();
    }, 2000);
    
    // 3秒後に元のページに戻る
    setTimeout(() => {
      if (document.referrer) {
        history.back();
      } else {
        // パスを動的に決定
        const currentPath = window.location.pathname;
        if (currentPath.includes('/data/')) {
          window.location.href = '../data/marugo.html';
        } else {
          window.location.href = 'data/marugo.html';
        }
      }
    }, 3000);

  } catch (error) {
    console.error('送信エラー:', error);
    
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
      // 無効化されたオプションはクリックできない
      if (option.classList.contains('disabled')) {
        return;
      }
      
      categoryOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      categoryInput.value = option.dataset.value;
    });
  });

  // 金額入力の自動フォーマット（半角・全角対応）
  const amountInput = document.getElementById('amount');
  amountInput.addEventListener('input', (e) => {
    let value = e.target.value;
    
    // 全角数字を半角数字に変換
    value = value.replace(/[０-９]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
    
    // 数字以外を除去
    value = value.replace(/[^0-9]/g, '');
    
    // カンマ区切りでフォーマット
    if (value) {
      value = parseInt(value).toLocaleString('ja-JP');
    }
    
    e.target.value = value;
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
    console.log('現在のパス:', currentPath);
    
    // パスに応じて戻るボタンのリンクを調整
    if (currentPath.includes('/data/')) {
      // correction.htmlがdataフォルダと同じ階層にある場合
      backBtn.href = 'data/marugo.html';
    } else if (currentPath.includes('data/')) {
      // correction.htmlがdataフォルダ内にある場合
      backBtn.href = 'marugo.html';
    } else {
      // correction.htmlがルートディレクトリにある場合
      backBtn.href = 'data/marugo.html';
    }
    
    console.log('戻るボタンのリンク:', backBtn.href);
  }
}

// 初期化処理
function initialize() {
  console.log('=== correction.html 初期化開始 ===');
  
  // メッセージを非表示
  hideMessages();
  
  // 戻るボタンのパスを修正
  fixBackButtonPath();
  
  // 店舗プルダウンを設定
  populateShops();
  
  // DOM要素を初期化
  initializeElements();
  
  // 元データを読み込み
  if (loadOriginalData()) {
    console.log('データ読み込み成功 - 表示処理開始');
    displayOriginalData();
    autoFillReverseData();
    
    // エラー通知を非表示
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) {
      errorNotice.style.display = 'none';
    }
  } else {
    // 元データが無い場合はエラー表示
    console.error('データ読み込み失敗');
    
    const errorNotice = document.getElementById('error-notice');
    if (errorNotice) {
      errorNotice.classList.add('show');
    }
    
    // フォームを非表示
    const form = document.getElementById('correctionForm');
    const originalDataSection = document.getElementById('original-data-section');
    if (form) form.style.display = 'none';
    if (originalDataSection) originalDataSection.style.display = 'none';
    
    // デバッグ情報をコンソールに出力
    console.log('デバッグ情報:');
    console.log('- 現在のURL:', window.location.href);
    console.log('- Referrer:', document.referrer);
    console.log('- sessionStorage keys:', Object.keys(sessionStorage));
    console.log('- localStorage keys:', Object.keys(localStorage));
    
    // 3秒後に元のページに戻る
    setTimeout(() => {
      if (document.referrer) {
        console.log('Referrerから戻る:', document.referrer);
        history.back();
      } else {
        // フォールバックパス
        const currentPath = window.location.pathname;
        let redirectPath;
        
        if (currentPath.includes('/data/')) {
          redirectPath = 'data/marugo.html';
        } else {
          redirectPath = 'data/marugo.html';
        }
        
        console.log('フォールバックリダイレクト:', redirectPath);
        window.location.href = redirectPath;
      }
    }, 3000);
  }
  
  console.log('=== correction.html 初期化完了 ===');
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
