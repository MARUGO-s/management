// 🚨 API使用量監視・アラートシステム
class QuotaAlertSystem {
    constructor() {
        this.DAILY_LIMIT = 300;
        this.MONTHLY_LIMIT = 3000;
        // 管理者画面から設定可能な閾値
        this.loadThresholds();
        this.loadAdminEmail();
        
        this.alertHistory = [];
        this.lastAlertTime = {};
        
        this.init();
    }

    // 管理者設定の閾値を読み込み
    loadThresholds() {
        try {
            const saved = localStorage.getItem('alertThresholds');
            if (saved) {
                const thresholds = JSON.parse(saved);
                this.WARNING_THRESHOLDS = {
                    monthly: {
                        first: thresholds.first || 1000,
                        middle: thresholds.middle || 2000,
                        final: thresholds.final || 2800
                    }
                };
            } else {
                // デフォルト値
                this.WARNING_THRESHOLDS = {
                    monthly: {
                        first: 1000,
                        middle: 2000,
                        final: 2800
                    }
                };
            }
        } catch (error) {
            console.warn('閾値読み込みエラー:', error);
            this.WARNING_THRESHOLDS = {
                monthly: { first: 1000, middle: 2000, final: 2800 }
            };
        }
    }

    // 管理者メールアドレスを読み込み
    loadAdminEmail() {
        const saved = localStorage.getItem('adminEmail');
        this.ADMIN_EMAIL = saved || 'admin@example.com';
    }

    init() {
        // 既存の最適化システムと統合
        this.wrapAPIWithMonitoring();
        this.startContinuousMonitoring();
        this.setupAdminPanel();
        
        console.log('🚨 API使用量監視・アラートシステムを初期化しました');
        console.log('📊 現在の閾値:', this.WARNING_THRESHOLDS);
        console.log('📧 管理者メール:', this.ADMIN_EMAIL);
    }

    // 閾値設定の読み込み
    loadThresholds() {
        try {
            const saved = localStorage.getItem('alertThresholds');
            if (saved) {
                const thresholds = JSON.parse(saved);
                this.WARNING_THRESHOLDS = {
                    monthly: {
                        first: thresholds.first || 1000,
                        middle: thresholds.middle || 2000,
                        final: thresholds.final || 2800
                    }
                };
            } else {
                // デフォルト値
                this.WARNING_THRESHOLDS = {
                    monthly: {
                        first: 1000,
                        middle: 2000,
                        final: 2800
                    }
                };
            }
        } catch (error) {
            console.warn('閾値読み込みエラー:', error);
            this.WARNING_THRESHOLDS = {
                monthly: { first: 1000, middle: 2000, final: 2800 }
            };
        }
    }

    // 管理者メールアドレスの読み込み
    loadAdminEmail() {
        const saved = localStorage.getItem('adminEmail');
        this.ADMIN_EMAIL = saved || 'admin@example.com';
    }

    // API監視の統合（使用量記録は config.js で処理）
    wrapAPIWithMonitoring() {
        // config.js で既にAPI使用量記録が行われているため、
        // ここでは重複記録を避けるために何もしない
        console.log('📊 API監視システム: 使用量記録は config.js で処理されます');
    }

    // API使用量の記録は config.js で処理されるため削除

    // 現在の使用量取得（累計方式・config.js と完全同期）
    getCurrentUsage() {
        const today = new Date().toDateString();
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        // 🌐 累計統計を優先使用（全デバイス・ブラウザの合算）
        const cumulativeStats = JSON.parse(localStorage.getItem('globalAPICumulative') || '{"total": 0, "daily": {}, "monthly": {}, "devices": {}}');
        
        // フォールバック用の従来統計
        const dailyStats = JSON.parse(localStorage.getItem('dailyAPIStats') || '{}');
        const monthlyStats = JSON.parse(localStorage.getItem('monthlyAPIStats') || '{}');
        const totalStats = JSON.parse(localStorage.getItem('totalAPIStats') || '{"total": 0}');
        
        // 累計データを優先、なければ従来データを使用
        const dailyUsage = cumulativeStats.daily[today] || dailyStats[today] || 0;
        const monthlyUsage = cumulativeStats.monthly[currentMonth] || monthlyStats[currentMonth] || 0;
        const totalUsage = cumulativeStats.total || totalStats.total || 0;
        
        // デバイス数も取得
        const deviceCount = Object.keys(cumulativeStats.devices || {}).length;
        
        console.log(`📊 使用量取得 (累計): 今日${dailyUsage}回, 今月${monthlyUsage}回, 総累計${totalUsage}回, デバイス${deviceCount}台`);
        
        return {
            daily: dailyUsage,
            monthly: monthlyUsage,
            total: totalUsage,
            devices: deviceCount,
            dailyPercentage: Math.round((dailyUsage / this.DAILY_LIMIT) * 100),
            monthlyPercentage: Math.round((monthlyUsage / this.MONTHLY_LIMIT) * 100),
            lastUpdated: cumulativeStats.lastUpdated
        };
    }

