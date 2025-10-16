import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================
// 注意：このスクリプトはDeno環境で実行してください
// =============================================

// Supabaseの接続情報を環境変数から取得
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('エラー: 環境変数 SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// デモデータを生成する関数
function generateDemoData() {
  const data = [];
  const today = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(today.getDate() - 90);

  for (let d = new Date(ninetyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
    // タイムゾーン問題を回避：ローカル日付として処理
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    const monthKey = dateKey.substring(0, 7);

    // 週末は使用量を減らす
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const apiCalls = Math.floor(Math.random() * (isWeekend ? 20 : 100)) + (isWeekend ? 5 : 20);
    const dataSubmissions = Math.floor(Math.random() * (isWeekend ? 5 : 20)) + (isWeekend ? 1 : 5);

    data.push({
      date_key: dateKey,
      month_key: monthKey,
      usage_type: 'daily',
      api_calls: apiCalls,
      data_submissions: dataSubmissions,
      device_count: Math.floor(Math.random() * 5) + 1,
    });
  }

  return data;
}

async function seedData() {
  console.log('デモデータの生成を開始します...');

  const dailyData = generateDemoData();
  const monthlyData = {};
  let totalApiCalls = 0;
  let totalDataSubmissions = 0;

  console.log(`${dailyData.length}日分の日次データを生成しました。`);

  // 既存のデータをクリア
  console.log('既存の統計データをクリアしています...');
  await supabase.from('api_usage_stats').delete().neq('usage_type', 'total');

  // 日次データを挿入
  console.log('日次データをSupabaseに挿入しています...');
  const { error: dailyError } = await supabase.from('api_usage_stats').insert(dailyData);
  if (dailyError) {
    console.error('日次データの挿入中にエラーが発生しました:', dailyError);
    return;
  }
  console.log('日次データの挿入が完了しました。');

  // 月次データを集計
  dailyData.forEach(d => {
    if (!monthlyData[d.month_key]) {
      monthlyData[d.month_key] = {
        api_calls: 0,
        data_submissions: 0,
      };
    }
    monthlyData[d.month_key].api_calls += d.api_calls;
    monthlyData[d.month_key].data_submissions += d.data_submissions;
  });

  const monthlyInsertData = Object.keys(monthlyData).map(monthKey => ({
    date_key: monthKey,
    month_key: monthKey,
    usage_type: 'monthly',
    api_calls: monthlyData[monthKey].api_calls,
    data_submissions: monthlyData[monthKey].data_submissions,
  }));

  // 月次データを挿入
  console.log('月次データをSupabaseに挿入しています...');
  const { error: monthlyError } = await supabase.from('api_usage_stats').insert(monthlyInsertData);
  if (monthlyError) {
    console.error('月次データの挿入中にエラーが発生しました:', monthlyError);
    return;
  }
  console.log('月次データの挿入が完了しました。');

  // 総計を更新
  totalApiCalls = dailyData.reduce((acc, d) => acc + d.api_calls, 0);
  totalDataSubmissions = dailyData.reduce((acc, d) => acc + d.data_submissions, 0);

  console.log('総計データを更新しています...');
  const { error: totalError } = await supabase
    .from('api_usage_stats')
    .update({
      api_calls: totalApiCalls,
      data_submissions: totalDataSubmissions,
    })
    .eq('usage_type', 'total');

  if (totalError) {
    console.error('総計データの更新中にエラーが発生しました:', totalError);
    return;
  }
  console.log('総計データの更新が完了しました。');

  console.log('✅ デモデータの挿入がすべて完了しました。');
}

// スクリプトを実行
seedData();
