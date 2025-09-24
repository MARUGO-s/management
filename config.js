// アプリケーション設定
window.APP_CONFIG = {
  // Supabase設定
  SUPABASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q',
  
  // アプリケーション設定
  APP_NAME: 'Recipe Box',
  APP_VERSION: '1.0.0',
  
  // 機能フラグ
  FEATURES: {
    URL_IMPORT: true,
    GROQ_EXTRACTION: true,
    AI_SUGGESTIONS: true,
    VISION_OCR: true
  }
};

// 設定の取得関数
function getConfig(key) {
  return window.APP_CONFIG[key];
}

// Supabaseクライアントの初期化
if (typeof window.supabaseClient === 'undefined') {
  window.supabaseClient = null;
}

function getSupabaseClient() {
  if (!window.supabaseClient && typeof supabase !== 'undefined') {
    window.supabaseClient = supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );
  }
  return window.supabaseClient;
}
