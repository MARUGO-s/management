// Supabase設定
// 本番環境では環境変数から取得することを推奨
const SUPABASE_CONFIG = {
  url: 'https://mzismgyctulktrihcwfg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXNtZ3ljdHVsa3RyaWhjd2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTI0MTEsImV4cCI6MjA3MzY4ODQxMX0.ZgXkgPnz408eN1uMVG5dmOxpcV1zQgBfh7Qgekh0nAg',

  // スプレッドシートID
  spreadsheetId: '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY'
}

// Google Sheets API呼び出し関数（セキュア版 + 使用量監視）
async function callSheetsAPI(range, method = 'GET', values = null) {
  // 呼び出し元を特定するためのスタックトレース
  const stack = new Error().stack;
  const caller = stack.split('\n')[2]?.trim() || 'unknown';
  
  // 本番用: 詳細ログは管理者モードでのみ表示
  if (window._debugMode) {
    console.log(`🔍 API呼び出し: ${method} ${range}`);
  }
  
  try {
    // API使用量を記録（呼び出し前）
    recordAPIUsage(range, method, caller);
    
    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/sheets-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      },
      body: JSON.stringify({
        spreadsheetId: SUPABASE_CONFIG.spreadsheetId,
        range,
        method,
        values
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error: ${response.status} - ${errorText}`)
    }

    const result = await response.json();
    
    console.log(`✅ API呼び出し成功: ${method} ${range} | データ行数: ${result.values?.length || 0}`);
    
    return result;
  } catch (error) {
    console.error(`❌ API呼び出しエラー: ${method} ${range} |`, error)
    throw error
  }
}

// API使用量記録関数
function recordAPIUsage(range, method, caller = 'unknown') {
  try {
    // 呼び出し履歴を詳細に記録
    if (!window._apiCallHistory) {
      window._apiCallHistory = [];
    }
    
    const callInfo = {
      timestamp: new Date().toISOString(),
      method,
      range,
      caller: caller.substring(0, 100), // 長すぎる場合は切り詰め
      counted: false
    };
    
    // ★ すべてのAPI呼び出しがクォータを消費するため、すべてカウント対象とする
    console.log(`🌐 API呼び出し: ${method} ${range}`);
    
    // 重複記録を防ぐため、短時間での同一呼び出しをチェック
    const callKey = `${method}_${range}`;
    const now = Date.now();
    
    if (!window._apiCallTracker) {
      window._apiCallTracker = new Map();
    }
    
    const lastCall = window._apiCallTracker.get(callKey);
    if (lastCall && (now - lastCall) < 2000) { // 2秒以内の重複呼び出しをスキップ
      if (window._debugMode) {
        console.log(`⚠️ 重複スキップ: ${method} ${range}`);
      }
      callInfo.counted = false;
      callInfo.skipped = true;
      window._apiCallHistory.push(callInfo);
      return;
    }
    
    window._apiCallTracker.set(callKey, now);
    callInfo.counted = true;
    
    const today = new Date().toDateString();
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    // 日次統計
    let dailyStats = JSON.parse(localStorage.getItem('dailyAPIStats') || '{}');
    if (!dailyStats[today]) {
      dailyStats[today] = 0;
    }
    dailyStats[today]++;
    localStorage.setItem('dailyAPIStats', JSON.stringify(dailyStats));
    
    // 月次統計
    let monthlyStats = JSON.parse(localStorage.getItem('monthlyAPIStats') || '{}');
    if (!monthlyStats[currentMonth]) {
      monthlyStats[currentMonth] = 0;
    }
    monthlyStats[currentMonth]++;
    localStorage.setItem('monthlyAPIStats', JSON.stringify(monthlyStats));
    
    // 全体統計
    let totalStats = JSON.parse(localStorage.getItem('totalAPIStats') || '{"total": 0}');
    totalStats.total++;
    localStorage.setItem('totalAPIStats', JSON.stringify(totalStats));
    
    console.log(`📊 API使用量記録: ${method} ${range} | 本日${dailyStats[today]}回, 今月${monthlyStats[currentMonth]}回, 総計${totalStats.total}回`);
    
    // 履歴に追加（最新100件のみ保持）
    window._apiCallHistory.push(callInfo);
    if (window._apiCallHistory.length > 100) {
      window._apiCallHistory = window._apiCallHistory.slice(-100);
    }
    
    // アラートシステムに通知（存在する場合）
    if (window.quotaAlertSystem) {
      window.quotaAlertSystem.checkQuotaLimits();
    }
  } catch (error) {
    console.warn('API使用量記録エラー:', error);
  }
}

// 注意: Supabaseクライアントライブラリは現在使用していません
// API呼び出しはSupabase Functions経由で行われます

// 管理者用: API呼び出し履歴表示
window.showAPICallHistory = function() {
  const dailyStats = JSON.parse(localStorage.getItem('dailyAPIStats') || '{}');
  const monthlyStats = JSON.parse(localStorage.getItem('monthlyAPIStats') || '{}');
  const totalStats = JSON.parse(localStorage.getItem('totalAPIStats') || '{"total": 0}');
  
  console.group('📊 API使用量履歴');
  console.log('日次統計:', dailyStats);
  console.log('月次統計:', monthlyStats);
  console.log('総計統計:', totalStats);
  
  if (window._apiCallHistory && window._apiCallHistory.length > 0) {
    console.log('\n📋 詳細な呼び出し履歴 (最新20件):');
    const recent = window._apiCallHistory.slice(-20);
    recent.forEach((call, index) => {
      const time = new Date(call.timestamp).toLocaleTimeString();
      const type = call.dataSubmission ? '📤 データ送信' : (call.readOnly ? '📖 読み取り' : '📝 書き込み');
      const status = call.counted ? '✅ カウント済み' : (call.skipped ? '⚠️ スキップ' : '❌ 未カウント');
      console.log(`${index + 1}. [${time}] ${type} ${call.method} ${call.range} | ${status}`);
      console.log(`   呼び出し元: ${call.caller}`);
    });
  }
  
  if (window._apiCallTracker) {
    console.log('\n🕒 最近の呼び出し時間:', Array.from(window._apiCallTracker.entries()).map(([key, time]) => [key, new Date(time).toLocaleTimeString()]));
  }
  console.groupEnd();
};

// 管理者用: API使用量リセット
window.resetAPIStats = function() {
  localStorage.removeItem('dailyAPIStats');
  localStorage.removeItem('monthlyAPIStats');
  localStorage.removeItem('totalAPIStats');
  if (window._apiCallTracker) {
    window._apiCallTracker.clear();
  }
  if (window._apiCallHistory) {
    window._apiCallHistory = [];
  }
  console.log('✅ API使用量統計と履歴をリセットしました');
};

// 管理者用: API呼び出しパターン分析
window.analyzeAPIUsagePatterns = function() {
  console.group('🔍 API使用パターン分析');
  
  if (window._apiCallHistory && window._apiCallHistory.length > 0) {
    const calls = window._apiCallHistory;
    
    // シート別の集計
    const sheetStats = {};
    const methodStats = {};
    const callerStats = {};
    
    calls.forEach(call => {
      // シート別
      const sheet = call.range.split('!')[0] || 'unknown';
      sheetStats[sheet] = (sheetStats[sheet] || 0) + (call.counted ? 1 : 0);
      
      // メソッド別
      methodStats[call.method] = (methodStats[call.method] || 0) + (call.counted ? 1 : 0);
      
      // 呼び出し元別
      const caller = call.caller.split(' ')[0] || 'unknown';
      callerStats[caller] = (callerStats[caller] || 0) + (call.counted ? 1 : 0);
    });
    
    console.log('📊 シート別API使用量:', sheetStats);
    console.log('📊 メソッド別API使用量:', methodStats);
    console.log('📊 呼び出し元別API使用量:', callerStats);
    
    // 最適化の提案
    const suggestions = [];
    
    if (sheetStats['貸借表'] > 1) {
      suggestions.push('⚠️ 貸借表への複数回アクセスが検出されました。統合データローダーの使用を確認してください。');
    }
    
    if (methodStats['GET'] > 3) {
      suggestions.push('⚠️ 多数のGET呼び出しが検出されました。キャッシュの活用を検討してください。');
    }
    
    if (suggestions.length > 0) {
      console.log('\n💡 最適化提案:');
      suggestions.forEach(suggestion => console.log(suggestion));
    } else {
      console.log('\n✅ API使用パターンは最適化されています');
    }
  }
  
  console.groupEnd();
};

// データ送信専用のカウント関数
window.recordDataSubmission = function(operation, method, description) {
  try {
    const today = new Date().toDateString();
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // 日次統計
    let dailyStats = JSON.parse(localStorage.getItem('dailyAPIStats') || '{}');
    if (!dailyStats[today]) {
      dailyStats[today] = 0;
    }
    dailyStats[today]++;
    localStorage.setItem('dailyAPIStats', JSON.stringify(dailyStats));
    
    // 月次統計
    let monthlyStats = JSON.parse(localStorage.getItem('monthlyAPIStats') || '{}');
    if (!monthlyStats[currentMonth]) {
      monthlyStats[currentMonth] = 0;
    }
    monthlyStats[currentMonth]++;
    localStorage.setItem('monthlyAPIStats', JSON.stringify(monthlyStats));
    
    // 全体統計
    let totalStats = JSON.parse(localStorage.getItem('totalAPIStats') || '{"total": 0}');
    totalStats.total++;
    localStorage.setItem('totalAPIStats', JSON.stringify(totalStats));
    
    console.log(`📊 データ送信記録: ${operation} | 本日${dailyStats[today]}回, 今月${monthlyStats[currentMonth]}回, 総計${totalStats.total}回`);
    
    // 履歴に追加
    if (!window._apiCallHistory) {
      window._apiCallHistory = [];
    }
    
    window._apiCallHistory.push({
      timestamp: new Date().toISOString(),
      method: method,
      range: operation,
      caller: description,
      counted: true,
      dataSubmission: true
    });
    
    if (window._apiCallHistory.length > 100) {
      window._apiCallHistory = window._apiCallHistory.slice(-100);
    }
    
    // アラートシステムに通知（存在する場合）
    if (window.quotaAlertSystem) {
      window.quotaAlertSystem.checkQuotaLimits();
    }
  } catch (error) {
    console.warn('データ送信記録エラー:', error);
  }
};

// 設定を global に公開
window.SUPABASE_CONFIG = SUPABASE_CONFIG
window.callSheetsAPI = callSheetsAPI