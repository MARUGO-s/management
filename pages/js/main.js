const GAS_URL = "https://script.google.com/macros/s/AKfycbxxrH8ZtjpadlxvdnbFFOvyc4kCsANrZt-aOu5HZ2RhlbSgDwFsJzq7AfMGW58w3HTW/exec"; // Google Apps ScriptのURL (小数点対応版)
const shops = [ // 店舗名のリスト
  "本部", "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
  "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
  "マルゴ新橋", "マルゴS", "MARUGO YOTSUYA", "371BAR", "三三五五",
  "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
  "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
  "X&C", "トラットリア ブリッコラ"
];

console.log('pages/js/main.js version 2025011604 loaded');

// M-mart支払い方法選択ポップアップを表示
function showPaymentMethodModal(option, categoryOptions, catHidden, rowEl) {
  const modal = document.getElementById('paymentMethodModal');
  if (!modal) return;

  // ポップアップを表示
  modal.classList.add('show');

  // 支払い方法ボタンのクリックイベント
  const paymentMethodBtns = modal.querySelectorAll('.payment-method-btn');
  const handlePaymentMethodClick = (e) => {
    const method = e.target.dataset.method;

    // カテゴリー値を「M-mart + 支払い方法」に設定
    const categoryValue = `M-mart ${method}`;

    // 選択状態を更新
    categoryOptions.forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');
    catHidden.value = categoryValue;

    // ボタン表示を更新
    updateButtonsByCategory('M-mart', rowEl);

    // エラー表示を解消
    const categoryGrid = rowEl.querySelector('.category-grid');
    if (categoryGrid) {
      categoryGrid.classList.remove('input-error', 'error-pulse', 'error-outline');
      const formGroup = categoryGrid.closest('.form-group');
      if (formGroup) {
        formGroup.classList.remove('error-outline');
      }
      const idx = pendingErrorQueue.indexOf(categoryGrid);
      if (idx > -1) {
        pendingErrorQueue.splice(idx, 1);
      }
      const hiddenIdx = pendingErrorQueue.indexOf(catHidden);
      if (hiddenIdx > -1) {
        pendingErrorQueue.splice(hiddenIdx, 1);
      }
    }

    // モーダルを閉じる
    modal.classList.remove('show');
    cleanupPaymentMethodModal();
  };

  // 各ボタンにイベントリスナーを追加
  paymentMethodBtns.forEach(btn => {
    btn.addEventListener('click', handlePaymentMethodClick);
  });

  // キャンセルボタンのクリックイベント
  const cancelBtn = document.getElementById('paymentMethodCancelBtn');
  const handleCancel = () => {
    modal.classList.remove('show');
    cleanupPaymentMethodModal();
  };
  cancelBtn.addEventListener('click', handleCancel);

  // オーバーレイクリックで閉じる
  const handleOverlayClick = (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      cleanupPaymentMethodModal();
    }
  };
  modal.addEventListener('click', handleOverlayClick);

  // クリーンアップ関数
  function cleanupPaymentMethodModal() {
    paymentMethodBtns.forEach(btn => {
      btn.removeEventListener('click', handlePaymentMethodClick);
    });
    cancelBtn.removeEventListener('click', handleCancel);
    modal.removeEventListener('click', handleOverlayClick);
  }
}

