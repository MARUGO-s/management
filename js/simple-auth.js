// 🔐 シンプルパスワード認証システム
class SimpleAuth {
    constructor() {
        this.SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8時間
        this.STORAGE_KEY = 'simpleAuth';
        this.PASSWORD_KEY = 'systemPassword';
        
        // 非同期初期化
        this.init().catch(error => {
            console.error('認証システム初期化エラー:', error);
        });
    }

    async init() {
        // 既存の認証状態をチェック
        if (this.isAuthenticated()) {
            this.hideAuthScreen();
        } else {
            await this.showAuthScreen();
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        // パスワードフォームのイベントリスナー
        const passwordForm = document.getElementById('password-form');
        if (passwordForm) {
            passwordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handlePasswordSubmit();
            });
        }

        // Enterキーでログイン
        const passwordInput = document.getElementById('password-input');
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handlePasswordSubmit();
                }
            });
        }

        // パスワード設定フォーム
        const setupForm = document.getElementById('setup-form');
        if (setupForm) {
            setupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handlePasswordSetup();
            });
        }

        // ログアウトボタン
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
    }

    // パスワードが設定されているかチェック（データベースベース）
    async isPasswordSet() {
        try {
            const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/password-manager`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
                },
                body: JSON.stringify({
                    action: 'get',
                    passwordType: 'system'
                })
            });
            
            const result = await response.json();
            return result.success && result.passwords?.system?.status === '設定済み';
        } catch (error) {
            console.error('❌ パスワード設定確認エラー:', error);
            return true; // エラー時はデフォルトで設定済みとして扱う
        }
    }

    // パスワード設定（Supabaseベース）
    async setSystemPassword(password) {
        try {
            const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/password-manager`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
                },
                body: JSON.stringify({
                    action: 'change',
                    passwordType: 'system',
                    newPassword: password
                })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log('✅ システムパスワードが設定されました（Supabase）');
                return true;
            } else {
                console.error('❌ パスワード設定失敗:', result.error);
                return false;
            }
        } catch (error) {
            console.error('❌ パスワード設定エラー:', error);
            return false;
        }
    }

    // パスワード検証（Supabaseベース）
    async verifyPassword(inputPassword) {
        try {
            const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/password-manager`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
                },
                body: JSON.stringify({
                    action: 'verify',
                    passwordType: 'system',
                    currentPassword: inputPassword
                })
            });
            
            const result = await response.json();
            if (!(result.success && result.isValid && result.token)) return false;
            // シートの読み取り・登録に使うトークンを保存する。
            if (!window.LoanSession) return false; // 古い config.js がキャッシュされている
            window.LoanSession.set(result.token, result.expiresAt);
            return true;
        } catch (error) {
            console.error('❌ パスワード検証エラー:', error);
            return false;
        }
    }

    // 認証状態チェック
    isAuthenticated() {
        // トークンがなければ（期限切れ・旧ログイン）ログインし直してもらう。
        if (!window.LoanSession?.get()) return false;
        const authData = sessionStorage.getItem(this.STORAGE_KEY);
        if (!authData) return false;

        try {
            const auth = JSON.parse(authData);
            const now = new Date().getTime();
            const authTime = new Date(auth.timestamp).getTime();
            const hoursElapsed = (now - authTime) / (1000 * 60 * 60);

            return auth.authenticated && hoursElapsed < 8; // 8時間有効
        } catch (error) {
            console.error('認証データの解析エラー:', error);
            return false;
        }
    }

    // 認証状態を保存
    setAuthenticated() {
        const authData = {
            authenticated: true,
            timestamp: new Date().toISOString()
        };
        sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(authData));
    }

    // パスワード送信処理
    async handlePasswordSubmit() {
        const passwordInput = document.getElementById('password-input');
        const passwordBtn = document.getElementById('password-btn');
        const passwordError = document.getElementById('password-error');
        const enteredPassword = passwordInput.value;

        if (!enteredPassword) {
            this.showError('パスワードを入力してください');
            return;
        }

        // ボタンを無効化
        passwordBtn.disabled = true;
        passwordBtn.textContent = '🔄 認証中...';

        // Supabaseでパスワード検証
        try {
            const isValid = await this.verifyPassword(enteredPassword);
            
            if (isValid) {
                // 認証成功
                this.setAuthenticated();
                passwordError.style.display = 'none';
                console.log('✅ 認証成功（Supabase）');
                // ログイン前に失敗したデータ読み込みをやり直すため、再読み込みする。
                location.reload();
                return;
            } else {
                // 認証失敗
                this.showError('パスワードが正しくありません');
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            console.error('認証エラー:', error);
            this.showError('認証処理でエラーが発生しました');
        }

        // ボタンを元に戻す
        passwordBtn.disabled = false;
        passwordBtn.textContent = '🚪 ログイン';
    }

    // パスワード設定処理
    async handlePasswordSetup() {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const setupBtn = document.getElementById('setup-btn');
        const setupError = document.getElementById('setup-error');

        if (!newPassword || !confirmPassword) {
            this.showSetupError('すべてのフィールドを入力してください');
            return;
        }

        if (newPassword.length < 6) {
            this.showSetupError('パスワードは6文字以上で入力してください');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showSetupError('パスワードが一致しません');
            return;
        }

        setupBtn.disabled = true;
        setupBtn.textContent = '🔄 設定中...';

        try {
            const success = await this.setSystemPassword(newPassword);
            
            if (success) {
                this.showSetupSuccess('パスワードが設定されました。ログインしてください。');
                
                // 設定画面を隠してログイン画面を表示
                document.getElementById('setup-section').style.display = 'none';
                document.getElementById('login-section').style.display = 'block';
                
                // フォームをクリア
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
                
                // パスワード入力欄にフォーカス
                setTimeout(() => {
                    const passwordInput = document.getElementById('password-input');
                    if (passwordInput) passwordInput.focus();
                }, 100);
            } else {
                this.showSetupError('パスワード設定に失敗しました');
            }

        } catch (error) {
            this.showSetupError('パスワード設定に失敗しました');
            console.error('Password setup error:', error);
        }

        setupBtn.disabled = false;
        setupBtn.textContent = '🔐 パスワード設定';
    }

    // 認証画面表示（データベースベース）
    async showAuthScreen() {
        const authScreen = document.getElementById('password-screen');
        if (authScreen) {
            authScreen.style.display = 'block';
            
            // パスワードが設定されているかチェック（非同期）
            const isSet = await this.isPasswordSet();
            if (isSet) {
                // 既にパスワードが設定されている場合はログイン画面
                const setupSection = document.getElementById('setup-section');
                const loginSection = document.getElementById('login-section');
                
                if (setupSection) setupSection.style.display = 'none';
                if (loginSection) loginSection.style.display = 'block';
                
                setTimeout(() => {
                    const passwordInput = document.getElementById('password-input');
                    if (passwordInput) passwordInput.focus();
                }, 100);
            } else {
                // パスワードが未設定の場合は設定画面
                const loginSection = document.getElementById('login-section');
                const setupSection = document.getElementById('setup-section');
                
                if (loginSection) loginSection.style.display = 'none';
                if (setupSection) setupSection.style.display = 'block';
                
                setTimeout(() => {
                    const newPasswordInput = document.getElementById('new-password');
                    if (newPasswordInput) newPasswordInput.focus();
                }, 100);
            }
        }

        // メインアプリを隠す
        const mainApp = document.getElementById('main-app');
        if (mainApp) mainApp.style.display = 'none';
    }

    // 認証画面を隠す
    hideAuthScreen() {
        const authScreen = document.getElementById('password-screen');
        if (authScreen) {
            authScreen.style.display = 'none';
        }

        // メインアプリを表示
        const mainApp = document.getElementById('main-app');
        if (mainApp) {
            mainApp.style.display = 'block';
        }

        // 自動ログイン処理を開始
        if (typeof GoogleSheetsAPIAnalyzer !== 'undefined') {
            new GoogleSheetsAPIAnalyzer();
        }
    }

    // エラーメッセージ表示
    showError(message) {
        const passwordError = document.getElementById('password-error');
        if (passwordError) {
            passwordError.textContent = message;
            passwordError.style.display = 'block';
            passwordError.style.animation = 'shake 0.5s';
            
            setTimeout(() => {
                passwordError.style.animation = '';
            }, 500);
        }
    }

    // 設定エラーメッセージ表示
    showSetupError(message) {
        const setupError = document.getElementById('setup-error');
        if (setupError) {
            setupError.textContent = message;
            setupError.style.display = 'block';
            setupError.className = 'setup-message error';
        }
    }

    // 設定成功メッセージ表示
    showSetupSuccess(message) {
        const setupError = document.getElementById('setup-error');
        if (setupError) {
            setupError.textContent = message;
            setupError.style.display = 'block';
            setupError.className = 'setup-message success';
        }
    }

    // ログアウト
    logout() {
        sessionStorage.removeItem(this.STORAGE_KEY);
        window.LoanSession?.clear();
        console.log('✅ ログアウトしました');
        this.showAuthScreen();
    }

    // パスワードリセット（管理者用）
    resetPassword() {
        if (confirm('システムパスワードをリセットしますか？\n次回アクセス時に新しいパスワードの設定が必要になります。')) {
            localStorage.removeItem(this.PASSWORD_KEY);
            sessionStorage.removeItem(this.STORAGE_KEY);
            console.log('✅ パスワードをリセットしました');
            window.location.reload();
        }
    }

    // 現在の認証状態を取得
    getAuthStatus() {
        return {
            isAuthenticated: this.isAuthenticated(),
            isPasswordSet: this.isPasswordSet(),
            sessionData: sessionStorage.getItem(this.STORAGE_KEY)
        };
    }
}

// グローバルに公開
window.SimpleAuth = SimpleAuth;

// 自動初期化
document.addEventListener('DOMContentLoaded', () => {
    window.simpleAuth = new SimpleAuth();
    console.log('🔐 シンプル認証システムが初期化されました');
});
