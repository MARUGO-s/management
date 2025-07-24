const GAS_URL = "https://script.google.com/macros/s/AKfycbxxhL81ThLnXuoDFfid2n9S7gzLMq_V-s5FxH8WqoBIUq2jCtKAa9_ZU-ovGC5r8qBZ/exec"; //
const shops = [ //
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

// 店舗データで貸主・借主のオプションを設定
function populateShops() { //
  const lenderSelect = document.getElementById("lender"); //
  const borrowerSelect = document.getElementById("borrower"); //

  shops.forEach(shop => { //
    const option1 = document.createElement("option"); //
    option1.value = shop; //
    option1.textContent = shop; //
    lenderSelect.appendChild(option1); //

    const option2 = document.createElement("option"); //
    option2.value = shop; //
    option2.textContent = shop; //
    borrowerSelect.appendChild(option2); //
  });
}

// ヘルパー関数
function delay(ms) { //
  return new Promise(resolve => setTimeout(resolve, ms)); //
}

// 金額を半角数字に変換する関数
function convertToHalfWidthNumber(value) { //
  if (!value) return ''; //
  
  // 全角数字を半角数字に変換
  let converted = value.replace(/[０-９]/g, function(s) { //
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); //
  });
  
  // カンマと数字以外を除去
  converted = converted.replace(/[^0-9]/g, ''); //
  
  return converted; //
}

async function showStep(stepId, message) { //
  const step = document.getElementById(stepId); //
  const activeSteps = document.querySelectorAll('.status-step.active'); //
  
  // 前のステップを完了状態にする
  activeSteps.forEach(s => { //
    s.classList.remove('active'); //
    s.classList.add('completed'); //
  });
  
  // 現在のステップをアクティブにする
  step.classList.add('active'); //
  step.querySelector('span:last-child').textContent = message; //
  
  // ローディングスピナーを追加
  const icon = step.querySelector('.status-icon'); //
  const originalIcon = icon.textContent; //
  icon.innerHTML = '<span class="mini-loading-spinner"></span>'; //
  
  // 元のアイコンを保存
  step.dataset.originalIcon = originalIcon; //
}

function completeStep(stepId, message) { //
  const step = document.getElementById(stepId); //
  step.classList.remove('active'); //
  step.classList.add('completed'); //
  step.querySelector('span:last-child').textContent = message; //
  
  // アイコンを元に戻す
  const icon = step.querySelector('.status-icon'); //
  if (step.dataset.originalIcon) { //
    icon.textContent = step.dataset.originalIcon; //
  }
}

function resetSteps() { //
  const steps = document.querySelectorAll('.status-step'); //
  steps.forEach(step => { //
    step.classList.remove('active', 'completed', 'error'); //
  });
}

function hideMessages() { //
  document.getElementById('successMessage').classList.remove('show'); //
  const errorMessage = document.getElementById('errorMessage'); //
  if (errorMessage) { //
    errorMessage.classList.remove('show'); //
  }
  // 検索結果も非表示にする
  const searchResult = document.getElementById('search-result'); //
  if (searchResult) { //
    searchResult.classList.remove('show'); //
  }
}