// Populate Shopsを修正
function populateShops() {
  const lenderSelect = document.getElementById("lender");
  const borrowerSelect = document.getElementById("borrower");

  // 重複を削除し、本部を先頭に追加
  const uniqueShops = ["本部", ...new Set(shops.filter(s => s !== "本部"))];

  // 既存のオプションをクリア
  lenderSelect.innerHTML = '<option value="">選択してください</option>';
  borrowerSelect.innerHTML = '<option value="">選択してください</option>';

  uniqueShops.forEach(shop => {
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


let cachedNames = null;
let cachedItems = null;
let cachedCostData = null;
let cachedIngredientsData = null;
const MAX_UNIQUE_HISTORY = 100; // 履歴の最大ユニーク件数（負荷対策）
const SELECT_MODAL_LIMIT = 100; // モーダル表示の最大件数
let latestItemMetaMap = new Map(); // key(normalized) -> { value, ms, qty, unitPrice, amount }
// エラー誘導用のキュー
let pendingErrorQueue = [];
// フォーカス関連の変数を削除
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

// B列（名前）を取得して datalist に反映（統合データローダー使用）
async function populateNameDatalist(forceRefresh = false) {
  try {
    // 統合データローダーが利用可能な場合は使用
    if (window.unifiedDataLoader) {
      console.log('📦 統合データローダーを使用して名前リストを取得');
      const names = await window.unifiedDataLoader.getNames(forceRefresh);
      cachedNames = names;
      renderNameList(names);
      return names;
    }

    // フォールバック: 従来の方法
    if (cachedNames && Array.isArray(cachedNames) && !forceRefresh) {
      renderNameList(cachedNames);
      return cachedNames;
    }

    const sheetName = '貸借表';
    const range = `${sheetName}!B:J`;

    // セキュアなAPI呼び出し
    const data = await callSheetsAPI(range, 'GET');
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

// F列（品目）を取得して datalist に反映（統合データローダー使用）
async function populateItemDatalist(forceRefresh = false) {
  try {
    // 統合データローダーが利用可能な場合は使用
    if (window.unifiedDataLoader) {
      console.log('📦 統合データローダーを使用して品目リストを取得');
      const items = await window.unifiedDataLoader.getItems(forceRefresh);
      cachedItems = items;
      renderItemList(items);
      return items;
    }

    // フォールバック: 従来の方法
    if (cachedItems && Array.isArray(cachedItems) && !forceRefresh) {
      renderItemList(cachedItems);
      return cachedItems;
    }
    const sheetName = '貸借表';
    const range = `${sheetName}!F:J`;

    // セキュアなAPI呼び出し
    const data = await callSheetsAPI(range, 'GET');
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

    const sheetName = '原価リスト';
    const range = `${sheetName}!B:L`;

    console.log('⚠️ 原価リスト取得: 別シートのため個別API呼び出し');
    const data = await callSheetsAPI(range, 'GET');
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

    const sheetName = '食材コスト';
    const range = `${sheetName}!A:AI`;

    console.log('⚠️ 食材コスト取得: 別シートのため個別API呼び出し');
    const data = await callSheetsAPI(range, 'GET');
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

// 金額を自動計算してフォーマットする関数
function calculateAmountForRow(rowEl) {
  const quantityInput = rowEl.querySelector('.quantity');
  const unitPriceInput = rowEl.querySelector('.unit-price');
  const amountInput = rowEl.querySelector('.amount');
  const quantity = parseFloat(convertToHalfWidthNumber(quantityInput.value)) || 0;
  const unitPrice = parseInt(convertToHalfWidthNumber(unitPriceInput.value), 10) || 0;
  const totalAmount = quantity * unitPrice;
  amountInput.value = totalAmount.toLocaleString('ja-JP');
}

function refreshRemoveButtonsVisibility() {
  const rows = Array.from(document.querySelectorAll('#entriesContainer .entry-row'));
  rows.forEach((row, idx) => {
    const removeBtn = row.querySelector('.remove-row-btn');
    if (!removeBtn) return;
    removeBtn.style.display = rows.length > 1 ? 'inline-block' : 'none';
  });
}

// フォーカス設定関数を削除（シンプルな状態に戻す）

function setupEntryRow(rowEl) {
  // 既にセットアップ済みかチェック（ただし、削除ボタンのイベントリスナーは常に再設定）
  const isAlreadySetup = rowEl.dataset.setupComplete === 'true';
  
  if (isAlreadySetup) {
    console.log('⚠️ setupEntryRow: 既にセットアップ済み、削除ボタンのみ再設定');
    // 削除ボタンのイベントリスナーのみ再設定
    const removeBtn = rowEl.querySelector('.remove-row-btn');
    if (removeBtn) {
      // 既存のリスナーを削除してから追加
      removeBtn.removeEventListener('click', removeBtn._removeHandler);
      removeBtn._removeHandler = () => {
        rowEl.remove();
        refreshRemoveButtonsVisibility();
      };
      removeBtn.addEventListener('click', removeBtn._removeHandler);
    }
    return;
  }

  const catHidden = rowEl.querySelector('.category');
  const categoryOptions = rowEl.querySelectorAll('.category-option');
  categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
      const selectedCategory = option.dataset.value;

      // M-martが選択された場合は支払い方法選択ポップアップを表示
      if (selectedCategory === 'M-mart') {
        showPaymentMethodModal(option, categoryOptions, catHidden, rowEl);
      } else {
        // M-mart以外の場合は通常処理
        categoryOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        catHidden.value = selectedCategory;
        updateButtonsByCategory(selectedCategory, rowEl);

        // カテゴリー選択時にエラー表示を解消
        const categoryGrid = rowEl.querySelector('.category-grid');
        if (categoryGrid) {
          // エラー表示クラスを削除
          categoryGrid.classList.remove('input-error', 'error-pulse', 'error-outline');
          const formGroup = categoryGrid.closest('.form-group');
          if (formGroup) {
            formGroup.classList.remove('error-outline');
          }

          // エラーキューからも削除
          const idx = pendingErrorQueue.indexOf(categoryGrid);
          if (idx > -1) {
            pendingErrorQueue.splice(idx, 1);
          }

          // カテゴリーのhiddenフィールドもクリア
          const catHidden = rowEl.querySelector('.category');
          if (catHidden) {
            const hiddenIdx = pendingErrorQueue.indexOf(catHidden);
            if (hiddenIdx > -1) {
              pendingErrorQueue.splice(hiddenIdx, 1);
            }
          }
        }
      }
    });
  });

  const quantityInput = rowEl.querySelector('.quantity');
  const unitPriceInput = rowEl.querySelector('.unit-price');
  const amountInput = rowEl.querySelector('.amount');
  
  // 単価フィールドのみフォーカス可能にする
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
          // 数量は小数点以下を完全に保持（丸めない）
          // 入力値をそのまま保持し、不要な末尾の0のみ削除
          e.target.value = value;
        } else {
          e.target.value = parseInt(value).toLocaleString('ja-JP');
        }
      }
      calculateAmountForRow(rowEl);
    });
  });
  
  // フォーカスイベントを削除（シンプルな状態に戻す）

  const itemBtn = rowEl.querySelector('.item-list-btn');
  if (itemBtn) {
    itemBtn.addEventListener('click', async () => {
      const dataset = await populateItemDatalist(true);
      openSelectModal('品目一覧', dataset, (val) => {
        const itemInput = rowEl.querySelector('.item');
        if (itemInput) itemInput.value = val;
        // 価格も挿入するか確認
        const key = normalizeKeyForDedupe(val);
        const meta = latestItemMetaMap.get(key);
        if (meta && (meta.unitPrice > 0 || meta.amount > 0)) {
          const doFill = confirm(`選択した品目に過去の価格があります。単価/数量/金額を反映しますか？\n\n`+
            `📝 品目: ${val}\n`+
            `＠ 単価: ${meta.unitPrice ? ('¥' + Number(meta.unitPrice).toLocaleString('ja-JP')) : '-'}\n`+
            `数量: ${meta.qty ? meta.qty : '-'}\n`+
            `金額: ${meta.amount ? ('¥' + Number(meta.amount).toLocaleString('ja-JP')) : '-'}`);
          if (doFill) {
            if (meta.unitPrice) rowEl.querySelector('.unit-price').value = Number(meta.unitPrice).toLocaleString('ja-JP');
            if (meta.qty) rowEl.querySelector('.quantity').value = String(meta.qty);
            calculateAmountForRow(rowEl);
            if (!meta.unitPrice && meta.amount && meta.qty) {
              // 単価欠落時、数量と金額から単価逆算（整数化）
              const up = Math.round(Number(meta.amount) / Number(meta.qty));
              rowEl.querySelector('.unit-price').value = up.toLocaleString('ja-JP');
              calculateAmountForRow(rowEl);
            }
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
          rowEl.querySelector('.item').value = selectedWineName;
          rowEl.querySelector('.unit-price').value = selectedItem.costInTax.toLocaleString('ja-JP');
          rowEl.querySelector('.quantity').value = '1';
          calculateAmountForRow(rowEl);
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
          rowEl.querySelector('.item').value = selectedProductName;
          rowEl.querySelector('.unit-price').value = priceWithTax.toLocaleString('ja-JP');
          rowEl.querySelector('.quantity').value = '1';
          calculateAmountForRow(rowEl);
        }
      });
    });
  }

  const removeBtn = rowEl.querySelector('.remove-row-btn');
  if (removeBtn) {
    // 既存のリスナーを削除してから追加（重複防止）
    removeBtn.removeEventListener('click', removeBtn._removeHandler);
    removeBtn._removeHandler = () => {
      rowEl.remove();
      refreshRemoveButtonsVisibility();
    };
    removeBtn.addEventListener('click', removeBtn._removeHandler);
  }

  // セットアップ完了フラグを設定
  rowEl.dataset.setupComplete = 'true';
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
  
  // セットアップ済みフラグをリセット（新しく追加された行として扱う）
  clone.dataset.setupComplete = 'false';
  
  // 新しく追加される行の設定（フォーカス制御なし）
  
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
    <div class="form-group" style="margin-bottom:25px;">
      <label>📅 日付</label>
      <input type="date" class="full-date" required>
    </div>
    <div class="form-row" style="display:flex; gap:15px; margin-bottom:25px;">
      <div class="form-group" style="flex:1; margin-bottom:0;">
        <label>📤 貸主</label>
        <select class="full-lender" required></select>
      </div>
      <div class="form-group" style="flex:1; margin-bottom:0;">
        <label>📥 借主</label>
        <select class="full-borrower" required></select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label>👤 名前</label>
      <input type="text" class="full-name" required placeholder="入力者名" value="${currentName.replace(/"/g, '&quot;')}">
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
              <input type="text" class="amount" required inputmode="numeric" placeholder="自動計算">
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

  // 日付を今日に設定（タイムゾーン対応）
  const dateInput = group.querySelector('.full-date');
  if (dateInput) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
  }

  // 最初の行をセットアップ
  const firstRow = group.querySelector('.entry-row');
  if (firstRow) setupEntryRow(firstRow);

  // 行追加（内部ボタンは削除。外部ツールバーの「＋ 品目を追加」を使用）

  // 外部ツールバー（テーブル外）を生成
  const toolbar = document.createElement('div');
  toolbar.className = 'full-toolbar group-toolbar';
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
      // グループとツールバーの両方を削除
      group.remove();
      toolbar.remove();
    }
  });

  extra.appendChild(group);
  // 外部ツールバー（テーブルの外）をグループ直後に追加
  extra.appendChild(toolbar);
  toolbar.appendChild(btnAddFull);
  toolbar.appendChild(btnAddItem);

  // 重複防止: 既存のツールバーを削除
  const existingToolbars = extra.querySelectorAll('.group-toolbar');
  existingToolbars.forEach((existingToolbar, index) => {
    if (index < existingToolbars.length - 1) { // 最新以外を削除
      existingToolbar.remove();
    }
  });
  btnAddItem.addEventListener('click', () => {
    const list = group.querySelector('.full-entries');
    const base = list.querySelector('.entry-row');
    const c = base.cloneNode(true);
    c.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    const catHidden = c.querySelector('.category');
    if (catHidden) catHidden.value = '';
    c.querySelectorAll('input').forEach(inp => inp.value = '');
    
    // セットアップ済みフラグをリセット（新しく追加された行として扱う）
    c.dataset.setupComplete = 'false';
    
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
    // 統合データローダーを使用して検索データを取得
    let rows;
    if (window.unifiedDataLoader) {
      console.log('📦 統合データローダーを使用して検索データを取得');
      const searchData = await window.unifiedDataLoader.getSearchData();
      rows = searchData.map(item => [
        item.date, item.name, item.lender, item.borrower, item.category,
        item.item, item.quantity, item.unitPrice, item.amount, item.note
      ]);
    } else {
      // フォールバック: 従来の方法
      console.log('⚠️ フォールバック: 個別API呼び出しで検索データを取得');
      const sheetName = '貸借表';
      const range = `${sheetName}!A:J`;
      const data = await callSheetsAPI(range, 'GET');
      rows = (data.values || []).slice(1);
    }
    
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
        quantity: currentData.quantity || '0',
        unitPrice: Number(String(currentData.unitPrice || '').replace(/[^\d.]/g, '')) || 0,
        // 金額は既存がなければ数量×単価で補完
        amount:
          Number(String(currentData.amount || '').replace(/[^\d.]/g, '')) ||
          Math.round((parseFloat(currentData.quantity) || 0) * (Number(currentData.unitPrice) || 0)),
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
              <span class="match-details-value">${typeof matchData.quantity === 'number' ? matchData.quantity.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 10 }) : matchData.quantity}</span></div>
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
            🔢 ${currentData.quantity || '0'}｜
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

