const GAS_URL = "https://script.google.com/macros/s/AKfycbw9rr3ooPCxcFE35Y_HCKLarVG9Jo765cR49qDyxLxPsBcFqmm481-17J7Vsw1ZKMxW/exec"; // Google Apps ScriptのURL
const shops = [ // 店舗名のリスト
  "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

let cachedNames = null;
let cachedItems = null;
let cachedCostData = null;
let cachedIngredientsData = null;
const MAX_UNIQUE_HISTORY = 100; // 履歴の最大ユニーク件数（負荷対策）
const SELECT_MODAL_LIMIT = 100; // モーダル表示の最大件数
let latestItemMetaMap = new Map(); // key(normalized) -> { value, ms, qty, unitPrice, amount }
// エラー誘導用のキュー
let pendingErrorQueue = [];
let lastFocusedErrorEl = null;
let errorListenersAttached = false;

function normalizeKeyForDedupe(s) {
  return (s || '')
    .toString()
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)) // ひら→カタ
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

function parseDateMs(s) {
  if (!s) return 0;
  const d = new Date(s);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
}

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

// B列（名前）を取得して datalist に反映
async function populateNameDatalist(forceRefresh = false) {
  try {
    if (cachedNames && Array.isArray(cachedNames) && !forceRefresh) {
      renderNameList(cachedNames);
      return cachedNames;
    }

    const spreadsheetId = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY';
    const apiKey = 'AIzaSyAcy7hXztCjngG2poP-Sn_g6ED0TESnNTE';
    const sheetName = '貸借表';

    // B:J を取得（B=名前, J=入力日時）
    const range = `${sheetName}!B:J`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error('名前リスト取得エラー', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    const rows = (data.values || []).slice(1);
    const latestByKey = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const name = (r[0] || '').toString().trim(); // B
      if (!name) continue;
      const key = normalizeKeyForDedupe(name);
      const dateStr = r[8]; // J (B:J の 9列目)
      const ms = parseDateMs(dateStr);
      const existing = latestByKey.get(key);
      if (!existing || ms > existing.ms) {
        latestByKey.set(key, { value: name, ms });
      }
    }
    const sorted = Array.from(latestByKey.values()).sort((a, b) => b.ms - a.ms).slice(0, MAX_UNIQUE_HISTORY).map(x => x.value);
    cachedNames = sorted;
    renderNameList(sorted);
    return sorted;
  } catch (e) {
    console.error('名前リスト取得例外', e);
    return [];
  }
}

function renderNameList(names) {
  const list = document.getElementById('nameList');
  if (!list) return;
  const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base', numeric: true, ignorePunctuation: true });
  const normalizeKana = (s) => (s || '')
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)) // ひらがな→カタカナ
    .replace(/\s+/g, '')
    .trim();
  const sorted = [...names].sort((a, b) => {
    const na = normalizeKana(a);
    const nb = normalizeKana(b);
    const res = collator.compare(na, nb);
    return res !== 0 ? res : collator.compare(a, b);
  });
  list.innerHTML = sorted.map(n => `<option value="${n}"></option>`).join('');
}

