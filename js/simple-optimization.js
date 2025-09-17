// 🚀 シンプルAPI最適化システム - 確実に動作するバージョン
class SimpleOptimization {
    constructor() {
        this.cache = new Map();
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        this.CACHE_DURATION = 30 * 60 * 1000; // 30分
        
        this.init();
    }

    init() {
        // ⚠️ 統合データローダーとの競合を避けるため、callSheetsAPIのラップを無効化
        console.log('⚠️ シンプル最適化システム: 統合データローダーとの競合を避けるため、APIラップを無効化しました');
        console.log('📦 統合データローダーが最適化を担当します');
        
        // 統計のみ初期化
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            lastReset: Date.now()
        };
        
        this.saveStats();
    }

    // キャッシュから取得
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached;
        }
        
        // 期限切れのキャッシュを削除
        if (cached) {
            this.cache.delete(key);
        }
        
        return null;
    }

    // キャッシュに保存
    saveToCache(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
        
        // キャッシュサイズ制限（最大50件）
        if (this.cache.size > 50) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    // 関連キャッシュをクリア
    clearRelatedCache(range) {
        const sheetName = range.split('!')[0];
        const keysToDelete = [];
        
        for (const key of this.cache.keys()) {
            if (key.includes(sheetName)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.cache.delete(key));
        console.log(`🗑️ 関連キャッシュをクリア: ${keysToDelete.length}件`);
    }

    // 統計を保存
    saveStats() {
        try {
            localStorage.setItem('simpleOptimizationStats', JSON.stringify(this.stats));
        } catch (error) {
            console.warn('統計保存エラー:', error);
        }
    }

    // 統計を読み込み
    loadStats() {
        try {
            const saved = localStorage.getItem('simpleOptimizationStats');
            if (saved) {
                this.stats = { ...this.stats, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('統計読み込みエラー:', error);
        }
    }

    // 統計表示
    displayStats() {
        const hitRate = this.stats.totalRequests > 0 ? 
            Math.round((this.stats.cacheHits / this.stats.totalRequests) * 100) : 0;
        
        console.group('📊 シンプル最適化統計');
        console.log(`総リクエスト数: ${this.stats.totalRequests}`);
        console.log(`キャッシュヒット: ${this.stats.cacheHits}`);
        console.log(`キャッシュミス: ${this.stats.cacheMisses}`);
        console.log(`ヒット率: ${hitRate}%`);
        console.log(`現在のキャッシュ数: ${this.cache.size}`);
        console.groupEnd();
        
        return {
            totalRequests: this.stats.totalRequests,
            cacheHits: this.stats.cacheHits,
            hitRate: hitRate,
            cacheSize: this.cache.size
        };
    }

    // ダッシュボードの更新
    updateDashboard() {
        // 既存のダッシュボードがあれば更新
        const dashboard = document.getElementById('optimization-dashboard');
        if (dashboard) {
            const stats = this.displayStats();
            
            // ダッシュボード内容を更新
            const report = this.generateReport();
            dashboard.innerHTML = this.createDashboardHTML(report);
        }
    }

    // レポート生成
    generateReport() {
        const hitRate = this.stats.totalRequests > 0 ? 
            Math.round((this.stats.cacheHits / this.stats.totalRequests) * 100) : 0;
        
        let level = '初期化中';
        if (hitRate >= 70) level = '優秀';
        else if (hitRate >= 50) level = '良好';
        else if (hitRate >= 30) level = '普通';
        else if (hitRate > 0) level = '改善中';

        return {
            overallScore: hitRate,
            overallLevel: level,
            cacheHitRate: hitRate + '%',
            totalRequests: this.stats.totalRequests,
            cacheHits: this.stats.cacheHits,
            cacheSize: this.cache.size,
            estimatedSavings: (this.stats.cacheHits * 0.004 / 1000).toFixed(6)
        };
    }

    // ダッシュボードHTML生成
    createDashboardHTML(report) {
        const color = this.getOptimizationColor(report.overallScore);
        
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #2d3748;">⚡ API最適化</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #999;
                ">×</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #4a5568;">総合最適化レベル</div>
                <div style="font-size: 24px; color: ${color}; font-weight: bold;">
                    ${report.overallScore}% ${report.overallLevel}
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #4a5568; margin-bottom: 8px;">📊 リアルタイム統計</div>
                <div style="font-size: 14px; line-height: 1.4;">
                    <div>📦 キャッシュヒット率: <strong>${report.cacheHitRate}</strong></div>
                    <div>🔢 総リクエスト数: <strong>${report.totalRequests}</strong></div>
                    <div>💾 キャッシュ数: <strong>${report.cacheSize}</strong></div>
                    <div>💰 推定削減コスト: <strong>$${report.estimatedSavings}</strong></div>
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <!-- 本番用: テストボタンは削除されました -->
                
                <button onclick="window.simpleOptimization?.clearCache()" style="
                    width: 100%;
                    padding: 8px;
                    background: #f8f9fa;
                    color: #6c757d;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 12px;
                ">🗑️ キャッシュをクリア</button>
            </div>

            <div style="font-size: 12px; color: #999; text-align: center;">
                最終更新: ${new Date().toLocaleTimeString('ja-JP')}
            </div>
        `;
    }

    // 最適化レベルの色
    getOptimizationColor(score) {
        if (score >= 70) return '#28a745';
        if (score >= 50) return '#ffc107';
        if (score >= 30) return '#fd7e14';
        if (score > 0) return '#17a2b8';
        return '#6c757d';
    }

    // テスト機能は本番用に削除されました

    // キャッシュクリア
    clearCache() {
        this.cache.clear();
        this.stats = { totalRequests: 0, cacheHits: 0, cacheMisses: 0 };
        this.saveStats();
        console.log('🗑️ キャッシュをクリアしました');
        this.updateDashboard();
    }

    // ダッシュボードボタンの作成
    createDashboardButton() {
        // 既存のボタンがあれば削除
        const existingBtn = document.getElementById('simple-optimization-btn');
        if (existingBtn) existingBtn.remove();

        const btn = document.createElement('button');
        btn.id = 'simple-optimization-btn';
        btn.innerHTML = '📊';
        btn.title = 'シンプル最適化ダッシュボード';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(45deg, #5a7c5a, #4a6b4a);
            color: white;
            border: none;
            font-size: 20px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 9999;
            transition: all 0.3s ease;
        `;

        btn.addEventListener('click', () => {
            this.toggleDashboard();
        });

        document.body.appendChild(btn);
    }

    // ダッシュボードの表示/非表示
    toggleDashboard() {
        let dashboard = document.getElementById('simple-optimization-dashboard');
        
        if (dashboard) {
            dashboard.remove();
        } else {
            this.createDashboardPanel();
        }
    }

    // ダッシュボードパネルの作成
    createDashboardPanel() {
        const dashboard = document.createElement('div');
        dashboard.id = 'simple-optimization-dashboard';
        dashboard.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 350px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            z-index: 10000;
            padding: 20px;
            font-family: 'Segoe UI', sans-serif;
        `;

        const report = this.generateReport();
        dashboard.innerHTML = this.createDashboardHTML(report);
        document.body.appendChild(dashboard);
    }
}

// グローバルに公開
window.SimpleOptimization = SimpleOptimization;

// 自動初期化
document.addEventListener('DOMContentLoaded', () => {
    // 少し遅延させて確実に初期化
    setTimeout(() => {
        window.simpleOptimization = new SimpleOptimization();
        window.simpleOptimization.loadStats();
        window.simpleOptimization.createDashboardButton();
        
        console.log('🚀 シンプル最適化システムが初期化されました');
        
        // グローバル関数
        window.showSimpleStats = () => window.simpleOptimization.displayStats();
        // 本番用: テスト関数は削除されました
        window.clearSimpleCache = () => window.simpleOptimization.clearCache();
    }, 1000);
});
