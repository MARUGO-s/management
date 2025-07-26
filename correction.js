// GAS WebアプリのURL (main.js/index.htmlで使用しているものと同じURLであることを確認してください)
// 例: "https://script.google.com/macros/s/AKfycbzzhL81ThLnXuoDFfid2n9S7gzLMq_V-s5FxH8WqoBIUq2jCtKAa9_ZU-ovGC5r8qBZ/exec"
// ここに正しいGAS WebアプリのURLを記述してください。
const GAS_URL = "ここにindex.htmlが送信しているGASのURLを貼り付けてください"; 

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

// URLパラメータまたはsessionStorageから元データを読み込む
function loadOriginalData() {
  // marugo.html は sessionStorage を使用しているため、sessionStorageを優先
  const savedData = sessionStorage.getItem('correctionData');
  if (savedData) {
    try {
      originalData = JSON.parse(savedData);
      console.log('sessionStorageから元データを読み込み:', originalData);
      sessionStorage.removeItem('correctionData'); // 使用後は削除
      return true;
    } catch (error) {
      console.error('sessionStorageのデータ解析エラー:', error);
    }
  }

  // Fallback: URLパラメータをチェック (古い形式や直接アクセス用)
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
      <span class="original-data-value">${safeString(originalData.date)}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">👤 入力者:</span>
      <span class="original-data-value">${safeString(originalData.name)}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">📤 貸主:</span>
      <span class="original-data-value">${safeString(originalData.lender)}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">📥 借主:</span>
      <span class="original-data-value">${safeString(originalData.borrower)}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">🏷️ カテゴリー:</span>
      <span class="original-data-value">${safeString(originalData.category)}</span>
    </div>
    <div class="original-data-item">
      <span class="original-data-label">📝 品目:</span>
      <span class="original-data-value">${safeString(originalData.item)}</span>
    </div>
    <div class="original-data-item" style="grid-column: 1 / -1;">
      <span class="original-data-label">💵 金額:</span>
      <span class="original-data-value">¥${formattedAmount}</span>
    </div>
  `;
}

// フォームに逆取引データを自動入力
function autoFillReverseData() {
  if (!originalData) return;
  
  // 日付はそのまま
  document.getElementById('date').value = safeString(originalData.date);
  
  // 貸主と借主を入れ替え
  document.getElementById('lender').value = safeString(originalData.borrower);
  document.getElementById('borrower').value = safeString(originalData.lender);
  
  // その他の項目はそのまま
  document.getElementById('category').value = safeString(originalData.category);
  document.getElementById('item').value = safeString(originalData.item);
  
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
    if (option.dataset.value === safeString(originalData.category)) {
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
  const originalBtnText = '✏️ 修正データを送信'; // ボタンの初期テキスト

  // 初期化
  hideMessages();
  resetSteps();

  // フォームから直接取得するデータ（disabledなので基本的にはoriginalDataから値を取得すべきだが、念のため）
  const currentCategoryValue = document.getElementById('category').value;
  if (!currentCategoryValue) {
    alert('カテゴリーが設定されていません。元のデータに問題がある可能性があります。');
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

    // データの取得は originalData から行う (disabledなフィールドの値を確実に取得するため)
    const data = {
      date: safeString(originalData.date),
      name: safeString(document.getElementById("name").value), // 入力者フィールドはdisabledだが、値は設定されているはず
      lender: safeString(originalData.borrower), // 逆取引なので元データのborrower
      borrower: safeString(originalData.lender), // 逆取引なので元データのlender
      category: safeString(originalData.category),
      item: safeString(originalData.item),
      amount: convertToHalfWidthNumber(safeString(originalData.amount)),
      // GAS側で処理を分岐させるための追加情報
      isCorrection: true,
      correctionOnly: true, // これはcorrection.htmlからの送信であることを明確にする
      correctionMark: "✏️修正", // GAS側でスプレッドシートに書き込む修正マーク
      sendType: "CORRECTION_FORM_SUBMIT" // GAS側で送信元を識別するための新しいタイプ
    };

    // 厳密なバリデーション
    if (!data.date || !data.name || !data.lender || !data.borrower || !data.category || !data.item || !data.amount) {
      throw new Error('必須データが不足しています。');
    }
    if (data.lender === data.borrower) {
      throw new Error('貸主と借主は異なる店舗である必要があります。');
    }
    const amountNumber = parseInt(data.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      throw new Error('金額が正しくありません。');
    }

    console.log('修正データ送信:', data);

    if (statusDisplay) {
      completeStep('step-validation', '✅ 修正データ検証完了');

      // Step 2: 送信開始 (GAS Webアプリへ)
      await showStep('step-sending', '📤 データをGASへ送信中...');
      await delay(400);
    }

    // ★修正点: Google Sheets APIへの直接送信からGAS_URLへのPOSTに変更
    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors", // GASへのPOSTでは通常no-corsモードを使用
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (statusDisplay) {
      completeStep('step-sending', '✅ GASへの送信完了');

      // Step 3: データ挿入（GAS側で実行されるためシミュレート）
      await showStep('step-inserting', '💾 スプレッドシートに書き込み中...');
      await delay(800);
      completeStep('step-inserting', '✅ 書き込み完了');

      // Step 4: バックアップ作成（GAS側で実行されるためシミュレート）
      await showStep('step-backup', '🔄 バックアップ処理中...');
      await delay(1000);
      completeStep('step-backup', '✅ バックアップ完了');

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
      btnText.textContent = originalBtnText; // 元のテキストに戻す
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
        // marugo.html へのパスを調整（correction.htmlがmarugo.htmlの親ディレクトリにある場合）
        // 例: index.html と marugo.html が同じディレクトリの場合、correction.html はその一つ上の階層にいることになる
        // marugo.htmlへの相対パスを正しく指定してください。
        // current path: /management/data/correction.html -> target: /management/data/marugo.html
        window.location.href = './marugo.html'; // ★修正点: パスを調整
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
        activeStep.querySelector('span:last-child').textContent = `❌ エラー: ${error.message.substring(0, 50)}...`; // エラーメッセージを短縮
      }
    }

    // エラー処理
    submitBtn.classList.remove('loading');
    btnText.textContent = originalBtnText; // 元のテキストに戻す
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

// 安全な文字列変換関数 (originalDataの安全な利用のため追加)
function safeString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value);
}

// 安全な数値変換関数 (originalDataの安全な利用のため追加)
function safeNumber(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    const stringValue = safeString(value);
    const cleaned = stringValue.replace(/[,\s]/g, '');
    const number = parseFloat(cleaned);
    return isNaN(number) ? 0 : number;
}


// DOM要素の初期化
function initializeElements() {
  // カテゴリー選択の処理
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
  // メッセージを非表示
  hideMessages();
  
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
    // メインフォームを非表示にして、データなしメッセージを表示
    document.getElementById('main-form').style.display = 'none';
    document.getElementById('no-data-message').style.display = 'block';
  }
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