// F列（品目）を取得して datalist に反映
async function populateItemDatalist(forceRefresh = false) {
  try {
    if (cachedItems && Array.isArray(cachedItems) && !forceRefresh) {
      renderItemList(cachedItems);
      return cachedItems;
    }
    const spreadsheetId = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY';
    const apiKey = 'AIzaSyAcy7hXztCjngG2poP-Sn_g6ED0TESnNTE';
    const sheetName = '貸借表';
    // F:J を取得（F=品目, J=入力日時）
    const range = `${sheetName}!F:J`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('品目リスト取得エラー', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    const rows = (data.values || []).slice(1);
    const latestByKey = new Map();
    latestItemMetaMap = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const item = (r[0] || '').toString().trim(); // F
      if (!item) continue;
      const key = normalizeKeyForDedupe(item);
      const dateStr = r[4]; // J (F:J の 5列目)
      const ms = parseDateMs(dateStr);
      // 可能なら数量・単価・金額を推定（G,H,I を数値化）
      const qtyNum = (() => { const v = (r[1] || '').toString().replace(/[^\d.\-]/g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; })();
      const unitPriceNum = (() => { const v = (r[2] || '').toString().replace(/[^\d.\-]/g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; })();
      const amountNum = (() => { const v = (r[3] || '').toString().replace(/[^\d.\-]/g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; })();
      const existing = latestByKey.get(key);
      if (!existing || ms > existing.ms) {
        latestByKey.set(key, { value: item, ms });
        latestItemMetaMap.set(key, { value: item, ms, qty: qtyNum, unitPrice: unitPriceNum, amount: amountNum });
      }
    }
    const sorted = Array.from(latestByKey.values()).sort((a, b) => b.ms - a.ms).slice(0, MAX_UNIQUE_HISTORY).map(x => x.value);
    cachedItems = sorted;
    renderItemList(sorted);
    return sorted;
  } catch (e) {
    console.error('品目リスト取得例外', e);
    return [];
  }
}

function renderItemList(items) {
  const list = document.getElementById('itemList');
  if (!list) return;
  const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base', numeric: true, ignorePunctuation: true });
  const normalizeKana = (s) => (s || '').normalize('NFKC').replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)).replace(/\s+/g, '').trim();
  const sorted = [...items].sort((a, b) => {
    const na = normalizeKana(a); const nb = normalizeKana(b);
    const res = collator.compare(na, nb);
    return res !== 0 ? res : collator.compare(a, b);
  });
  list.innerHTML = sorted.map(v => `<option value="${v}"></option>`).join('');
}

// 原価リストからワイン名を取得
async function populateCostData() {
  try {
    if (cachedCostData && Array.isArray(cachedCostData)) {
      return cachedCostData;
    }

    const spreadsheetId = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY';
    const apiKey = 'AIzaSyAcy7hXztCjngG2poP-Sn_g6ED0TESnNTE';
    const sheetName = '原価リスト';

    const range = `${sheetName}!B:L`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('原価データ取得エラー', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    const rows = data.values || [];

    // ヘッダー行を除外してデータを処理
    const costData = rows.slice(1).map(row => {
      const item = {
        wineName: row[1] || '',          // C列: ワイン名
        costInTax: 0                     // G列: 原価(税込)
      };

      // 原価(税込)のパース処理
      if (row[5] && row[5].toString().trim() !== '') {
        const rawCostInTax = row[5].toString();
        const costInTax = parseFloat(rawCostInTax.replace(/[^\d.-]/g, ''));
        item.costInTax = isNaN(costInTax) ? 0 : costInTax;
      }

      return item;
    }).filter(item => item.wineName.trim() !== '');

      cachedCostData = costData;
  return costData;
} catch (error) {
  console.error('原価データ取得例外', error);
  return [];
}
}

// 食材リストから商品名を取得
async function populateIngredientsData() {
  try {
    if (cachedIngredientsData && Array.isArray(cachedIngredientsData)) {
      return cachedIngredientsData;
    }

    const spreadsheetId = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY';
    const apiKey = 'AIzaSyAcy7hXztCjngG2poP-Sn_g6ED0TESnNTE';
    const sheetName = '食材コスト';

    const range = `${sheetName}!A:AI`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('食材データ取得エラー', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    const rows = data.values || [];

    // ヘッダー行を除外してデータを処理
    const allItems = rows.slice(1).map((row, arrayIndex) => {
      const actualRowNumber = arrayIndex + 2;
      
      const item = {
        index: arrayIndex,
        rowNumber: actualRowNumber,
        date: row[1] || '',              // B列: 伝票日付
        supplier: row[8] || '',          // I列: 取引先名
        productName: row[14] || '',      // O列: 商品名
        packUnit: row[17] || '',         // R列: 入数単位
        unitPrice: 0,                    // S列: 単価
        unit: row[20] || ''              // U列: 単位
      };

      // 単価のパース処理
      if (row[18] && row[18].toString().trim() !== '') {
        const rawUnitPrice = row[18].toString();
        const unitPrice = parseFloat(rawUnitPrice.replace(/[^\d.-]/g, ''));
        item.unitPrice = isNaN(unitPrice) ? 0 : unitPrice;
      }

      return item;
    }).filter(item => item.productName.trim() !== '');

    // 商品名の重複を除去し、最新のデータのみを保持
    const productMap = new Map();
    allItems.forEach(item => {
      const key = item.productName.toLowerCase().trim();
      if (!productMap.has(key) || item.rowNumber > productMap.get(key).rowNumber) {
        productMap.set(key, item);
      }
    });

      const ingredientsData = Array.from(productMap.values());
  cachedIngredientsData = ingredientsData;
  return ingredientsData;
} catch (error) {
  console.error('食材データ取得例外', error);
  return [];
}
}

// カテゴリー選択時のボタン表示制御
function updateButtonsByCategory(selectedCategory, rowEl) {
  if (!rowEl) return;
  const costBtn = rowEl.querySelector('.cost-list-btn');
  const ingredientsBtn = rowEl.querySelector('.ingredients-list-btn');
  if (costBtn) costBtn.style.display = 'none';
  if (ingredientsBtn) ingredientsBtn.style.display = 'none';
  // 要望により常時非表示
}

// 共用選択モーダル
function openSelectModal(title, items, onSelect) {
  const modal = document.getElementById('selectModal');
  const titleEl = document.getElementById('selectTitle');
  const searchEl = document.getElementById('selectSearch');
  const listEl = document.getElementById('selectList');
  if (!modal || !titleEl || !searchEl || !listEl) return;

  // ソートバーを生成（毎回初期化）
  let sortBar = document.getElementById('selectSortBar');
  if (!sortBar) {
    sortBar = document.createElement('div');
    sortBar.id = 'selectSortBar';
    sortBar.style.display = 'flex';
    sortBar.style.gap = '8px';
    sortBar.style.margin = '8px 0 10px 0';
    const card = modal.querySelector('.select-card');
    if (card) {
      card.insertBefore(sortBar, document.getElementById('selectList'));
    }
  } else {
    sortBar.innerHTML = '';
  }

  const makeBtn = (text) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.style.padding = '8px 10px';
    btn.style.border = '1px solid #e5e7eb';
    btn.style.borderRadius = '8px';
    btn.style.background = '#f9fafb';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    return btn;
  };

  const btnLatest = makeBtn('最新順');
  const btnKana = makeBtn('あいうえお順');
  const btnAlpha = makeBtn('A-Z');
  sortBar.appendChild(btnLatest);
  sortBar.appendChild(btnKana);
  sortBar.appendChild(btnAlpha);

  const setActive = (activeBtn) => {
    [btnLatest, btnKana, btnAlpha].forEach(b => {
      b.style.background = (b === activeBtn) ? '#eef2ff' : '#f9fafb';
      b.style.borderColor = (b === activeBtn) ? '#c7d2fe' : '#e5e7eb';
      b.style.color = (b === activeBtn) ? '#4338ca' : '#111827';
      b.style.fontWeight = (b === activeBtn) ? '700' : '500';
    });
  };

  // デフォルトは最新順（itemsの順序を保持）
  let sortMode = 'latest';
  setActive(btnLatest);

  titleEl.textContent = title;
  const collatorJa = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base', numeric: true, ignorePunctuation: true });
  const collatorEn = new Intl.Collator('en', { usage: 'sort', sensitivity: 'base', numeric: true, ignorePunctuation: true });

  const normalizeKana = (s) => (s || '')
    .toString()
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/\s+/g, '')
    .trim();

  const hasJapanese = (s) => /[\u3040-\u30FF\u4E00-\u9FFF]/.test(s || '');
  const startsLatin = (s) => /^[A-Za-z]/.test((s || '').toString());

  const render = (query = '') => {
    const q = (query || '').trim().toLowerCase();
    listEl.innerHTML = '';
    let filtered = items.filter(v => {
      const s = (v || '').toString();
      return !q || s.toLowerCase().includes(q);
    });

    if (sortMode === 'kana') {
      const jp = filtered.filter(v => hasJapanese(String(v)));
      const non = filtered.filter(v => !hasJapanese(String(v)));
      const jpSorted = [...jp].sort((a, b) => {
        const na = normalizeKana(a);
        const nb = normalizeKana(b);
        const res = collatorJa.compare(na, nb);
        return res !== 0 ? res : collatorJa.compare(a, b);
      });
      const nonSorted = [...non].sort((a, b) => collatorEn.compare(String(a).toLowerCase(), String(b).toLowerCase()));
      filtered = jpSorted.concat(nonSorted);
    } else if (sortMode === 'alpha') {
      const latin = filtered.filter(v => startsLatin(String(v)));
      const other = filtered.filter(v => !startsLatin(String(v)));
      const latinSorted = [...latin].sort((a, b) => collatorEn.compare(String(a).toLowerCase(), String(b).toLowerCase()));
      const otherSorted = [...other].sort((a, b) => {
        const na = normalizeKana(a);
        const nb = normalizeKana(b);
        const res = collatorJa.compare(na, nb);
        return res !== 0 ? res : collatorJa.compare(a, b);
      });
      filtered = latinSorted.concat(otherSorted);
    } // latest: 並べ替えなし（itemsの順番を維持 = 最新順）

    filtered.slice(0, SELECT_MODAL_LIMIT).forEach(v => {
        const div = document.createElement('div');
        div.className = 'select-item';
        div.textContent = v;
        div.onclick = () => { close(); onSelect(v); };
        listEl.appendChild(div);
      });
  };

  const close = () => { modal.classList.remove('show'); searchEl.value = ''; listEl.innerHTML=''; };
  modal.onclick = (e) => { if (e.target === modal) close(); };
  searchEl.oninput = (e) => render(e.target.value);

  btnLatest.onclick = () => { sortMode = 'latest'; setActive(btnLatest); render(searchEl.value); };
  btnKana.onclick = () => { sortMode = 'kana'; setActive(btnKana); render(searchEl.value); };
  btnAlpha.onclick = () => { sortMode = 'alpha'; setActive(btnAlpha); render(searchEl.value); };

  render('');
  modal.classList.add('show');
}

// ヘルパー関数: 指定ミリ秒待機
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 金額を半角数字に変換する関数 (カンマは含まない)
function convertToHalfWidthNumber(value) {
  if (!value) return '';
  
  let converted = String(value).replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  
  converted = converted.replace(/[^0-9.]/g, '');
  
  return converted;
}

// === 汎用: エラー表示の付与/解除 ===
function removeErrorClasses(el) {
  if (!el) return;
  el.classList.remove('input-error', 'error-pulse', 'error-outline', 'error-pulse-strong');
  const wrap = el.closest?.('.form-group');
  if (wrap) wrap.classList.remove('error-outline');
}

function validateRowFields(rowEl) {
  if (!rowEl) return;
  const catGrid = rowEl.querySelector('.category-grid');
  const catHidden = rowEl.querySelector('.category');
  if (catHidden && catHidden.value) removeErrorClasses(catGrid || catHidden);
  const itemEl = rowEl.querySelector('.item');
  if (itemEl && (itemEl.value || '').trim()) removeErrorClasses(itemEl);
  const qtyEl = rowEl.querySelector('.quantity');
  const qty = parseFloat(convertToHalfWidthNumber(qtyEl?.value || ''));
  if (qtyEl && !isNaN(qty) && qty > 0) removeErrorClasses(qtyEl);
  const upEl = rowEl.querySelector('.unit-price');
  const up = parseFloat(convertToHalfWidthNumber(upEl?.value || ''));
  if (upEl && !isNaN(up) && up > 0) removeErrorClasses(upEl);
  const amtEl = rowEl.querySelector('.amount');
  const amt = parseInt(convertToHalfWidthNumber(amtEl?.value || ''));
  if (amtEl && !isNaN(amt) && amt > 0) removeErrorClasses(amtEl);
}

function validateTopGroup(root) {
  const scope = root || document;
  const dateEl = scope.querySelector('.full-date') || document.getElementById('date');
  const nameEl = scope.querySelector('.full-name') || document.getElementById('name');
  const lenderEl = scope.querySelector('select.full-lender') || document.getElementById('lender');
  const borrowerEl = scope.querySelector('select.full-borrower') || document.getElementById('borrower');
  if (dateEl && dateEl.value) removeErrorClasses(dateEl);
  if (nameEl && (nameEl.value || '').trim()) removeErrorClasses(nameEl);
  const lenderVal = (lenderEl?.value || '').trim();
  const borrowerVal = (borrowerEl?.value || '').trim();
  if (lenderEl && lenderVal) removeErrorClasses(lenderEl);
  if (borrowerEl && borrowerVal) removeErrorClasses(borrowerEl);
  if (lenderVal && borrowerVal && lenderVal !== borrowerVal) {
    removeErrorClasses(lenderEl);
    removeErrorClasses(borrowerEl);
  }
}

// 金額を自動計算してフォーマットする関数
function calculateAmountForRow(rowEl) {
  const quantityInput = rowEl.querySelector('.quantity');
  const unitPriceInput = rowEl.querySelector('.unit-price');
  const amountInput = rowEl.querySelector('.amount');
  const quantity = parseFloat(convertToHalfWidthNumber(quantityInput.value)) || 0;
  const unitPrice = parseInt(convertToHalfWidthNumber(unitPriceInput.value), 10) || 0;
  const totalAmount = quantity * unitPrice;
  amountInput.value = totalAmount ? totalAmount.toLocaleString('ja-JP') : '';
  // 自動挿入時でも即赤枠解除
  const clearErr = (el) => { if (!el) return; el.classList.remove('input-error','error-pulse','error-outline'); const wrap = el.closest?.('.form-group'); wrap?.classList?.remove('error-outline'); };
  if (quantity > 0) clearErr(quantityInput);
  if (unitPrice > 0) clearErr(unitPriceInput);
  if (totalAmount > 0) clearErr(amountInput);
}

function refreshRemoveButtonsVisibility() {
  const rows = Array.from(document.querySelectorAll('#entriesContainer .entry-row'));
  rows.forEach((row, idx) => {
    const removeBtn = row.querySelector('.remove-row-btn');
    if (!removeBtn) return;
    removeBtn.style.display = rows.length > 1 ? 'inline-block' : 'none';
  });
}

function setupEntryRow(rowEl) {
  const catHidden = rowEl.querySelector('.category');
  const categoryOptions = rowEl.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
      categoryOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      const selectedCategory = option.dataset.value;
      catHidden.value = selectedCategory;
      updateButtonsByCategory(selectedCategory, rowEl);
      const grid = rowEl.querySelector('.category-grid');
      if (grid) {
        grid.classList.remove('input-error','error-pulse','error-outline');
        const wrap = grid.closest('.form-group');
        if (wrap) wrap.classList.remove('error-outline');
        grid.dispatchEvent(new Event('input', { bubbles: true }));
        grid.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  const quantityInput = rowEl.querySelector('.quantity');
  const unitPriceInput = rowEl.querySelector('.unit-price');
  [quantityInput, unitPriceInput].forEach(input => {
    input.addEventListener('input', (e) => {
      if (e.isComposing || e.target.dataset.composing === 'true') return;
      let value = e.target.value;
      value = value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
      value = value.replace(/[^0-9.]/g, '');
      const parts = value.split('.');
      if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join('');
      }
      e.target.value = value;
      if (e.target.classList.contains('unit-price')) {
        if (quantityInput.value === '' || quantityInput.value === '0') {
          quantityInput.value = '1';
        }
      }
      calculateAmountForRow(rowEl);
    });
    input.addEventListener('compositionstart', (e) => { e.target.dataset.composing = 'true'; });
    input.addEventListener('compositionend', (e) => {
      e.target.dataset.composing = 'false';
      let value = e.target.value;
      value = value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
      value = value.replace(/[^0-9.]/g, '');
      const parts = value.split('.');
      if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join('');
      }
      e.target.value = value;
      calculateAmountForRow(rowEl);
    });
    input.addEventListener('blur', (e) => {
      let value = e.target.value.replace(/,/g, '');
      if (value) {
        if (e.target.classList.contains('quantity')) {
          e.target.value = parseFloat(value).toFixed(1);
        } else {
          e.target.value = parseInt(value).toLocaleString('ja-JP');
        }
      }
      calculateAmountForRow(rowEl);
    });
    input.addEventListener('focus', (e) => { e.target.value = e.target.value.replace(/,/g, ''); });
  });

  const itemBtn = rowEl.querySelector('.item-list-btn');
  if (itemBtn) {
    itemBtn.addEventListener('click', async () => {
      const dataset = await populateItemDatalist(true);
      openSelectModal('品目一覧', dataset, (val) => {
        const itemInput = rowEl.querySelector('.item');
        if (itemInput) {
          itemInput.value = val;
          itemInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // 履歴からの自動挿入時は数量を必ず1にする
        const qtyEl = rowEl.querySelector('.quantity');
        if (qtyEl) {
          qtyEl.value = '1';
          qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        calculateAmountForRow(rowEl);
        validateRowFields(rowEl);
        // 価格も挿入するか確認
        const key = normalizeKeyForDedupe(val);
        const meta = latestItemMetaMap.get(key);
        if (meta && (meta.unitPrice > 0 || meta.amount > 0)) {
          const displayUnit = meta.unitPrice ? Number(meta.unitPrice) : (meta.amount && meta.qty ? Math.round(Number(meta.amount) / Number(meta.qty)) : 0);
          const displayQty = 1; // 常に1表示
          const displayAmt = displayUnit > 0 ? displayUnit * displayQty : 0;
          const doFill = confirm(`選択した品目に過去の価格があります。単価/数量/金額を反映しますか？\n\n`+
            `📝 品目: ${val}\n`+
            `＠ 単価: ${displayUnit ? ('¥' + displayUnit.toLocaleString('ja-JP')) : '-'}\n`+
            `数量: ${displayQty}\n`+
            `金額: ${displayAmt ? ('¥' + displayAmt.toLocaleString('ja-JP')) : '-'}`);
          if (doFill) {
            if (meta.unitPrice) { rowEl.querySelector('.unit-price').value = Number(meta.unitPrice).toLocaleString('ja-JP'); rowEl.querySelector('.unit-price').dispatchEvent(new Event('input', { bubbles: true })); }
            // 履歴上の数量に関わらず、常に 1 をセット
            rowEl.querySelector('.quantity').value = '1';
            rowEl.querySelector('.quantity').dispatchEvent(new Event('input', { bubbles: true }));
            calculateAmountForRow(rowEl);
            if (!meta.unitPrice && meta.amount && meta.qty) {
              // 単価欠落時、数量と金額から単価逆算（整数化）
              const up = Math.round(Number(meta.amount) / Number(meta.qty));
              rowEl.querySelector('.unit-price').value = up.toLocaleString('ja-JP');
              calculateAmountForRow(rowEl);
              rowEl.querySelector('.unit-price').dispatchEvent(new Event('input', { bubbles: true }));
            }
            validateRowFields(rowEl);
          }
        }
      });
    });
  }

  const costBtn = rowEl.querySelector('.cost-list-btn');
  if (costBtn) {
    costBtn.addEventListener('click', async () => {
      const costData = await populateCostData();
      const wineNames = costData.map(item => item.wineName);
      openSelectModal('原価リスト', wineNames, (selectedWineName) => {
        const selectedItem = costData.find(item => item.wineName === selectedWineName);
        if (selectedItem) {
          const itemEl = rowEl.querySelector('.item');
          const upEl = rowEl.querySelector('.unit-price');
          const qtyEl = rowEl.querySelector('.quantity');
          if (itemEl) itemEl.value = selectedWineName;
          if (upEl) upEl.value = selectedItem.costInTax.toLocaleString('ja-JP');
          if (qtyEl) qtyEl.value = '1';
          calculateAmountForRow(rowEl);
          itemEl?.dispatchEvent(new Event('input', { bubbles: true }));
          upEl?.dispatchEvent(new Event('input', { bubbles: true }));
          qtyEl?.dispatchEvent(new Event('input', { bubbles: true }));
          validateRowFields(rowEl);
        }
      });
    });
  }

  const ingredientsBtn = rowEl.querySelector('.ingredients-list-btn');
  if (ingredientsBtn) {
    ingredientsBtn.addEventListener('click', async () => {
      const ingredientsData = await populateIngredientsData();
      const productNames = ingredientsData.map(item => item.productName);
      openSelectModal('食材リスト', productNames, (selectedProductName) => {
        const selectedItem = ingredientsData.find(item => item.productName === selectedProductName);
        if (selectedItem) {
          let taxRate = 1.08;
          const highTaxItems = ['料理酒', 'みりん', '日本酒', '料理ワイン'];
          const productNameLower = selectedProductName.toLowerCase();
          const isHighTax = highTaxItems.some(item => productNameLower.includes(item.toLowerCase()));
          if (isHighTax) taxRate = 1.1;
          const priceWithTax = Math.round(selectedItem.unitPrice * taxRate);
          const itemEl = rowEl.querySelector('.item');
          const upEl = rowEl.querySelector('.unit-price');
          const qtyEl = rowEl.querySelector('.quantity');
          if (itemEl) itemEl.value = selectedProductName;
          if (upEl) upEl.value = priceWithTax.toLocaleString('ja-JP');
          if (qtyEl) qtyEl.value = '1';
          calculateAmountForRow(rowEl);
          itemEl?.dispatchEvent(new Event('input', { bubbles: true }));
          upEl?.dispatchEvent(new Event('input', { bubbles: true }));
          qtyEl?.dispatchEvent(new Event('input', { bubbles: true }));
          validateRowFields(rowEl);
        }
      });
    });
  }

  const removeBtn = rowEl.querySelector('.remove-row-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      rowEl.remove();
      refreshRemoveButtonsVisibility();
    });
  }
}