    // クォータ制限のチェック
    async checkQuotaLimits() {
        const usage = this.getCurrentUsage();
        
        // 月次制限チェック（累計ベース）のみ
        await this.checkMonthlyLimitByCount(usage);
    }

    // 日次制限チェックは削除されました（月次のみ使用）

    // 月次制限チェック（累計件数ベース）
    async checkMonthlyLimitByCount(usage) {
        const monthlyCount = usage.monthly;
        const thresholds = this.WARNING_THRESHOLDS.monthly;
        
        // 最終警告（2800件 - 無料枠超過直前）
        if (monthlyCount >= thresholds.final) {
            await this.showFinalAlert(usage);
        }
        // 中間警告（2000件）
        else if (monthlyCount >= thresholds.middle) {
            await this.showMiddleAlert(usage);
        }
        // 初回警告（1000件）
        else if (monthlyCount >= thresholds.first) {
            await this.showFirstAlert(usage);
        }
    }

    // 初回警告（設定可能な閾値）
    async showFirstAlert(usage) {
        const alertKey = `first_warning_${new Date().toISOString().slice(0, 7)}`;
        
        // 月に1回のみ（どのページからでも、一度表示したら絶対に再表示しない）
        const alreadyShown = localStorage.getItem(alertKey);
        if (alreadyShown) {
            console.log('📊 初回警告: 今月は既に表示済みのためスキップ (グローバル制御)');
            return;
        }
        
        const threshold = this.WARNING_THRESHOLDS.monthly.first;
        const remaining = this.MONTHLY_LIMIT - usage.monthly;
        const percentageOfLimit = Math.round((threshold / this.MONTHLY_LIMIT) * 100);
        
        const message = `
📊 【初回警告】月間API使用量が${threshold}件に達しました

月次使用量: ${usage.monthly}/3,000件 (${usage.monthlyPercentage}%)

使用量が増加しています。最適化システムの活用をお勧めします。

【現在の状況】:
- 無料枠の${percentageOfLimit}%を使用
- 残り約${remaining.toLocaleString()}件の余裕

【推奨対応】:
1. 最適化システムの効果確認
2. 同じデータの再利用を心がける
3. 不要なアクセスの削減
        `;

        await this.showPopupAlert(message, '📊 初回警告 - 管理者にお知らせください');
        
        // グローバルに表示済みフラグを設定
        localStorage.setItem(alertKey, Date.now().toString());
        this.lastAlertTime[alertKey] = Date.now();
        this.recordAlert('first_warning', 'monthly', usage);
    }

    // 中間警告（設定可能な閾値）
    async showMiddleAlert(usage) {
        const alertKey = `middle_warning_${new Date().toISOString().slice(0, 7)}`;
        
        // 月に1回のみ（どのページからでも、一度表示したら絶対に再表示しない）
        const alreadyShown = localStorage.getItem(alertKey);
        if (alreadyShown) {
            console.log('⚠️ 中間警告: 今月は既に表示済みのためスキップ (グローバル制御)');
            return;
        }
        
        const threshold = this.WARNING_THRESHOLDS.monthly.middle;
        const remaining = this.MONTHLY_LIMIT - usage.monthly;
        const percentageOfLimit = Math.round((threshold / this.MONTHLY_LIMIT) * 100);
        
        const message = `
⚠️ 【中間警告】月間API使用量が${threshold}件に達しました

月次使用量: ${usage.monthly}/3,000件 (${usage.monthlyPercentage}%)

無料枠の${percentageOfLimit}%を使用しています。使用量の管理をお願いします。

【現在の状況】:
- 残り約${remaining.toLocaleString()}件の余裕
- 月末まで${this.getRemainingDays()}日

【推奨対応】:
1. 使用パターンの見直し
2. 最適化システムの積極活用
3. 不要なデータアクセスの削減
4. 使用量の分散
        `;

        await this.showPopupAlert(message, '⚠️ 中間警告 - 管理者にお知らせください');
        
        // グローバルに表示済みフラグを設定
        localStorage.setItem(alertKey, Date.now().toString());
        this.lastAlertTime[alertKey] = Date.now();
        this.recordAlert('middle_warning', 'monthly', usage);
    }

