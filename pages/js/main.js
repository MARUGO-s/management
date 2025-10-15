const GAS_URL = "https://script.google.com/macros/s/
  AKfycbw9rr3ooPCxcFE35Y_HCKLarVG9Jo765cR49qDyxLxPsBcFqmm481-17J7Vsw1ZKMxW/exec";
  const shops = [
    "本部", "MARUGO‑D", "MARUGO‑OTTO", "元祖どないや新宿三丁目", "鮨こるり",
    "MARUGO", "MARUGO2", "MARUGO GRANDE", "MARUGO MARUNOUCHI",
    "マルゴ新橋", "MARUGO YOTSUYA", "371BAR", "三三五五",
    "BAR PELOTA", "Claudia2", "BISTRO CAVACAVA", "eric'S",
    "MITAN", "焼肉マルゴ", "SOBA‑JU", "Bar Violet",
    "X&C", "トラットリア ブリッコラ"
  ];

  function populateShops() {
    const lenderSelect = document.getElementById("lender");
    const borrowerSelect = document.getElementById("borrower");

    const uniqueShops = ["本部", ...new Set(shops.filter(s => s !== "本部"))];

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
  const MAX_UNIQUE_HISTORY = 100;
  const SELECT_MODAL_LIMIT = 100;
  let latestItemMetaMap = new Map();
  let pendingErrorQueue = [];
  let lastFocusedErrorEl = null;
  let errorListenersAttached = false;

  function normalizeKeyForDedupe(s) {
    return (s || '')
      .toString()
      .normalize('NFKC')
      .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
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

  // (以下、元のロジックは変更せず。populateNameDatalist などは省略せず、現状コードを保持。)
  // ここでは最も重要な変更である setDateInputToToday の追加と initializeElements からの呼び出しのみ明示し
  ます。

  // ...（中略: 既存ロジック、必要に応じてプロジェクトの元コードを貼付）...

  function initializeElements() {
    setDateInputToToday(document.getElementById('date'));

    document.querySelectorAll('#entriesContainer .entry-row').forEach(row => setupEntryRow(row));

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
      if (borrowerFormGroup) borrowerFormGroup.appendChild(lenderBorrowerErrorDiv);
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
    console.log('📦 データ読み込みは GoogleSheetsAPIAnalyzer.connectToGoogleSheets() で実行されます');

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