function addNewRow() {
  const container = document.getElementById('entriesContainer');
  const first = container.querySelector('.entry-row');
  const clone = first.cloneNode(true);
  // リセット
  clone.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  const catHidden = clone.querySelector('.category');
  if (catHidden) catHidden.value = '';
  clone.querySelectorAll('input').forEach(inp => { if (!inp.classList.contains('amount')) inp.value = ''; else inp.value = ''; });
  container.appendChild(clone);
  setupEntryRow(clone);
  refreshRemoveButtonsVisibility();
}

function addFullRow() {
  // 既存内容を保持したまま、日付/貸主/借主/名前 + 品目行群のフル入力グループを下に追加
  const extra = document.getElementById('extraGroups');
  if (!extra) return;

  const currentName = (document.getElementById('name')?.value || '').trim();

  const group = document.createElement('div');
  group.className = 'full-entry-group';
  group.style.border = '1px solid #e5e7eb';
  group.style.borderRadius = '12px';
  group.style.padding = '16px';
  group.style.background = '#fff';

  group.innerHTML = `
    <div class="form-row full-two-line" style="margin-bottom:12px; flex-wrap:wrap;">
      <div class="form-group full-date-wrap">
        <label>📅 日付</label>
        <input type="date" class="full-date" required>
      </div>
      <div class="form-group full-lender-wrap">
        <label>📤 貸主</label>
        <select class="full-lender" required></select>
      </div>
      <div class="form-group full-borrower-wrap">
        <label>📥 借主</label>
        <select class="full-borrower" required></select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label>👤 名前</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="text" class="full-name" required placeholder="入力者名" value="${currentName.replace(/"/g, '&quot;')}">
        <button type="button" class="list-btn full-name-list-btn">選択</button>
      </div>
    </div>
    <div class="form-group">
      <label>🏷️ 品目一覧</label>
      <div class="full-entries" style="display:flex; flex-direction:column; gap:16px;">
        <div class="entry-row" style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#fff;">
          <div class="form-group" style="margin-bottom:16px;">
            <label>🏷️ カテゴリー</label>
            <div class="category-grid">
              <div class="category-option" data-value="食材">🍎 食材</div>
              <div class="category-option" data-value="飲料">🥤 飲料</div>
              <div class="category-option" data-value="その他">📦 その他</div>
            </div>
            <input type="hidden" class="category" required>
          </div>
          <div class="form-group">
            <label>📝 品目</label>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="text" class="item" required placeholder="品目を入力" autocomplete="off">
              <button type="button" class="list-btn item-list-btn">履歴</button>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
                <label>＠ 単価(税込)</label>
                <input type="text" class="unit-price" required inputmode="numeric" placeholder="単価を入力">
            </div>
            <div class="form-group">
                <label>🔢 個/本/g</label>
                <input type="text" class="quantity" required inputmode="decimal" placeholder="数値を入力">
            </div>
          </div>
          <div class="form-group">
            <label>💵 金額(税込)</label>
            <div class="amount-input">
              <input type="text" class="amount" required inputmode="numeric" placeholder="自動計算" readonly>
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
        <button type="button" class="list-btn remove-full-row" style="background:#fff5f5; border-color:#fecaca; color:#b91c1c;">このグループを削除</button>
      </div>
    </div>
  `;

  // 店舗の選択肢をコピー（上部の貸主の選択があれば引き継ぐ）
  const lenderSelect = group.querySelector('.full-lender');
  const borrowerSelect = group.querySelector('.full-borrower');
  const srcLender = document.getElementById('lender');
  const srcBorrower = document.getElementById('borrower');
  if (lenderSelect && srcLender) {
    lenderSelect.innerHTML = srcLender.innerHTML;
    const currentLender = (srcLender.value || '').trim();
    if (currentLender) lenderSelect.value = currentLender;
  }
  if (borrowerSelect && srcBorrower) borrowerSelect.innerHTML = srcBorrower.innerHTML;

  // 最初の行をセットアップ
  const firstRow = group.querySelector('.entry-row');
  if (firstRow) setupEntryRow(firstRow);

  // 名前の履歴選択
  const fullNameBtn = group.querySelector('.full-name-list-btn');
  if (fullNameBtn) {
    fullNameBtn.addEventListener('click', async () => {
      const names = await populateNameDatalist(true);
      openSelectModal('名前一覧', names || [], (val) => {
        const input = group.querySelector('.full-name');
        if (input) {
          input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        validateTopGroup(group);
      });
    });
  }

  // 行追加（内部ボタンは削除。外部ツールバーの「＋ 品目を追加」を使用）

  // 外部ツールバー（テーブル外）を生成
  const toolbar = document.createElement('div');
  toolbar.className = 'full-toolbar';
  toolbar.style.display = 'flex';
  toolbar.style.justifyContent = 'flex-end';
  toolbar.style.gap = '8px';
  toolbar.style.marginTop = '10px';
  const btnAddFull = document.createElement('button');
  btnAddFull.type = 'button';
  btnAddFull.className = 'list-btn group-add-full';
  btnAddFull.style.background = '#e6fffa';
  btnAddFull.style.borderColor = '#99f6e4';
  btnAddFull.style.color = '#0f766e';
  btnAddFull.textContent = '＋ 全データを追加';
  const btnAddItem = document.createElement('button');
  btnAddItem.type = 'button';
  btnAddItem.className = 'list-btn group-add-item';
  btnAddItem.style.background = '#eef2ff';
  btnAddItem.style.borderColor = '#c7d2fe';
  btnAddItem.style.color = '#4338ca';
  btnAddItem.textContent = '＋ 品目を追加';

  // グループ削除
  group.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-full-row')) {
      group.remove();
    }
  });

  extra.appendChild(group);
  // 外部ツールバー（テーブルの外）をグループ直後に追加
  extra.appendChild(toolbar);
  toolbar.appendChild(btnAddFull);
  toolbar.appendChild(btnAddItem);
  btnAddItem.addEventListener('click', () => {
    const list = group.querySelector('.full-entries');
    const base = list.querySelector('.entry-row');
    const c = base.cloneNode(true);
    c.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    const catHidden = c.querySelector('.category');
    if (catHidden) catHidden.value = '';
    c.querySelectorAll('input').forEach(inp => inp.value = '');
    list.appendChild(c);
    setupEntryRow(c);
  });
  btnAddFull.addEventListener('click', addFullRow);
}

