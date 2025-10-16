// スプレッドシート設定
const SHEET_NAME = '食材コスト';

// DOM要素
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const ingredientsTable = document.getElementById('ingredientsTable');
const ingredientsTableBody = document.getElementById('ingredientsTableBody');
const searchInput = document.getElementById('searchInput');

// 食材データを格納
let ingredientsData = [];
let filteredData = [];
let currentSort = { column: '', direction: '' };

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  loadIngredientsData();
  setupSearch();
  setupSorting();
});

// 食材データを読み込み
async function loadIngredientsData() {
  try {
    loadingMessage.style.display = 'block';
    errorMessage.style.display = 'none';
    ingredientsTable.style.display = 'none';

    const range = `${SHEET_NAME}!A:AI`;
    console.log('⚠️ 食材コスト取得: 別シートのため個別API呼び出し');
    const data = await callSheetsAPI(range, 'GET');
    const rows = data.values || [];

    console.log('取得したデータ:', rows.slice(0, 3)); // デバッグ用

    // ヘッダー行を除外してデータを処理
    const allItems = rows.slice(1).map((row, arrayIndex) => {
      const actualRowNumber = arrayIndex + 2; // 実際のスプレッドシートの行番号（ヘッダー行+1）
      console.log(`行${actualRowNumber}:`, row); // デバッグ用
      
      const item = {
        index: arrayIndex, // 配列内のインデックス
        rowNumber: actualRowNumber, // 実際のスプレッドシートの行番号
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
        console.log(`単価パース: "${rawUnitPrice}" → ${item.unitPrice}`);
      }

      console.log(`処理後 行${actualRowNumber}:`, {
        date: item.date,
        supplier: item.supplier,
        productName: item.productName,
        packUnit: item.packUnit,
        unitPrice: item.unitPrice,
        unit: item.unit
      }); // デバッグ用
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

    ingredientsData = Array.from(productMap.values());

    filteredData = [...ingredientsData];
    displayIngredientsData(filteredData);
    loadingMessage.style.display = 'none';
    ingredientsTable.style.display = 'table';

  } catch (error) {
    console.error('食材データ読み込みエラー:', error);
    loadingMessage.style.display = 'none';
    errorMessage.style.display = 'block';
    errorMessage.textContent = `❌ データの読み込みに失敗しました: ${error.message}`;
  }
}

// 食材データを表示
function displayIngredientsData(data) {
  ingredientsTableBody.innerHTML = '';

  if (data.length === 0) {
    ingredientsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #718096;">データが見つかりません</td></tr>';
    return;
  }

  data.forEach((item, displayIndex) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(item.date)}</td>
      <td>${escapeHtml(item.supplier)}</td>
      <td>${escapeHtml(item.productName)}</td>
      <td>${escapeHtml(item.packUnit)}</td>
      <td>¥${item.unitPrice.toLocaleString()}</td>
      <td>${escapeHtml(item.unit)}</td>
    `;
    ingredientsTableBody.appendChild(row);
  });
}

// 検索機能を設定
function setupSearch() {
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (searchTerm === '') {
      filteredData = [...ingredientsData];
    } else {
      filteredData = ingredientsData.filter(item => 
        item.productName.toLowerCase().includes(searchTerm) ||
        item.supplier.toLowerCase().includes(searchTerm) ||
        item.date.toLowerCase().includes(searchTerm)
      );
    }
    
    applySorting();
    displayIngredientsData(filteredData);
  });
}

// ソート機能を設定
function setupSorting() {
  const sortableHeaders = document.querySelectorAll('.sortable');
  sortableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const column = header.dataset.sort;
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
      }
      
      // ソートアイコンを更新
      sortableHeaders.forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      header.classList.add(`sort-${currentSort.direction}`);
      
      applySorting();
      displayIngredientsData(filteredData);
    });
  });
}

// ソートを適用
function applySorting() {
  if (!currentSort.column) return;

  filteredData.sort((a, b) => {
    let aVal = a[currentSort.column];
    let bVal = b[currentSort.column];

    if (currentSort.column === 'unitPrice') {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// CSVエクスポート
function exportToCSV() {
  const headers = ['伝票日付', '取引先名', '商品名', '入数単位', '単価', '単位'];
  const csvContent = [
    headers.join(','),
    ...ingredientsData.map(item => [
      `"${item.date}"`,
      `"${item.supplier}"`,
      `"${item.productName}"`,
      `"${item.packUnit}"`,
      item.unitPrice,
      `"${item.unit}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  // タイムゾーン問題を回避：ローカル日付として処理
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  link.setAttribute('download', `食材リスト_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// データを更新
function refreshData() {
  loadIngredientsData();
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
