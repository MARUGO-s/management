// 🔐 シンプルパスワード認証システム
class SimpleAuth {
    constructor() {
        this.SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8時間
        this.STORAGE_KEY = 'simpleAuth';
        this.PASSWORD_KEY = 'systemPassword';
        
        this.init();
    }

    init() {
        // 既存の認証状態をチェック
        if (this.isAuthenticated()) {
            this.hideAuthScreen();
        } else {
            this.showAuthScreen();
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

    // パスワードが設定されているかチェック
    isPasswordSet() {
        return !!localStorage.getItem(this.PASSWORD_KEY);
    }

    // パスワード設定
    setSystemPassword(password) {
        // 簡単なハッシュ化（本格的な実装では、より強固なハッシュを使用）
        const hashedPassword = btoa(password + 'salt_' + new Date().getFullYear());
        localStorage.setItem(this.PASSWORD_KEY, hashedPassword);
        console.log('✅ システムパスワードが設定されました');
    }

    // パスワード検証
    verifyPassword(inputPassword) {
        const storedHash = localStorage.getItem(this.PASSWORD_KEY);
        if (!storedHash) return false;
        
        const inputHash = btoa(inputPassword + 'salt_' + new Date().getFullYear());
        return inputHash === storedHash;
    }

    // 認証状態チェック
    isAuthenticated() {
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

        // 少し遅延を入れてセキュリティらしく見せる
        setTimeout(() => {
            if (this.verifyPassword(enteredPassword)) {
                // 認証成功
                this.setAuthenticated();
                passwordError.style.display = 'none';
                this.hideAuthScreen();
                console.log('✅ 認証成功');
            } else {
                // 認証失敗
                this.showError('パスワードが正しくありません');
                passwordInput.value = '';
                passwordInput.focus();
            }

            // ボタンを元に戻す
            passwordBtn.disabled = false;
            passwordBtn.textContent = '🚪 ログイン';
        }, 800);
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

        setTimeout(() => {
            try {
                this.setSystemPassword(newPassword);
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

            } catch (error) {
                this.showSetupError('パスワード設定に失敗しました');
                console.error('Password setup error:', error);
            }

            setupBtn.disabled = false;
            setupBtn.textContent = '🔐 パスワード設定';
        }, 500);
    }

    // 認証画面表示
    showAuthScreen() {
        const authScreen = document.getElementById('password-screen');
        if (authScreen) {
            authScreen.style.display = 'block';
            
            // パスワードが設定されているかチェック
            if (this.isPasswordSet()) {
                // 既にパスワードが設定されている場合はログイン画面
                document.getElementById('setup-section').style.display = 'none';
                document.getElementById('login-section').style.display = 'block';
                
                setTimeout(() => {
                    const passwordInput = document.getElementById('password-input');
                    if (passwordInput) passwordInput.focus();
                }, 100);
            } else {
                // パスワードが未設定の場合は設定画面
                document.getElementById('login-section').style.display = 'none';
                document.getElementById('setup-section').style.display = 'block';
                
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
