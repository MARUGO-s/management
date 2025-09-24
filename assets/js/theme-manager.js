// テーマ管理機能
// 全ページで共通して使用するテーマ切り替え機能

class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'recipe-box-settings';
    this.defaultSettings = {
      theme: 'dark' // デフォルトはダークテーマ
    };
    
    this.currentSettings = this.loadSettings();
    this.initializeTheme();
  }
  
  // 設定の読み込み
  loadSettings() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? { ...this.defaultSettings, ...JSON.parse(stored) } : this.defaultSettings;
    } catch (error) {
      console.error('テーマ設定の読み込みエラー:', error);
      return this.defaultSettings;
    }
  }
  
  // 設定の保存
  saveSettings(settings) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
      console.log('テーマ設定を保存:', settings);
    } catch (error) {
      console.error('テーマ設定の保存エラー:', error);
    }
  }
  
  // 初期テーマの適用
  initializeTheme() {
    // DOMが読み込まれるまで待機
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.applyTheme();
        this.watchSystemTheme();
      });
    } else {
      this.applyTheme();
      this.watchSystemTheme();
    }
  }
  
  // テーマの適用
  applyTheme(theme = null) {
    const targetTheme = theme || this.currentSettings.theme;
    
    // 既存のテーマクラスを削除
    document.body.classList.remove('light-theme', 'dark-theme');
    
    if (targetTheme === 'auto') {
      // システム設定に従う
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.add('dark-theme');
      }
    } else if (targetTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      // デフォルトはダークテーマ
      document.body.classList.add('dark-theme');
    }
    
    console.log('テーマを適用:', targetTheme);
  }
  
  // システム設定の変更を監視
  watchSystemTheme() {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      mediaQuery.addEventListener('change', () => {
        if (this.currentSettings.theme === 'auto') {
          this.applyTheme();
        }
      });
    }
  }
  
  // テーマの変更
  setTheme(theme) {
    this.currentSettings.theme = theme;
    this.saveSettings(this.currentSettings);
    this.applyTheme(theme);
  }
  
  // 現在のテーマを取得
  getCurrentTheme() {
    return this.currentSettings.theme;
  }
  
  // システム設定に従うかどうかを確認
  isSystemTheme() {
    return this.currentSettings.theme === 'auto';
  }
}

// グローバルテーママネージャーの初期化
window.themeManager = new ThemeManager();

// グローバル関数として公開
function applyTheme(theme) {
  window.themeManager.setTheme(theme);
}

function getCurrentTheme() {
  return window.themeManager.getCurrentTheme();
}

// 設定変更イベントの監視
window.addEventListener('settingsChanged', (event) => {
  if (event.detail && event.detail.theme !== undefined) {
    window.themeManager.setTheme(event.detail.theme);
  }
});

// エクスポート（必要に応じて）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ThemeManager,
    applyTheme,
    getCurrentTheme
  };
}