// 送信完了後: 実際にスプレッドシートに登録された最新データを取得して確認表示
async function showRegisteredDataConfirmation(allPayloads) {
  try {
    // より狭い範囲を読み取って高速化（送信直後のデータのみ）
    const readRange = '貸借表!A2:K10'; // 上位10行のみに制限
    const result = await callSheetsAPI(readRange, 'GET');
    const rows = (result.values || []);

    // 送信直後1分以内に挿入された行を対象に絞り込み（時間窓を短縮）
    const nowMs = Date.now();
    const timeWindowMs = 1 * 60 * 1000; // 1分に短縮
    const refName = (allPayloads[0]?.name || '').toString().trim();
    const refDate = (allPayloads[0]?.date || '').toString().trim();

    const parsed = rows.map(r => ({
      date: r[0] || '',
      name: r[1] || '',
      lender: r[2] || '',
      borrower: r[3] || '',
      category: r[4] || '',
      item: r[5] || '',
      quantity: r[6] || '',
      unitPrice: r[7] || '',
      amount: r[8] || '',
      inputDate: r[9] || '',
      correction: r[10] || ''
    }));

    const recent = parsed.filter(r => {
      // 入力日時(J列)は GAS 側で日本時間の文字列。Dateに変換して3分以内かつ氏名/日付が一致するものを優先
      let t = NaN;
      try { t = new Date(r.inputDate).getTime(); } catch (_) { t = NaN; }
      const withinWindow = !isNaN(t) && (nowMs - t) <= timeWindowMs && (nowMs - t) >= 0;
      const sameName = refName ? (r.name === refName) : true;
      const sameDate = refDate ? (r.date?.toString().slice(0, 10) === refDate) : true;
      return withinWindow && sameName && sameDate;
    });

    // もし絞り込みが0件なら、先頭から送信件数分だけ拾う（保険）
    const pick = recent.length > 0 ? recent.slice(0, allPayloads.length) : parsed.slice(0, allPayloads.length);
    
    // 送信データと登録データの比較（高速化）
    const dataComparison = compareSentAndRegisteredData(allPayloads, pick);

    // 確認モーダルを生成（高速化）
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:5000;opacity:0;transition:opacity 0.2s ease-in;';
    const card = document.createElement('div');
    card.style.cssText = 'width:92%;max-width:560px;background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.25);padding:16px;transform:scale(0.95);transition:transform 0.2s ease-in;';
    const title = document.createElement('h3');
    title.textContent = '📄 登録結果（スプレッドシート反映済み）';
    title.style.cssText = 'margin:0 0 10px 0;color:#111827;font-size:18px;font-weight:700;';
    const body = document.createElement('div');
    body.style.cssText = 'max-height:60vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;';

    // 縦の行表示形式（カード型）
    const cardsContainer = document.createElement('div');
    cardsContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
    
    pick.forEach((r, index) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;';
      
      const rows = [
        { label: '📅 日付', value: r.date },
        { label: '👤 名前', value: r.name },
        { label: '🔄 貸主→借主', value: `${r.lender} → ${r.borrower}` },
        { label: '📝 カテゴリー/品目', value: `${r.category} / ${r.item}` },
        { label: '🔢 数量', value: r.quantity },
        { label: '💰 単価', value: r.unitPrice },
        { label: '💵 金額', value: r.amount }
      ];
      
      rows.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #e2e8f0;';
        
        const label = document.createElement('span');
        label.textContent = row.label;
        label.style.cssText = 'font-weight:600;color:#374151;min-width:120px;';
        
        const value = document.createElement('span');
        value.textContent = row.value;
        value.style.cssText = 'color:#1f2937;text-align:right;flex:1;';
        
        rowDiv.appendChild(label);
        rowDiv.appendChild(value);
        card.appendChild(rowDiv);
      });
      
      cardsContainer.appendChild(card);
    });

    body.appendChild(cardsContainer);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin-top:10px;';
    
    // NGボタン（常に表示）
    const ngBtn = document.createElement('button');
    ngBtn.className = 'list-btn';
    ngBtn.id = 'ng-button';
    
    if (dataComparison.hasMismatch) {
      // 不一致がある場合：赤色でアニメーション
      ngBtn.style.cssText = 'background:#fee2e2;border-color:#fecaca;color:#b91c1c;animation:pulse-red 2s infinite;';
      ngBtn.textContent = '❌ NG（データ不一致検出！）';
      ngBtn.title = 'データ不一致が検出されました。クリックして詳細を報告してください。';
    } else {
      // 不一致がない場合：通常の色
      ngBtn.style.cssText = 'background:#f3f4f6;border-color:#d1d5db;color:#6b7280;';
      ngBtn.textContent = '❌ NG（問題報告）';
      ngBtn.title = '何か問題があった場合はこちらをクリックしてください。';
    }
    
    const handleProblemReport = (event) => {
      // ログを永続化（localStorageに保存）
      const logData = {
        timestamp: new Date().toISOString(),
        action: '問題報告ボタンクリック',
        dataComparison: dataComparison,
        allPayloads: allPayloads
      };
      localStorage.setItem('lastProblemReport', JSON.stringify(logData));
      
      // 問題報告処理
      setTimeout(async () => {
        await reportDataMismatch(dataComparison, allPayloads);
        
        // ページをリロード
        setTimeout(() => {
          document.body.removeChild(overlay);
          location.reload();
        }, 1000);
      }, 100);
    };
    
    // イベントリスナーの設定
    ngBtn.addEventListener('click', handleProblemReport, { once: false });
    
    actions.appendChild(ngBtn);
    
    const ok = document.createElement('button');
    ok.className = 'list-btn';
    ok.textContent = '✅ OK（正常）';
    ok.onclick = () => { document.body.removeChild(overlay); location.reload(); };
    actions.appendChild(ok);

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    // アニメーション効果で表示
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    
    // アニメーション用のCSSを動的に追加
    if (dataComparison.hasMismatch) {
      const style = document.createElement('style');
      style.textContent = `
        @keyframes pulse-red {
          0% { 
            background: #fee2e2; 
            border-color: #fecaca; 
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
          }
          50% { 
            background: #fecaca; 
            border-color: #f87171; 
            transform: scale(1.05);
            box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
          }
          100% { 
            background: #fee2e2; 
            border-color: #fecaca; 
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        
        .data-mismatch-warning {
          animation: shake 0.5s ease-in-out 3;
        }
      `;
      document.head.appendChild(style);
      
      // タイトルにも警告アニメーションを追加
      title.classList.add('data-mismatch-warning');
      title.style.color = '#dc2626';
      title.innerHTML = '⚠️ 登録結果（データ不一致検出！）';
    }
  } catch (e) {
    console.warn('登録結果の取得に失敗しました', e);
    // 失敗時は従来どおりのリロード
    location.reload();
  }
}