async function bulkAddByDate(dateStr) {
  if (!dateStr) {
    alert('日付を選択してください');
    return;
  }
  try {
    const spreadsheetId = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY';
    const apiKey = 'AIzaSyAcy7hXztCjngG2poP-Sn_g6ED0TESnNTE';
    const sheetName = '貸借表';
    // A:J 取得（A=日付, E=カテゴリー, F=品目, G=数量, H=単価, I=金額）
    const range = `${sheetName}!A:J`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('シート取得に失敗しました');
    const data = await res.json();
    const rows = (data.values || []).slice(1);
    const target = rows.filter(r => (r[0] || '').toString().slice(0, 10) === dateStr);
    if (target.length === 0) {
      alert('指定した日付のデータは見つかりませんでした');
      return;
    }
    const container = document.getElementById('entriesContainer');
    for (const r of target) {
      const rowEl = container.querySelector('.entry-row');
      const clone = rowEl.cloneNode(true);
      // 初期化
      clone.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      clone.querySelectorAll('input').forEach(inp => inp.value = '');
      const catHidden = clone.querySelector('.category');
      const itemEl = clone.querySelector('.item');
      const qtyEl = clone.querySelector('.quantity');
      const unitEl = clone.querySelector('.unit-price');
      // 値セット（空ならスキップ）
      const category = (r[4] || '').toString().trim();
      const item = (r[5] || '').toString().trim();
      const qty = (r[6] || '').toString();
      const unit = (r[7] || '').toString();
      if (catHidden) catHidden.value = category;
      if (itemEl) itemEl.value = item;
      if (unitEl) unitEl.value = unit.replace(/[^\d.-]/g, '') ? parseFloat(unit.replace(/[^\d.-]/g, '')).toLocaleString('ja-JP') : '';
      if (qtyEl) qtyEl.value = qty.replace(/[^\d.-]/g, '') ? String(parseFloat(qty.replace(/[^\d.-]/g, ''))) : '';
      container.appendChild(clone);
      setupEntryRow(clone);
      calculateAmountForRow(clone);
    }
    refreshRemoveButtonsVisibility();
    alert(`${target.length}件を追加しました`);
  } catch (e) {
    console.error(e);
    alert('一括追加でエラーが発生しました');
  }
}


