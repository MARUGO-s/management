// === 送信中ポップアップ制御 ===
function showSubmitOverlay() {
  const el = document.getElementById('submit-overlay');
  if (el) { el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); }
}
function hideSubmitOverlay() {
  const el = document.getElementById('submit-overlay');
  if (el) { el.style.display = 'none'; el.setAttribute('aria-hidden','true'); }
}

const GAS_URL = "https://script.google.com/macros/s/AKfycbw73jkEAmiCKzEk5nwpQlcd0PWx33aYLsrsm_aK-w1GNH6uaIG-8EDELVRF0JfIJYEt/exec";
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
            console.error("元データの解析に失敗:", e);
        }
    }
    return false;
}

function displayOriginalData() {
    if (!originalData) return;
    const grid = document.getElementById('original-data-grid');
    const formattedUnitPrice = `¥${parseInt(originalData.unitPrice || 0).toLocaleString('ja-JP')}`;
    const formattedAmount = `¥${parseInt(originalData.amount || 0).toLocaleString('ja-JP')}`;
    
    // ▼▼▼ 変更点: 元データ表示に「単価」を追加 ▼▼▼
    grid.innerHTML = `
        <div class="original-data-item"><span>📅 日付:</span><span>${originalData.date || '不明'}</span></div>
        <div class="original-data-item"><span>👤 入力者:</span><span>${originalData.name || '不明'}</span></div>
        <div class="original-data-item"><span>📤 貸主:</span><span>${originalData.lender || '不明'}</span></div>
        <div class="original-data-item"><span>📥 借主:</span><span>${originalData.borrower || '不明'}</span></div>
        <div class="original-data-item"><span>📝 品目:</span><span>${originalData.item || '不明'}</span></div>
        <div class="original-data-item"><span>🏷️ カテゴリー:</span><span>${originalData.category || '不明'}</span></div>
        <div class="original-data-item"><span>🔢 個/本:</span><span>${originalData.quantity || '不明'}</span></div>
        <div class="original-data-item"><span>＠ 単価:</span><span>${formattedUnitPrice}</span></div>
        <div class="original-data-item amount-row" style="grid-column: 1 / -1;"><span>💵 金額:</span><span>${formattedAmount}</span></div>
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
    
    // ▼▼▼ 変更点: フォームに「単価」と「金額」を自動入力 ▼▼▼
    document.getElementById('unitPrice').value = `¥${parseInt(originalData.unitPrice || 0).toLocaleString('ja-JP')}`;
    document.getElementById('amount').value = `¥${parseInt(originalData.amount || 0).toLocaleString('ja-JP')}`;
    
    document.querySelectorAll('.category-option').forEach(opt => {
        if (opt.dataset.value === originalData.category) {
            opt.classList.add('selected');
        }
    });
}

async function submitCorrectionData(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const originalText = btnText.textContent;
    try { const nm = document.getElementById('name')?.value?.trim(); if (nm) localStorage.setItem('userName', nm); } catch (_) {}
    
    submitBtn.disabled = true;
    btnText.textContent = '送信中...';
    showSubmitOverlay();

    // ▼▼▼ 変更点: 送信データに `unitPrice` を追加 ▼▼▼
    const data = {
        date: document.getElementById("date").value,
        name: document.getElementById("name").value,
        lender: document.getElementById("lender").value,
        borrower: document.getElementById("borrower").value,
        category: document.getElementById("category").value,
        item: document.getElementById("item").value,
        quantity: String(originalData.quantity || '0'),
        unitPrice: String(originalData.unitPrice || '0'),
        amount: String(originalData.amount || '0'),
        isCorrection: true,
        correctionMark: "✏️修正(逆取引)" // 修正の種別を明確化
    };

    if (!data.name) {
        alert('名前を入力してください。');
        submitBtn.disabled = false;
        hideSubmitOverlay();
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

        const successMsg = document.getElementById('successMessage');
        successMsg.textContent = '✅ 修正データが正常に送信されました！';
        successMsg.classList.add('show');

        setTimeout(() => {
            if (confirm('送信完了しました。分析ページに戻りますか？')) {
                window.location.href = document.getElementById('back-btn').href;
            }
            successMsg.classList.remove('show');
            submitBtn.disabled = false;
            hideSubmitOverlay();
            btnText.textContent = originalText;
        }, 1500);

    } catch (error) {
        console.error('送信エラー:', error);
        const errorMsg = document.getElementById('errorMessage');
        errorMsg.textContent = `❌ 送信エラー: ${error.message}`;
        errorMsg.classList.add('show');
        setTimeout(() => errorMsg.classList.remove('show'), 5000);
        submitBtn.disabled = false;
        hideSubmitOverlay();
        btnText.textContent = originalText;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    populateShops();
    if (loadOriginalData()) {
        displayOriginalData();
        autoFillReverseData();

    const nameInput = document.getElementById('name');
    if (nameInput) {
        try {
            const saved = localStorage.getItem('userName');
            if (saved && !nameInput.value) nameInput.value = saved;
            requestAnimationFrame(() => { nameInput.focus(); nameInput.select(); });
        } catch (_) {}
    }

    } else {
        alert("修正対象のデータが見つかりません。分析ページからやり直してください。");
        document.getElementById('correctionForm').style.display = 'none';
    }
    document.getElementById('correctionForm').addEventListener('submit', submitCorrectionData);
});

window.addEventListener('beforeunload', hideSubmitOverlay);
