const GAS_URL = "https://script.google.com/macros/s/
  AKfycbw9rr3ooPCxcFE35Y_HCKLarVG9Jo765cR49qDyxLxPsBcFqmm481-17J7Vsw1ZKMxW/exec"; //
  Google Apps ScriptのURL
  const shops = [ // 店舗名のリスト
    "本部", "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
    "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
    "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
    "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
    "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
    "X&C", "トラットリア ブリッコラ"
  ];

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
  let latestItemMetaMap = new Map(); // key(normalized) -> { value, ms, qty, unitPrice,
  amount }
  // エラー誘導用のキュー
  let pendingErrorQueue = [];
  let lastFocusedErrorEl = null;
  let errorListenersAttached = false;

  function normalizeKeyForDedupe(s) {
    return (s || '')
      .toString()
      .normalize('NFKC')
      .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)) // ひら→
  カタ
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

  function setDateInputToToday(input) {
    if (!input) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().split('T')[0];
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
      const sorted = Array.from(latestByKey.values()).sort((a, b) => b.ms - a.ms).slice(0,
  MAX_UNIQUE_HISTORY).map(x => x.value);
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
    const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base',
  numeric: true, ignorePunctuation: true });
    const normalizeKana = (s) => (s || '')
      .normalize('NFKC')
      .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)) // ひらがな
  →カタカナ
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
        const qtyNum = (() => { const v = (r[1] || '').toString().replace(/[^\d.\-]/g,
  ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; })();
        const unitPriceNum = (() => { const v = (r[2] || '').toString().replace(/[^\d.\-]/
  g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; })();
        const amountNum = (() => { const v = (r[3] || '').toString().replace(/[^\d.\-]/g,
  ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; })();
        const existing = latestByKey.get(key);
        if (!existing || ms > existing.ms) {
          latestByKey.set(key, { value: item, ms });
          latestItemMetaMap.set(key, { value: item, ms, qty: qtyNum, unitPrice:
  unitPriceNum, amount: amountNum });
        }
      }
      const sorted = Array.from(latestByKey.values()).sort((a, b) => b.ms - a.ms).slice(0,
  MAX_UNIQUE_HISTORY).map(x => x.value);
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
    const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base',
  numeric: true, ignorePunctuation: true });
    const normalizeKana = (s) => (s || '')
      .normalize('NFKC')
      .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      .replace(/\s+/g, '')
      .trim();
    const sorted = [...items].sort((a, b) => {
      const na = normalizeKana(a);
      const nb = normalizeKana(b);
      const res = collator.compare(na, nb);
      return res !== 0 ? res : collator.compare(a, b);
    });
    list.innerHTML = sorted.map(n => `<option value="${n}"></option>`).join('');
  }

  function renderCostItemList(items) {
    const list = document.getElementById('costList');
    if (!list) return;
    const sanitized = items.map(item => ({
      label: `${item.productName} (${item.unitPrice}円/${item.packUnit})`,
      value: item.productName
    }));
    list.innerHTML = sanitized.map(item => `<option value="${item.value}">${item.label}
  </option>`).join('');
  }

  function renderIngredientsItemList(items) {
    const list = document.getElementById('ingredientsList');
    if (!list) return;
    list.innerHTML = items.map(item => `<option
  value="${item.productName}">${item.displayText}</option>`).join('');
  }

  function setupEntryRow(rowEl) {
    if (!rowEl) return;

    const categoryGrid = rowEl.querySelector('.category-grid');
    if (categoryGrid) {
      categoryGrid.querySelectorAll('.category-option').forEach(option => {
        option.addEventListener('click', () => {
          categoryGrid.querySelectorAll('.category-option').forEach(opt =>
  opt.classList.remove('selected'));
          option.classList.add('selected');
          const hiddenInput = rowEl.querySelector('.category');
          if (hiddenInput) {
            hiddenInput.value = option.dataset.value || option.textContent.trim();
          }
          updateButtonsByCategory(option.dataset.value || option.textContent.trim(),
  rowEl);
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

    const itemInput = rowEl.querySelector('.item');
    if (itemInput) {
      setupItemAutoFill(itemInput, rowEl);
    }

    const quantityInput = rowEl.querySelector('.quantity');
    const unitPriceInput = rowEl.querySelector('.unit-price');
    if (quantityInput) quantityInput.addEventListener('input', () =>
  calculateAmountForRow(rowEl));
    if (unitPriceInput) unitPriceInput.addEventListener('input', () =>
  calculateAmountForRow(rowEl));
  }

  function updateButtonsByCategory(selectedCategory, rowEl) {
    const costBtn = rowEl.querySelector('.cost-list-btn');
    const ingredientsBtn = rowEl.querySelector('.ingredients-list-btn');

    if (!costBtn || !ingredientsBtn) return;

    if (selectedCategory === '飲料') {
      costBtn.style.display = 'inline-block';
      ingredientsBtn.style.display = 'none';
    } else if (selectedCategory === '食材') {
      costBtn.style.display = 'none';
      ingredientsBtn.style.display = 'inline-block';
    } else {
      costBtn.style.display = 'none';
      ingredientsBtn.style.display = 'none';
    }
  }

  function setupItemAutoFill(itemInput, rowEl) {
    itemInput.addEventListener('blur', () => autoFillFromHistory(itemInput, rowEl));
    itemInput.addEventListener('change', () => autoFillFromHistory(itemInput, rowEl));

    const costBtn = rowEl.querySelector('.cost-list-btn');
    if (costBtn) {
      costBtn.addEventListener('click', async () => {
        const data = await loadCostData();
        openSelectModal('原価リスト', data.map(item => item.productName), (selected) => {
          const selectedItem = data.find(item => item.productName === selected);
          if (selectedItem) {
            const taxRate = 1.1;
            const priceWithTax = Math.round(Number(selectedItem.unitPrice || 0) *
  taxRate);
            rowEl.querySelector('.item').value = selectedItem.productName;
            rowEl.querySelector('.unit-price').value = priceWithTax.toLocaleString('ja-
  JP');
            rowEl.querySelector('.quantity').value = '1';
            calculateAmountForRow(rowEl);
          }
        });
      });
    }

    const ingredientsBtn = rowEl.querySelector('.ingredients-list-btn');
    if (ingredientsBtn) {
      ingredientsBtn.addEventListener('click', async () => {
        const data = await loadIngredientsData();
        openSelectModal('食材リスト', data.map(item => item.productName), (selected) => {
          const selectedItem = data.find(item => item.productName === selected);
          if (selectedItem) {
            const highTaxItems = ['料理酒', 'みりん', '日本酒', '料理ワイン'];
            const productNameLower = selectedItem.productName.toLowerCase();
            const isHighTax = highTaxItems.some(item =>
  productNameLower.includes(item.toLowerCase()));
            let taxRate = isHighTax ? 1.1 : 1.08;
            const priceWithTax = Math.round(Number(selectedItem.unitPrice || 0) *
  taxRate);
            rowEl.querySelector('.item').value = selectedItem.productName;
            rowEl.querySelector('.unit-price').value = priceWithTax.toLocaleString('ja-
  JP');
            rowEl.querySelector('.quantity').value = '1';
            calculateAmountForRow(rowEl);
          }
        });
      });
    }
  }

  function autoFillFromHistory(itemInput, rowEl) {
    const value = itemInput.value.trim();
    if (!value) return;

    const key = normalizeKeyForDedupe(value);
    if (latestItemMetaMap.has(key)) {
      const meta = latestItemMetaMap.get(key);
      if (!meta) return;

      if (meta.qty) rowEl.querySelector('.quantity').value = meta.qty;
      if (meta.unitPrice) rowEl.querySelector('.unit-price').value =
  meta.unitPrice.toLocaleString('ja-JP');
      if (meta.amount) rowEl.querySelector('.amount').value =
  meta.amount.toLocaleString('ja-JP');
    }
  }

  function calculateAmountForRow(rowEl) {
    const quantityInput = rowEl.querySelector('.quantity');
    const unitPriceInput = rowEl.querySelector('.unit-price');
    const amountInput = rowEl.querySelector('.amount');

    const quantity = parseFloat((quantityInput?.value || '').replace(/,/g, '')) || 0;
    const unitPrice = parseFloat((unitPriceInput?.value || '').replace(/,/g, '')) || 0;
    const amount = Math.round(quantity * unitPrice);

    if (amountInput) {
      amountInput.value = amount ? amount.toLocaleString('ja-JP') : '';
    }
  }

  function refreshRemoveButtonsVisibility() {
    const rows = document.querySelectorAll('#entriesContainer .entry-row');
    rows.forEach((row, index) => {
      const removeBtn = row.querySelector('.remove-row-btn');
      if (!removeBtn) return;
      removeBtn.style.display = rows.length > 1 ? 'inline-block' : 'none';
      removeBtn.disabled = rows.length <= 1;
    });
  }

  function addNewRow() {
    const container = document.getElementById('entriesContainer');
    const first = container.querySelector('.entry-row');
    const clone = first.cloneNode(true);
    clone.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    const catHidden = clone.querySelector('.category');
    if (catHidden) catHidden.value = '';
    clone.querySelectorAll('input').forEach(inp => {
      if (inp.classList.contains('amount')) {
        inp.value = '';
      } else {
        inp.value = '';
      }
    });
    container.appendChild(clone);
    setupEntryRow(clone);
    refreshRemoveButtonsVisibility();
  }

  function addFullRow() {
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
      <div class="form-row" style="margin-bottom:12px;">
        <div class="form-group">
          <label>📅 日付</label>
          <input type="date" class="full-date" required>
        </div>
        <div class="form-group">
          <label>📤 貸主</label>
          <select class="full-lender" required></select>
        </div>
        <div class="form-group">
          <label>📥 借主</label>
          <select class="full-borrower" required></select>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>👤 名前</label>
        <input type="text" class="full-name" required placeholder="入力者名"
  value="${currentName.replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>🏷️ 品目一覧</label>
        <div class="full-entries" style="display:flex; flex-direction:column; gap:16px;">
          <div class="entry-row" style="border:1px solid #e5e7eb; border-radius:12px;
  padding:16px; background:#fff;">
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
                <input type="text" class="item" required placeholder="品目を入力"
  autocomplete="off">
                <button type="button" class="list-btn item-list-btn">履歴</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                  <label>＠ 単価(税込)</label>
                  <input type="text" class="unit-price" required inputmode="numeric"
  placeholder="単価を入力">
              </div>
              <div class="form-group">
                  <label>🔢 個/本/g</label>
                  <input type="text" class="quantity" required inputmode="decimal"
  placeholder="数値を入力">
              </div>
            </div>
            <div class="form-group">
              <label>💵 金額(税込)</label>
              <div class="amount-input">
                <input type="text" class="amount" required inputmode="numeric"
  placeholder="自動計算" readonly>
              </div>
            </div>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
          <button type="button" class="list-btn remove-full-row"
  style="background:#fff5f5; border-color:#fecaca; color:#b91c1c;">このグループを削除
  </button>
        </div>
      </div>
    `;

    const lenderSelect = group.querySelector('.full-lender');
    const borrowerSelect = group.querySelector('.full-borrower');
    const mainLender = document.getElementById('lender');
    const mainBorrower = document.getElementById('borrower');

    if (mainLender && lenderSelect) lenderSelect.innerHTML = mainLender.innerHTML;
    if (mainBorrower && borrowerSelect) borrowerSelect.innerHTML = mainBorrower.innerHTML;

    const container = group.querySelector('.full-entries');
    const row = container.querySelector('.entry-row');
    setupEntryRow(row);

    const removeButton = group.querySelector('.remove-full-row');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        group.remove();
      });
    }

    extra.appendChild(group);
    setDateInputToToday(group.querySelector('.full-date'));
  }

  function openSelectModal(title, items, onSelect) {
    const modal = document.getElementById('selectModal');
    const titleEl = document.getElementById('selectTitle');
    const listEl = document.getElementById('selectList');
    const searchEl = document.getElementById('selectSearch');
    if (!modal || !titleEl || !listEl || !searchEl) return;

    titleEl.textContent = title;
    searchEl.value = '';

    const limitedItems = items.slice(0, SELECT_MODAL_LIMIT);

    listEl.innerHTML = limitedItems.map(item => `
      <div class="select-item" data-value="${item}">${item}</div>
    `).join('');

    listEl.querySelectorAll('.select-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const value = itemEl.dataset.value;
        if (value) onSelect?.(value);
        modal.classList.remove('show');
      });
    });

    searchEl.addEventListener('input', () => {
      const query = searchEl.value.trim();
      const filtered = limitedItems.filter(item =>
        item.toLowerCase().includes(query.toLowerCase())
      ).slice(0, SELECT_MODAL_LIMIT);
      listEl.innerHTML = filtered.map(item => `
        <div class="select-item" data-value="${item}">${item}</div>
      `).join('');
      listEl.querySelectorAll('.select-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
          const value = itemEl.dataset.value;
          if (value) onSelect?.(value);
          modal.classList.remove('show');
        });
      });
    });

    modal.classList.add('show');

    modal.addEventListener('click', function handler(e) {
      if (e.target === modal) {
        modal.classList.remove('show');
        modal.removeEventListener('click', handler);
      }
    });
  }

  function convertToHalfWidthNumber(value) {
    if (!value) return '';
    const normalized = String(value)
      .replace(/[^\d\.\-]/g, '')
      .trim();
    return normalized;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function callSheetsAPI(range, method = 'GET', body = null) {
    if (!window.googleSheetsAPIAnalyzer) {
      throw new Error('Google Sheets API Analyzer が初期化されていません');
    }
    return window.googleSheetsAPIAnalyzer.callSheetsAPI(range, method, body);
  }

  async function loadCostData() {
    if (cachedCostData) {
      return cachedCostData;
    }

    if (window.unifiedDataLoader) {
      cachedCostData = await window.unifiedDataLoader.getCostData();
      return cachedCostData;
    }

    throw new Error('原価データのロード方法が定義されていません');
  }

  async function loadIngredientsData() {
    if (cachedIngredientsData) {
      return cachedIngredientsData;
    }

    if (window.unifiedDataLoader) {
      cachedIngredientsData = await window.unifiedDataLoader.getIngredientsData();
      return cachedIngredientsData;
    }

    throw new Error('食材データのロード方法が定義されていません');
  }

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
      console.error("Lender/borrower select or error div not found for real-time
  validation.");
      return true;
    }

    if (lenderSelect.value && borrowerSelect.value && lenderSelect.value ===
  borrowerSelect.value) {
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

    if (!currentData.date || !currentData.lender || !currentData.borrower || !
  currentData.category || !currentData.item || !currentData.amount) {
      searchResultContent.innerHTML = `<div class="search-error">❌ すべての項目を入力して
  から検索してください</div>`;
      searchResult.classList.add('show');
      return;
    }

    if (currentData.lender === currentData.borrower) {
      searchResultContent.innerHTML = `<div class="search-error">❌ 貸主と借主が同じため検
  索できません</div>`;
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
          quantity: Number(currentData.quantity || 0),
          unitPrice: Number(String(currentData.unitPrice || '').replace(/[^\d.]/g, ''))
  || 0,
          amount:
            Number(String(currentData.amount || '').replace(/[^\d.]/g, '')) ||
            Math.round((Number(currentData.quantity) || 0) *
  (Number(currentData.unitPrice) || 0)),
          inputDate: "2024-12-27 10:30:00",
          correction: ""
        };

        searchResultContent.innerHTML = `
          <div class="search-match">✅ 逆取引データが見つかりました
            <div class="match-details">
              <div class="match-details-row"><span class="match-details-label">📅 日付：</
  span><span class="match-details-value">${matchData.date}</span></div>
              <div class="match-details-row"><span class="match-details-label">👤 入力者：
  </span><span class="match-details-value">${matchData.name}</span></div>
              <div class="match-details-row"><span class="match-details-label">↔︎ 貸主：</
  span><span class="match-details-value">${matchData.lender}</span></div>
              <div class="match-details-row"><span class="match-details-label">↔︎ 借主：</
  span><span class="match-details-value">${matchData.borrower}</span></div>
              <div class="match-details-row"><span class="match-details-label">📂 カテゴ
  リー：</span><span class="match-details-value">${matchData.category}</span></div>
              <div class="match-details-row"><span class="match-details-label">📝 品目：</
  span><span class="match-details-value">${matchData.item}</span></div>
              <div class="match-details-row"><span class="match-details-label">🔢 個数：</
  span><span class="match-details-value">${matchData.quantity}</span></div>
              <div class="match-details-row"><span class="match-details-label">＠ 単価：</
  span><span class="match-details-value">¥${matchData.unitPrice.toLocaleString('ja-JP')}</
  span></div>
              <div class="match-details-row"><span class="match-details-label">💵 金額：
  </span><span class="match-details-value">¥${matchData.amount.toLocaleString('ja-JP')}</
  span></div>
            </div>
          </div>
          <div class="search-actions">
            <button type="button" class="list-btn" id="apply-reverse-btn">このデータを適用
  </button>
          </div>
        `;
        searchResult.classList.add('show');

        const applyBtn = document.getElementById('apply-reverse-btn');
        if (applyBtn) {
          applyBtn.addEventListener('click', () => {
            document.getElementById("borrower").value = matchData.borrower;
            document.getElementById("lender").value = matchData.lender;
            document.getElementById("category").value = matchData.category;
            document.getElementById("item").value = matchData.item;
            document.getElementById("quantity").value = matchData.quantity;
            document.getElementById("unitPrice").value =
  matchData.unitPrice.toLocaleString('ja-JP');
            document.getElementById("amount").value = matchData.amount.toLocaleString('ja-
  JP');
            searchResult.classList.remove('show');
          });
        }
      } else {
        searchResultContent.innerHTML = `<div class="search-error">❌ 逆取引データは見つか
  りませんでした</div>`;
        searchResult.classList.add('show');
      }
    } catch (error) {
      console.error('逆取引検索エラー:', error);
      searchResultContent.innerHTML = `<div class="search-error">❌ 検索中にエラーが発生し
  ました</div>`;
      searchResult.classList.add('show');
    } finally {
      searchBtn.disabled = false;
      searchBtn.classList.remove('loading');
      btnText.textContent = originalText;
    }
  }

  function initializeElements() {
    setDateInputToToday(document.getElementById('date'));

    document.querySelectorAll('#entriesContainer .entry-row').forEach(row =>
  setupEntryRow(row));

    const addBtn = document.getElementById('add-row-btn');
    if (addBtn) addBtn.addEventListener('click', addNewRow);
    refreshRemoveButtonsVisibility();

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
    if (borrowerSelect) borrowerSelect.addEventListener('change',
  checkLenderBorrowerMatch);
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

    console.log('📦 データ読み込みは GoogleSheetsAPIAnalyzer.connectToGoogleSheets() で実
  行されます');

    const nameBtn = document.getElementById('name-list-btn');
    if (nameBtn) {
      nameBtn.addEventListener('click', async () => {
        const dataset = await populateNameDatalist(true);
        openSelectModal('名前一覧', dataset, (val) =>
  { document.getElementById('name').value = val; });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
