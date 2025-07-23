const GAS_URL = "https://script.google.com/macros/s/AKfycbyVsreLhqXgNf6VEmrcCi00jvfAexXnXO9Gy6V-W4Chey0FrXcw6klZDwkvvaGYhQgd/exec"; // 例: https://script.google.com/macros/s/AKfycbw........................../exec
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

  // 金額入力の自動フォーマット
  const amountInput = document.getElementById('amount');
  amountInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value) {
      value = parseInt(value).toLocaleString('ja-JP');
    }
    e.target.value = value;
  });

  // フォーム送信処理
  const form = document.getElementById('loanForm');
  const submitBtn = document.querySelector('.submit-btn:not(.correction-btn)'); // 通常の送信ボタン
  const correctionBtn = document.querySelector('.correction-btn'); // 修正送信ボタン
  const successMessage = document.getElementById('successMessage');

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
    // バリデーション
    if (!categoryInput.value) {
      alert('カテゴリーを選択してください');
      return;
    }

    // 修正確認 (既存データチェックはGAS側で削除されているが、確認メッセージは残す)
    if (isCorrection) {
      const confirmMessage = '【修正データとして送信します】\n\n' +
                           'この操作は既存のデータを変更しませんが、スプレッドシートに「修正」マーク付きで追加されます。\n\n' +
                           'よろしいですか？'; // メッセージを簡略化
      if (!confirm(confirmMessage)) {
        return;
      }
    }

    // ローディング状態開始
    const targetBtn = isCorrection ? correctionBtn : submitBtn;
    const btnText = targetBtn.querySelector('.btn-text');
    const originalText = btnText.textContent;
    
    targetBtn.classList.add('loading');
    btnText.textContent = isCorrection ? '修正送信中...' : '送信中...';
    targetBtn.disabled = true;

    try {
      // 金額の正規化（全角数字を半角に変換）
      const amountRaw = document.getElementById("amount").value;
      const normalizedAmount = amountRaw.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 65248));

      // デバイス判定ロジック
      const userAgentRaw = navigator.userAgent; // 元のUser-Agent文字列を取得
      let userAgent = "PC"; // デフォルトはPC

      if (/iPhone|iPad|iPod/.test(userAgentRaw)) {
        userAgent = "iPhone"; // iOSデバイス
      } else if (/Android/.test(userAgentRaw)) {
        userAgent = "Android"; // Androidデバイス
      }
      // その他の場合はデフォルトの "PC" のまま

      const data = {
        date: document.getElementById("date").value,
        name: document.getElementById("name").value,
        lender: document.getElementById("lender").value,
        borrower: document.getElementById("borrower").value,
        category: document.getElementById("category").value,
        item: document.getElementById("item").value,
        amount: normalizedAmount,
        displayName: "",
        userId: "",
        userAgent: userAgent, // 判定したデバイスタイプを送信
        isCorrection: isCorrection
      };

      // Google Apps Scriptに送信
      console.log('=== 送信開始 ===');
      console.log('GAS URL:', GAS_URL);
      console.log('送信データ:', data);
      console.log('修正フラグ:', isCorrection);
      console.log('データJSON:', JSON.stringify(data));
      
      const response = await fetch(GAS_URL, {
        method: "POST",
        mode: "cors", // ★CORSモード
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      console.log('レスポンス受信:', response);
      // response.ok や response.status が信頼できるようになります
      console.log('レスポンスステータス:', response.status);
      console.log('レスポンスOK:', response.ok);

      let responseText = '';
      try {
        responseText = await response.text(); 
      } catch (e) {
        console.warn('response.text() 取得中にエラーまたは空:', e);
        // ここではエラーとして扱わず、後続のJSONパースで処理を続行
      }

      console.log('GASからの生レスポンス:', responseText);

      // GASからのレスポンスをJSONとして解析し、ステータスを確認
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('GASレスポンスのJSON解析エラー:', parseError);
        // JSONとしてパースできなかった場合、エラーとして処理
        throw new Error("GASからの予期せぬレスポンス形式です: " + responseText);
      }

      if (result.status === "error") {
        console.error('GAS側でエラーが発生しました:', result.message);
        throw new Error(result.message); // GASからのエラーメッセージをスロー
      }

      console.log('送信完了');

      // 成功処理 (タイムアウトはそのまま)
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
      }, 1000);

    } catch (error) {
      console.error('送信エラー:', error);

      // エラー処理
      const targetBtn = isCorrection ? correctionBtn : submitBtn;
      const btnText = targetBtn.querySelector('.btn-text');
      targetBtn.classList.remove('loading');
      btnText.textContent = originalText;
      targetBtn.disabled = false;

      // エラーメッセージの表示
      let errorMessage = '送信に失敗しました。';
      
      // GAS側から受け取った具体的なエラーメッセージがあればそれを使う
      if (error.message) {
        errorMessage = error.message; 
      } else if (error.message && error.message.includes('network')) {
        errorMessage = 'ネットワークエラーが発生しました。\nインターネット接続を確認してください。';
      } else {
        errorMessage = '送信に失敗しました。再度お試しください。';
      }
      
      alert(errorMessage);
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
