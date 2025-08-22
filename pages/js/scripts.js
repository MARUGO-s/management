// カスタム確認ダイアログの表示（改良版UI）
showCustomConfirmDialog(message, onConfirm, onCancel) {
    const dialogId = 'custom-confirm-dialog';
    let dialog = document.getElementById(dialogId);

    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = dialogId;
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            z-index: 10000;
            text-align: left; /* 左寄せに変更 */
            max-width: 90%;
            width: 400px; /* 基本の幅を設定 */
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            white-space: pre-wrap;
        `;
        const titleDiv = document.createElement('h2');
        titleDiv.textContent = '🗑️ 確認';
        titleDiv.style.marginBottom = '15px';
        titleDiv.style.color = '#333';
        dialog.appendChild(titleDiv);

        const msgDiv = document.createElement('div');
        msgDiv.id = 'custom-confirm-message';
        msgDiv.style.marginBottom = '20px';
        msgDiv.style.fontSize = '16px';
        msgDiv.style.color = '#333';
        dialog.appendChild(msgDiv);

        const warningDiv = document.createElement('div');
        warningDiv.style.padding = '15px';
        warningDiv.style.backgroundColor = '#ffe0b2'; /* 薄いオレンジ色 */
        warningDiv.style.border = '1px solid #ffc107';
        warningDiv.style.borderRadius = '8px';
        warningDiv.style.marginBottom = '20px';
        warningDiv.innerHTML = '<p style="margin-top: 0; font-weight: bold; color: #d32f2f;">⚠️ この操作により：</p><ul><li>貸主と借主が入れ替わった逆取引データが作成されます</li><li>自動的に「✏️修正」マークが付与されます</li><li>修正用ページに移動します</li></ul>';
        dialog.appendChild(warningDiv);

        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end'; /* ボタンを右寄せ */
        btnContainer.style.gap = '10px';
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'はい、続行します';
        confirmBtn.style.cssText = `
            background-color: #5a7c5a;
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: background-color 0.3s ease;
            min-width: 140px; /* ボタンの幅を調整 */
            text-align: center;
        `;
        confirmBtn.onmouseover = () => confirmBtn.style.backgroundColor = '#4a6b4a';
        confirmBtn.onmouseout = () => confirmBtn.style.backgroundColor = '#5a7c5a';
        confirmBtn.onclick = () => { dialog.remove(); onConfirm(); };
        btnContainer.appendChild(confirmBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.style.cssText = `
            background-color: #888;
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: background-color 0.3s ease;
            min-width: 140px; /* ボタンの幅を調整 */
            text-align: center;
        `;
        cancelBtn.onmouseover = () => cancelBtn.style.backgroundColor = '#6a6a6a';
        cancelBtn.onmouseout = () => cancelBtn.style.backgroundColor = '#888';
        cancelBtn.onclick = () => { dialog.remove(); onCancel(); };
        btnContainer.appendChild(cancelBtn);

        dialog.appendChild(btnContainer);
        document.body.appendChild(dialog);
    }

    let formattedMessage = `<p>以下のデータを逆取引として修正送信しますか？</p><ul style="list-style: none; padding-left: 20px;">`;
    formattedMessage += `<li><strong>📅 日付:</strong> ${message.date || '不明'}</li>`;
    formattedMessage += `<li><strong>👤 入力者:</strong> ${message.name || '不明'}</li>`;
    formattedMessage += `<li><strong>📤 貸主:</strong> ${message.lender || '不明'}</li>`;
    formattedMessage += `<li><strong>📥 借主:</strong> ${message.borrower || '不明'}</li>`;
    formattedMessage += `<li><strong>🏷️ カテゴリー:</strong> ${message.category || '不明'}</li>`;
    formattedMessage += `<li><strong>📝 品目:</strong> ${message.item || '不明'}</li>`;
    formattedMessage += `<li><strong>🔢 個/本/g:</strong> ${message.quantity || '不明'}</li>`;
    formattedMessage += `<li><strong>💰 単価:</strong> ${message.unitPriceFormatted || '不明'}</li>`;
    formattedMessage += `<li><strong>💵 金額:</strong> ${message.amountFormatted || '不明'}</li>`;
    formattedMessage += `<li><strong><span style="font-family: monospace;">📄</span> スプレッドシート行:</strong> ${message.originalRowIndex || '不明'}</li>`;
    formattedMessage += `</ul>`;

    document.getElementById('custom-confirm-message').innerHTML = formattedMessage;
    dialog.style.display = 'block';
}

// 削除確認ダイアログを表示（修正版 - 新UI対応）
showDeleteConfirmDialog(selectedData) {
    console.log('確認ダイアログ表示:', selectedData);

    if (!selectedData) {
        console.error('選択されたデータが無効です');
        this.showCustomAlertDialog('選択されたデータが無効です。再度お試しください。');
        return;
    }

    const amountFormatted = selectedData.amount ? `¥${parseInt(selectedData.amount).toLocaleString('ja-JP')}` : '不明';
    const unitPriceFormatted = selectedData.unitPrice ? `¥${this.parseAmount(selectedData.unitPrice).toLocaleString()}` : '不明';

    const dataForMessage = {
        date: selectedData.date || '',
        name: selectedData.name || '',
        lender: selectedData.lender || '',
        borrower: selectedData.borrower || '',
        category: selectedData.category || '',
        item: selectedData.item || '',
        quantity: selectedData.quantity || '',
        unitPriceFormatted: unitPriceFormatted,
        amountFormatted: amountFormatted,
        originalRowIndex: selectedData.originalRowIndex || ''
    };

    this.showCustomConfirmDialog(dataForMessage, () => {
        console.log('ユーザーが確認 - リダイレクト開始');
        this.redirectToCorrectionPage(selectedData);
    }, () => {
        console.log('ユーザーがキャンセル');
    });
}