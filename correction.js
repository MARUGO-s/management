// Google Apps ScriptのウェブアプリURLをここに設定してください
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxxhL81ThLnXuoDFfid2n9S7gzLMq_V-s5FxH8WqoBIUq2jCtKAa9_ZU-ovGC5r8qBZ/exec'; 

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

    // 貸主・借主のプルダウンオプションを生成する関数
    function populatePeopleDropdowns(lenderName, borrowerName) {
        const people = Array.from(new Set([lenderName, borrowerName, '個人A', '個人B', '個人C', '個人D', '個人E', '個人F', '個人G'])); // サンプルの名前。実際には動的に取得するのが望ましい
        people.sort(); // ソート

        lenderSelect.innerHTML = '<option value="">選択してください</option>';
        borrowerSelect.innerHTML = '<option value="">選択してください</option>';

        people.forEach(person => {
            const lenderOption = document.createElement('option');
            lenderOption.value = person;
            lenderOption.textContent = person;
            lenderSelect.appendChild(lenderOption);

            const borrowerOption = document.createElement('option');
            borrowerOption.value = person;
            borrowerOption.textContent = person;
            borrowerSelect.appendChild(borrowerOption);
        });

        // デフォルトで逆取引の貸主・借主を選択状態にする
        lenderSelect.value = borrowerName;
        borrowerSelect.value = lenderName;
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

            // フォームフィールドにデータを設定
            dateInput.value = originalData.date || '';
            // nameInputは「システム修正」で固定

            populatePeopleDropdowns(originalData.lender, originalData.borrower); // 貸主と借主を入れ替えてセット

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
            window.location.href = '../marugo.html'; // marugo.htmlに戻る
        }
    }

    // フォーム送信処理
    correctionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // フォームが既に送信中の場合は何もしない
        if (submitBtn.disabled) {
            return;
        }

        // 送信ボタンを無効化し、ローディング表示
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        submitBtn.querySelector('.btn-text').textContent = '送信中...';
        statusDisplay.classList.add('show');
        resetStatusSteps();

        // フォームデータの収集 (今回は読み取り専用なのでoriginalDataから取得)
        const correctedData = {
            date: originalData.date,
            name: "システム修正", // 固定値
            lender: originalData.borrower, // 貸主と借主を入れ替える
            borrower: originalData.lender,   // 貸主と借主を入れ替える
            category: originalData.category,
            item: originalData.item,
            amount: parseFloat(originalData.amount), // 数値に戻す
            correction: "✏️修正", // 修正フラグを追加
            originalRowIndex: originalData.originalRowIndex, // 元の行のインデックス (GAS側で必要に応じて使用)
            isCorrection: true, // GASで修正処理をトリガーするためのフラグ
            correctionOnly: true // 修正専用のパスをGASで通るためのフラグ
        };

        // ステータス表示の更新ヘルパー関数
        function updateStatus(stepId, type, message = '') {
            const stepElement = document.getElementById(stepId);
            if (stepElement) {
                stepElement.classList.remove('active', 'completed', 'error');
                if (type === 'active') {
                    stepElement.classList.add('active');
                    stepElement.innerHTML = `<span class="mini-loading-spinner"></span><span>${message}</span>`;
                } else if (type === 'completed') {
                    stepElement.classList.add('completed');
                    stepElement.innerHTML = `<span class="status-icon">✅</span><span>${message}</span>`;
                } else if (type === 'error') {
                    stepElement.classList.add('error');
                    stepElement.innerHTML = `<span class="status-icon">❌</span><span>${message}</span>`;
                }
            }
        }

        function resetStatusSteps() {
            const steps = ['step-validation', 'step-sending', 'step-inserting', 'step-backup', 'step-complete'];
            steps.forEach(stepId => {
                const stepElement = document.getElementById(stepId);
                if (stepElement) {
                    stepElement.classList.remove('active', 'completed', 'error');
                    // 元のテキストに戻す
                    if (stepId === 'step-validation') stepElement.innerHTML = `<span class="status-icon">📋</span><span>修正データを検証中...</span>`;
                    if (stepId === 'step-sending') stepElement.innerHTML = `<span class="status-icon">📤</span><span>修正データをスプレッドシートに送信中...</span>`;
                    if (stepId === 'step-inserting') stepElement.innerHTML = `<span class="status-icon">💾</span><span>修正データを挿入中...</span>`;
                    if (stepId === 'step-backup') stepElement.innerHTML = `<span class="status-icon">🔄</span><span>バックアップを作成中...</span>`;
                    if (stepId === 'step-complete') stepElement.innerHTML = `<span class="status-icon">✅</span><span>修正送信完了！</span>`;
                }
            });
        }


        try {
            updateStatus('step-validation', 'active', '修正データを検証中...');
            // 簡単なバリデーション (disabledなので基本OKだが念のため)
            if (!correctedData.date || !correctedData.lender || !correctedData.borrower || !correctedData.item || !correctedData.amount) {
                throw new Error('必須項目が入力されていません。');
            }
            updateStatus('step-validation', 'completed', '修正データを検証済み');

            updateStatus('step-sending', 'active', '修正データをスプレッドシートに送信中...');
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'cors', // CORSを有効にする
                headers: {
                    'Content-Type': 'application/json', // ★ここを 'application/json' に変更
                },
                body: JSON.stringify(correctedData) // ★ここを JSON.stringify に変更
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`GASエラー: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            
            if (result.status === 'SUCCESS') {
                updateStatus('step-sending', 'completed', '修正データをスプレッドシートに送信済み');
                updateStatus('step-inserting', 'completed', '修正データを挿入済み');
                updateStatus('step-backup', 'completed', 'バックアップを作成済み');
                updateStatus('step-complete', 'completed', '修正送信完了！');
                
                showNotification(successMessage);
                // 成功後、sessionStorageをクリアしてmarugo.htmlに戻る
                sessionStorage.removeItem('correctionData');
                setTimeout(() => {
                    window.location.href = '../marugo.html';
                }, 2000); // 2秒後にリダイレクト
            } else {
                throw new Error(result.message || 'GASからの予期せぬエラーが発生しました。');
            }

        } catch (error) {
            console.error('修正データの送信エラー:', error);
            updateStatus('step-complete', 'error', '修正送信失敗');
            showNotification(errorMessage);
            errorMessage.textContent = `❌ 送信に失敗しました: ${error.message}`;

        } finally {
            // ボタンの状態を元に戻す
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.querySelector('.btn-text').textContent = '✏️ 修正データを送信';
        }
    });

    // 通知メッセージ表示関数
    function showNotification(messageElement) {
        messageElement.classList.add('show');
        setTimeout(() => {
            messageElement.classList.remove('show');
        }, 3000); // 3秒後に非表示
    }

    // ページロード時にデータを読み込む
    loadCorrectionData();
});
