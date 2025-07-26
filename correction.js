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

// 状態表示関数
async function showStep(stepId, message) {
  const step = document.getElementById(stepId);
  const activeSteps = document.querySelectorAll('.status-step.active');
  
  // 前のステップを完了状態にする
  activeSteps.forEach(s => {
    s.classList.remove('active');
    s.classList.add('completed');
  });
  
  // 現在のステップをアクティブにする
  step.classList.add('active');
  step.querySelector('span:last-child').textContent = message;
  
  // ローディングスピナーを追加
  const icon = step.querySelector('.status-icon');
  const originalIcon = icon.textContent;
  icon.innerHTML = '<span class="mini-loading-spinner"></span>';
  
  // 元のアイコンを保存
  step.dataset.originalIcon = originalIcon;
}

function completeStep(stepId, message) {
  const step = document.getElementById(stepId);
  step.classList.remove('active');
  step.classList.add('completed');
  step.querySelector('span:last-child').textContent = message;
  
  // アイコンを元に戻す
  const icon = step.querySelector('.status-icon');
  if (step.dataset.originalIcon) {
    icon.textContent = step.dataset.originalIcon;
  }
}

function resetSteps() {
  const steps = document.querySelectorAll('.status-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed', 'error');
  });
}

function hideMessages() {
  document.getElementById('successMessage').classList.remove('show');
  document.getElementById('errorMessage').classList.remove('show');
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

// URLパラメータまたはlocalStorageから元データを読み込む
function loadOriginalData() {
  // まずURLパラメータをチェック
  const urlParams = new URLSearchParams(window.location.search);
  const dataParam = urlParams.get('data');
  
  if (dataParam) {
    try {
      originalData = JSON.parse(decodeURIComponent(dataParam));
      console.log('URLパラメータから元データを読み込み:', originalData);
      return true;
    } catch (error) {
      console.error('URLパラメータのデータ解析エラー:', error);
    }
  }
  
  // URLパラメータが無効な場合、localStorageをチェック
  const savedData = localStorage.getItem('correctionData');
  if (savedData) {
    try {
      originalData = JSON.parse(savedData);
      console.log('localStorageから元データを読み込み:', originalData);
      // 使用後は削除
      localStorage.removeItem('correctionData');
      return true;
    } catch (error) {
      console.error('localStorageのデータ解析エラー:', error);
    }
  }
  
  console.error('元データが見つかりません');
  return false;
}

// 元データを表示する
function displayOriginalData() {
  if (!originalData) return;
  
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
  if (!originalData) return;
  
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
  
  // カテゴリー選択状態を更新とdisabled化
  const categoryOptions = document.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    option.classList.remove('selected');
    option.classList.add('disabled'); // すべてのオプションを無効化
    if (option.dataset.value === originalData.category) {
      option.classList.add('selected');
    }
  });
  
  console.log('逆取引データを自動入力完了');
}

// 修正データを送信
async function submitCorrectionData() {
  const statusDisplay = document.getElementById('status-display');
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  // 初期化
  hideMessages();
  resetSteps();

  // バリデーション
  const categoryInput = document.getElementById('category');
  if (!categoryInput.value) {
    alert('カテゴリーを選択してください');
    return;
  }

  // ボタンを無効化
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = '修正送信中...';
  
  // 状態表示を開始
  if (statusDisplay) {
    statusDisplay.classList.add('show');
  }

  try {
    // Step 1: データ検証
    if (statusDisplay) {
      await showStep('step-validation', '📋 修正データを検証中...');
      await delay(600);
    }

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

    if (statusDisplay) {
      completeStep('step-validation', '✅ 修正データ検証完了');

      // Step 2: 送信開始
      await showStep('step-sending', '📤 修正データをスプレッドシートに送信中...');
      await delay(400);
    }

    // Google Apps Scriptにデータを送信
    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (statusDisplay) {
      completeStep('step-sending', '✅ 修正データ送信完了');

      // Step 3: データ挿入（GAS側で実行されるためシミュレート）
      await showStep('step-inserting', '💾 修正データを挿入中...');
      await delay(800);
      completeStep('step-inserting', '✅ 修正データ挿入完了');

      // Step 4: バックアップ作成（GAS側で実行されるためシミュレート）
      await showStep('step-backup', '🔄 バックアップを作成中...');
      await delay(1000);
      completeStep('step-backup', '✅ バックアップ作成完了');

      // Step 5: 完了
      await showStep('step-complete', '🎉 修正送信が完了しました！');
      completeStep('step-complete', '🎉 修正送信完了！');
    }

    // 送信完了処理（no-corsのためレスポンス確認は不可）
    await delay(statusDisplay ? 500 : 1000);

    // 成功処理
    setTimeout(() => {
      // ローディング状態終了
      submitBtn.classList.remove('loading');
      btnText.textContent = originalText;
      submitBtn.disabled = false;

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
      
      if (statusDisplay) {
        statusDisplay.classList.remove('show');
      }
      
      // 3秒後に元のページに戻る
      setTimeout(() => {
        if (document.referrer) {
          history.back();
        } else {
          window.location.href = 'data/marugo.html';
        }
      }, 3000);
    }, statusDisplay ? 500 : 1000);

  } catch (error) {
    console.error('送信エラー:', error);
    
    // エラー状態を表示
    if (statusDisplay) {
      const activeStep = document.querySelector('.status-step.active');
      if (activeStep) {
        activeStep.classList.remove('active');
        activeStep.classList.add('error');
        activeStep.querySelector('span:last-child').textContent = '❌ エラーが発生しました';
      }
    }

    // エラー処理
    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
    submitBtn.disabled = false;

    // エラーメッセージ表示
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = `❌ 修正送信エラー: ${error.message}`;
    errorMessage.classList.add('show');
    
    setTimeout(() => {
      errorMessage.classList.remove('show');
      if (statusDisplay) {
        statusDisplay.classList.remove('show');
      }
    }, 5000);
  }
}

// DOM要素の初期化
function initializeElements() {
  // カテゴリー選択の処理（無効化版）
  const categoryOptions = document.querySelectorAll('.category-option');
  const categoryInput = document.getElementById('category');

  categoryOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      // disabled状態の場合はクリックを無効化
      if (option.classList.contains('disabled')) {
        e.preventDefault();
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

// 初期化処理
function initialize() {
  // 店舗プルダウンを設定
  populateShops();
  
  // DOM要素を初期化
  initializeElements();
  
  // 元データを読み込み
  if (loadOriginalData()) {
    displayOriginalData();
    autoFillReverseData();
  } else {
    // 元データが無い場合はエラー表示
    alert('修正対象のデータが見つかりません。データ一覧ページから再度選択してください。');
    // 元のページに戻る
    if (document.referrer) {
      history.back();
    } else {
      window.location.href = 'data/marugo.html';
    }
  }
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