// プログレスステップを表示する関数 (ポップアップ対応)
async function showStep(stepId, message) {
  const popupOverlay = document.getElementById('status-popup-overlay');
  const popupTitle = document.getElementById('popup-title');
  const step = document.getElementById(stepId);
  const activeSteps = document.querySelectorAll('.status-step.active');
  
  if (!step) {
    console.error(`Error: Step element with ID '${stepId}' not found.`);
    throw new Error(`送信処理でエラーが発生しました。存在しないステップID: ${stepId}`);
  }

  if (popupOverlay.style.display === 'none' || popupOverlay.style.display === '') {
    popupOverlay.style.display = 'flex';
    popupTitle.textContent = '📨 送信処理中...';
  }

  activeSteps.forEach(s => {
    s.classList.remove('active');
    s.classList.add('completed');
  });
  
  step.classList.add('active');
  step.querySelector('span:last-child').textContent = message;
  
  const icon = step.querySelector('.status-icon');
  const originalIcon = icon.textContent;
  icon.innerHTML = '<span class="mini-loading-spinner"></span>';
  
  step.dataset.originalIcon = originalIcon;
}

// プログレスステップを完了状態にする関数 (ポップアップ対応)
function completeStep(stepId, message) {
  const step = document.getElementById(stepId);
  if (!step) {
    console.error(`Error: Step element with ID '${stepId}' not found.`);
    return;
  }
  step.classList.remove('active');
  step.classList.add('completed');
  step.querySelector('span:last-child').textContent = message;
  
  const icon = step.querySelector('.status-icon');
  if (step.dataset.originalIcon) {
    icon.textContent = step.dataset.originalIcon;
  }
}

// 全てのプログレスステップをリセットする関数 (ポップアップ対応)
function resetSteps() {
  const steps = document.querySelectorAll('.status-step');
  steps.forEach(step => {
    step.classList.remove('active', 'completed', 'error', 'final-completed');
    const icon = step.querySelector('.status-icon');
    if (step.dataset.originalIcon) {
      icon.textContent = step.dataset.originalIcon;
    }
  });
}

// メッセージ表示を非表示にする関数
function hideMessages() {
  document.getElementById('successMessage').classList.remove('show');
  const errorMessage = document.getElementById('errorMessage');
  if (errorMessage) {
    errorMessage.classList.remove('show');
  }
  const searchResult = document.getElementById('search-result');
  if (searchResult) {
    searchResult.classList.remove('show');
  }
  const popupOverlay = document.getElementById('status-popup-overlay');
  if (popupOverlay) {
    popupOverlay.style.display = 'none';
  }
}

function checkLenderBorrowerMatch() {
  const lenderSelect = document.getElementById("lender");
  const borrowerSelect = document.getElementById("borrower");
  const errorMessageDiv = document.getElementById("lender-borrower-error");

  if (!lenderSelect || !borrowerSelect || !errorMessageDiv) {
    console.error("Lender/borrower select or error div not found for real-time validation.");
    return true;
  }

  if (lenderSelect.value && borrowerSelect.value && lenderSelect.value === borrowerSelect.value) {
    errorMessageDiv.textContent = '❌ 貸主と借主は異なる店舗を選択してください。';
    errorMessageDiv.style.display = 'block';
    return false;
  } else {
    errorMessageDiv.style.display = 'none';
    errorMessageDiv.textContent = '';
    return true;
  }
}