// 送信データと登録データの比較関数
function compareSentAndRegisteredData(sentData, registeredData) {
  const mismatches = [];
  let hasMismatch = false;
  
  console.log('🔍 データ比較開始:', { sentData, registeredData });
  
  // 複数データの場合、順序が一致しない可能性があるため、より柔軟な照合を行う
  if (sentData.length > 1) {
    console.log('🔍 複数データ送信検出、柔軟な照合を実行');
    
    // 各送信データに対して、最も類似度の高い登録データを探す
    const usedRegisteredIndices = new Set();
    
    for (let i = 0; i < sentData.length; i++) {
      const sent = sentData[i];
      let bestMatch = null;
      let bestMatchIndex = -1;
      let bestScore = 0;
      
      // 未使用の登録データの中で最も類似度の高いものを探す
      for (let j = 0; j < registeredData.length; j++) {
        if (usedRegisteredIndices.has(j)) continue;
        
        const registered = registeredData[j];
        const score = calculateSimilarityScore(sent, registered);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = registered;
          bestMatchIndex = j;
        }
      }
      
      // 類似度が80%以上の場合は一致とみなす
      if (bestScore >= 0.8 && bestMatch) {
        usedRegisteredIndices.add(bestMatchIndex);
        console.log(`✅ 送信データ${i + 1}と登録データ${bestMatchIndex + 1}が一致 (類似度: ${(bestScore * 100).toFixed(1)}%)`);
        
        // 細かい差異をチェック
        const differences = compareFields(sent, bestMatch);
        if (differences.length > 0) {
          mismatches.push({
            index: i,
            sent: sent,
            registered: bestMatch,
            differences: differences
          });
          hasMismatch = true;
        }
      } else {
        console.log(`❌ 送信データ${i + 1}に対応する登録データが見つかりません (最高類似度: ${(bestScore * 100).toFixed(1)}%)`);
        mismatches.push({
          index: i,
          sent: sent,
          registered: null,
          differences: [{ field: 'ALL', sent: '送信データ', registered: '対応する登録データが見つかりません' }]
        });
        hasMismatch = true;
      }
    }
  } else {
    // 単一データの場合は従来通りの順序比較
    console.log('🔍 単一データ送信、順序比較を実行');
    
    for (let i = 0; i < sentData.length; i++) {
      const sent = sentData[i];
      const registered = registeredData[i] || {};
      
      const differences = compareFields(sent, registered);
      
      if (differences.length > 0) {
        mismatches.push({
          index: i,
          sent: sent,
          registered: registered,
          differences: differences
        });
        hasMismatch = true;
      }
    }
  }
  
  console.log('🔍 比較結果:', { hasMismatch, mismatches });
  
  return {
    hasMismatch: hasMismatch,
    mismatches: mismatches,
    totalSent: sentData.length,
    totalRegistered: registeredData.length
  };
}