    // 最終警告（設定可能な閾値 - 月5回まで表示）
    async showFinalAlert(usage) {
        const alertKey = `final_warning_${new Date().toISOString().slice(0, 7)}`;
        const countKey = `final_warning_count_${new Date().toISOString().slice(0, 7)}`;
        
        // 月5回まで表示（どのページからでも共通のカウント）
        const alertCount = parseInt(localStorage.getItem(countKey) || '0');
        if (alertCount >= 5) {
            console.log('🚨 最終警告: 今月は既に5回表示済みのためスキップ (グローバル制御)');
            return;
        }
        
        const threshold = this.WARNING_THRESHOLDS.monthly.final;
        const remaining = this.MONTHLY_LIMIT - usage.monthly;
        
        const message = `
🚨 【最終警告】月間API使用量が${threshold}件に達しました

月次使用量: ${usage.monthly}/3,000件 (${usage.monthlyPercentage}%)

⚠️ 無料枠超過まで残り${remaining}件です！

【緊急対応が必要】:
1. 新規データアクセスを最小限に抑制
2. キャッシュクリアを絶対に避ける
3. 不要なシステムアクセスを停止
4. 有料プランへの移行を検討

【残り容量】: 約${remaining}件
【月末まで】: ${this.getRemainingDays()}日
        `;

        await this.showPopupAlert(message, `🚨 最終警告 (${alertCount + 1}/5回目) - 管理者にお知らせください`);
        
        // 表示回数をカウント
        localStorage.setItem(countKey, (alertCount + 1).toString());
        this.lastAlertTime[alertKey] = Date.now();
        this.recordAlert('final_warning', 'monthly', usage);
    }

    // 警告アラートの表示
    async showWarningAlert(type, usage) {
        const alertKey = `warning_${type}_${new Date().toDateString()}`;
        
        // 1日1回のみ
        if (this.lastAlertTime[alertKey]) return;
        
        const isDaily = type === 'daily';
        const current = isDaily ? usage.daily : usage.monthly;
        const limit = isDaily ? this.DAILY_LIMIT : this.MONTHLY_LIMIT;
        const percentage = isDaily ? usage.dailyPercentage : usage.monthlyPercentage;
        
        const message = `
⚠️ API使用量が警告レベルに達しました

${isDaily ? '日次' : '月次'}使用量: ${current}/${limit}回 (${percentage}%)

使用量にご注意ください。

【推奨対応】:
1. 最適化システムの活用
2. 不要なアクセスの削減
3. 使用パターンの見直し

システム管理者にお知らせしますか？
        `;

        await this.showPopupAlert(message, '⚠️ 使用量警告 - 管理者にお知らせください');
        
        this.lastAlertTime[alertKey] = Date.now();
        this.recordAlert('warning', type, usage);
    }

    // 情報アラートの表示
    async showInfoAlert(type, usage) {
        const alertKey = `info_${type}_${new Date().toDateString()}`;
        
        // 1日1回のみ
        if (this.lastAlertTime[alertKey]) return;
        
        const isDaily = type === 'daily';
        const current = isDaily ? usage.daily : usage.monthly;
        const limit = isDaily ? this.DAILY_LIMIT : this.MONTHLY_LIMIT;
        const percentage = isDaily ? usage.dailyPercentage : usage.monthlyPercentage;
        
        const message = `
📊 API使用量のお知らせ

${isDaily ? '日次' : '月次'}使用量: ${current}/${limit}回 (${percentage}%)

使用量が増加しています。最適化システムの活用をお勧めします。

【最適化のヒント】:
1. 同じデータの再利用
2. 関連作業のまとめ実行
3. キャッシュの活用
        `;

        await this.showPopupAlert(message, '📊 使用量通知', false);
        
        this.lastAlertTime[alertKey] = Date.now();
        this.recordAlert('info', type, usage);
    }

