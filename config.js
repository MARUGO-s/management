// Supabase設定
// 本番環境では環境変数から取得することを推奨
const SUPABASE_CONFIG = {
  url: 'https://mzismgyctulktrihcwfg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXNtZ3ljdHVsa3RyaWhjd2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTI0MTEsImV4cCI6MjA3MzY4ODQxMX0.ZgXkgPnz408eN1uMVG5dmOxpcV1zQgBfh7Qgekh0nAg',

  // スプレッドシートID
  spreadsheetId: '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY'
}

// Google Sheets API呼び出し関数（セキュア版 + 使用量監視 + 遮断機能）
async function callSheetsAPI(range, method = 'GET', values = null) {
  // 呼び出し元を特定するためのスタックトレース
  const stack = new Error().stack;
  const caller = stack.split('\n')[2]?.trim() || 'unknown';
  
  // 本番用: 詳細ログは管理者モードでのみ表示
  if (window._debugMode) {
    console.log(`🔍 API呼び出し: ${method} ${range}`);
  }
  
  try {
    // API使用量制限チェック（2,500回超過で遮断）
    const isBlocked = await checkAPILimit();
    if (isBlocked) {
      throw new Error('API_LIMIT_EXCEEDED');
    }

    // API使用量を記録（呼び出し前）
    await recordAPIUsage(range, method, caller);
    
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
    if (error.message === 'API_LIMIT_EXCEEDED') {
      console.error('🚫 API使用量制限に達しました');
      // 制限超過エラーを再スロー（動的上限値付きメッセージ）
      const apiLimit = getAPILimit();
      const limitError = new Error(`API使用量が制限値（${apiLimit.toLocaleString()}回）を超過しました。管理者にご連絡ください。`);
      limitError.code = 'API_LIMIT_EXCEEDED';
      throw limitError;
    }
    
    console.error(`❌ API呼び出しエラー: ${method} ${range} |`, error)
    throw error
  }
}

// API使用量制限チェック関数（管理画面設定の上限値で遮断）
async function checkAPILimit() {
  try {
    // 管理画面で設定された上限値を取得
    const apiLimit = getAPILimit();
    
    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/api-usage-tracker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      },
      body: JSON.stringify({
        action: 'get'
      })
    });

    if (response.ok) {
      const stats = await response.json();
      const monthlyUsage = stats.monthly.total;
      
      // 設定された上限値を超えていたら遮断
      if (monthlyUsage >= apiLimit) {
        console.warn(`🚫 API使用量制限に達しました: ${monthlyUsage}回/${apiLimit}回`);
        
        // 使用量インジケーターを更新
        updateIndicatorForBlocked(apiLimit);
        
        return true; // 遮断
      }
      
      return false; // 通常動作
    } else {
      console.warn('⚠️ API使用量チェック失敗、通常動作を継続');
      return false;
    }
  } catch (error) {
    console.warn('⚠️ API使用量チェックエラー、通常動作を継続:', error);
    return false;
  }
}

