// 🚀 統合データローダー - 複数のAPI呼び出しを1つにまとめて最適化
class UnifiedDataLoader {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5分間キャッシュ
        this.isLoading = false;
        this.loadPromise = null;
        
        console.log('📦 統合データローダーを初期化しました');
    }

    // メインの統合データ読み込み関数
    async loadAllData(forceRefresh = false) {
        // 既に読み込み中の場合は同じPromiseを返す
        if (this.isLoading && this.loadPromise) {
            console.log('⏳ データ読み込み中 - 既存のPromiseを返します');
            return this.loadPromise;
        }

        // キャッシュチェック
        if (!forceRefresh && this.isDataCached()) {
            console.log('📦 キャッシュからデータを返します');
            return this.getCachedData();
        }

        // 新規データ読み込み
        this.isLoading = true;
        this.loadPromise = this.performDataLoad();

        try {
            const result = await this.loadPromise;
            this.cacheData(result);
            return result;
        } finally {
            this.isLoading = false;
            this.loadPromise = null;
        }
    }

    // 実際のデータ読み込み処理
    async performDataLoad() {
        console.log('🌐 統合データ読み込みを開始...');
        
        try {
            // 1回のAPI呼び出しで貸借表の全データを取得
            const mainSheetData = await callSheetsAPI('貸借表!A:K', 'GET');
            
            console.log('📊 貸借表データ取得完了:', mainSheetData.values?.length || 0, '行');
            
            // 取得したデータから各種リストを抽出
            const result = this.processMainSheetData(mainSheetData.values || []);
            
            console.log('✅ データ処理完了');
            return result;
            
        } catch (error) {
            console.error('❌ 統合データ読み込みエラー:', error);
            throw error;
        }
    }

    // 貸借表データから各種リストを抽出
    processMainSheetData(rows) {
        if (rows.length === 0) {
            return this.getEmptyResult();
        }

        const dataRows = rows.slice(1); // ヘッダー行を除外
        const result = {
            timestamp: Date.now(),
            rawData: rows,
            names: this.extractNames(dataRows),
            items: this.extractItems(dataRows),
            stores: this.extractStores(dataRows),
            categories: this.extractCategories(dataRows),
            searchData: this.prepareSearchData(dataRows),
            stats: this.calculateStats(dataRows)
        };

        console.log('📋 抽出結果:', {
            names: result.names.length,
            items: result.items.length,
            stores: result.stores.size,
            categories: result.categories.length,
            totalRows: dataRows.length
        });

        return result;
    }

    // 名前リストを抽出（B列）
    extractNames(rows) {
        const nameSet = new Set();
        const nameWithDate = [];

        rows.forEach(row => {
            const name = (row[1] || '').toString().trim(); // B列
            const dateStr = row[0] || ''; // A列
            
            if (name) {
                nameSet.add(name);
                const ms = this.parseDateMs(dateStr);
                nameWithDate.push({ name, ms });
            }
        });

        // 最新の使用順にソート
        const sortedNames = nameWithDate
            .sort((a, b) => b.ms - a.ms)
            .map(item => item.name)
            .filter((name, index, arr) => arr.indexOf(name) === index) // 重複除去
            .slice(0, 50); // 最新50件

        return sortedNames;
    }

    // 品目リストを抽出（F列）
    extractItems(rows) {
        const itemMap = new Map();

        rows.forEach(row => {
            const item = (row[5] || '').toString().trim(); // F列
            const dateStr = row[0] || ''; // A列
            const quantity = this.parseNumber(row[6]); // G列
            const unitPrice = this.parseNumber(row[7]); // H列
            const amount = this.parseNumber(row[8]); // I列
            
            if (item) {
                const key = this.normalizeKey(item);
                const ms = this.parseDateMs(dateStr);
                
                if (!itemMap.has(key) || itemMap.get(key).ms < ms) {
                    itemMap.set(key, {
                        item,
                        ms,
                        quantity,
                        unitPrice,
                        amount
                    });
                }
            }
        });

        // 最新順にソート
        return Array.from(itemMap.values())
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 50)
            .map(item => item.item);
    }

    // 店舗リストを抽出（C列とD列）
    extractStores(rows) {
        const stores = new Set();

        rows.forEach(row => {
            const lender = (row[2] || '').toString().trim(); // C列
            const borrower = (row[3] || '').toString().trim(); // D列
            
            if (lender) stores.add(lender);
            if (borrower) stores.add(borrower);
        });

        return stores;
    }

    // カテゴリリストを抽出（E列）
    extractCategories(rows) {
        const categorySet = new Set();

        rows.forEach(row => {
            const category = (row[4] || '').toString().trim(); // E列
            if (category) {
                categorySet.add(category);
            }
        });

        return Array.from(categorySet).sort();
    }

    // 検索用データを準備
    prepareSearchData(rows) {
        return rows.map((row, index) => ({
            rowIndex: index + 2, // スプレッドシートの実際の行番号
            date: row[0] || '',
            name: row[1] || '',
            lender: row[2] || '',
            borrower: row[3] || '',
            category: row[4] || '',
            item: row[5] || '',
            quantity: row[6] || '',
            unitPrice: row[7] || '',
            amount: row[8] || '',
            note: row[9] || ''
        }));
    }

    // 統計情報を計算
    calculateStats(rows) {
        return {
            totalRecords: rows.length,
            uniqueNames: new Set(rows.map(row => row[1]).filter(Boolean)).size,
            uniqueItems: new Set(rows.map(row => row[5]).filter(Boolean)).size,
            dateRange: this.getDateRange(rows)
        };
    }

    // 日付範囲を取得
    getDateRange(rows) {
        const dates = rows.map(row => this.parseDateMs(row[0])).filter(ms => ms > 0);
        if (dates.length === 0) return null;
        
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        return {
            from: minDate.toLocaleDateString('ja-JP'),
            to: maxDate.toLocaleDateString('ja-JP')
        };
    }

    // ユーティリティ関数
    parseDateMs(dateStr) {
        if (!dateStr) return 0;
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? 0 : date.getTime();
    }

    parseNumber(value) {
        if (!value) return 0;
        const num = parseFloat(value.toString().replace(/[^\d.-]/g, ''));
        return isNaN(num) ? 0 : num;
    }

    normalizeKey(str) {
        return str.toLowerCase().replace(/\s+/g, '');
    }

    // キャッシュ関連
    isDataCached() {
        const cached = this.cache.get('allData');
        if (!cached) return false;
        
        const age = Date.now() - cached.timestamp;
        return age < this.cacheExpiry;
    }

    getCachedData() {
        return this.cache.get('allData').data;
    }

    cacheData(data) {
        this.cache.set('allData', {
            data,
            timestamp: Date.now()
        });
    }

    getEmptyResult() {
        return {
            timestamp: Date.now(),
            rawData: [],
            names: [],
            items: [],
            stores: new Set(),
            categories: [],
            searchData: [],
            stats: {
                totalRecords: 0,
                uniqueNames: 0,
                uniqueItems: 0,
                dateRange: null
            }
        };
    }

    // 外部アクセス用のヘルパー関数
    async getNames(forceRefresh = false) {
        const data = await this.loadAllData(forceRefresh);
        return data.names;
    }

    async getItems(forceRefresh = false) {
        const data = await this.loadAllData(forceRefresh);
        return data.items;
    }

    async getStores(forceRefresh = false) {
        const data = await this.loadAllData(forceRefresh);
        return Array.from(data.stores);
    }

    async getSearchData(forceRefresh = false) {
        const data = await this.loadAllData(forceRefresh);
        return data.searchData;
    }

    // キャッシュクリア
    clearCache() {
        this.cache.clear();
        console.log('🗑️ データキャッシュをクリアしました');
    }

    // デバッグ情報表示
    getDebugInfo() {
        const cached = this.cache.get('allData');
        return {
            isCached: !!cached,
            cacheAge: cached ? Date.now() - cached.timestamp : 0,
            isLoading: this.isLoading
        };
    }
}

// グローバルインスタンス
window.unifiedDataLoader = new UnifiedDataLoader();

// 既存の関数を統合データローダーを使用するように置き換え
window.optimizedPopulateNameDatalist = async function(forceRefresh = false) {
    try {
        console.log('📋 最適化された名前リスト読み込み開始');
        const names = await window.unifiedDataLoader.getNames(forceRefresh);
        
        // 既存のrenderNameList関数を使用
        if (typeof renderNameList === 'function') {
            renderNameList(names);
        }
        
        return names;
    } catch (error) {
        console.error('名前リスト読み込みエラー:', error);
        return [];
    }
};

window.optimizedPopulateItemDatalist = async function(forceRefresh = false) {
    try {
        console.log('📋 最適化された品目リスト読み込み開始');
        const items = await window.unifiedDataLoader.getItems(forceRefresh);
        
        // 既存のrenderItemList関数を使用
        if (typeof renderItemList === 'function') {
            renderItemList(items);
        }
        
        return items;
    } catch (error) {
        console.error('品目リスト読み込みエラー:', error);
        return [];
    }
};

console.log('🚀 統合データローダーが利用可能になりました');
