// ===== 設定 =====
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxxhL81ThLnXuoDFfid2n9S7gzLMq_V-s5FxH8WqoBIUq2jCtKAa9_ZU-ovGC5r8qBZ/exec";

// ===== 便利関数 =====
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function toNumber(s){ return Number(String(s||"").replace(/[^\d]/g,"")); }

// ===== 初期化 =====
document.addEventListener("DOMContentLoaded", () => {
  const form = $("#loanForm");
  const btn  = form?.querySelector('button[type="submit"]');

  // 今日の日付をセット（空なら）
  const dateEl = $("#date");
  if (dateEl && !dateEl.value) {
    const d=new Date(), mm=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
    dateEl.value = `${d.getFullYear()}-${mm}-${dd}`;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!btn) return;

    // 1) 検証
    window.StatusModal?.open();
    window.StatusInline?.show?.();
    window.StatusModal?.set("validation");
    window.StatusInline?.set?.("validation");

    const payload = {
      date:   $("#date")?.value?.trim(),
      name:   $("#name")?.value?.trim(),
      lender: $("#lender")?.value?.trim(),
      borrower: $("#borrower")?.value?.trim(),
      category: $("#category")?.value?.trim(),
      item:   $("#item")?.value?.trim(),
      amount: toNumber($("#amount")?.value),
      isCorrection: false
    };

    if (!payload.date || !payload.name || !payload.lender || !payload.borrower ||
        !payload.category || !payload.item || !payload.amount) {
      // 必須不足
      return showError();
    }

    btn.disabled = true;
    btn.classList.add("loading");

    try {
      // 2) ステータス：送信→挿入
      step("sending");  await sleep(150);

      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });

      step("inserting"); await sleep(150);
      step("email-sending"); await sleep(150);

      let data = {};
      try { data = await res.json(); } catch{}

      if (res.ok && data.status === "SUCCESS") {
        step("email-sent"); await sleep(150);
        step("backup");     await sleep(120);
        complete(); showSuccess();
        // form.reset(); // 必要なら解除
      } else {
        showError();
      }
    } catch (e) {
      console.error(e);
      showError();
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  });
});

// ===== ステータス表示の薄いラッパ =====
function step(k){
  window.StatusModal?.set?.(k);
  window.StatusInline?.set?.(k);
}
function complete(){
  window.StatusModal?.complete?.();
  window.StatusInline?.complete?.();
}
function showSuccess(){
  const el = document.querySelector("#successMessage");
  if (!el) return; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"), 2200);
}
function showError(){
  const el = document.querySelector("#errorMessage");
  if (!el) return; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"), 2200);
}