// 管理画面設定のAPI上限値を取得
function getAPILimit() {
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

// 遮断時の使用量インジケーター更新
function updateIndicatorForBlocked(apiLimit = null) {
  const limit = apiLimit || getAPILimit();
  const indicator = document.getElementById('usage-indicator');
  const usageText = document.getElementById('usage-text');
  
  if (indicator) {
    indicator.style.background = 'rgba(108, 117, 125, 0.9)'; // グレー
    indicator.style.border = '2px solid #dc3545'; // 赤い枠
  }
  
  if (usageText) {
    usageText.textContent = '🚫 制限中';
    usageText.title = `API使用量が制限値（${limit.toLocaleString()}回）を超過しました。管理者にご連絡ください。`;
  }
}

// API使用量記録関数（Supabaseベース）
async function recordAPIUsage(range, method, caller = 'unknown') {
  try {
    // 呼び出し履歴を詳細に記録（ローカル用）
    if (!window._apiCallHistory) {
      window._apiCallHistory = [];
    }
    
    const callInfo = {
      timestamp: new Date().toISOString(),
      method,
      range,
      caller: caller.substring(0, 100),
      counted: false
    };
    
    console.log(`🌐 API呼び出し: ${method} ${range}`);
    
    // 重複記録を防ぐため、短時間での同一呼び出しをチェック
    const callKey = `${method}_${range}`;
    const now = Date.now();
    
    if (!window._apiCallTracker) {
      window._apiCallTracker = new Map();
    }
    
    const lastCall = window._apiCallTracker.get(callKey);
    if (lastCall && (now - lastCall) < 2000) {
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
    
    // 🌐 Supabaseに使用量記録
    const deviceId = getOrCreateDeviceId();
    const deviceInfo = {
      userAgent: navigator.userAgent.substring(0, 100),
      timestamp: new Date().toISOString(),
      range: range,
      method: method
    };
    
    try {
      const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/api-usage-tracker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
        },
        body: JSON.stringify({
          action: 'record',
          deviceId: deviceId,
          deviceInfo: deviceInfo,
          usageType: 'api_call'
        })
      });

      if (response.ok) {
        const result = await response.json();
      } else {
        const errorText = await response.text();
        throw new Error(`Supabase記録エラー: ${response.status} - ${errorText}`);
      }
    } catch (supabaseError) {
      console.warn('⚠️ Supabase記録失敗、ローカルにフォールバック:', supabaseError.message);
      
      // フォールバック: ローカルストレージに記録
      const today = new Date().toDateString();
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      let dailyStats = JSON.parse(localStorage.getItem('dailyAPIStats') || '{}');
      if (!dailyStats[today]) dailyStats[today] = 0;
      dailyStats[today]++;
      localStorage.setItem('dailyAPIStats', JSON.stringify(dailyStats));
      
      let monthlyStats = JSON.parse(localStorage.getItem('monthlyAPIStats') || '{}');
      if (!monthlyStats[currentMonth]) monthlyStats[currentMonth] = 0;
      monthlyStats[currentMonth]++;
      localStorage.setItem('monthlyAPIStats', JSON.stringify(monthlyStats));
      
      let totalStats = JSON.parse(localStorage.getItem('totalAPIStats') || '{"total": 0}');
      totalStats.total++;
      localStorage.setItem('totalAPIStats', JSON.stringify(totalStats));
      
    }
    
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

// デバイスID生成・取得関数
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    // ユニークなデバイスIDを生成
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceId', deviceId);
    console.log('🆔 新しいデバイスIDを生成:', deviceId);
  }
  return deviceId;
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

// API制限エラーの共通表示関数
window.showAPILimitError = function() {
  // カスタムエラーモーダルを表示
  const errorModal = createAPILimitModal();
  document.body.appendChild(errorModal);
  errorModal.style.display = 'flex';
  
  // 5秒後に自動で閉じる
  setTimeout(() => {
    errorModal.remove();
  }, 10000);
};

// API制限エラー用モーダルを作成
function createAPILimitModal() {
  const apiLimit = getAPILimit();
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;
  
  modal.innerHTML = `
    <div style="
      background: white;
      padding: 40px;
      border-radius: 15px;
      max-width: 500px;
      width: 90%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    ">
      <div style="
        font-size: 60px;
        margin-bottom: 20px;
      ">🚫</div>
      
      <h2 style="
        color: #dc3545;
        margin: 0 0 20px 0;
        font-size: 24px;
      ">API使用量制限に達しました</h2>
      
      <p style="
        color: #6c757d;
        line-height: 1.6;
        margin: 0 0 20px 0;
        font-size: 16px;
      ">
        月間API使用量が制限値（${apiLimit.toLocaleString()}回）を超過したため、<br>
        一時的にAPIアクセスを制限しています。
      </p>
      
      <div style="
        background: #f8f9fa;
        padding: 20px;
        border-radius: 10px;
        margin: 20px 0;
        border-left: 4px solid #dc3545;
      ">
        <h3 style="
          color: #495057;
          margin: 0 0 10px 0;
          font-size: 18px;
        ">📞 管理者にご連絡ください</h3>
        
        <p style="
          color: #6c757d;
          margin: 0;
          font-size: 14px;
        ">
          システム管理者に連絡して、<br>
          API使用量の調整をご依頼ください。
        </p>
      </div>
      
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #6c757d;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 25px;
        font-size: 16px;
        cursor: pointer;
        margin-top: 10px;
      ">閉じる</button>
    </div>
  `;
  
  // クリックで閉じる
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  return modal;
}

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