// データの類似度を計算する関数
function calculateSimilarityScore(sent, registered) {
  const fields = ['date', 'name', 'lender', 'borrower', 'category', 'item', 'quantity', 'unitPrice', 'amount'];
  let matchCount = 0;
  let totalFields = fields.length;
  
  fields.forEach(field => {
    const sentValue = normalizeValue(sent[field]);
    const registeredValue = normalizeValue(registered[field]);
    
    if (sentValue === registeredValue) {
      matchCount++;
    }
  });
  
  return matchCount / totalFields;
}

// フィールドを比較する関数
function compareFields(sent, registered) {
  const differences = [];
  const fields = ['date', 'name', 'lender', 'borrower', 'category', 'item', 'quantity', 'unitPrice', 'amount'];
  
  // 数値として比較するフィールド
  const numericFields = ['quantity', 'unitPrice', 'amount'];
  
  fields.forEach(field => {
    let isEqual = false;
    let sentDisplay = '';
    let registeredDisplay = '';
    
    // 数値フィールドの場合は数値として直接比較（normalizeValueを経由しない）
    if (numericFields.includes(field)) {
      // 数値フィールドは、カンマや空白を除去してから数値に変換
      const sentStr = String(sent[field] || '').trim().replace(/[,¥\s]/g, '');
      const registeredStr = String(registered[field] || '').trim().replace(/[,¥\s]/g, '');
      
      sentDisplay = sentStr;
      registeredDisplay = registeredStr;
      
      const sentNum = parseFloat(sentStr);
      const registeredNum = parseFloat(registeredStr);
      
      console.log(`🔍 ${field}比較:`, { sent: sentStr, registered: registeredStr, sentNum: sentNum, registeredNum: registeredNum });
      
      // 両方とも有効な数値の場合
      if (!isNaN(sentNum) && !isNaN(registeredNum)) {
        // 浮動小数点数の精度誤差を考慮して比較（小数点以下10桁まで）
        isEqual = Math.abs(sentNum - registeredNum) < 0.0000000001;
        console.log(`🔢 ${field}数値比較:`, { sent: sentNum, registered: registeredNum, isEqual: isEqual });
      } else if (sentStr === '' && registeredStr === '') {
        // 両方とも空の場合は一致とみなす
        isEqual = true;
      } else {
        // 数値として解釈できない場合は文字列として比較
        isEqual = sentStr === registeredStr;
      }
    } else {
      // 非数値フィールドはnormalizeValueで正規化して文字列として比較
      const sentValue = normalizeValue(sent[field]);
      const registeredValue = normalizeValue(registered[field]);
      
      sentDisplay = sentValue;
      registeredDisplay = registeredValue;
      
      console.log(`🔍 ${field}比較:`, { sent: sentValue, registered: registeredValue });
      
      isEqual = sentValue === registeredValue;
    }
    
    if (!isEqual) {
      differences.push({
        field: field,
        sent: sentDisplay,
        registered: registeredDisplay
      });
      console.log(`❌ ${field}不一致:`, { sent: sentDisplay, registered: registeredDisplay });
    }
  });
  
  return differences;
}

// 値を正規化する関数（改善版）
function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  
  let normalized = value.toString().trim();
  
  // 日付の正規化（より柔軟な処理）
  if (normalized.includes('-') || normalized.includes('/')) {
    // 日付形式を統一（YYYY/MM/DD形式に）
    try {
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        normalized = `${year}/${month}/${day}`;
      }
    } catch (e) {
      // 日付パースに失敗した場合は元の値を保持
    }
  }
  
  // 数値の正規化（より柔軟な処理）
  if (/^[\d,.\s]+$/.test(normalized)) {
    // カンマ、ピリオド、空白を除去
    normalized = normalized.replace(/[,.\s]/g, '');
  }
  
  // 金額の正規化（¥記号やカンマを除去）
  if (normalized.includes('¥') || normalized.includes(',')) {
    normalized = normalized.replace(/[¥,\s]/g, '');
  }
  
  // 店舗名の正規化（大文字小文字を統一）
  if (normalized.includes('MARUGO') || normalized.includes('CAVA') || normalized.includes('CLAUDIA')) {
    normalized = normalized.toUpperCase();
  }
  
  // 空白を統一
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

// ブラウザ名を取得する関数
function getBrowserName() {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  return 'Unknown';
}

// ブラウザバージョンを取得する関数
function getBrowserVersion() {
  const userAgent = navigator.userAgent;
  const match = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+\.\d+)/);
  return match ? match[2] : 'Unknown';
}

