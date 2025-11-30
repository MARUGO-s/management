// 2025年10月1日〜15日までのダミーデータを直接挿入するスクリプト
// ブラウザのコンソールで実行可能

async function insertOctoberDummyData() {
    console.log('🚀 10月ダミーデータの挿入を開始します...');
    
    // Supabase設定を確認
    if (!window.SUPABASE_CONFIG) {
        console.error('❌ SUPABASE_CONFIGが見つかりません。管理画面で実行してください。');
        return;
    }
    
    // 10月1日〜15日のダミーデータ
    const dummyData = [
        { date: '2025-10-01', api_calls: 12, data_submissions: 3, device_count: 1 },
        { date: '2025-10-02', api_calls: 28, data_submissions: 7, device_count: 2 },
        { date: '2025-10-03', api_calls: 8, data_submissions: 2, device_count: 1 },
        { date: '2025-10-04', api_calls: 45, data_submissions: 12, device_count: 3 },
        { date: '2025-10-05', api_calls: 5, data_submissions: 1, device_count: 1 },
        { date: '2025-10-06', api_calls: 3, data_submissions: 1, device_count: 1 },
        { date: '2025-10-07', api_calls: 52, data_submissions: 15, device_count: 4 },
        { date: '2025-10-08', api_calls: 31, data_submissions: 8, device_count: 2 },
        { date: '2025-10-09', api_calls: 15, data_submissions: 4, device_count: 1 },
        { date: '2025-10-10', api_calls: 38, data_submissions: 10, device_count: 3 },
        { date: '2025-10-11', api_calls: 48, data_submissions: 13, device_count: 4 },
        { date: '2025-10-12', api_calls: 7, data_submissions: 2, device_count: 1 },
        { date: '2025-10-13', api_calls: 4, data_submissions: 1, device_count: 1 },
        { date: '2025-10-14', api_calls: 67, data_submissions: 18, device_count: 5 },
        { date: '2025-10-15', api_calls: 55, data_submissions: 14, device_count: 4 }
    ];
    
    let successCount = 0;
    let totalApiCalls = 0;
    let totalDataSubmissions = 0;
    
    // 各日のデータを挿入
    for (const dayData of dummyData) {
        try {
            console.log(`📊 ${dayData.date}のデータを挿入中...`);
            
            const response = await fetch(`${window.SUPABASE_CONFIG.url}/functions/v1/api-usage-tracker`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_CONFIG.anonKey}`
                },
                body: JSON.stringify({
                    action: 'insert_dummy_data',
                    dateKey: dayData.date,
                    apiCalls: dayData.api_calls,
                    dataSubmissions: dayData.data_submissions,
                    deviceCount: dayData.device_count
                })
            });
            
            if (response.ok) {
                successCount++;
                totalApiCalls += dayData.api_calls;
                totalDataSubmissions += dayData.data_submissions;
                console.log(`✅ ${dayData.date}: API呼び出し ${dayData.api_calls}回, データ送信 ${dayData.data_submissions}回`);
            } else {
                const errorText = await response.text();
                console.error(`❌ ${dayData.date}: 挿入に失敗`, errorText);
            }
        } catch (error) {
            console.error(`❌ ${dayData.date}: エラー`, error);
        }
    }
    
    // 月次統計を更新
    if (successCount > 0) {
        try {
            console.log('📈 月次統計を更新中...');
            
            const monthlyResponse = await fetch(`${window.SUPABASE_CONFIG.url}/functions/v1/api-usage-tracker`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_CONFIG.anonKey}`
                },
                body: JSON.stringify({
                    action: 'insert_dummy_data',
                    dateKey: '2025-10',
                    apiCalls: totalApiCalls,
                    dataSubmissions: totalDataSubmissions,
                    deviceCount: Math.max(...dummyData.map(d => d.device_count)),
                    usageType: 'monthly'
                })
            });
            
            if (monthlyResponse.ok) {
                console.log('✅ 月次統計を更新しました');
            } else {
                console.warn('⚠️ 月次統計の更新に失敗');
            }
        } catch (error) {
            console.warn('⚠️ 月次統計の更新に失敗:', error);
        }
    }
    
    // 結果表示
    console.log('🎉 ダミーデータの挿入が完了しました！');
    console.log(`📊 挿入日数: ${successCount}日`);
    console.log(`🔢 合計API呼び出し: ${totalApiCalls}回`);
    console.log(`📤 合計データ送信: ${totalDataSubmissions}回`);
    
    // グラフを更新（管理画面の場合）
    if (typeof loadMonthlyChart === 'function') {
        console.log('🔄 グラフを更新中...');
        setTimeout(() => {
            loadMonthlyChart();
            if (typeof refreshUsageData === 'function') {
                refreshUsageData();
            }
        }, 1000);
    }
    
    return {
        success: successCount === dummyData.length,
        insertedDays: successCount,
        totalDays: dummyData.length,
        totalApiCalls,
        totalDataSubmissions
    };
}

// ブラウザ環境で実行可能にする
if (typeof window !== 'undefined') {
    window.insertOctoberDummyData = insertOctoberDummyData;
    console.log('🌐 insertOctoberDummyData()関数が利用可能です。');
    console.log('📝 使用方法: insertOctoberDummyData()');
}

// 自動実行（管理画面の場合）
if (typeof window !== 'undefined' && window.SUPABASE_CONFIG) {
    console.log('🚀 自動的にダミーデータを挿入します...');
    insertOctoberDummyData();
}