// データ送信専用のカウント関数（Supabaseベース）
window.recordDataSubmission = async function(operation, method, description) {
  try {
    console.log(`📤 データ送信記録: ${operation}`);
    
    // 🌐 Supabaseに使用量記録
    const deviceId = getOrCreateDeviceId();
    const deviceInfo = {
      userAgent: navigator.userAgent.substring(0, 100),
      timestamp: new Date().toISOString(),
      operation: operation,
      method: method,
      description: description
    };
    
    try {
      const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/api-usage-tracker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
        },
        body: JSON.stringify({
          action: 'record',
          deviceId: deviceId,
          deviceInfo: deviceInfo,
          usageType: 'data_submission'
        })
      });

      if (response.ok) {
        const result = await response.json();
      } else {
        const errorText = await response.text();
        throw new Error(`Supabase記録エラー: ${response.status} - ${errorText}`);
      }
    } catch (supabaseError) {
      console.warn('⚠️ Supabase記録失敗、ローカルにフォールバック:', supabaseError.message);
      
      // フォールバック: ローカルストレージに記録
      const today = new Date().toDateString();
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      let dailyStats = JSON.parse(localStorage.getItem('dailyAPIStats') || '{}');
      if (!dailyStats[today]) dailyStats[today] = 0;
      dailyStats[today]++;
      localStorage.setItem('dailyAPIStats', JSON.stringify(dailyStats));
      
      let monthlyStats = JSON.parse(localStorage.getItem('monthlyAPIStats') || '{}');
      if (!monthlyStats[currentMonth]) monthlyStats[currentMonth] = 0;
      monthlyStats[currentMonth]++;
      localStorage.setItem('monthlyAPIStats', JSON.stringify(monthlyStats));
      
      let totalStats = JSON.parse(localStorage.getItem('totalAPIStats') || '{"total": 0}');
      totalStats.total++;
      localStorage.setItem('totalAPIStats', JSON.stringify(totalStats));
      
    }
    
    // 履歴に追加（ローカル用）
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

// 管理者用: 累計API使用量表示（Supabaseベース）
window.showCumulativeAPIUsage = async function() {
  console.group('🌐 累計API使用量 (Supabase統一管理)');
  
  try {
    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/api-usage-tracker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      },
      body: JSON.stringify({
        action: 'get'
      })
    });

    if (response.ok) {
      const usageData = await response.json();
      
      console.log('📊 本日の使用量:', usageData.daily.total, '回 (API:', usageData.daily.api_calls, '回, データ送信:', usageData.daily.data_submissions, '回)');
      console.log('📆 今月の使用量:', usageData.monthly.total, '回 (API:', usageData.monthly.api_calls, '回, データ送信:', usageData.monthly.data_submissions, '回)');
      console.log('📊 総累計:', usageData.total.total, '回 (API:', usageData.total.api_calls, '回, データ送信:', usageData.total.data_submissions, '回)');
      console.log('📱 登録デバイス数:', usageData.devices.count, '台');
      
      if (usageData.devices.details && usageData.devices.details.length > 0) {
        console.log('\n📱 デバイス別詳細:');
        usageData.devices.details.forEach((device, index) => {
          console.log(`  ${index + 1}. ${device.device_id.substring(0, 12)}...: API${device.total_api_calls}回, データ送信${device.total_data_submissions}回 (最終: ${new Date(device.last_access).toLocaleString('ja-JP')})`);
        });
      }
      
      console.log('🕒 取得時刻:', new Date(usageData.timestamp).toLocaleString('ja-JP'));
      console.groupEnd();
      
      return usageData;
    } else {
      throw new Error(`Supabase取得エラー: ${response.status}`);
    }
  } catch (error) {
    console.warn('⚠️ Supabase取得失敗、ローカルデータにフォールバック:', error.message);
    
    // フォールバック: ローカルデータ表示
    const cumulativeStats = JSON.parse(localStorage.getItem('globalAPICumulative') || '{"total": 0, "daily": {}, "monthly": {}, "devices": {}}');
    
    console.log('📊 ローカル総累計:', cumulativeStats.total, '回');
    console.log('📅 ローカル日次累計:', cumulativeStats.daily);
    console.log('📆 ローカル月次累計:', cumulativeStats.monthly);
    console.log('📱 ローカルデバイス別:', Object.keys(cumulativeStats.devices).length, 'デバイス');
    
    console.groupEnd();
    return cumulativeStats;
  }
};

// 管理者用: 累計統計リセット
window.resetCumulativeStats = function() {
  localStorage.removeItem('globalAPICumulative');
  console.log('✅ 累計API使用量統計をリセットしました');
};

// 設定を global に公開
window.SUPABASE_CONFIG = SUPABASE_CONFIG
window.callSheetsAPI = callSheetsAPI