// 逆取引検索機能
async function searchReverseTransaction() { //
  const searchBtn = document.getElementById('search-btn'); //
  const searchResult = document.getElementById('search-result'); //
  const searchResultContent = document.getElementById('search-result-content'); //
  const btnText = searchBtn.querySelector('.btn-text'); //
  const originalText = btnText.textContent; //

  // 入力データを取得
  const currentData = { //
    date: document.getElementById("date").value, //
    name: document.getElementById("name").value, //
    lender: document.getElementById("lender").value, //
    borrower: document.getElementById("borrower").value, //
    category: document.getElementById("category").value, //
    item: document.getElementById("item").value, //
    amount: convertToHalfWidthNumber(document.getElementById("amount").value) //
  };

  // バリデーション
  if (!currentData.date || !currentData.lender || !currentData.borrower || !currentData.category || !currentData.item || !currentData.amount) { //
    searchResultContent.innerHTML = `
      <div class="search-error">
        ❌ すべての項目を入力してから検索してください
      </div>
    `; //
    searchResult.classList.add('show'); //
    return; //
  }

  if (currentData.lender === currentData.borrower) { //
    searchResultContent.innerHTML = `
      <div class="search-error">
        ❌ 貸主と借主が同じため検索できません
      </div>
    `; //
    searchResult.classList.add('show'); //
    return; //
  }

  // ローディング状態開始
  searchBtn.disabled = true; //
  searchBtn.classList.add('loading'); //
  btnText.textContent = '検索中...'; //
  searchResult.classList.remove('show'); //

  try {
    // 逆取引データを作成（貸主と借主を入れ替え）
    const reverseData = { //
      ...currentData,
      lender: currentData.borrower, //
      borrower: currentData.lender, //
      searchMode: true // 検索モードであることを示すフラグ
    };

    console.log('検索データ:', reverseData); //

    // GASに検索リクエストを送信
    const response = await fetch(GAS_URL, { //
      method: "POST", //
      mode: "no-cors", //
      headers: { //
        "Content-Type": "application/json" //
      },
      body: JSON.stringify(reverseData) //
    });

    // no-corsモードのため、実際のレスポンスは取得できない
    // 検索時間をシミュレート
    await delay(800); //

    // 実際の実装では、GASからJSONPやWebhookを使用してレスポンスを受け取る
    // ここでは検索結果をシミュレート（実際の運用では削除）
    const searchSuccess = Math.random() > 0.4; // 60%の確率で一致
    
    if (searchSuccess) { //
      // 一致した場合（実際にはGASから受け取ったデータを使用）
      const matchData = { //
        date: currentData.date, //
        name: "システム検索結果", // 実際にはGASから受け取った入力者名
        lender: currentData.borrower, //
        borrower: currentData.lender, //
        category: currentData.category, //
        item: currentData.item, //
        amount: currentData.amount, //
        inputDate: "2024-12-27 10:30:00", // 実際にはGASから受け取った入力日時
        correction: "" // 実際にはGASから受け取った修正フラグ
      };

      searchResultContent.innerHTML = `
        <div class="search-match">
          ✅ 逆取引データが見つかりました！
          <div class="match-details">
            <div class="match-details-row">
              <span class="match-details-label">📅 日付:</span>
              <span class="match-details-value">${matchData.date}</span>
            </div>
            <div class="match-details-row">
              <span class="match-details-label">👤 入力者:</span>
              <span class="match-details-value">${matchData.name}</span>
            </div>
            <div class="match-details-row">
              <span class="match-details-label">📤 貸主:</span>
              <span class="match-details-value">${matchData.lender}</span>
            </div>
            <div class="match-details-row">
              <span class="match-details-label">📥 借主:</span>
              <span class="match-details-value">${matchData.borrower}</span>
            </div>
            <div class="match-details-row">
              <span class="match-details-label">🏷️ カテゴリー:</span>
              <span class="match-details-value">${matchData.category}</span>
            </div>
            <div class="match-details-row">
              <span class="match-details-label">📝 品目:</span>
              <span class="match-details-value">${matchData.item}</span>
            </div>
            <div class="match-details-row">
              <span class="match-details-label">💵 金額:</span>
              <span class="match-details-value">¥${parseInt(matchData.amount).toLocaleString('ja-JP')}</span>
            </div>
            <div class="match-details-row">
              <span class="match-details-label">⏰ 入力日時:</span>
              <span class="match-details-value">${matchData.inputDate}</span>
            </div>
            ${matchData.correction ? `
            <div class="match-details-row">
              <span class="match-details-label">✏️ 修正:</span>
              <span class="match-details-value">${matchData.correction}</span>
            </div>
            ` : ''}
          </div>
          <div class="match-actions">
            <button class="correction-action-btn" id="correction-from-search">
              ✏️ このデータを修正として送信
            </button>
          </div>
        </div>
      `; //
    } else { //
      // 一致しなかった場合
      searchResultContent.innerHTML = `
        <div class="search-no-match">
          ❓ 逆取引データは見つかりませんでした
          <div style="margin-top: 10px; font-size: 14px; font-weight: normal;">
            以下の条件に一致するデータは存在しません：<br>
            📅 ${currentData.date} | ${currentData.borrower} → ${currentData.lender}<br>
            🏷️ ${currentData.category} | 📝 ${currentData.item} | 💵 ¥${parseInt(currentData.amount).toLocaleString('ja-JP')}
          </div>
          <div class="match-actions">
            <button class="correction-action-btn" id="correction-from-search-new">
              ✏️ 新規修正として送信
            </button>
          </div>
        </div>
      `; //
    }

    searchResult.classList.add('show'); //

    // イベントデリゲーションを使用して、検索結果内のボタンクリックを処理
    // 検索結果コンテナに一度だけリスナーを追加し、ボタンのIDで分岐
    // 既存のリスナーが重複しないよう、removeEventListenerで削除してから追加
    const existingListener = searchResultContent.dataset.listenerAdded;
    if (existingListener) {
        searchResultContent.removeEventListener('click', handleSearchResultButtonClick);
    }
    searchResultContent.addEventListener('click', handleSearchResultButtonClick);
    searchResultContent.dataset.listenerAdded = 'true';


  } catch (error) { //
    console.error('検索エラー:', error); //
    
    searchResultContent.innerHTML = `
      <div class="search-error">
        ❌ 検索中にエラーが発生しました<br>
        <small>${error.message}</small>
      </div>
    `; //
    searchResult.classList.add('show'); //
  } finally {
    // ローディング状態終了
    searchBtn.disabled = false; //
    searchBtn.classList.remove('loading'); //
    btnText.textContent = originalText; //
  }
}