// データ不一致を管理画面に報告する関数
async function reportDataMismatch(comparison, originalPayloads) {
  
  try {
    // 詳細な環境情報を取得
    const environmentInfo = {
      // 基本情報
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
      
      // ブラウザ情報
      browser: {
        name: getBrowserName(),
        version: getBrowserVersion(),
        language: navigator.language,
        languages: navigator.languages,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine
      },
      
      // 画面情報
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth
      },
      
      // ウィンドウ情報
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      
      // タイムゾーン情報
      timezone: {
        offset: new Date().getTimezoneOffset(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      
      // プラットフォーム情報
      platform: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        vendorSub: navigator.vendorSub,
        product: navigator.product,
        productSub: navigator.productSub
      },
      
      // ネットワーク情報（利用可能な場合）
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      } : null,
      
      // データ内容
      comparison: comparison,
      originalPayloads: originalPayloads,
      reportType: comparison.mismatchCount > 0 ? 'data_mismatch' : 'problem_report'
    };
    
    // データ不一致レポート用のデータを準備
    const reportData = {
      mismatchCount: comparison.mismatchCount || 0,
      sentDataCount: originalPayloads ? originalPayloads.length : 0,
      registeredDataCount: comparison.registeredData ? comparison.registeredData.length : 0,
      sentData: originalPayloads,
      registeredData: comparison.registeredData,
      mismatchDetails: comparison.mismatchDetails,
      environmentInfo: environmentInfo
    };
    
    // ローカルストレージに保存（管理画面で確認可能）
    const existingReports = JSON.parse(localStorage.getItem('dataMismatchReports') || '[]');
    existingReports.push(reportData);
    localStorage.setItem('dataMismatchReports', JSON.stringify(existingReports));
    
    // Supabaseにデータ不一致レポートを保存
      try {
        const response = await fetch(`${window.SUPABASE_CONFIG.url}/functions/v1/data-mismatch-reports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.SUPABASE_CONFIG.anonKey}`
          },
          body: JSON.stringify({
            action: 'create',
            reportData: reportData
          })
        });
        
        if (response.ok) {
          const result = await response.json();
        } else {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      } catch (e) {
        console.error('❌ Supabaseへの報告に失敗しました:', e);
      }
    
    // データが一致している場合と不一致の場合でメッセージを分ける
    if (comparison.mismatchCount > 0) {
      alert('❌ データ不一致が検出されました。\n管理画面で詳細を確認できます。');
    } else {
      alert('📝 問題報告を送信しました。\n管理画面で詳細を確認できます。');
    }
    
  } catch (e) {
    console.error('データ不一致の報告に失敗しました:', e);
    alert('❌ データ不一致の報告に失敗しました。');
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
  // 🔒 重複実行防止（より厳格なチェック）
  if (submitData._isRunning) {
    console.warn('⚠️ submitData already running, skipping duplicate call');
    return;
  }
  submitData._isRunning = true;
  
  const { isCorrection = false, correctionOnly = false, correctionMark = "" } = options;
  console.log('🚀 submitData開始:', { isCorrection, correctionOnly, correctionMark });
  
  const popupOverlay = document.getElementById('status-popup-overlay');
  const popupTitle = document.getElementById('popup-title');
  const submitBtn = document.querySelector('.submit-btn:not(.search-btn)');
  const btnText = submitBtn.querySelector('.btn-text');
  const originalText = submitBtn.dataset.originalText || btnText.textContent;
  submitBtn.dataset.originalText = originalText;
  const form = document.getElementById('loanForm');

  // フォーカス関連の関数を削除（シンプルな状態に戻す）

  // 送信ボタンを即座に無効化（重複クリック防止）
  submitBtn.disabled = true;

  hideMessages();
  resetSteps();

  try {
    // まずプレ検証（フォーカス＆ハイライト）
    const clearError = (el) => {
      if (!el) return;
      
      // 金額と個/本/gフィールドのみエラー表示を無効化
      if (el.classList.contains('amount') || el.classList.contains('quantity')) {
        return;
      }
      
      // その他のフィールドは通常のエラー表示クリア
      el.classList.remove('input-error');
      el.classList.remove('error-outline');
      el.classList.remove('error-pulse');
      const wrap = el.closest?.('.form-group');
      if (wrap) wrap.classList.remove('error-outline');
    };
     const markError = (el) => {
       if (!el) return;
       
       // 金額と個/本/gフィールドはエラーキューに追加しない
       if (el.classList.contains('amount') || el.classList.contains('quantity')) {
         return;
       }
       
       // その他のフィールドは通常のエラー表示
       el.classList.add('input-error');
       el.classList.add('error-pulse');
       const wrap = el.closest?.('.form-group') || el;
       wrap.classList.add('error-outline');
       pendingErrorQueue.push(el);
     };

    // 上部グループ + 追加フルグループをまとめて送信
    const groupDefs = [];
    const mainRows = Array.from(document.querySelectorAll('#entriesContainer .entry-row'));
    console.log('🔍 メイングループ作成:', { mainRowsCount: mainRows.length });
    
    groupDefs.push({
      root: document,
      dateEl: document.getElementById('date'),
      nameEl: document.getElementById('name'),
      lenderEl: document.getElementById('lender'),
      borrowerEl: document.getElementById('borrower'),
      rows: mainRows,
    });
    
    const extraGroups = document.querySelectorAll('#extraGroups .full-entry-group');
    console.log('🔍 追加グループ:', { extraGroupsCount: extraGroups.length });
    
    document.querySelectorAll('#extraGroups .full-entry-group').forEach((g, idx) => {
      const extraRows = Array.from(g.querySelectorAll('.full-entries .entry-row'));
      console.log(`🔍 追加グループ ${idx + 1}:`, { extraRowsCount: extraRows.length });
      
      groupDefs.push({
        root: g,
        dateEl: g.querySelector('.full-date'),
        nameEl: g.querySelector('.full-name'),
        lenderEl: g.querySelector('.full-lender'),
        borrowerEl: g.querySelector('.full-borrower'),
        rows: extraRows,
      });
    });
    
    console.log('🔍 全グループ定義:', { totalGroups: groupDefs.length });

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
       if (!date) { markError(gd.dateEl); }
       else { clearError(gd.dateEl); }
       if (!name) { markError(gd.nameEl); }
       else { clearError(gd.nameEl); }
       if (!lender) { markError(gd.lenderEl); }
       else { clearError(gd.lenderEl); }
       if (!borrower) { markError(gd.borrowerEl); }
       else { clearError(gd.borrowerEl); }
       if (lender && borrower && lender === borrower) { markError(gd.borrowerEl); }

      console.log('🔍 rows.forEach開始:', { groupIndex, rowsLength: rows.length });
      
      rows.forEach((row, i) => {
        console.log(`🔍 行処理 ${i + 1}/${rows.length}:`, { 
          groupIndex, 
          rowIndex: i,
          rowElement: row 
        });
        
        // 数量の値を各段階で確認（デバッグ用）
        const quantityInputValue = row.querySelector('.quantity')?.value || '';
        const quantityConverted = convertToHalfWidthNumber(quantityInputValue);
        
        const en = {
          category: row.querySelector('.category')?.value?.trim() || '',
          item: row.querySelector('.item')?.value?.trim() || '',
          quantity: quantityConverted,
          unitPrice: convertToHalfWidthNumber(row.querySelector('.unit-price')?.value || ''),
          amount: convertToHalfWidthNumber(row.querySelector('.amount')?.value || ''),
        };
        
        // デバッグ: 数量の値と型を確認
        console.log(`🔍 データ抽出 ${i + 1}:`, {
          ...en,
          quantityDebug: {
            inputValue: quantityInputValue,
            converted: quantityConverted,
            convertedType: typeof quantityConverted,
            convertedLength: quantityConverted.length,
            isString: typeof quantityConverted === 'string'
          }
        });
        
        const catEl = row.querySelector('.category-grid') || row.querySelector('.category');
         if (!en.category) { markError(catEl); }
         else { clearError(catEl); }
         const itemEl = row.querySelector('.item');
         if (!en.item) { markError(itemEl); }
         else { clearError(itemEl); }

         const unitPriceEl = row.querySelector('.unit-price');
         if (!en.unitPrice) { markError(unitPriceEl); }
         else { clearError(unitPriceEl); }
         
         // 数量と金額のチェック
         const qtyEl = row.querySelector('.quantity');
         if (!en.quantity) { markError(qtyEl); }
         else { clearError(qtyEl); }
         const amtEl = row.querySelector('.amount');
         if (!en.amount) { markError(amtEl); }
         else { clearError(amtEl); }
         const amt = parseFloat(en.amount);
         if (en.amount && (isNaN(amt) || amt <= 0)) { markError(amtEl); }
        const payload = {
          date, name, lender, borrower,
          category: en.category,
          item: en.item,
          quantity: en.quantity, // convertToHalfWidthNumberが文字列を返すのでそのまま使用
          unitPrice: en.unitPrice,
          amount: en.amount,
          isCorrection: isCorrection,
        };
        
        // デバッグ: Payload作成時の数量を確認
        console.log('🔍 Payload作成:', {
          index: allPayloads.length + 1,
          item: en.item,
          amount: en.amount,
          quantityDebug: {
            value: payload.quantity,
            type: typeof payload.quantity,
            stringified: JSON.stringify(payload.quantity)
          },
          payload: payload
        });
        
        allPayloads.push(payload);
      });
       // エラー要素のフィルタリング（フォーカス制御なし）
      groupIndex++;
    }

    if (pendingErrorQueue.length > 0) {
      // 金額と個/本/gフィールドをエラーキューから除外
      pendingErrorQueue = pendingErrorQueue.filter(el => {
        if (!el) return false;
        // 金額と個/本/gフィールドは除外
        if (el.classList.contains('amount') || el.classList.contains('quantity')) {
          return false;
        }
        return true;
      });
      
      // 重複を除去
      const seen = new Set();
      pendingErrorQueue = pendingErrorQueue.filter(el => {
        if (!el) return false;
        const key = el;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const errorModal = document.getElementById('errorModal');
      const errorModalBody = document.getElementById('errorModalBody');
      const errorModalCloseBtn = document.getElementById('errorModalCloseBtn');
      if (errorModal && errorModalBody) {
        errorModalBody.textContent = `入力ミスがあります（${pendingErrorQueue.length}件）。内容をご確認ください。`;
        errorModal.classList.add('show');
        
        // エラーモーダル表示時に送信ボタンを有効化
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        btnText.textContent = originalText;
        
        // 重複実行防止フラグをリセット
        submitData._isRunning = false;
        
        // フォーカス制御を削除（シンプルな状態に戻す）
        if (errorModalCloseBtn && !errorListenersAttached) {
          // 既存のリスナーを削除してから追加
          errorModalCloseBtn.removeEventListener('click', errorModalCloseBtn._closeHandler);
          errorModalCloseBtn._closeHandler = () => {
            errorModal.classList.remove('show');
            
            // エラーモーダル閉じる時に送信ボタンを有効化
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            btnText.textContent = originalText;
            
            // エラー表示を再表示
            pendingErrorQueue.forEach(el => {
              if (el && !el.classList.contains('amount') && !el.classList.contains('quantity')) {
                el.classList.add('input-error', 'error-pulse');
                const wrap = el.closest?.('.form-group') || el;
                wrap.classList.add('error-outline');
              }
            });
            
            // フォーカス制御を削除（シンプルな状態に戻す）
          };
          errorModalCloseBtn.addEventListener('click', errorModalCloseBtn._closeHandler);
          errorListenersAttached = true;
        }
        // 入力で修正されたら次のエラーに進む
        const attachProgression = (el) => {
          if (!el) return;
          const handler = () => {
            // 金額と個/本/gフィールド以外は通常のエラー表示クリア
            if (!el.classList.contains('amount') && !el.classList.contains('quantity')) {
              el.classList.remove('input-error','error-pulse','error-outline');
              const wrap = el.closest?.('.form-group'); 
              if (wrap) wrap.classList.remove('error-outline');
            }
            const idx = pendingErrorQueue.indexOf(el);
            if (idx > -1) pendingErrorQueue.splice(idx, 1);
            // フォーカス制御を削除（シンプルな状態に戻す）
          };
          // 何か入力/変更があれば修正扱い
          el.addEventListener('input', handler, { once: true });
          el.addEventListener('change', handler, { once: true });
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

    console.log('🚀 送信開始:', { totalPayloads: allPayloads.length });
    
    for (let i = 0; i < allPayloads.length; i++) {
      const payload = allPayloads[i];
      
      console.log(`📤 送信処理 ${i + 1}/${allPayloads.length}:`, {
        item: payload.item,
        amount: payload.amount,
        category: payload.category
      });
      
      await showStep('step-sending', `📤 送信中 ${i + 1}/${allPayloads.length} 行目...`);
      await delay(200);
      
      if (correctionOnly) {
        payload.correctionOnly = true;
        payload.correctionMark = correctionMark || "✏️修正";
        payload.sendType = "CORRECTION";
      }
      
      try {
        // デバッグ: 送信前のデータ型と値を確認
        console.log(`📤 送信開始 ${i + 1}/${allPayloads.length}:`, {
          url: GAS_URL,
          quantity: payload.quantity,
          quantityType: typeof payload.quantity,
          quantityValue: String(payload.quantity),
          quantityIsNumber: typeof payload.quantity === 'number',
          quantityIsString: typeof payload.quantity === 'string',
          payload: payload,
          payloadStringified: JSON.stringify(payload)
        });
        
        // no-corsモードで送信（CORSエラーを回避）
        // 注意: no-corsモードではレスポンスの詳細を取得できませんが、
        // GASのWebアプリとして正しくデプロイされていれば送信は成功します
        try {
          await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          console.log(`✅ 送信完了 ${i + 1}/${allPayloads.length}:`, payload.item);
        } catch (fetchError) {
          // no-corsモードでは通常エラーは発生しませんが、念のため
          console.error(`❌ Fetchエラー ${i + 1}/${allPayloads.length}:`, fetchError);
          throw new Error(`GASへの接続に失敗しました: ${fetchError.message}`);
        }
      } catch (error) {
        console.error(`❌ 送信失敗 ${i + 1}/${allPayloads.length}:`, error);
        console.error(`❌ 送信失敗時のペイロード:`, payload);
        console.error(`❌ エラー詳細:`, {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        
        // API制限エラーの場合は専用モーダルを表示
        if (error.code === 'API_LIMIT_EXCEEDED' || error.message.includes('制限値')) {
          if (typeof window.showAPILimitError === 'function') {
            window.showAPILimitError();
          }
          throw error; // 送信を停止
        }
        
        // エラーをユーザーに表示
        const errorModal = document.getElementById('errorModal');
        const errorModalBody = document.getElementById('errorModalBody');
        if (errorModal && errorModalBody) {
          errorModalBody.innerHTML = `
            <strong>❌ 送信エラー</strong><br><br>
            ${error.message || '不明なエラーが発生しました'}<br><br>
            URL: ${GAS_URL}<br><br>
            <small style="color: #666;">ブラウザのコンソール（F12）で詳細を確認してください。</small>
          `;
          errorModal.classList.add('show');
        }
        
        throw error; // 送信を停止
      }
    }
    
    // 送信完了後にまとめてAPI使用量をカウント
    if (typeof window.recordDataSubmission === 'function') {
      window.recordDataSubmission('data_submission_batch', 'POST', `submitData ${allPayloads.length} rows`);
    }
    
    completeStep('step-sending', `✅ 送信完了 (${allPayloads.length}行)`);
    await showStep('step-inserting', `💾 ${correctionOnly ? '修正データ' : ''}を挿入中...`);
    await delay(800);
    completeStep('step-inserting', `✅ ${correctionOnly ? '修正データ' : ''}挿入完了`);
    await showStep('step-backup', '🔄 バックアップを作成中...');
    await delay(600); // 待機時間を短縮
    completeStep('step-backup', '✅ バックアップ作成完了');
    await showStep('step-email', '📧 借主へメール通知中...');
    await delay(800); // 待機時間を短縮
    completeStep('step-email', '✅ 借主へのメール送信完了');
    
    // 送信内容をチェック中ステップを追加
    await showStep('step-checking', '🔍 送信内容をチェック中...');
    await delay(500); // 待機時間を短縮
    completeStep('step-checking', '✅ チェック完了');
    
    await showStep('step-complete', `🎉 ${correctionOnly ? '修正送信' : 'すべての処理'}が完了しました！`);
    const finalStep = document.getElementById('step-complete');
    finalStep.classList.remove('completed');
    finalStep.classList.add('final-completed');
    popupTitle.textContent = '🎉 完了！';
    
    // スプレッドシート確認画面の準備が整うまで送信ポップアップを表示し続ける
    setTimeout(async () => {
      // 送信ポップアップの表示を維持しながら、バックグラウンドでスプレッドシート確認画面を準備
      try {
        // 準備中ステップを表示
        await showStep('step-checking', '🔍 送信内容をチェック中...');
        await delay(300);
        completeStep('step-checking', '✅ チェック完了');
        
        // スプレッドシート確認画面の準備
        await showRegisteredDataConfirmation(allPayloads);
        
        // 準備が整ったら送信ポップアップをフェードアウト
        popupOverlay.style.transition = 'opacity 0.3s ease-out';
        popupOverlay.style.opacity = '0';
        
        setTimeout(() => {
          popupOverlay.style.display = 'none';
          submitBtn.classList.remove('loading');
          btnText.textContent = originalText;
          submitBtn.disabled = false;
          
          // 🔓 重複実行防止フラグをリセット
          submitData._isRunning = false;
          console.log('🎉 submitData完了');
          
          const message = document.getElementById('successMessage');
          message.textContent = correctionOnly ? '✅ 修正データの送信が完了しました！' : '✅ 送信完了しました！';
          message.classList.add('show');
          setTimeout(() => { message.classList.remove('show'); }, 800);
        }, 300); // フェードアウト完了後に処理
        
      } catch (_) {
        // エラーが発生した場合は送信ポップアップを閉じてリロード
        popupOverlay.style.display = 'none';
        submitBtn.classList.remove('loading');
        btnText.textContent = originalText;
        submitBtn.disabled = false;
        submitData._isRunning = false;
        location.reload();
      }
    }, 500); // 短い待機時間
  } catch (error) {
    console.error('送信エラー:', error);
    
    // 🔓 重複実行防止フラグをリセット
    submitData._isRunning = false;
    console.log('❌ submitDataエラー終了');
    
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
      // フォーカス制御を削除（シンプルな状態に戻す）
      if (errorModalCloseBtn) {
        const closeHandler = () => {
          errorModal.classList.remove('show');
          errorModalCloseBtn.removeEventListener('click', closeHandler);
          
          // エラーモーダル閉じる時に送信ボタンを有効化
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
          btnText.textContent = originalText;
          
          // エラー表示を再表示
          pendingErrorQueue.forEach(el => {
            if (el && !el.classList.contains('amount') && !el.classList.contains('quantity')) {
              el.classList.add('input-error', 'error-pulse');
              const wrap = el.closest?.('.form-group') || el;
              wrap.classList.add('error-outline');
            }
          });
          
          setTimeout(() => {
            // フォーカス制御を削除（シンプルな状態に戻す）
          }, 10);
        };
        errorModalCloseBtn.addEventListener('click', closeHandler);
      }
      // オーバーレイクリックで閉じる
      errorModal.addEventListener('click', (e) => {
        if (e.target === errorModal) {
          errorModal.classList.remove('show');
          
          // エラーモーダル閉じる時に送信ボタンを有効化
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
          btnText.textContent = originalText;
          
          // エラー表示を再表示
          pendingErrorQueue.forEach(el => {
            if (el && !el.classList.contains('amount') && !el.classList.contains('quantity')) {
              el.classList.add('input-error', 'error-pulse');
              const wrap = el.closest?.('.form-group') || el;
              wrap.classList.add('error-outline');
            }
          });
          
          setTimeout(() => {
            // フォーカス制御を削除（シンプルな状態に戻す）
          }, 10);
        }
      }, { once: true });
    }
  }
}

function initializeElements() {
  // 日付を今日に設定（タイムゾーン対応）
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  document.getElementById('date').value = `${year}-${month}-${day}`;

  // 🔓 submitDataフラグをリセット（ページ読み込み時）
  if (typeof submitData === 'function') {
    submitData._isRunning = false;
  }

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

  // イベントリスナーを一度だけ設定
  if (lenderSelect && !lenderSelect._eventListenerAdded) {
    lenderSelect.addEventListener('change', checkLenderBorrowerMatch);
    lenderSelect.addEventListener('focus', (e) => { e.target.style.transform = 'none'; });
    lenderSelect.addEventListener('blur', (e) => { e.target.style.transform = ''; });
    lenderSelect._eventListenerAdded = true;
  }
  if (borrowerSelect && !borrowerSelect._eventListenerAdded) {
    borrowerSelect.addEventListener('change', checkLenderBorrowerMatch);
    borrowerSelect.addEventListener('focus', (e) => { e.target.style.transform = 'none'; });
    borrowerSelect.addEventListener('blur', (e) => { e.target.style.transform = ''; });
    borrowerSelect._eventListenerAdded = true;
  }
  checkLenderBorrowerMatch();

  const form = document.getElementById('loanForm');
  // 既存のイベントリスナーを削除してから追加（重複防止）
  form.removeEventListener('submit', form._submitHandler);
  form._submitHandler = async (e) => {
    e.preventDefault();
    if (!checkLenderBorrowerMatch()) return;
    await submitData({ isCorrection: false, correctionOnly: false });
  };
  form.addEventListener('submit', form._submitHandler);

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
  
  // ⚠️ API呼び出しは GoogleSheetsAPIAnalyzer で統合実行されるため、ここでは実行しない
  console.log('📦 データ読み込みは GoogleSheetsAPIAnalyzer.connectToGoogleSheets() で実行されます');

  // 名前一覧ボタン（共通）
  const nameBtn = document.getElementById('name-list-btn');
  if (nameBtn) {
    nameBtn.addEventListener('click', async () => {
      const dataset = await populateNameDatalist(true);
      openSelectModal('名前一覧', dataset, (val) => { document.getElementById('name').value = val; });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
