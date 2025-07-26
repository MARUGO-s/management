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
  
  // カテゴリー選択状態を更新し、無効化
  const categoryOptions = document.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    option.classList.remove('selected');
    option.classList.add('disabled'); // 無効化
    if (option.dataset.value === originalData.category) {
      option.classList.add('selected');
    }
  });
  
  console.log('逆取引データを自動入力完了');
}

// 修正データを送信
async function submitCorrectionData() {
  const submitBtn = document.querySelector('.submit-btn:not(.cancel-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  // バリデーション (disabledなフィールドは値が取れない場合があるため、originalDataから取得)
  const data = {
    date: originalData.date, // originalDataから取得
    name: document.getElementById("name").value, // 入力者フィールドは変更可能なのでDOMから
    lender: originalData.borrower, // originalDataから取得 (逆取引のため)
    borrower: originalData.lender, // originalDataから取得 (逆取引のため)
    category: originalData.category, // originalDataから取得
    item: originalData.item, // originalDataから取得
    amount: convertToHalfWidthNumber(originalData.amount), // originalDataから取得
    isCorrection: true,
    correctionOnly: true,
    correctionMark: "✏️修正",
    sendType: "CORRECTION"
  };

  // フォーム上の必須項目のチェックはDOM要素のdisabledによって無効化されるが、念のためデータ自体のバリデーションは残す
  if (!data.date || !data.name || !data.lender || !data.borrower || !data.category || !data.item || !data.amount) {
    alert('データが不完全です。元のデータが正しく読み込まれているか確認してください。');
    return;
  }
  if (data.lender === data.borrower) {
    alert('貸主と借主は異なる店舗である必要があります。'); // これは逆取引なので、通常は発生しないはずですが念のため
    return;
  }
  const amountNumber = parseInt(data.amount);
  if (isNaN(amountNumber) || amountNumber <= 0) {
    alert('正しい金額が設定されていません。');
    return;
  }

  // ボタンを無効化
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnText.textContent = '送信中...'; // ここは送信中のまま（段階的な表示はなし）

  try {
    console.log('修正データ送信:', data);

    // Google Apps Scriptにデータを送信
    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    // 送信完了処理（no-corsのためレスポンス確認は不可）
    await delay(1000);

    // 成功メッセージ表示
    const successMessage = document.getElementById('successMessage');
    successMessage.textContent = '✅ 修正データの送信が完了しました！';
    successMessage.classList.add('show');
    
    setTimeout(() => {
      successMessage.classList.remove('show');
    }, 3000);

    // フォームリセット (入力不可になったので実質的には表示をクリアしない)
    
    // 3秒後に元のページに戻る
    setTimeout(() => {
      if (document.referrer) {
        history.back();
      } else {
        window.location.href = 'data/marugo.html';
      }
    }, 3000);

  } catch (error) {
    console.error('送信エラー:', error);
    
    // エラーメッセージ表示
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = `❌ 送信エラー: ${error.message}`;
    errorMessage.classList.add('show');
    
    setTimeout(() => {
      errorMessage.classList.remove('show');
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
  // カテゴリー選択の処理は無効化するため、イベントリスナーは設定しない
  const categoryOptions = document.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    // option.classList.add('disabled'); // autoFillReverseData で disabled に設定されるため、ここでは不要
  });

  // 金額入力の自動フォーマット（半角・全角対応）
  const amountInput = document.getElementById('amount');
  // disabledにするため、このイベントリスナーは不要だが、コードで値を設定した際に整形されるように残しておく
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

// 初期化処理
function initialize() {
  // メッセージを非表示
  hideMessages();
  
  // 店舗プルダウンを設定（optionsを生成するが、select自体はdisabledになる）
  populateShops();
  
  // DOM要素を初期化（inputをdisabledにする）
  initializeElements();
  
  // 元データを読み込み
  if (loadOriginalData()) {
    displayOriginalData();
    autoFillReverseData(); // 逆取引データをフォームにセットし、選択状態を更新
  } else {
    // 元データが無い場合はエラー表示
    alert('修正対象のデータが見つかりません。データ一覧ページから再度選択してください。');
    // 元のページに戻る
    setTimeout(() => { // アラートが表示されるのを待ってから遷移
        if (document.referrer) {
            history.back();
        } else {
            window.location.href = 'data/marugo.html'; 
        }
    }, 100); // 少し遅延させてアラートが先に表示されるようにする
  }
}

// ページが完全に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