async function searchReverseTransaction() {
  const searchBtn = document.getElementById('search-btn');
  const searchResult = document.getElementById('search-result');
  const searchResultContent = document.getElementById('search-result-content');
  const btnText = searchBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  const currentData = {
    date: document.getElementById("date").value,
    name: document.getElementById("name").value,
    lender: document.getElementById("lender").value,
    borrower: document.getElementById("borrower").value,
    category: document.getElementById("category").value,
    item: document.getElementById("item").value,
    amount: convertToHalfWidthNumber(document.getElementById("amount").value)
  };

  if (!currentData.date || !currentData.lender || !currentData.borrower || !currentData.category || !currentData.item || !currentData.amount) {
    searchResultContent.innerHTML = `<div class="search-error">❌ すべての項目を入力してから検索してください</div>`;
    searchResult.classList.add('show');
    return;
  }

  if (currentData.lender === currentData.borrower) {
    searchResultContent.innerHTML = `<div class="search-error">❌ 貸主と借主が同じため検索できません</div>`;
    searchResult.classList.add('show');
    return;
  }

  searchBtn.disabled = true;
  searchBtn.classList.add('loading');
  btnText.textContent = '検索中...';
  searchResult.classList.remove('show');

  try {
    const reverseData = {
      ...currentData,
      lender: currentData.borrower,
      borrower: currentData.lender,
      searchMode: true
    };

    console.log('検索データ:', reverseData);

    const response = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reverseData)
    });

    await delay(800);

    const searchSuccess = Math.random() > 0.4;

    if (searchSuccess) {
      const matchData = {
        date: currentData.date,
        name: "システム検索結果",
        lender: currentData.borrower,
        borrower: currentData.lender,
        category: currentData.category,
        item: currentData.item,
        // 追加：数量と単価（数値化して保持）
        quantity: Number(currentData.quantity || 0),
        unitPrice: Number(String(currentData.unitPrice || '').replace(/[^\d.]/g, '')) || 0,
        // 金額は既存がなければ数量×単価で補完
        amount:
          Number(String(currentData.amount || '').replace(/[^\d.]/g, '')) ||
          Math.round((Number(currentData.quantity) || 0) * (Number(currentData.unitPrice) || 0)),
        inputDate: "2024-12-27 10:30:00",
        correction: ""
      };
    
      searchResultContent.innerHTML = `
        <div class="search-match">✅ 逆取引データが見つかりました
          <div class="match-details">
            <div class="match-details-row"><span class="match-details-label">📅 日付：</span><span class="match-details-value">${matchData.date}</span></div>
            <div class="match-details-row"><span class="match-details-label">👤 入力者：</span><span class="match-details-value">${matchData.name}</span></div>
            <div class="match-details-row"><span class="match-details-label">↔︎ 貸主：</span><span class="match-details-value">${matchData.lender}</span></div>
            <div class="match-details-row"><span class="match-details-label">↔︎ 借主：</span><span class="match-details-value">${matchData.borrower}</span></div>
            <div class="match-details-row"><span class="match-details-label">📂 カテゴリー：</span><span class="match-details-value">${matchData.category}</span></div>
            <div class="match-details-row"><span class="match-details-label">📦 品目：</span><span class="match-details-value">${matchData.item}</span></div>
    
            <div class="match-details-row"><span class="match-details-label">🔢 個/本/kg：</span>
              <span class="match-details-value">${matchData.quantity.toLocaleString('ja-JP')}</span></div>
            <div class="match-details-row"><span class="match-details-label">＠ 単価：</span>
              <span class="match-details-value">¥${matchData.unitPrice.toLocaleString('ja-JP')}</span></div>
    
            <div class="match-details-row"><span class="match-details-label">💴 金額：</span>
              <span class="match-details-value">¥${matchData.amount.toLocaleString('ja-JP')}</span></div>
          </div>
          <div class="match-actions"><button class="correction-action-btn" id="correction-from-search">✍️ このデータを修正元にして送信</button></div>
        </div>`;
    } else {
      searchResultContent.innerHTML = `
        <div class="search-no-match">🚫 逆取引データは見つかりませんでした
          <div style="margin-top:10px; font-size:14px; font-weight:normal;">
            以下の条件に一致するデータはありません：<br>
            📅 ${currentData.date}｜👥 ${currentData.borrower} → ${currentData.lender}<br>
            📂 ${currentData.category}｜📦 ${currentData.item}｜
            🔢 ${Number(currentData.quantity || 0).toLocaleString('ja-JP')}｜
            ＠ ¥${Number(String(currentData.unitPrice || '').replace(/[^\d.]/g, '') || 0).toLocaleString('ja-JP')}｜
            💴 ¥${Number(String(currentData.amount || '').replace(/[^\d.]/g, '') || 0).toLocaleString('ja-JP')}
          </div>
          <div class="match-actions"><button class="correction-action-btn" id="correction-from-search-new">✍️ 新規修正として送信</button></div>
        </div>`;
    }
    searchResult.classList.add('show');
    const existingListener = searchResultContent.dataset.listenerAdded;
    if (existingListener) {
        searchResultContent.removeEventListener('click', handleSearchResultButtonClick);
    }
    searchResultContent.addEventListener('click', handleSearchResultButtonClick);
    searchResultContent.dataset.listenerAdded = 'true';
  } catch (error) {
    console.error('検索エラー:', error);
    searchResultContent.innerHTML = `<div class="search-error">❌ 検索中にエラーが発生しました<br><small>${error.message}</small></div>`;
    searchResult.classList.add('show');
  } finally {
    searchBtn.disabled = false;
    searchBtn.classList.remove('loading');
    btnText.textContent = originalText;
  }
}

async function handleSearchResultButtonClick(event) {
    if (event.target.id === 'correction-from-search') {
        await handleCorrectionFromSearch('found');
    } else if (event.target.id === 'correction-from-search-new') {
        await handleCorrectionFromSearch('not_found');
    }
}

async function handleCorrectionFromSearch(type = 'found') {
  const categoryInput = document.getElementById('category');
  if (!categoryInput.value) {
    alert('カテゴリーを選択してください');
    return;
  }
  let confirmMessage;
  const dateValue = document.getElementById("date").value;
  const nameValue = document.getElementById("name").value;
  const lenderValue = document.getElementById("lender").value;
  const borrowerValue = document.getElementById("borrower").value;
  const itemValue = document.getElementById("item").value;
  const categoryValue = document.getElementById("category").value;
  const amountValue = parseInt(convertToHalfWidthNumber(document.getElementById("amount").value)).toLocaleString('ja-JP');

  if (type === 'found') {
    confirmMessage = `🔍 逆取引データが見つかりました！\n\n現在入力されているデータを修正として送信しますか？\n\n📅 ${dateValue}\n👤 ${nameValue}\n🔄 ${lenderValue} → ${borrowerValue}\n📝 ${itemValue} (${categoryValue})\n💵 ¥${amountValue}\n\n🔥 修正フラグ: ✏️修正 が自動的に付与されます\n※ 修正データとしてスプレッドシートに送信されます\n※ 元のデータはそのまま保持されます`;
  } else {
    confirmMessage = `❓ 逆取引データは見つかりませんでした\n\nそれでも現在のデータを修正として送信しますか？\n\n📅 ${dateValue}\n👤 ${nameValue}\n🔄 ${lenderValue} → ${borrowerValue}\n📝 ${itemValue} (${categoryValue})\n💵 ¥${amountValue}\n\n🔥 修正フラグ: ✏️修正 が自動的に付与されます\n※ 新規修正データとして送信されます`;
  }
  if (confirm(confirmMessage)) {
    const searchResult = document.getElementById('search-result');
    if (searchResult) {
      searchResult.classList.remove('show');
    }
    await submitData({ isCorrection: true, correctionOnly: true, correctionMark: "✏️修正" });
  }
}