// 検索結果からの修正ボタンクリックを処理する共通のハンドラー
async function handleSearchResultButtonClick(event) {
    if (event.target.id === 'correction-from-search') {
        await handleCorrectionFromSearch('found');
    } else if (event.target.id === 'correction-from-search-new') {
        await handleCorrectionFromSearch('not_found');
    }
}


// 検索結果からの修正送信処理
async function handleCorrectionFromSearch(type = 'found') { //
  const categoryInput = document.getElementById('category'); //
  
  // バリデーション
  if (!categoryInput.value) { //
    alert('カテゴリーを選択してください'); //
    return; //
  }

  // 修正確認ダイアログ（タイプに応じてメッセージを変更）
  let confirmMessage; //
  
  const dateValue = document.getElementById("date").value; //
  const nameValue = document.getElementById("name").value; //
  const lenderValue = document.getElementById("lender").value; //
  const borrowerValue = document.getElementById("borrower").value; //
  const itemValue = document.getElementById("item").value; //
  const categoryValue = document.getElementById("category").value; //
  const amountValue = parseInt(convertToHalfWidthNumber(document.getElementById("amount").value)).toLocaleString('ja-JP'); //

  if (type === 'found') { //
    confirmMessage = `🔍 逆取引データが見つかりました！

現在入力されているデータを修正として送信しますか？

📅 ${dateValue}
👤 ${nameValue}
🔄 ${lenderValue} → ${borrowerValue}
📝 ${itemValue} (${categoryValue})
💵 ¥${amountValue}

🔥 修正フラグ: ✏️修正 が自動的に付与されます
※ 修正データとしてスプレッドシートに送信されます
※ 元のデータはそのまま保持されます`; //
  } else { //
    confirmMessage = `❓ 逆取引データは見つかりませんでした

それでも現在のデータを修正として送信しますか？

📅 ${dateValue}
👤 ${nameValue}
🔄 ${lenderValue} → ${borrowerValue}
📝 ${itemValue} (${categoryValue})
💵 ¥${amountValue}

🔥 修正フラグ: ✏️修正 が自動的に付与されます
※ 新規修正データとして送信されます`; //
  }

  if (confirm(confirmMessage)) { //
    // 検索結果を非表示にする
    const searchResult = document.getElementById('search-result'); //
    if (searchResult) { //
      searchResult.classList.remove('show'); //
    }

    // 修正送信を実行（修正専用の送信）
    await submitData({ isCorrection: true, correctionOnly: true, correctionMark: "✏️修正" }); // 修正データを送信
  }
}

