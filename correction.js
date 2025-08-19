const GAS_URL = "https://script.google.com/macros/s/AKfycbxS0-2U24O3MMxtRLb080vjHZRXSEuNuh7SIz3k_WWKv20hV0Xg7Rzhqn-fj2NBXizh/exec";
const shops = [
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];
let originalData = null;

function populateShops() {
    const lenderSelect = document.getElementById("lender");
    const borrowerSelect = document.getElementById("borrower");
    shops.forEach(shop => {
        lenderSelect.add(new Option(shop, shop));
        borrowerSelect.add(new Option(shop, shop));
    });
}

function loadOriginalData() {
    const savedData = sessionStorage.getItem('correctionData');
    if (savedData) {
        try {
            originalData = JSON.parse(savedData);
            return true;
        } catch (e) {
            console.error("SessionStorageからのデータ解析に失敗:", e);
        }
    }
    const params = new URLSearchParams(location.search);
    const d = params.get('d');
    if (d) {
        try {
            const json = decodeURIComponent(escape(atob(decodeURIComponent(d))));
            originalData = JSON.parse(json);
            sessionStorage.setItem('correctionData', JSON.stringify(originalData));
            return true;
        } catch (e) {
            console.error("URLパラメータの解析に失敗:", e);
        }
    }
    return false;
}

function displayOriginalData() {
    if (!originalData) return;
    const grid = document.getElementById('original-data-grid');
    const formattedAmount = `¥${parseInt(originalData.amount || 0).toLocaleString('ja-JP')}`;
    
    grid.innerHTML = `
        <div class="original-data-label">日付:</div><div class="original-data-value">${originalData.date || '不明'}</div>
        <div class="original-data-label">入力者:</div><div class="original-data-value">${originalData.name || '不明'}</div>
        <div class="original-data-label">貸主:</div><div class="original-data-value">${originalData.lender || '不明'}</div>
        <div class="original-data-label">借主:</div><div class="original-data-value">${originalData.borrower || '不明'}</div>
        <div class="original-data-label">品目:</div><div class="original-data-value">${originalData.item || '不明'}</div>
        <div class="original-data-label">個/本:</div><div class="original-data-value">${originalData.quantity || '不明'}</div>
        <div class="original-data-label">金額:</div><div class="original-data-value">${formattedAmount}</div>
    `;
}

function autoFillReverseData() {
    if (!originalData) return;
    document.getElementById('date').value = originalData.date || '';
    document.getElementById('lender').value = originalData.borrower || '';
    document.getElementById('borrower').value = originalData.lender || '';
    document.getElementById('category').value = originalData.category || '';
    document.getElementById('item').value = originalData.item || '';
    document.getElementById('quantity').value = originalData.quantity || '';
    document.getElementById('amount').value = `¥${parseInt(originalData.amount || 0).toLocaleString('ja-JP')}`;
    
    document.querySelectorAll('.category-option').forEach(opt => {
        if (opt.dataset.value === originalData.category) {
            opt.classList.add('selected');
        }
    });
}

function showPopup(title, message, isError = false) {
    const popup = document.getElementById('status-popup-overlay');
    document.getElementById('popup-title').textContent = title;
    document.getElementById('popup-message').innerHTML = message;
    popup.style.display = 'flex';
    if(isError) {
        document.getElementById('status-popup').style.borderColor = '#e53e3e';
    } else {
        document.getElementById('status-popup').style.borderColor = '#38a169';
    }
}

function hidePopup() {
    document.getElementById('status-popup-overlay').style.display = 'none';
}

async function submitCorrectionData(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const originalText = btnText.textContent;
    
    submitBtn.disabled = true;
    btnText.textContent = '送信中...';
    showPopup('📨 送信中', '<div class="auto-login-spinner"></div><p>修正データを送信しています...</p>');

    const data = {
        date: document.getElementById("date").value,
        name: document.getElementById("name").value,
        lender: document.getElementById("lender").value,
        borrower: document.getElementById("borrower").value,
        category: document.getElementById("category").value,
        item: document.getElementById("item").value,
        quantity: document.getElementById("quantity").value,
        amount: String(originalData.amount || '0'),
        isCorrection: true,
        correctionOnly: true,
        originalRowIndex: originalData.originalRowIndex
    };

    if (!data.name) {
        showPopup('❌ 入力エラー', '修正者名を入力してください。', true);
        setTimeout(hidePopup, 3000);
        submitBtn.disabled = false;
        btnText.textContent = originalText;
        return;
    }

    try {
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        
        showPopup('✅ 送信完了', '修正データが正常に送信されました！<br>1.5秒後に自動で確認画面に戻ります。');
        
        setTimeout(() => {
            hidePopup();
            if (confirm('送信完了しました。分析ページに戻りますか？')) {
                window.location.href = document.getElementById('back-btn').href;
            }
            submitBtn.disabled = false;
            btnText.textContent = originalText;
        }, 1500);

    } catch (error) {
        showPopup('❌ 送信エラー', `エラーが発生しました: ${error.message}`, true);
        setTimeout(hidePopup, 5000);
        submitBtn.disabled = false;
        btnText.textContent = originalText;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    populateShops();
    if (loadOriginalData()) {
        displayOriginalData();
        autoFillReverseData();
    } else {
        alert("修正対象のデータが見つかりません。分析ページからやり直してください。");
        document.getElementById('correctionForm').style.display = 'none';
    }
    document.getElementById('correctionForm').addEventListener('submit', submitCorrectionData);
});