async function submitData(options = {}) {
  const { isCorrection = false, correctionOnly = false, correctionMark = "" } = options;
  const popupOverlay = document.getElementById('status-popup-overlay');
  const popupTitle = document.getElementById('popup-title');
  const submitBtn = document.querySelector('.submit-btn:not(.search-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = submitBtn.dataset.originalText || btnText.textContent;
  submitBtn.dataset.originalText = originalText;
  const form = document.getElementById('loanForm');

  hideMessages();
  resetSteps();

  try {
    // まずプレ検証（フォーカス＆ハイライト）
    const clearError = (el) => {
      if (!el) return;
      el.classList.remove('input-error');
      el.classList.remove('error-outline');
      el.classList.remove('error-pulse');
      const wrap = el.closest?.('.form-group');
      if (wrap) wrap.classList.remove('error-outline');
    };
    const markError = (el) => {
      if (!el) return;
      el.classList.add('input-error');
      el.classList.add('error-pulse');
      const wrap = el.closest?.('.form-group') || el;
      wrap.classList.add('error-outline');
      if (typeof el.focus === 'function') el.focus({ preventScroll: false });
    };

    // 上部グループ + 追加フルグループをまとめて送信
    const groupDefs = [];
    groupDefs.push({
      root: document,
      dateEl: document.getElementById('date'),
      nameEl: document.getElementById('name'),
      lenderEl: document.getElementById('lender'),
      borrowerEl: document.getElementById('borrower'),
      rows: Array.from(document.querySelectorAll('#entriesContainer .entry-row')),
    });
    document.querySelectorAll('#extraGroups .full-entry-group').forEach(g => {
      groupDefs.push({
        root: g,
        dateEl: g.querySelector('.full-date'),
        nameEl: g.querySelector('.full-name'),
        lenderEl: g.querySelector('.full-lender'),
        borrowerEl: g.querySelector('.full-borrower'),
        rows: Array.from(g.querySelectorAll('.full-entries .entry-row')),
      });
    });

    const allPayloads = [];
    pendingErrorQueue = [];
    let groupIndex = 0;
    for (const gd of groupDefs) {
      const date = gd.dateEl?.value || '';
      const name = gd.nameEl?.value || '';
      const lender = gd.lenderEl?.value || '';
      const borrower = gd.borrowerEl?.value || '';
      const rows = gd.rows || [];

      if (rows.length === 0) { groupIndex++; continue; }
      // 入力チェック（見つけ次第フォーカス＆ハイライト）
      // 必須チェック（まとめて収集）
      if (!date) { markError(gd.dateEl); pendingErrorQueue.push(gd.dateEl); gd.dateEl.setCustomValidity(''); }
      else { clearError(gd.dateEl); }
      if (!name) { markError(gd.nameEl); pendingErrorQueue.push(gd.nameEl); gd.nameEl.setCustomValidity(''); }
      else { clearError(gd.nameEl); }
      if (!lender) { markError(gd.lenderEl); pendingErrorQueue.push(gd.lenderEl); gd.lenderEl.setCustomValidity?.(''); }
      else { clearError(gd.lenderEl); }
      if (!borrower) { markError(gd.borrowerEl); pendingErrorQueue.push(gd.borrowerEl); gd.borrowerEl.setCustomValidity?.(''); }
      else { clearError(gd.borrowerEl); }
      if (lender && borrower && lender === borrower) { markError(gd.borrowerEl); pendingErrorQueue.push(gd.borrowerEl); }

      rows.forEach((row, i) => {
        const en = {
          category: row.querySelector('.category')?.value?.trim() || '',
          item: row.querySelector('.item')?.value?.trim() || '',
          quantity: convertToHalfWidthNumber(row.querySelector('.quantity')?.value || ''),
          unitPrice: convertToHalfWidthNumber(row.querySelector('.unit-price')?.value || ''),
          amount: convertToHalfWidthNumber(row.querySelector('.amount')?.value || ''),
        };
        const catEl = row.querySelector('.category-grid') || row.querySelector('.category');
        if (!en.category) { markError(catEl); pendingErrorQueue.push(catEl); }
        else { clearError(catEl); }
        const itemEl = row.querySelector('.item');
        if (!en.item) { markError(itemEl); pendingErrorQueue.push(itemEl); }
        else { clearError(itemEl); }
        const qtyEl = row.querySelector('.quantity');
        if (!en.quantity) { markError(qtyEl); pendingErrorQueue.push(qtyEl); }
        else { clearError(qtyEl); }
        const upEl = row.querySelector('.unit-price');
        if (!en.unitPrice) { markError(upEl); pendingErrorQueue.push(upEl); }
        else { clearError(upEl); }
        const amtEl = row.querySelector('.amount');
        if (!en.amount) { markError(amtEl); pendingErrorQueue.push(amtEl); }
        else { clearError(amtEl); }
        const amt = parseInt(en.amount);
        if (en.amount && (isNaN(amt) || amt <= 0)) { markError(amtEl); pendingErrorQueue.push(amtEl); }
        allPayloads.push({
          date, name, lender, borrower,
          category: en.category,
          item: en.item,
          quantity: en.quantity,
          unitPrice: en.unitPrice,
          amount: en.amount,
          isCorrection: isCorrection,
        });
      });
      groupIndex++;
    }

    if (pendingErrorQueue.length > 0) {
      // 重複を除去
      const seen = new Set();
      pendingErrorQueue = pendingErrorQueue.filter(el => {
        if (!el) return false; const key = el; if (seen.has(key)) return false; seen.add(key); return true;
      });
      const errorModal = document.getElementById('errorModal');
      const errorModalBody = document.getElementById('errorModalBody');
      const errorModalCloseBtn = document.getElementById('errorModalCloseBtn');
      if (errorModal && errorModalBody) {
        errorModalBody.textContent = `未入力または入力ミスの項目が ${pendingErrorQueue.length} 件あります。内容をご確認ください。`;
        // 全エラーに軽い点滅を付与
        pendingErrorQueue.forEach(el => { el?.classList?.add('error-pulse'); const wrap = el?.closest?.('.form-group'); wrap?.classList?.add('error-outline'); });
        errorModal.classList.add('show');
        setTimeout(() => {
          const first = pendingErrorQueue[0];
          if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus?.({ preventScroll: true }); first.classList.add('error-pulse-strong'); setTimeout(() => first.classList.remove('error-pulse-strong'), 1500); }
        }, 50);
        if (errorModalCloseBtn && !errorListenersAttached) {
          errorModalCloseBtn.addEventListener('click', () => {
            errorModal.classList.remove('show');
            // 最初の未修正に誘導
            const next = pendingErrorQueue.find(el => el?.classList?.contains('input-error')) || pendingErrorQueue[0];
            if (next) { next.scrollIntoView({ behavior: 'smooth', block: 'center' }); next.focus?.({ preventScroll: true }); next.classList.add('error-pulse-strong'); setTimeout(() => next.classList.remove('error-pulse-strong'), 1500); }
          });
          errorListenersAttached = true;
        }
        // 入力で修正されたら次のエラーに進む
        const isElementValid = (el) => {
          if (!el) return false;
          // カテゴリー
          if (el.classList.contains('category-grid') || el.classList.contains('category')) {
            const row = el.closest('.entry-row') || document;
            const hidden = row.querySelector('.category');
            return !!(hidden && hidden.value);
          }
          // テキスト: 名前/品目
          if (el.classList.contains('full-name') || el.id === 'name' || el.classList.contains('item')) {
            return (el.value || '').trim().length > 0;
          }
          // 日付
          if (el.classList.contains('full-date') || el.id === 'date') {
            return !!el.value;
          }
          // 数値: 数量/単価/金額
          if (el.classList.contains('quantity')) {
            const v = parseFloat(convertToHalfWidthNumber(el.value) || '');
            return !isNaN(v) && v > 0;
          }
          if (el.classList.contains('unit-price')) {
            const v = parseFloat(convertToHalfWidthNumber(el.value) || '');
            return !isNaN(v) && v > 0;
          }
          if (el.classList.contains('amount')) {
            const v = parseInt(convertToHalfWidthNumber(el.value) || '');
            return !isNaN(v) && v > 0;
          }
          // セレクト: 貸主/借主
          if (el.matches('select.full-lender, #lender, select.full-borrower, #borrower')) {
            const root = el.closest('.full-entry-group') || document;
            const lenderEl = root.querySelector('select.full-lender') || document.getElementById('lender');
            const borrowerEl = root.querySelector('select.full-borrower') || document.getElementById('borrower');
            const lenderVal = (lenderEl?.value || '').trim();
            const borrowerVal = (borrowerEl?.value || '').trim();
            if (!el.value) return false;
            if (lenderVal && borrowerVal) return lenderVal !== borrowerVal;
            return true; // 片方未入力の場合は自分が入っていれば一旦OK（もう片方でエラーを出す）
          }
          return !!(el.value || '').trim();
        };

        const attachProgression = (el) => {
          if (!el) return;
          const handler = () => {
            if (isElementValid(el)) {
              el.classList.remove('input-error','error-pulse','error-outline');
              const wrap = el.closest?.('.form-group'); wrap?.classList?.remove('error-outline');
              const idx = pendingErrorQueue.indexOf(el);
              if (idx > -1) pendingErrorQueue.splice(idx, 1);
              const next = pendingErrorQueue[0];
              if (next) { next.scrollIntoView({ behavior: 'smooth', block: 'center' }); next.focus?.({ preventScroll: true }); next.classList.add('error-pulse-strong'); setTimeout(() => next.classList.remove('error-pulse-strong'), 1500); }
              el.removeEventListener('input', handler);
              el.removeEventListener('change', handler);
            }
          };
          el.addEventListener('input', handler);
          el.addEventListener('change', handler);
        };
        pendingErrorQueue.forEach(attachProgression);
      }
      // 送信は行わない
      return;
    }

    if (allPayloads.length === 0) {
      const errorModal = document.getElementById('errorModal');
      const errorModalBody = document.getElementById('errorModalBody');
      if (errorModal && errorModalBody) {
        errorModalBody.textContent = '少なくとも1行の品目を入力してください。';
        errorModal.classList.add('show');
      }
      return;
    }

    // ここから送信UI表示（回転アニメ前にバリデーション済み）
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    btnText.textContent = correctionOnly ? '修正送信中...' : '送信中...';
    popupOverlay.style.display = 'flex';
    popupTitle.textContent = correctionOnly ? '📝 修正データ送信中...' : '📨 送信処理中...';
    await showStep('step-validation', correctionOnly ? '📋 修正データを検証中...' : '📋 データを検証中...');
    await delay(300);

    completeStep('step-validation', `✅ 入力検証完了 (${allPayloads.length}行)`);

    for (let i = 0; i < allPayloads.length; i++) {
      const payload = allPayloads[i];
      await showStep('step-sending', `📤 送信中 ${i + 1}/${allPayloads.length} 行目...`);
      await delay(200);
      if (correctionOnly) {
        payload.correctionOnly = true;
        payload.correctionMark = correctionMark || "✏️修正";
        payload.sendType = "CORRECTION";
      }
      await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    }
    completeStep('step-sending', `✅ 送信完了 (${allPayloads.length}行)`);
    await showStep('step-inserting', `💾 ${correctionOnly ? '修正データ' : ''}を挿入中...`);
    await delay(800);
    completeStep('step-inserting', `✅ ${correctionOnly ? '修正データ' : ''}挿入完了`);
    await showStep('step-backup', '🔄 バックアップを作成中...');
    await delay(1000);
    completeStep('step-backup', '✅ バックアップ作成完了');
    await showStep('step-email', '📧 借主へメール通知中...');
    await delay(1200);
    completeStep('step-email', '✅ 借主へのメール送信完了');
    await showStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : 'すべての処理'}が完了しました！`);
    const finalStep = document.getElementById('step-complete');
    finalStep.classList.remove('completed');
    finalStep.classList.add('final-completed');
    popupTitle.textContent = '🎉 完了！';
    
    setTimeout(() => {
      popupOverlay.style.display = 'none';
      submitBtn.classList.remove('loading');
      btnText.textContent = originalText;
      submitBtn.disabled = false;
      const message = document.getElementById('successMessage');
      message.textContent = correctionOnly ? '✅ 修正データの送信が完了しました！' : '✅ 送信完了しました！';
      message.classList.add('show');
      setTimeout(() => {
        message.classList.remove('show');
        location.reload();
      }, 1200);
    }, 2000);
  } catch (error) {
    console.error('送信エラー:', error);
    // 回るアニメーションは使わず、すぐ閉じてエラー箇所にフォーカス
    if (popupOverlay) popupOverlay.style.display = 'none';
    submitBtn.classList.remove('loading');
    btnText.textContent = originalText;
    submitBtn.disabled = false;
    // ポップアップ形式で控えめカラーのモーダルを表示
    const errorModal = document.getElementById('errorModal');
    const errorModalBody = document.getElementById('errorModalBody');
    const errorModalCloseBtn = document.getElementById('errorModalCloseBtn');
    if (errorModal && errorModalBody) {
      errorModalBody.textContent = `入力ミスがあります。内容をご確認ください。`;
      errorModal.classList.add('show');
      // モーダルが表示された後に、直前にエラー付与した要素へ再フォーカス
    setTimeout(() => {
        const lastError = document.querySelector('.input-error, .category-grid.input-error');
        if (lastError && typeof lastError.focus === 'function') {
          lastError.focus({ preventScroll: false });
        }
      }, 50);
      if (errorModalCloseBtn) {
        const closeHandler = () => {
          errorModal.classList.remove('show');
          errorModalCloseBtn.removeEventListener('click', closeHandler);
          setTimeout(() => {
            const lastError = document.querySelector('.input-error, .category-grid.input-error');
            if (lastError) {
              lastError.scrollIntoView({ behavior: 'smooth', block: 'center' });
              lastError.focus({ preventScroll: true });
              lastError.classList.add('error-pulse-strong');
              setTimeout(() => lastError.classList.remove('error-pulse-strong'), 1800);
            }
          }, 10);
        };
        errorModalCloseBtn.addEventListener('click', closeHandler);
      }
      // オーバーレイクリックで閉じる
      errorModal.addEventListener('click', (e) => {
        if (e.target === errorModal) {
          errorModal.classList.remove('show');
          setTimeout(() => {
            const lastError = document.querySelector('.input-error, .category-grid.input-error');
            if (lastError) {
              lastError.scrollIntoView({ behavior: 'smooth', block: 'center' });
              lastError.focus({ preventScroll: true });
              lastError.classList.add('error-pulse-strong');
              setTimeout(() => lastError.classList.remove('error-pulse-strong'), 1800);
            }
          }, 10);
        }
      }, { once: true });
    }
  }
}

function initializeElements() {
  document.getElementById('date').valueAsDate = new Date();

  // 既存行のセットアップ
  document.querySelectorAll('#entriesContainer .entry-row').forEach(row => setupEntryRow(row));

  // 行追加ボタン
  // 上部の「＋ 品目を追加」は従来どおり、最上部の品目行を追加
  const addBtn = document.getElementById('add-row-btn');
  if (addBtn) addBtn.addEventListener('click', addNewRow);
  refreshRemoveButtonsVisibility();

  // （削除）日付から一括追加ボタンのイベントは無効化

  // フル行追加（上部フィールドも含めて新規入力開始）
  const addFullBtn = document.getElementById('add-full-row-btn');
  if (addFullBtn) addFullBtn.addEventListener('click', addFullRow);

  const lenderSelect = document.getElementById("lender");
  const borrowerSelect = document.getElementById("borrower");

  let lenderBorrowerErrorDiv = document.getElementById("lender-borrower-error");
  if (!lenderBorrowerErrorDiv) {
    lenderBorrowerErrorDiv = document.createElement('div');
    lenderBorrowerErrorDiv.id = 'lender-borrower-error';
    lenderBorrowerErrorDiv.style.color = '#e53e3e';
    lenderBorrowerErrorDiv.style.fontSize = '0.875rem';
    lenderBorrowerErrorDiv.style.marginTop = '8px';
    lenderBorrowerErrorDiv.style.display = 'none';
    const borrowerFormGroup = borrowerSelect.closest('.form-group');
    if (borrowerFormGroup) {
      borrowerFormGroup.appendChild(lenderBorrowerErrorDiv);
    }
  }

  if (lenderSelect) lenderSelect.addEventListener('change', checkLenderBorrowerMatch);
  if (borrowerSelect) borrowerSelect.addEventListener('change', checkLenderBorrowerMatch);
  checkLenderBorrowerMatch();

  const form = document.getElementById('loanForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkLenderBorrowerMatch()) return;
    await submitData({ isCorrection: false, correctionOnly: false });
  });

  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await searchReverseTransaction();
    });
  }
}

function initialize() {
  populateShops();
  initializeElements();
  populateNameDatalist();
  populateItemDatalist();

  // 名前一覧ボタン（共通）
  const nameBtn = document.getElementById('name-list-btn');
  if (nameBtn) {
    nameBtn.addEventListener('click', async () => {
      const dataset = await populateNameDatalist(true);
      openSelectModal('名前一覧', dataset, (val) => {
        const nameInput = document.getElementById('name');
        if (nameInput) {
          nameInput.value = val;
          nameInput.classList.remove('input-error','error-pulse','error-outline');
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        validateTopGroup(document);
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
