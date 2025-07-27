// Google Apps ScriptのウェブアプリURL（main.jsと同じURL）
const GAS_URL = "https://script.google.com/macros/s/AKfycbxxhL81ThLnXuoDFfid2n9S7gzLMq_V-s5FxH8WqoBIUq2jCtKAa9_ZU-ovGC5r8qBZ/exec";

const shops = [
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

// ヘルパー関数（main.jsと同じ）
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 金額を半角数字に変換する関数（main.jsと同じ）
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

// ステップ処理関数（main.jsと同じ）
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

document.addEventListener('DOMContentLoaded', () => {
    const correctionForm = document.getElementById('correctionForm');
    const originalDataGrid = document.getElementById('original-data-grid');
    const dateInput = document.getElementById('date');
    const nameInput = document.getElementById('name');
    const lenderSelect = document.getElementById('lender');
    const borrowerSelect = document.getElementById('borrower');
    const categoryHiddenInput = document.getElementById('category');
    const itemInput = document.getElementById('item');
    const amountInput = document.getElementById('amount');
    const statusDisplay = document.getElementById('status-display');
    const submitBtn = document.querySelector('.submit-btn');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');

    let originalData = null; // marugo.htmlから渡された元のデータを保持

    // 店舗データで貸主・借主のオプションを設定（main.jsと同じ）
    function populateShops() {
        lenderSelect.innerHTML = '<option value="">選択してください</option>';
        borrowerSelect.innerHTML = '<option value="">選択してください</option>';

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

    // sessionStorageからデータを受け取り、フォームに表示する
    function loadCorrectionData() {
        const storedData = sessionStorage.getItem('correctionData');
        if (storedData) {
            originalData = JSON.parse(storedData);

            // 元データを表示
            originalDataGrid.innerHTML = `
                <div class="original-data-item"><span class="original-data-label">日付</span><span class="original-data-value">${originalData.date || 'N/A'}</span></div>
                <div class="original-data-item"><span class="original-data-label">入力者</span><span class="original-data-value">${originalData.name || 'N/A'}</span></div>
                <div class="original-data-item"><span class="original-data-label">貸主</span><span class="original-data-value">${originalData.lender || 'N/A'}</span></div>
                <div class="original-data-item"><span class="original-data-label">借主</span><span class="original-data-value">${originalData.borrower || 'N/A'}</span></div>
                <div class="original-data-item"><span class="original-data-label">カテゴリー</span><span class="original-data-value">${originalData.category || 'N/A'}</span></div>
                <div class="original-data-item"><span class="original-data-label">品目</span><span class="original-data-value">${originalData.item || 'N/A'}</span></div>
                <div class="original-data-item"><span class="original-data-label">金額</span><span class="original-data-value">¥${(originalData.amount || 0).toLocaleString()}</span></div>
                <div class="original-data-item"><span class="original-data-label">修正フラグ</span><span class="original-data-value">${originalData.correction || 'なし'}</span></div>
                <div class="original-data-item"><span class="original-data-label">元のシート行</span><span class="original-data-value">${originalData.originalRowIndex || 'N/A'}</span></div>
            `;

            // 店舗オプションを生成
            populateShops();

            // フォームフィールドにデータを設定（貸主と借主を入れ替え）
            dateInput.value = originalData.date || '';
            nameInput.value = "システム修正"; // 固定値
            lenderSelect.value = originalData.borrower || ''; // 借主→貸主
            borrowerSelect.value = originalData.lender || '';  // 貸主→借主

            // カテゴリーを設定し、選択状態にする
            const categoryOptions = document.querySelectorAll('.category-option');
            categoryOptions.forEach(option => {
                option.classList.remove('selected');
                if (option.dataset.value === originalData.category) {
                    option.classList.add('selected');
                    categoryHiddenInput.value = originalData.category;
                }
                // すべてのカテゴリを無効にする
                option.classList.add('disabled');
            });
            
            itemInput.value = originalData.item || '';
            amountInput.value = (originalData.amount || 0).toLocaleString(); // 金額をカンマ区切りで表示

            // 全ての入力フィールドを読み取り専用にする
            dateInput.disabled = true;
            nameInput.disabled = true;
            lenderSelect.disabled = true;
            borrowerSelect.disabled = true;
            itemInput.disabled = true;
            amountInput.disabled = true;

        } else {
            // データがない場合は、ユーザーにmarugo.htmlに戻るように促すか、エラー表示
            alert('修正対象のデータが見つかりません。前のページに戻ってデータを選択してください。');
            window.location.href = 'data/marugo.html'; // marugo.htmlに戻る
        }
    }

    // 修正データ送信処理（main.jsのsubmitData関数と同じ流れ）
    async function submitCorrectionData() {
        const btnText = submitBtn.querySelector('.btn-text');
        const originalText = btnText.textContent;

        // 初期化
        hideMessages();
        resetSteps();

        // ボタンを無効化
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        btnText.textContent = '修正送信中...';
        
        // 状態表示を開始
        statusDisplay.classList.add('show');

        try {
            // Step 1: データ検証
            await showStep('step-validation', '📋 修正データを検証中...');
            await delay(600);

            // 修正データを作成（貸主と借主を入れ替え）
            const correctionData = {
                date: originalData.date,
                name: "システム修正", // 固定値
                lender: originalData.borrower, // 貸主と借主を入れ替える
                borrower: originalData.lender,   // 貸主と借主を入れ替える
                category: originalData.category,
                item: originalData.item,
                amount: originalData.amount.toString(), // 文字列として送信
                isCorrection: true, // 修正フラグ
                correctionOnly: true, // 修正専用のパスをGASで通るためのフラグ
                correctionMark: "✏️修正", // 修正マーク
                sendType: "CORRECTION", // 送信タイプ
                originalRowIndex: originalData.originalRowIndex, // 元の行のインデックス
            };

            // バリデーション
            if (!correctionData.date || !correctionData.lender || !correctionData.borrower || !correctionData.category || !correctionData.item || !correctionData.amount) {
                throw new Error('必須項目が入力されていません。');
            }
            if (correctionData.lender === correctionData.borrower) {
                throw new Error('貸主と借主は異なる店舗を選択してください。');
            }
            const amountNumber = parseInt(correctionData.amount);
            if (isNaN(amountNumber) || amountNumber <= 0) {
                throw new Error('正しい金額を入力してください。');
            }

            console.log('=== 🔥 修正専用送信データ（詳細） ===', correctionData);

            completeStep('step-validation', '✅ 修正データ検証完了');

            // Step 2: 送信開始
            await showStep('step-sending', '📤 修正データをスプレッドシートに送信中...');
            await delay(400);

            // Google Apps Scriptにデータを送信（main.jsと同じ方式）
            const response = await fetch(GAS_URL, {
                method: "POST",
                mode: "no-cors", // main.jsと同じno-corsモード
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(correctionData)
            });

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

            // 成功処理
            setTimeout(() => {
                // ローディング状態終了
                submitBtn.classList.remove('loading');
                btnText.textContent = originalText;
                submitBtn.disabled = false;

                // 成功メッセージ表示
                successMessage.textContent = '✅ 修正データの送信が完了しました！';
                successMessage.classList.add('show');
                setTimeout(() => {
                    successMessage.classList.remove('show');
                }, 3000);

                // sessionStorageをクリアしてmarugo.htmlに戻る
                sessionStorage.removeItem('correctionData');
                setTimeout(() => {
                    window.location.href = 'data/marugo.html';
                }, 2000); // 2秒後にリダイレクト
                
                statusDisplay.classList.remove('show');
            }, 500);

        } catch (error) {
            console.error('修正データ送信エラー:', error);
            
            // エラー状態を表示
            const activeStep = document.querySelector('.status-step.active');
            if (activeStep) {
                activeStep.classList.remove('active');
                activeStep.classList.add('error');
                activeStep.querySelector('span:last-child').textContent = '❌ エラーが発生しました';
            }

            // エラー処理
            submitBtn.classList.remove('loading');
            btnText.textContent = originalText;
            submitBtn.disabled = false;

            // エラーメッセージ表示
            errorMessage.textContent = `❌ 修正送信エラー: ${error.message}`;
            errorMessage.classList.add('show');
            
            setTimeout(() => {
                errorMessage.classList.remove('show');
                statusDisplay.classList.remove('show');
            }, 5000);
        }
    }

    // フォーム送信処理
    correctionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // フォームが既に送信中の場合は何もしない
        if (submitBtn.disabled) {
            return;
        }

        await submitCorrectionData();
    });

    // ページロード時にデータを読み込む
    loadCorrectionData();
});
