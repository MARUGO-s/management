// 🔍 API使用量インジケーター（全ページ共通）
const INDICATOR_DEFAULT_SETTINGS = { orange: 900, yellow: 1500, red: 2400 };

class UsageIndicator {
    constructor() {
        this.isDetailsVisible = false; // 詳細表示は常に非表示がデフォルト
        this.updateInterval = null;
        this.colorSettings = null;
        this.colorSettingsPromise = null;
        this.latestMonthlyValue = 0;
        this.init();
    }

    // 初期化
    init() {
        this.createIndicator();
        this.ensureDetailsHidden(); // 確実に詳細を非表示に
        this.ensureColorSettings().catch(error => console.warn('色設定の初期取得エラー:', error));
        this.loadUsageData();
        
        // 5分ごとに更新（軽微な負荷）
        this.updateInterval = setInterval(() => {
            this.loadUsageData();
        }, 5 * 60 * 1000); // 5分間隔
        
    }

    // インジケーター要素を作成
    createIndicator() {
        // 既存の要素があれば削除
        const existing = document.getElementById('usage-indicator');
        if (existing) {
            existing.remove();
        }

        const indicator = document.createElement('div');
        indicator.id = 'usage-indicator';
        indicator.innerHTML = `
            <div id="usage-indicator-content">
                <span id="usage-text">📊 読み込み中...</span>
                <button id="usage-toggle" onclick="window.usageIndicator.toggle()" title="詳細表示/非表示">
                    ⋯
                </button>
            </div>
            <div id="usage-details" style="display: none !important;">
                <div style="font-size: 10px; margin: 2px 0;">今日: <span id="daily-count">-</span>/300</div>
                <div style="font-size: 10px; margin: 2px 0;">今月: <span id="monthly-count">-</span>/3,000</div>
                <div style="font-size: 10px; margin: 2px 0;">総計: <span id="total-count">-</span></div>
                <div style="font-size: 10px; margin: 2px 0;">デバイス: <span id="device-count">-</span>台</div>
            </div>
        `;

        // スタイル設定（小さく目立たない）
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(3px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            max-width: 160px;
            transition: all 0.3s ease;
            opacity: 0.6;
        `;

        // 詳細部分のスタイル
        const detailsStyle = `
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
            font-size: 11px;
            line-height: 1.4;
        `;

        // ボタンスタイル（より小さく目立たない）
        const buttonStyle = `
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 10px;
            margin-left: 6px;
            opacity: 0.5;
            transition: opacity 0.2s ease;
            padding: 2px;
        `;

        document.body.appendChild(indicator);

        // スタイル適用
        document.getElementById('usage-details').style.cssText = detailsStyle;
        document.getElementById('usage-toggle').style.cssText = buttonStyle;
        
        // 初期状態を確実に設定（詳細非表示）
        setTimeout(() => {
            const details = document.getElementById('usage-details');
            const toggleButton = document.getElementById('usage-toggle');
            
            if (details) {
                details.style.display = 'none';
            }
            
            if (toggleButton) {
                toggleButton.textContent = '⋯';
                toggleButton.title = '詳細を表示';
            }
            
            this.isDetailsVisible = false;
        }, 100); // 100ms後に確実に設定

        // ホバー効果（より控えめ）
        indicator.addEventListener('mouseenter', () => {
            indicator.style.opacity = '0.9';
            document.getElementById('usage-toggle').style.opacity = '0.8';
        });

        indicator.addEventListener('mouseleave', () => {
            indicator.style.opacity = '0.6';
            document.getElementById('usage-toggle').style.opacity = '0.5';
        });
    }

    // 詳細表示を確実に非表示にする
    ensureDetailsHidden() {
        const details = document.getElementById('usage-details');
        const toggleButton = document.getElementById('usage-toggle');
        
        if (details) {
            details.style.display = 'none';
            this.isDetailsVisible = false;
        }
        
        if (toggleButton) {
            toggleButton.textContent = '⋯';
            toggleButton.title = '詳細を表示';
        }
        
    }

    // 使用量データを読み込み
    async loadUsageData() {
        try {
            // Supabaseから使用量取得
            const response = await fetch(`${window.SUPABASE_CONFIG.url}/functions/v1/api-usage-tracker`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_CONFIG.anonKey}`
                },
                body: JSON.stringify({
                    action: 'get'
                })
            });

            if (response.ok) {
                const usageData = await response.json();
                await this.updateDisplay(usageData);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }

        } catch (error) {
            console.warn('⚠️ 使用量インジケーター取得失敗:', error.message);
            
            // フォールバック: ローカルストレージから取得
            await this.loadFromLocalStorage();
        }
    }

    // 表示を更新
    async updateDisplay(usageData) {
        const today = usageData.daily.total;
        const monthly = usageData.monthly.total;
        const total = usageData.total.total;
        const devices = usageData.devices.count;

        this.latestMonthlyValue = monthly;

        // メイン表示（簡潔）
        document.getElementById('usage-text').textContent = `📊 ${monthly}/3,000`;

        // 詳細表示（データ更新時も非表示状態を維持）
        document.getElementById('daily-count').textContent = today;
        document.getElementById('monthly-count').textContent = monthly;
        document.getElementById('total-count').textContent = total;
        document.getElementById('device-count').textContent = devices;
        
        // 詳細表示状態を維持（データ更新で表示状態が変わらないように）
        const details = document.getElementById('usage-details');
        if (details && !this.isDetailsVisible) {
            details.style.display = 'none';
        }

        // 色の変更（管理画面設定に基づく）
        const indicator = document.getElementById('usage-indicator');
        const settings = await this.ensureColorSettings();
        this.updateIndicatorColor(indicator, monthly, settings);

    }

    // ローカルストレージからのフォールバック
    async loadFromLocalStorage() {
        try {
            const today = new Date().toDateString();
            const currentMonth = new Date().toISOString().slice(0, 7);
            
            const dailyStats = JSON.parse(localStorage.getItem('dailyAPIStats') || '{}');
            const monthlyStats = JSON.parse(localStorage.getItem('monthlyAPIStats') || '{}');
            const totalStats = JSON.parse(localStorage.getItem('totalAPIStats') || '{"total": 0}');
            
            const dailyUsage = dailyStats[today] || 0;
            const monthlyUsage = monthlyStats[currentMonth] || 0;
            const totalUsage = totalStats.total || 0;

            this.latestMonthlyValue = monthlyUsage;

            // 表示更新
            document.getElementById('usage-text').textContent = `📊 ${monthlyUsage}/3,000`;
            document.getElementById('daily-count').textContent = dailyUsage;
            document.getElementById('monthly-count').textContent = monthlyUsage;
            document.getElementById('total-count').textContent = totalUsage;
            document.getElementById('device-count').textContent = '-';
            
            // 詳細表示状態を維持（ローカル取得時も非表示状態を保持）
            const details = document.getElementById('usage-details');
            if (details && !this.isDetailsVisible) {
                details.style.display = 'none';
            }

            // 色の変更（管理画面設定に基づく・ローカル版）
            const indicator = document.getElementById('usage-indicator');
            const settings = this.getLocalColorSettings();
            this.applyColorSettings(settings, false);
            this.updateIndicatorColor(indicator, monthlyUsage, settings);


        } catch (error) {
            console.error('❌ ローカル使用量取得エラー:', error);
            document.getElementById('usage-text').textContent = '📊 エラー';
        }
    }

    // 管理画面設定に基づく色変更
    updateIndicatorColor(indicator, monthlyUsage, settings = null) {
        if (!indicator) return;
        
        // 動的API上限値を取得
        const apiLimit = this.getAPILimit();
        
        // API制限チェック（設定された上限値で遮断表示）
        if (monthlyUsage >= apiLimit) {
            indicator.style.background = 'rgba(108, 117, 125, 0.9)'; // グレー
            indicator.style.border = '2px solid #dc3545'; // 赤い枠
            const usageText = document.getElementById('usage-text');
            if (usageText) {
                usageText.textContent = '🚫 制限中';
                usageText.title = `API使用量が制限値（${apiLimit.toLocaleString()}回）を超過しました。管理者にご連絡ください。`;
            }
            return;
        }
        
        // 通常の色変更処理
        const activeSettings = settings || this.getColorSettings();
        indicator.style.border = 'none'; // 枠をリセット
        
        if (monthlyUsage >= activeSettings.red) {
            indicator.style.background = 'rgba(220, 53, 69, 0.9)'; // 赤
        } else if (monthlyUsage >= activeSettings.yellow) {
            indicator.style.background = 'rgba(255, 193, 7, 0.9)'; // 黄
        } else if (monthlyUsage >= activeSettings.orange) {
            indicator.style.background = 'rgba(40, 167, 69, 0.8)'; // 緑
        } else {
            indicator.style.background = 'rgba(0, 0, 0, 0.8)'; // 黒
        }
    }

    // 色設定のローカル取得
    getLocalColorSettings() {
        try {
            const saved = localStorage.getItem('indicatorColorSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed.orange === 'number' && typeof parsed.yellow === 'number' && typeof parsed.red === 'number') {
                    return parsed;
                }
            }
        } catch (error) {
            console.warn('色設定読み込みエラー:', error);
        }
        return { ...INDICATOR_DEFAULT_SETTINGS };
    }

    applyColorSettings(settings, persist = true) {
        if (!settings) return;
        const normalized = {
            orange: Number(settings.orange) || INDICATOR_DEFAULT_SETTINGS.orange,
            yellow: Number(settings.yellow) || INDICATOR_DEFAULT_SETTINGS.yellow,
            red: Number(settings.red) || INDICATOR_DEFAULT_SETTINGS.red
        };

        if (!(normalized.orange < normalized.yellow && normalized.yellow < normalized.red)) {
            console.warn('色設定の順序が不正なため、デフォルト値を使用します');
            this.colorSettings = { ...INDICATOR_DEFAULT_SETTINGS };
        } else {
            this.colorSettings = normalized;
        }

        if (persist) {
            try {
                localStorage.setItem('indicatorColorSettings', JSON.stringify({
                    ...this.colorSettings,
                    updated: new Date().toISOString()
                }));
            } catch (error) {
                console.warn('色設定の保存エラー:', error);
            }
        }
        return this.colorSettings;
    }

    async ensureColorSettings(forceRefresh = false) {
        if (!forceRefresh && this.colorSettings) {
            return this.colorSettings;
        }

        if (!forceRefresh && this.colorSettingsPromise) {
            return this.colorSettingsPromise;
        }

        const fetchPromise = (async () => {
            try {
                const response = await fetch(`${window.SUPABASE_CONFIG.url}/functions/v1/indicator-settings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.SUPABASE_CONFIG.anonKey}`
                    },
                    body: JSON.stringify({ action: 'get' })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.settings) {
                        this.applyColorSettings(result.settings, true);
                        return this.colorSettings;
                    }
                }
                throw new Error('Supabase response error');
            } catch (error) {
                console.warn('色設定のSupabase取得エラー:', error);
                const fallback = this.getLocalColorSettings();
                this.applyColorSettings(fallback, false);
                return this.colorSettings;
            }
        })();

        this.colorSettingsPromise = fetchPromise;
        const resolved = await fetchPromise;
        this.colorSettingsPromise = null;
        return resolved;
    }

    // 色設定を取得（管理画面設定 or デフォルト）
    getColorSettings() {
        if (this.colorSettings) {
            return this.colorSettings;
        }
        const local = this.getLocalColorSettings();
        this.colorSettings = local;
        return local;
    }

    // API上限値を取得（管理画面設定 or デフォルト）
    getAPILimit() {
        try {
            const saved = localStorage.getItem('apiLimitSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                return settings.apiLimit || 2500; // デフォルト2,500
            }
        } catch (error) {
            console.warn('上限値設定読み込みエラー:', error);
        }
        return 2500; // デフォルト値
    }

    // 詳細表示の切り替え（デフォルト非表示）
    toggle() {
        const details = document.getElementById('usage-details');
        this.isDetailsVisible = !this.isDetailsVisible;
        
        if (this.isDetailsVisible) {
            details.style.cssText = details.style.cssText.replace('display: none !important;', 'display: block;');
            details.style.display = 'block';
            document.getElementById('usage-toggle').textContent = '▲';
            document.getElementById('usage-toggle').title = '詳細を非表示';
        } else {
            details.style.display = 'none';
            document.getElementById('usage-toggle').textContent = '⋯';
            document.getElementById('usage-toggle').title = '詳細を表示';
        }
    }

    // 手動更新
    async refresh() {
        await this.loadUsageData();
    }

    // インジケーターを非表示
    hide() {
        const indicator = document.getElementById('usage-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // インジケーターを表示
    show() {
        const indicator = document.getElementById('usage-indicator');
        if (indicator) {
            indicator.style.display = 'block';
        }
    }

    // 破棄
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        const indicator = document.getElementById('usage-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

// 自動初期化（admin.html以外のページで）
window.addEventListener('DOMContentLoaded', () => {
    // admin.htmlでは初期化しない（重複を避ける）
    if (!window.location.pathname.includes('admin.html')) {
        // config.js の読み込みを待ってから初期化
        setTimeout(() => {
            if (window.SUPABASE_CONFIG) {
                window.usageIndicator = new UsageIndicator();
            } else {
                console.warn('⚠️ SUPABASE_CONFIG が見つかりません');
            }
        }, 1000);
    }
});

// グローバル関数として公開
window.UsageIndicator = UsageIndicator;