    // ポップアップアラートの表示
    async showPopupAlert(message, title) {
        // ポップアップを表示
        this.displayPopup(message, title);
        
        // メール送信機能は削除されました
        return true;
    }

    // ポップアップの表示
    displayPopup(message, title) {
        // オーバーレイの作成
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 20000;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: fadeIn 0.3s ease;
        `;

        // アラートボックスの作成
        const alertBox = document.createElement('div');
        alertBox.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            text-align: center;
            animation: slideIn 0.3s ease;
        `;

        alertBox.innerHTML = `
            <h2 style="margin-bottom: 20px; color: #2d3748;">${title}</h2>
            <div style="
                text-align: left;
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                white-space: pre-line;
                line-height: 1.5;
            ">${message}</div>
            <div style="margin-top: 20px;">
                <div style="
                    background: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffeaa7;
                    border-radius: 8px;
                    padding: 15px;
                    margin: 15px 0;
                    text-align: left;
                ">
                    📋 システム管理者にお知らせください
                </div>
                <button id="close-alert-btn" style="
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin: 10px;
                    font-weight: 600;
                ">確認しました</button>
            </div>
        `;

        overlay.appendChild(alertBox);
        document.body.appendChild(overlay);

        // 閉じるボタンのイベント
        const closeBtn = alertBox.querySelector('#close-alert-btn');
        closeBtn.addEventListener('click', () => {
            overlay.remove();
        });

        // ESCキーで閉じる
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // 15秒後に自動で閉じる
        setTimeout(() => {
            if (overlay.parentElement) {
                overlay.remove();
            }
        }, 15000);
    }

    // 月末までの残り日数計算
    getRemainingDays() {
        const now = new Date();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const remainingDays = lastDay.getDate() - now.getDate();
        return remainingDays;
    }

    // 簡素化: ポップアップ警告のみ
    // メール送信機能は削除されました

    // 不要になったメール関連関数（参考用に保持）
    generateEmailContent(level, type, usage) {
        const current = usage.monthly;
        const limit = this.MONTHLY_LIMIT;
        const percentage = usage.monthlyPercentage;
        const remaining = limit - current;
        const remainingDays = this.getRemainingDays();
        
        let urgencyLevel, alertType;
        
        switch(level) {
            case 'first_warning':
                urgencyLevel = '📊 初回警告';
                alertType = '1000件到達';
                break;
            case 'middle_warning':
                urgencyLevel = '⚠️ 中間警告';
                alertType = '2000件到達';
                break;
            case 'final_warning':
                urgencyLevel = '🚨 最終警告';
                alertType = '2800件到達';
                break;
            default:
                urgencyLevel = '📊 通知';
                alertType = '使用量通知';
        }
        
        const subject = `${urgencyLevel} 貸借管理システム API使用量アラート - ${alertType}`;
        
        const body = `
貸借管理システム API使用量アラート

【アラートレベル】: ${urgencyLevel}
【発生時刻】: ${new Date().toLocaleString('ja-JP')}
【アラートタイプ】: ${alertType}

【使用状況】:
- 現在の使用量: ${current}件
- 月間無料枠: ${limit}件
- 使用率: ${percentage}%
- 残り容量: ${remaining}件
- 月末まで: ${remainingDays}日

【予測分析】:
${this.generateMonthlyForecast(usage, remainingDays)}

【推奨対応】:
${this.generateRecommendationsByLevel(level, usage, remaining)}

【システム情報】:
- 最適化レベル: ${this.getOptimizationLevel()}
- 今日の使用量: ${usage.daily}件
- 最終アクセス: ${new Date().toLocaleString('ja-JP')}

【対応履歴】:
このアラートは月間累計${current}件到達時に自動送信されました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
貸借管理システム 自動監視機能
設定変更: alert-system-setup.html
システム管理: pages/marugo.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `;

        return {
            to: this.ADMIN_EMAIL,
            subject: subject,
            body: body,
            priority: level === 'final_warning' ? 'high' : 'normal'
        };
    }

