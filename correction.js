// === 送信中ポップアップ制御 ===
function showSubmitOverlay() {
  const el = document.getElementById('submit-overlay');
  if (el) { el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); }
}
function hideSubmitOverlay() {
  const el = document.getElementById('submit-overlay');
  if (el) { el.style.display = 'none'; el.setAttribute('aria-hidden','true'); }
}

const GAS_URL = "https://script.google.com/macros/s/AKfycbzoNdSD...RmsbydJUsHsgAaJmGKvzcc8_bA_XHXBf3Ee-ltRxLwhzzYVpU3NdCnK2d/exec";
const shops = [
  "MARUGO-D", "MARUGO-OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "TESORO", "MADUREZ", "丸五水産", "Other"
];

let originalData = null;

document.addEventListener('DOMContentLoaded', async () => {
  // --- 元データの取得（既存） ---
  function loadOriginal() {
    // URLパラメータ d（Base64 JSON）優先 → sessionStorage fallback
    const params = new URLSearchParams(location.search);
    const d = params.get('d');
    if (d) {
      try {
        const json = decodeURIComponent(escape(atob(decodeURIComponent(d))));
        originalData = JSON.parse(json);
        sessionStorage.setItem('correctionData', JSON.stringify(originalData));
        return true;
      } catch (e) {
        console.error("URLデータの解析に失敗:", e);
      }
    }
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

    // （表示グリッドは既存のまま。非表示仕様もそのまま）
    grid.innerHTML = `
        <div class="original-data-item"><span>📅 日付:</span><span>${originalData.date || '不明'}</span></div>
        <div class="original-data-item"><span>👤 入力者:</span><span>${originalData.name || '不明'}</span></div>
        <div class="original-data-item"><span>📤 貸主:</span><span>${originalData.lender || '不明'}</span></div>
        <div class="original-data-item"><span>📥 借主:</span><span>${originalData.borrower || '不明'}</span></div>
        <div class="original-data-item"><span>📝 品目:</span><span>${originalData.item || '不明'}</span></div>
        <div class="original-data-item"><span>🏷️ カテゴリー:</span><span>${originalData.category || '不明'}</span></div>
        <div class="original-data-item"><span>🔢 個/本/kg:</span><span>${originalData.quantity || '不明'}</span></div>
        <div class="original-data-item"><span>＠ 単価:</span><span>${formattedUnitPrice}</span></div>
        <div class="original-data-item amount-row" style="grid-column: 1 / -1;"><span>💵 金額:</span><span>${formattedAmount}</span></div>
    `;

    // --- 既存のフォーム初期化（そのまま） ---
    document.getElementById('date').value = originalData.date || '';
    document.getElementById('lender').innerHTML = shops.map(s => `<option value="${s}">${s}</option>`).join('');
    document.getElementById('borrower').innerHTML = shops.map(s => `<option value="${s}">${s}</option>`).join('');
    document.getElementById('lender').value = originalData.borrower || '';
    document.getElementById('borrower').value = originalData.lender || '';
    document.getElementById('category').value = originalData.category || '';
    document.getElementById('item').value = originalData.item || '';
    document.getElementById('quantity').value = originalData.quantity || '';

    // ★追加（表示のみ）：rowIndex をフォーム欄に反映（readonly）
    try {
      const ri = (originalData.rowIndex ?? originalData.originalRowIndex) ?? '';
      const rowEl = document.getElementById('rowIndex');
      if (rowEl) rowEl.value = ri;
    } catch (_) {}

    // 既存：単価と金額を自動入力（表示専用）
    document.getElementById('unitPrice').value =
      `¥${parseInt(originalData.unitPrice || 0).toLocaleString('ja-JP')}`;
    document.getElementById('amount').value =
      `¥${parseInt(originalData.amount || 0).toLocaleString('ja-JP')}`;

    document.querySelectorAll('.category-option').forEach(opt => {
      if (opt.dataset.value === originalData.category) {
        opt.classList.add('selected');
      }
    });
  }

  if (loadOriginal()) {
    displayOriginalData();

    // 担当者名の保持（既存）
    try {
      const nameInput = document.getElementById('name');
      const saved = localStorage.getItem('userName');
      if (saved && !nameInput.value) nameInput.value = saved;
      requestAnimationFrame(() => { nameInput.focus(); nameInput.select(); });
    } catch (_) {}

  } else {
    alert("修正対象のデータが見つかりません。分析ページからやり直してください。");
    document.getElementById('correctionForm').style.display = 'none';
  }
  document.getElementById('correctionForm').addEventListener('submit', submitCorrectionData);
});

async function submitCorrectionData(event) {
  event.preventDefault();
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;
  try {
    const nm = document.getElementById('name')?.value?.trim();
    if (nm) localStorage.setItem('userName', nm);
  } catch (_) {}

  submitBtn.disabled = true;
  btnText.textContent = '送信中...';
  showSubmitOverlay();

  // 送信データ（既存）＋ ★追加：rowIndex
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
    // ★ここだけ追加：行番号（文字列で送る）
    rowIndex: String((originalData.rowIndex ?? originalData.originalRowIndex) ?? ''),
    isCorrection: true,
    // 以降（メール関連やフラグなど）は既存のまま
  };

  try {
    // 既存：GAS へ POST
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const json = await res.json();

    if (json && json.status === 'ok') {
      btnText.textContent = '送信完了';
      alert('修正データを送信しました。');
      location.href = 'data/marugo.html';
    } else {
      throw new Error(json?.message || '送信に失敗しました');
    }
  } catch (err) {
    console.error(err);
    alert('送信時にエラーが発生しました。時間を置いて再度お試しください。');
    btnText.textContent = originalText;
    submitBtn.disabled = false;
  } finally {
    hideSubmitOverlay();
  }
}

window.addEventListener('beforeunload', hideSubmitOverlay);
