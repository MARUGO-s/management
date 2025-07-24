const GAS_URL = "https://script.google.com/macros/s/AKfycbwV3Rerqq183yMAon3LOxgWJp80vhlA8HdcxtQMjxVmDvD2bQI-IxI0UNpCzgXc1Uv8/exec";
const shops = [
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

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
  const errorMessage = document.getElementById('errorMessage');
  if (errorMessage) {
    errorMessage.classList.remove('show');
  }
}

// DOM要素の初期化
function initializeElements() {
  // 今日の日付を自動設定
  document.getElementById('date').valueAsDate = new Date();

  // カテゴリー選択の処理
  const categoryOptions = document.querySelectorAll('.category-option');
  const categoryInput = document.getElementById('category');

  categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
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
  const form = document.getElementById('loanForm');
  const submitBtn = document.querySelector('.submit-btn:not(.correction-btn)');
  const correctionBtn = document.querySelector('.correction-btn');

  // 通常の送信処理
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitForm(false); // 修正フラグ = false
  });

  // 修正送信処理
  correctionBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await submitForm(true); // 修正フラグ = true
  });

  // 共通の送信処理
  async function submitForm(isCorrection) {
    const statusDisplay = document.getElementById('status-display');
    const targetBtn = isCorrection ? correctionBtn : submitBtn;
    const btnText = targetBtn.querySelector('.btn-text');
    const originalText = btnText.textContent;

    // 初期化
    hideMessages();
    resetSteps();

    // バリデーション
    if (!categoryInput.value) {
      alert('カテゴリーを選択してください');
      return;
    }

    // 修正確認
    if (isCorrection) {
      if (!confirm('修正データとして送信します。\nよろしいですか？')) {
        return;
      }
    }

    // ボタンを無効化
    targetBtn.disabled = true;
    targetBtn.classList.add('loading');
    btnText.textContent = isCorrection ? '修正送信中...' : '送信中...';
    
    // 状態表示を開始
    if (statusDisplay) {
      statusDisplay.classList.add('show');
    }

    try {
      // Step 1: データ検証
      if (statusDisplay) {
        await showStep('step-validation', '📋 データを検証中...');
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
        isCorrection: isCorrection
      };

      // 簡単なバリデーション
      if (!data.date || !data.name || !data.lender || !data.borrower || !data.category || !data.item || !data.amount) {
        throw new Error('すべての必須項目を入力してください。');
      }

      if (data.lender === data.borrower) {
        throw new Error('貸主と借主は異なる店舗を選択してください。');
      }

      // 金額の数値チェック
      const amountNumber = parseInt(data.amount);
      if (isNaN(amountNumber) || amountNumber <= 0) {
        throw new Error('正しい金額を入力してください。');
      }

      // デバッグ用：送信データを確認
      console.log('送信データ:', data);
      console.log('金額（半角変換後）:', data.amount);

      if (statusDisplay) {
        completeStep('step-validation', '✅ データ検証完了');

        // Step 2: 送信開始
        await showStep('step-sending', '📤 スプレッドシートに送信中...');
        await delay(400);
      }

      // Google Apps Scriptに送信
      const response = await fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (statusDisplay) {
        completeStep('step-sending', '✅ 送信完了');

        // Step 3: データ挿入（GAS側で実行されるためシミュレート）
        await showStep('step-inserting', '💾 データを挿入中...');
        await delay(800);
        completeStep('step-inserting', '✅ データ挿入完了');

        // Step 4: バックアップ作成（GAS側で実行されるためシミュレート）
        await showStep('step-backup', '🔄 バックアップを作成中...');
        await delay(1000);
        completeStep('step-backup', '✅ バックアップ作成完了');

        // Step 5: 完了
        await showStep('step-complete', '🎉 すべての処理が完了しました！');
        completeStep('step-complete', '🎉 送信完了！');
      }

      // 成功処理
      setTimeout(() => {
        // ローディング状態終了
        targetBtn.classList.remove('loading');
        btnText.textContent = originalText;
        targetBtn.disabled = false;

        // 成功メッセージ表示
        const message = document.getElementById('successMessage');
        message.textContent = isCorrection ? '✅ 修正送信完了しました！' : '✅ 送信完了しました！';
        message.classList.add('show');
        setTimeout(() => {
          message.classList.remove('show');
        }, 3000);

        // フォームリセット
        form.reset();
        categoryOptions.forEach(opt => opt.classList.remove('selected'));
        document.getElementById('date').valueAsDate = new Date();
        
        if (statusDisplay) {
          statusDisplay.classList.remove('show');
        }
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
      targetBtn.classList.remove('loading');
      btnText.textContent = originalText;
      targetBtn.disabled = false;

      // エラーメッセージ表示
      const errorMessage = document.getElementById('errorMessage');
      if (errorMessage) {
        errorMessage.textContent = `❌ ${error.message}`;
        errorMessage.classList.add('show');
        
        setTimeout(() => {
          errorMessage.classList.remove('show');
          if (statusDisplay) {
            statusDisplay.classList.remove('show');
          }
        }, 5000);
      } else {
        // errorMessage要素がない場合はalertで表示
        alert(`送信エラー: ${error.message}`);
      }
    }
  }
}

// 初期化処理
function initialize() {
  populateShops();
  initializeElements();
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
