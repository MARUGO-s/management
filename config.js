// アプリケーション設定
window.APP_CONFIG = {
  // Gemini API設定
  GEMINI_API_KEY: '', // ここに実際のAPIキーを設定してください
  
  // Supabase設定
  SUPABASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q',
  
  // アプリケーション設定
  APP_NAME: 'Recipe Box',
  APP_VERSION: '1.0.0',
  
  // 機能フラグ
  FEATURES: {
    URL_IMPORT: true,
    GEMINI_EXTRACTION: true,
    AI_SUGGESTIONS: true
  }
};

// 設定の取得関数
function getConfig(key) {
  return window.APP_CONFIG[key];
}

// Gemini APIキーの設定
function setGeminiApiKey(apiKey) {
  window.APP_CONFIG.GEMINI_API_KEY = apiKey;
  localStorage.setItem('gemini_api_key', apiKey);
}

// 保存されたAPIキーの復元
function loadSavedApiKey() {
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    window.APP_CONFIG.GEMINI_API_KEY = savedKey;
  }
}

// 初期化時に保存されたAPIキーを読み込み
document.addEventListener('DOMContentLoaded', () => {
  loadSavedApiKey();
});
