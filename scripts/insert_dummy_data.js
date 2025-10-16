// 2025年10月1日〜15日までのダミーデータを挿入するスクリプト
// Supabase Edge Functionを使用してデータを挿入

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // 実際のSupabase URLに置き換え
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // 実際のSupabase Anon Keyに置き換え

// ダミーデータの定義
const dummyData = [
    // 10月1日（火） - 軽い使用
    { date: '2025-10-01', api_calls: 12, data_submissions: 3, device_count: 1 },
    // 10月2日（水） - 中程度の使用
    { date: '2025-10-02', api_calls: 28, data_submissions: 7, device_count: 2 },
    // 10月3日（木） - 軽い使用
    { date: '2025-10-03', api_calls: 8, data_submissions: 2, device_count: 1 },
    // 10月4日（金） - 高使用
    { date: '2025-10-04', api_calls: 45, data_submissions: 12, device_count: 3 },
    // 10月5日（土） - 休日軽使用
    { date: '2025-10-05', api_calls: 5, data_submissions: 1, device_count: 1 },
    // 10月6日（日） - 休日軽使用
    { date: '2025-10-06', api_calls: 3, data_submissions: 1, device_count: 1 },
    // 10月7日（月） - 週明け高使用
    { date: '2025-10-07', api_calls: 52, data_submissions: 15, device_count: 4 },
    // 10月8日（火） - 中程度の使用
    { date: '2025-10-08', api_calls: 31, data_submissions: 8, device_count: 2 },
    // 10月9日（水） - 軽い使用
    { date: '2025-10-09', api_calls: 15, data_submissions: 4, device_count: 1 },
    // 10月10日（木） - 中程度の使用
    { date: '2025-10-10', api_calls: 38, data_submissions: 10, device_count: 3 },
    // 10月11日（金） - 高使用
    { date: '2025-10-11', api_calls: 48, data_submissions: 13, device_count: 4 },
    // 10月12日（土） - 休日軽使用
    { date: '2025-10-12', api_calls: 7, data_submissions: 2, device_count: 1 },
    // 10月13日（日） - 休日軽使用
    { date: '2025-10-13', api_calls: 4, data_submissions: 1, device_count: 1 },
    // 10月14日（月） - 週明け最高使用
    { date: '2025-10-14', api_calls: 67, data_submissions: 18, device_count: 5 },
    // 10月15日（火） - 高使用
    { date: '2025-10-15', api_calls: 55, data_submissions: 14, device_count: 4 }
];

// 月次統計を計算
const monthlyStats = dummyData.reduce((acc, day) => ({
    api_calls: acc.api_calls + day.api_calls,
    data_submissions: acc.data_submissions + day.data_submissions,
    device_count: Math.max(acc.device_count, day.device_count)
}), { api_calls: 0, data_submissions: 0, device_count: 0 });

async function insertDummyData() {
    try {
        console.log('🚀 ダミーデータの挿入を開始します...');
        
        // 日別データを挿入
        for (const dayData of dummyData) {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/api-usage-tracker`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    action: 'record',
                    dateKey: dayData.date,
                    apiCalls: dayData.api_calls,
                    dataSubmissions: dayData.data_submissions,
                    deviceCount: dayData.device_count
                })
            });
            
            if (response.ok) {
                console.log(`✅ ${dayData.date}: API呼び出し ${dayData.api_calls}回, データ送信 ${dayData.data_submissions}回`);
            } else {
                console.error(`❌ ${dayData.date}: 挿入に失敗`, await response.text());
            }
        }
        
        // 月次統計を更新
        const monthlyResponse = await fetch(`${SUPABASE_URL}/functions/v1/api-usage-tracker`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                action: 'update_monthly_stats',
                monthKey: '2025-10',
                apiCalls: monthlyStats.api_calls,
                dataSubmissions: monthlyStats.data_submissions,
                deviceCount: monthlyStats.device_count
            })
        });
        
        if (monthlyResponse.ok) {
            console.log(`✅ 月次統計を更新: API呼び出し ${monthlyStats.api_calls}回, データ送信 ${monthlyStats.data_submissions}回`);
        } else {
            console.error('❌ 月次統計の更新に失敗', await monthlyResponse.text());
        }
        
        console.log('🎉 ダミーデータの挿入が完了しました！');
        console.log(`📊 合計: API呼び出し ${monthlyStats.api_calls}回, データ送信 ${monthlyStats.data_submissions}回`);
        
    } catch (error) {
        console.error('❌ ダミーデータの挿入中にエラーが発生しました:', error);
    }
}

// スクリプト実行
if (typeof window !== 'undefined') {
    // ブラウザ環境
    window.insertDummyData = insertDummyData;
    console.log('🌐 ブラウザ環境で実行可能です。insertDummyData()を呼び出してください。');
} else {
    // Node.js環境
    insertDummyData();
}
