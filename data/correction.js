const GAS_URL = "https://script.google.com/macros/s/AKfycbxS0-2U24O3MMxtRLb080vjHZRXSEuNuh7SIz3k_WWKv20hV0Xg7Rzhqn-fj2NBXizh/exec";
let originalData = null;

function loadAndDisplayData() {
    const savedData = sessionStorage.getItem('correctionData');
    if (!savedData) {
        alert("修正データが見つかりません。分析ページからやり直してください。");
        window.location.href = 'marugo.html';
        return;
    }

    originalData = JSON.parse(savedData);
    const grid = document.getElementById('original-data-grid');
    
    // 元データ表示
    grid.innerHTML = `
        <div class="original-data-item"><span>日付:</span><span>${originalData.date}</span></div>
        <div class="original-data-item"><span>貸主:</span><span>${originalData.lender}</span></div>
        <div class="original-data-item"><span>借主:</span><span>${originalData.borrower}</span></div>
        <div class="original-data-item"><span>品目:</span><span>${originalData.item}</span></div>
        <div class="original-data-item"><span>個/本:</span><span>${originalData.quantity}</span></div>
        <div class="original-data-item"><span>金額:</span><span>¥${originalData.amount.toLocaleString()}</span></div>
    `;

    // フォームに自動入力
    document.getElementById('date').value = originalData.date;
    document.getElementById('lender').value = originalData.borrower; // 貸主と借主を逆転
    document.getElementById('borrower').value = originalData.lender;
    document.getElementById('category').value = originalData.category;
    document.getElementById('item').value = originalData.item;
    document.getElementById('quantity').value = originalData.quantity;
    document.getElementById('amount').value = originalData.amount.toLocaleString();
}

async function submitCorrectionData(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const nameInput = document.getElementById("name");

    if (!nameInput.value.trim()) {
        alert('あなたの名前を入力してください。');
        nameInput.focus();
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';

    const data = {
        date: originalData.date,
        name: nameInput.value.trim(),
        lender: originalData.borrower,
        borrower: originalData.lender,
        category: originalData.category,
        item: originalData.item,
        quantity: originalData.quantity,
        amount: originalData.amount,
        isCorrection: true,
        correctionOnly: true, // GAS側で特別処理するためのフラグ
        originalRowIndex: originalData.originalRowIndex
    };

    try {
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(data)
        });
        
        document.getElementById('successMessage').textContent = '✅ 修正データが送信されました！';
        document.getElementById('successMessage').classList.add('show');
        setTimeout(() => window.location.href = 'marugo.html', 2000);

    } catch (error) {
        document.getElementById('errorMessage').textContent = `❌ 送信エラー: ${error.message}`;
        document.getElementById('errorMessage').classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = '✏️ 修正データを送信';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadAndDisplayData();
    document.getElementById('correctionForm').addEventListener('submit', submitCorrectionData);
});