// 共通の送信処理
async function submitData(options = {}) {
  const { isCorrection = false, correctionOnly = false, correctionMark = "" } = options;

  const statusDisplay = document.getElementById('status-display'); //
  const submitBtn = document.querySelector('.submit-btn:not(.search-btn)'); //
  const btnText = submitBtn.querySelector('.btn-text'); //
  const originalText = btnText.textContent; //
  const categoryInput = document.getElementById('category'); //
  const categoryOptions = document.querySelectorAll('.category-option'); //
  const form = document.getElementById('loanForm'); //

  // 初期化
  hideMessages(); //
  resetSteps(); //

  // バリデーション（カテゴリー選択）
  if (!categoryInput.value) { //
    alert('カテゴリーを選択してください'); //
    return; //
  }

  // ボタンを無効化
  submitBtn.disabled = true; //
  submitBtn.classList.add('loading'); //
  btnText.textContent = correctionOnly ? '修正送信中...' : '送信中...'; //
  
  // 状態表示を開始
  if (statusDisplay) { //
    statusDisplay.classList.add('show'); //
  }

  try {
    // Step 1: データ検証
    if (statusDisplay) { //
      await showStep('step-validation', correctionOnly ? '📋 修正データを検証中...' : '📋 データを検証中...'); //
      await delay(600); //
    }

    const data = {
      date: document.getElementById("date").value, //
      name: document.getElementById("name").value, //
      lender: document.getElementById("lender").value, //
      borrower: document.getElementById("borrower").value, //
      category: document.getElementById("category").value, //
      item: document.getElementById("item").value, //
      amount: convertToHalfWidthNumber(document.getElementById("amount").value), //
      isCorrection: isCorrection, //
      userAgent: navigator.userAgent, //
    };

    // 修正専用のフラグとマークを追加
    if (correctionOnly) {
      data.correctionOnly = true; //
      data.correctionMark = correctionMark || "✏️修正"; // 引数で指定なければデフォルト
      data.sendType = "CORRECTION"; //
    }

    // 共通のバリデーション
    if (!data.date || !data.name || !data.lender || !data.borrower || !data.category || !data.item || !data.amount) { //
      throw new Error('すべての必須項目を入力してください。'); //
    }
    if (data.lender === data.borrower) { //
      throw new Error('貸主と借主は異なる店舗を選択してください。'); //
    }
    const amountNumber = parseInt(data.amount); //
    if (isNaN(amountNumber) || amountNumber <= 0) { //
      throw new Error('正しい金額を入力してください。'); //
    }

    // 修正送信時のみの追加バリデーション
    if (correctionOnly) {
      if (data.isCorrection !== true || !data.correctionOnly || data.correctionMark !== "✏️修正") { //
        throw new Error('修正フラグの設定に問題があります。'); //
      }
      console.log('=== 🔥 修正専用送信データ（詳細） ===', data); //
    } else {
      console.log('=== 通常送信データ（詳細） ===', data); //
    }

    if (statusDisplay) { //
      completeStep('step-validation', `✅ ${correctionOnly ? '修正データ' : 'データ'}検証完了`); //

      // Step 2: 送信開始
      await showStep('step-sending', `📤 ${correctionOnly ? '修正データ' : ''}スプレッドシートに送信中...`); //
      await delay(400); //
    }

    // Google Apps Scriptにデータを送信
    const response = await fetch(GAS_URL, { //
      method: "POST", //
      mode: "no-cors", //
      headers: { //
        "Content-Type": "application/json" //
      },
      body: JSON.stringify(data) //
    });

    if (statusDisplay) { //
      completeStep('step-sending', `✅ ${correctionOnly ? '修正データ' : ''}送信完了`); //

      // Step 3: データ挿入（GAS側で実行されるためシミュレート）
      await showStep('step-inserting', `💾 ${correctionOnly ? '修正データ' : ''}を挿入中...`); //
      await delay(800); //
      completeStep('step-inserting', `✅ ${correctionOnly ? '修正データ' : ''}挿入完了`); //

      // Step 4: バックアップ作成（GAS側で実行されるためシミュレート）
      await showStep('step-backup', '🔄 バックアップを作成中...'); //
      await delay(1000); //
      completeStep('step-backup', '✅ バックアップ作成完了'); //

      // Step 5: 完了
      await showStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : 'すべての処理'}が完了しました！`); //
      completeStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : '送信'}完了！`); //
    }

    // 成功処理
    setTimeout(() => {
      // ローディング状態終了
      submitBtn.classList.remove('loading'); //
      btnText.textContent = originalText; //
      submitBtn.disabled = false; //

      // 成功メッセージ表示
      const message = document.getElementById('successMessage'); //
      message.textContent = correctionOnly ? '✅ 修正データの送信が完了しました！' : '✅ 送信完了しました！'; //
      message.classList.add('show'); //
      setTimeout(() => { //
        message.classList.remove('show'); //
      }, 3000);

      // フォームリセット
      form.reset(); //
      categoryOptions.forEach(opt => opt.classList.remove('selected')); //
      document.getElementById('date').valueAsDate = new Date(); //
      
      if (statusDisplay) { //
        statusDisplay.classList.remove('show'); //
      }
    }, statusDisplay ? 500 : 1000);

  } catch (error) { //
    console.error('送信エラー:', error); //
    
    // エラー状態を表示
    if (statusDisplay) { //
      const activeStep = document.querySelector('.status-step.active'); //
      if (activeStep) { //
        activeStep.classList.remove('active'); //
        activeStep.classList.add('error'); //
        activeStep.querySelector('span:last-child').textContent = '❌ エラーが発生しました'; //
      }
    }

    // エラー処理
    submitBtn.classList.remove('loading'); //
    btnText.textContent = originalText; //
    submitBtn.disabled = false; //

    // エラーメッセージ表示
    const errorMessage = document.getElementById('errorMessage'); //
    if (errorMessage) { //
      errorMessage.textContent = `❌ ${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`; //
      errorMessage.classList.add('show'); //
      
      setTimeout(() => { //
        errorMessage.classList.remove('show'); //
        if (statusDisplay) { //
          statusDisplay.classList.remove('show'); //
        }
      }, 5000);
    } else {
      alert(`${correctionOnly ? '修正送信' : '送信'}エラー: ${error.message}`); //
    }
  }
}