    // 月間予測の生成
    generateMonthlyForecast(usage, remainingDays) {
        const currentDay = new Date().getDate();
        const dailyAverage = usage.monthly / currentDay;
        const projectedTotal = Math.round(usage.monthly + (dailyAverage * remainingDays));
        
        let forecast = `現在のペースでの月末予測: ${projectedTotal}件`;
        
        if (projectedTotal > this.MONTHLY_LIMIT) {
            const overageDate = this.calculateOverageDate(usage, dailyAverage);
            forecast += `\n⚠️ 予測超過日: ${overageDate}`;
            forecast += `\n⚠️ 予測超過量: ${projectedTotal - this.MONTHLY_LIMIT}件`;
        } else {
            forecast += `\n✅ 月末まで無料枠内での運用予測`;
        }
        
        return forecast;
    }

    // 超過予想日の計算
    calculateOverageDate(usage, dailyAverage) {
        const remaining = this.MONTHLY_LIMIT - usage.monthly;
        const daysToOverage = Math.floor(remaining / dailyAverage);
        const overageDate = new Date();
        overageDate.setDate(overageDate.getDate() + daysToOverage);
        
        return overageDate.toLocaleDateString('ja-JP');
    }

    // レベル別推奨対応の生成
    generateRecommendationsByLevel(level, usage, remaining) {
        const recommendations = [];
        
        switch(level) {
            case 'first_warning':
                recommendations.push('1. 最適化システムの効果を確認してください');
                recommendations.push('2. 同じデータの再利用を心がけてください');
                recommendations.push('3. 不要なアクセスがないか確認してください');
                recommendations.push('4. 使用パターンの見直しを検討してください');
                break;
                
            case 'middle_warning':
                recommendations.push('1. 【重要】使用パターンの見直しが必要です');
                recommendations.push('2. 最適化システムを積極的に活用してください');
                recommendations.push('3. 不要なデータアクセスを削減してください');
                recommendations.push('4. 使用量の分散を検討してください');
                recommendations.push('5. 有料プランへの移行を検討開始してください');
                break;
                
            case 'final_warning':
                recommendations.push('1. 【緊急】新規データアクセスを最小限に抑制してください');
                recommendations.push('2. 【緊急】キャッシュクリアを絶対に避けてください');
                recommendations.push('3. 【緊急】不要なシステムアクセスを停止してください');
                recommendations.push('4. 【緊急】有料プランへの移行を強く推奨します');
                recommendations.push('5. 残り容量は約200件です');
                break;
        }
        
        return recommendations.join('\n');
    }

    // 使用量予測の生成
    generateUsageForecast(usage, type) {
        if (type === 'daily') {
            const currentHour = new Date().getHours();
            const remainingHours = 24 - currentHour;
            const hourlyRate = usage.daily / currentHour;
            const projectedTotal = Math.round(usage.daily + (hourlyRate * remainingHours));
            
            return `今日の予測使用量: ${projectedTotal}回 (現在のペースで継続した場合)`;
        } else {
            const currentDay = new Date().getDate();
            const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
            const remainingDays = daysInMonth - currentDay;
            const dailyRate = usage.monthly / currentDay;
            const projectedTotal = Math.round(usage.monthly + (dailyRate * remainingDays));
            
            return `今月の予測使用量: ${projectedTotal}回 (現在のペースで継続した場合)`;
        }
    }

    // 推奨対応の生成
    generateRecommendations(level, usage) {
        const recommendations = [];
        
        if (level === 'critical') {
            recommendations.push('1. 【緊急】不要なデータアクセスを即座に停止');
            recommendations.push('2. 【緊急】キャッシュクリアを避ける');
            recommendations.push('3. 【緊急】新規データ入力を一時停止');
        }
        
        recommendations.push('4. 最適化システムの効果確認');
        recommendations.push('5. 使用パターンの見直し');
        recommendations.push('6. 必要に応じて有料プランへの移行検討');
        
        return recommendations.join('\n');
    }