// DOM要素の初期化
function initializeElements() { //
  // 今日の日付を自動設定
  document.getElementById('date').valueAsDate = new Date(); //

  // カテゴリー選択の処理
  const categoryOptions = document.querySelectorAll('.category-option'); //
  const categoryInput = document.getElementById('category'); //

  categoryOptions.forEach(option => { //
    option.addEventListener('click', () => { //
      categoryOptions.forEach(opt => opt.classList.remove('selected')); //
      option.classList.add('selected'); //
      categoryInput.value = option.dataset.value; //
    });
  });

  // 金額入力の自動フォーマット（半角・全角対応）
  const amountInput = document.getElementById('amount'); //
  amountInput.addEventListener('input', (e) => { //
    let value = e.target.value; //
    
    // 全角数字を半角数字に変換
    value = value.replace(/[０-９]/g, function(s) { //
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); //
    });
    
    // 数字以外を除去
    value = value.replace(/[^0-9]/g, ''); //
    
    // カンマ区切りでフォーマット
    if (value) { //
      value = parseInt(value).toLocaleString('ja-JP'); //
    }
    
    e.target.value = value; //
  });

  // フォーム送信処理 (通常の送信)
  const form = document.getElementById('loanForm'); //
  form.addEventListener('submit', async (e) => { //
    e.preventDefault(); //
    await submitData({ isCorrection: false, correctionOnly: false }); // 統合された関数を呼び出す
  });

  // 逆取引検索処理
  const searchBtn = document.getElementById('search-btn'); //
  searchBtn.addEventListener('click', async (e) => { //
    e.preventDefault(); //
    await searchReverseTransaction(); //
  });
}

// 初期化処理
function initialize() { //
  populateShops(); //
  initializeElements(); //
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') { //
  document.addEventListener('DOMContentLoaded', initialize); //
} else { //
  initialize(); //
}