    // 現在の最適化レベル取得
    getOptimizationLevel() {
        if (window.simpleOptimization) {
            const stats = window.simpleOptimization.stats;
            const hitRate = stats.totalRequests > 0 ? 
                Math.round((stats.cacheHits / stats.totalRequests) * 100) : 0;
            return `${hitRate}% (キャッシュヒット率)`;
        }
        return '不明';
    }

    // mailto リンクのフォールバック
    openMailtoLink(level, type, usage) {
        const emailContent = this.generateEmailContent(level, type, usage);
        const mailtoURL = `mailto:${this.ADMIN_EMAIL}?subject=${encodeURIComponent(emailContent.subject)}&body=${encodeURIComponent(emailContent.body)}`;
        
        try {
            window.open(mailtoURL);
            this.showSuccessNotification('📧 メールアプリを開きました');
        } catch (error) {
            console.error('Mailto エラー:', error);
            this.showErrorNotification('❌ メール送信に失敗しました');
        }
    }

    // 成功通知の表示
    showSuccessNotification(message) {
        this.showToast(message, 'success');
    }

    // エラー通知の表示
    showErrorNotification(message) {
        this.showToast(message, 'error');
    }

    // トースト通知の表示
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 21000;
            font-weight: 500;
            animation: slideInRight 0.3s ease;
        `;
        
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // 3秒後に自動削除
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    }

    // アラート履歴の記録
    recordAlert(level, type, usage) {
        const alert = {
            timestamp: new Date().toISOString(),
            level: level,
            type: type,
            usage: usage,
            id: Date.now()
        };
        
        this.alertHistory.unshift(alert);
        
        // 最新50件のみ保持
        if (this.alertHistory.length > 50) {
            this.alertHistory = this.alertHistory.slice(0, 50);
        }
        
        localStorage.setItem('alertHistory', JSON.stringify(this.alertHistory));
    }

    // 継続的監視の開始
    startContinuousMonitoring() {
        // 10分ごとに使用量をチェック
        setInterval(() => {
            this.performScheduledCheck();
        }, 10 * 60 * 1000);
        
        // 1時間ごとに詳細分析
        setInterval(() => {
            this.performDetailedAnalysis();
        }, 60 * 60 * 1000);
    }

    // 定期チェックの実行
    performScheduledCheck() {
        const usage = this.getCurrentUsage();
        
        // 使用量ログ
        console.log('📊 定期使用量チェック:', {
            日次: `${usage.daily}/${this.DAILY_LIMIT} (${usage.dailyPercentage}%)`,
            月次: `${usage.monthly}/${this.MONTHLY_LIMIT} (${usage.monthlyPercentage}%)`
        });
        
        // 予測分析
        this.performUsageForecast(usage);
    }

    // 詳細分析の実行
    performDetailedAnalysis() {
        const usage = this.getCurrentUsage();
        const forecast = this.generateUsageForecast(usage, 'monthly');
        
        console.group('📈 API使用量詳細分析');
        console.log('現在の使用状況:', usage);
        console.log('予測:', forecast);
        console.log('アラート履歴:', this.alertHistory.slice(0, 5));
        console.groupEnd();
    }

    // 使用量予測の実行
    performUsageForecast(usage) {
        const monthlyForecast = this.generateUsageForecast(usage, 'monthly');
        const projectedUsage = parseInt(monthlyForecast.match(/\d+/)?.[0] || '0');
        
        // 月末までに無料枠を超過する可能性が高い場合
        if (projectedUsage > this.MONTHLY_LIMIT * 0.9) {
            console.warn('⚠️ 月末までに無料枠超過の可能性があります');
            
            // 早期警告（月の15日以降で80%超過予測の場合）
            const currentDay = new Date().getDate();
            if (currentDay >= 15 && projectedUsage > this.MONTHLY_LIMIT) {
                this.showEarlyWarning(projectedUsage, usage);
            }
        }
    }

    // 早期警告の表示
    async showEarlyWarning(projectedUsage, usage) {
        const message = `
📊 月末超過予測アラート

現在のペースで使用を続けると、月末までに無料枠を超過する可能性があります。

【予測使用量】: ${projectedUsage}回
【無料枠】: ${this.MONTHLY_LIMIT}回
【超過予測】: ${projectedUsage - this.MONTHLY_LIMIT}回

【推奨対応】:
1. 使用量の削減
2. 最適化システムの積極活用
3. 不要なアクセスの見直し

システム管理者にお知らせしますか？
        `;

        await this.showPopupAlert(message, '📊 月末超過予測 - 管理者にお知らせください');
    }

    // 管理者パネルの設定
    setupAdminPanel() {
        // 管理者用のグローバル関数を設定
        window.setAdminEmail = (email) => {
            this.ADMIN_EMAIL = email;
            localStorage.setItem('adminEmail', email);
            console.log(`📧 管理者メールを設定: ${email}`);
        };

        window.getQuotaUsage = () => {
            return this.getCurrentUsage();
        };

        window.getAlertHistory = () => {
            return this.alertHistory;
        };

        window.testQuotaAlert = async (level = 'first') => {
            let testUsage;
            
            switch(level) {
                case 'first':
                    testUsage = {
                        daily: 35,
                        monthly: 1000,
                        dailyPercentage: 35,
                        monthlyPercentage: 33
                    };
                    await this.showFirstAlert(testUsage);
                    break;
                    
                case 'middle':
                    testUsage = {
                        daily: 65,
                        monthly: 2000,
                        dailyPercentage: 65,
                        monthlyPercentage: 67
                    };
                    await this.showMiddleAlert(testUsage);
                    break;
                    
                case 'final':
                    testUsage = {
                        daily: 90,
                        monthly: 2800,
                        dailyPercentage: 90,
                        monthlyPercentage: 93
                    };
                    await this.showFinalAlert(testUsage);
                    break;
            }
        };

        window.resetQuotaStats = () => {
            localStorage.removeItem('dailyAPIStats');
            localStorage.removeItem('monthlyAPIStats');
            localStorage.removeItem('alertHistory');
            this.alertHistory = [];
            this.lastAlertTime = {};
            console.log('🗑️ 使用量統計をリセットしました');
        };

        // 保存されている管理者メールを読み込み
        const savedEmail = localStorage.getItem('adminEmail');
        if (savedEmail) {
            this.ADMIN_EMAIL = savedEmail;
        }
    }

    // CSS アニメーションの追加
    addAnimations() {
        if (!document.getElementById('quota-alert-animations')) {
            const style = document.createElement('style');
            style.id = 'quota-alert-animations';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-30px) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                
                @keyframes slideInRight {
                    from {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                
                @keyframes slideOutRight {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 使用量サマリーの表示
    displayUsageSummary() {
        const usage = this.getCurrentUsage();
        
        console.group('📊 API使用量サマリー');
        console.log(`📅 日次使用量: ${usage.daily}/${this.DAILY_LIMIT} (${usage.dailyPercentage}%)`);
        console.log(`📆 月次使用量: ${usage.monthly}/${this.MONTHLY_LIMIT} (${usage.monthlyPercentage}%)`);
        console.log(`🚨 アラート履歴: ${this.alertHistory.length}件`);
        console.groupEnd();
        
        return usage;
    }
}

// グローバルに公開
window.QuotaAlertSystem = QuotaAlertSystem;

// 自動初期化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.quotaAlertSystem = new QuotaAlertSystem();
        window.quotaAlertSystem.addAnimations();
        
        console.log('🚨 API使用量監視・アラートシステムが初期化されました');
        
        // デバッグ用グローバル関数
        window.showQuotaUsage = () => window.quotaAlertSystem.displayUsageSummary();
        window.getQuotaUsage = () => window.quotaAlertSystem.getCurrentUsage();
        
        // テスト用: 手動で警告をトリガー
        window.testAlert = (level) => {
            const usage = window.quotaAlertSystem.getCurrentUsage();
            console.log(`🧪 ${level}警告をテスト実行:`, usage);
            
            if (level === 'first') {
                window.quotaAlertSystem.showFirstAlert(usage);
            } else if (level === 'middle') {
                window.quotaAlertSystem.showMiddleAlert(usage);
            } else if (level === 'final') {
                window.quotaAlertSystem.showFinalAlert(usage);
            }
        };
    }, 1500);
});
