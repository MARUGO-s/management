import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UsageCounts = {
  daily: {
    total: number
    api_calls?: number
    data_submissions?: number
  }
  monthly: {
    total: number
    api_calls?: number
    data_submissions?: number
  }
  total: {
    total: number
    api_calls?: number
    data_submissions?: number
  }
  devices: {
    count: number
    details?: any[]
  }
  timestamp: string
}

async function fetchUsageSnapshot(
  client: ReturnType<typeof createClient>,
  today: string,
  currentMonth: string,
): Promise<UsageCounts> {
  const { data: usageData, error: usageError } = await client
    .from('api_usage_stats')
    .select('*')
    .in('usage_type', ['daily', 'monthly', 'total'])
    .in('date_key', [today, currentMonth, 'total'])

  if (usageError) {
    console.error('使用量取得エラー:', usageError)
    throw usageError
  }

  const dailyStats = usageData?.find(row => row.usage_type === 'daily') || { api_calls: 0, data_submissions: 0 }
  const monthlyStats = usageData?.find(row => row.usage_type === 'monthly') || { api_calls: 0, data_submissions: 0 }
  const totalStats = usageData?.find(row => row.usage_type === 'total') || { api_calls: 0, data_submissions: 0 }

  const { data: deviceData, error: deviceError } = await client
    .from('device_usage_stats')
    .select('device_id, total_api_calls, total_data_submissions, last_access')

  if (deviceError) {
    console.error('デバイス統計取得エラー:', deviceError)
  }

  return {
    daily: {
      api_calls: dailyStats.api_calls || 0,
      data_submissions: dailyStats.data_submissions || 0,
      total: (dailyStats.api_calls || 0) + (dailyStats.data_submissions || 0),
    },
    monthly: {
      api_calls: monthlyStats.api_calls || 0,
      data_submissions: monthlyStats.data_submissions || 0,
      total: (monthlyStats.api_calls || 0) + (monthlyStats.data_submissions || 0),
    },
    total: {
      api_calls: totalStats.api_calls || 0,
      data_submissions: totalStats.data_submissions || 0,
      total: (totalStats.api_calls || 0) + (totalStats.data_submissions || 0),
    },
    devices: {
      count: deviceData?.length || 0,
      details: deviceData || [],
    },
    timestamp: new Date().toISOString(),
  }
}

serve(async (req) => {
  // CORS対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!serviceRoleKey) {
      throw new Error('Service role key is not configured')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey
    )

    // リクエストボディを一度だけ読み取り
    const requestBody = await req.json()
    const { action, deviceId, deviceInfo, usageType = 'api_call', targetMonth, resetType } = requestBody

    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const currentMonth = today.substring(0, 7) // YYYY-MM

    if (action === 'record') {
      // 1. デバイス別統計更新
      if (deviceId) {
        const { data: deviceData, error: deviceError } = await supabaseClient
          .from('device_usage_stats')
          .select('*')
          .eq('device_id', deviceId)
          .single()

        if (deviceError && deviceError.code !== 'PGRST116') {
          console.error('デバイス統計取得エラー:', deviceError)
        }

        if (deviceData) {
          // 既存デバイス更新
          const updateData: any = {
            last_access: new Date().toISOString(),
            device_info: deviceInfo || deviceData.device_info
          }

          if (usageType === 'api_call') {
            updateData.total_api_calls = (deviceData.total_api_calls || 0) + 1
          } else if (usageType === 'data_submission') {
            updateData.total_data_submissions = (deviceData.total_data_submissions || 0) + 1
          }

          await supabaseClient
            .from('device_usage_stats')
            .update(updateData)
            .eq('device_id', deviceId)

        } else {
          // 新規デバイス登録
          const insertData: any = {
            device_id: deviceId,
            device_info: deviceInfo,
            first_access: new Date().toISOString(),
            last_access: new Date().toISOString()
          }

          if (usageType === 'api_call') {
            insertData.total_api_calls = 1
            insertData.total_data_submissions = 0
          } else if (usageType === 'data_submission') {
            insertData.total_api_calls = 0
            insertData.total_data_submissions = 1
          }

          await supabaseClient
            .from('device_usage_stats')
            .insert(insertData)
        }
      }

      // 2. 日次統計更新（日変更チェック付き）
      await updateDailyStatsWithReset(supabaseClient, today, currentMonth, usageType)

      // 3. 月次統計更新（月変更チェック付き）
      await updateMonthlyStatsWithReset(supabaseClient, currentMonth, usageType)

      // 4. 総計統計更新
      await updateUsageStats(supabaseClient, 'total', 'total', 'total', usageType)

      // 5. デバイス数更新
      await updateDeviceCount(supabaseClient)

      const usageSnapshot = await fetchUsageSnapshot(supabaseClient, today, currentMonth)

      return new Response(JSON.stringify({
        success: true,
        message: 'API使用量を記録しました',
        usage: usageSnapshot,
        timestamp: usageSnapshot.timestamp,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    } else if (action === 'get') {
      const usageSnapshot = await fetchUsageSnapshot(supabaseClient, today, currentMonth)

      return new Response(JSON.stringify(usageSnapshot), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    } else if (action === 'get_monthly_chart') {
      // 月次チャート用の日別データ取得
      const monthKey = targetMonth || currentMonth // YYYY-MM形式

      // 指定月の日別データを取得
      const { data: dailyData, error: dailyError } = await supabaseClient
        .from('api_usage_stats')
        .select('date_key, api_calls, data_submissions, device_count, updated_at')
        .eq('usage_type', 'daily')
        .like('date_key', `${monthKey}%`)
        .order('date_key', { ascending: true })

      if (dailyError) {
        console.error('日別データ取得エラー:', dailyError)
        throw dailyError
      }

      // 月の日数を計算
      const year = parseInt(monthKey.split('-')[0])
      const month = parseInt(monthKey.split('-')[1])
      const daysInMonth = new Date(year, month, 0).getDate()

      // 1日から月末まで全日のデータを作成（データがない日は0で埋める）
      const chartData = []
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${monthKey}-${day.toString().padStart(2, '0')}`
        const dayData = dailyData.find(row => row.date_key === dateKey)
        
        chartData.push({
          date: dateKey,
          day: day,
          api_calls: dayData?.api_calls || 0,
          data_submissions: dayData?.data_submissions || 0,
          total: (dayData?.api_calls || 0) + (dayData?.data_submissions || 0),
          device_count: dayData?.device_count || 0,
          updated_at: dayData?.updated_at || null
        })
      }

      const monthlyTotal = chartData.reduce((sum, day) => sum + day.total, 0)
      const maxDailyUsage = Math.max(...chartData.map(day => day.total))

      const result = {
        month: monthKey,
        year: year,
        monthName: new Date(year, month - 1).toLocaleDateString('ja-JP', { month: 'long' }),
        daysInMonth: daysInMonth,
        dailyData: chartData,
        summary: {
          monthlyTotal: monthlyTotal,
          maxDailyUsage: maxDailyUsage,
          avgDailyUsage: Math.round(monthlyTotal / daysInMonth * 10) / 10,
          activeDays: chartData.filter(day => day.total > 0).length
        },
        timestamp: new Date().toISOString()
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    } else if (action === 'reset') {
      // 統計リセット（管理者用）
      const resetTypeToUse = resetType || 'all'

      if (resetTypeToUse === 'daily' || resetTypeToUse === 'all') {
        await supabaseClient
          .from('api_usage_stats')
          .update({ api_calls: 0, data_submissions: 0, device_count: 0 })
          .eq('usage_type', 'daily')
      }

      if (resetTypeToUse === 'monthly' || resetTypeToUse === 'all') {
        await supabaseClient
          .from('api_usage_stats')
          .update({ api_calls: 0, data_submissions: 0, device_count: 0 })
          .eq('usage_type', 'monthly')
      }

      if (resetTypeToUse === 'total' || resetTypeToUse === 'all') {
        await supabaseClient
          .from('api_usage_stats')
          .update({ api_calls: 0, data_submissions: 0, device_count: 0 })
          .eq('usage_type', 'total')
      }

      if (resetTypeToUse === 'devices' || resetTypeToUse === 'all') {
        await supabaseClient
          .from('device_usage_stats')
          .delete()
          .neq('id', 0) // 全削除
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: `${resetTypeToUse} 統計をリセットしました`,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error) {
    console.error('API使用量追跡エラー:', error)
    return new Response(JSON.stringify({ 
      error: 'API使用量追跡でエラーが発生しました', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// 使用量統計更新ヘルパー関数
async function updateUsageStats(supabaseClient: any, dateKey: string, monthKey: string, usageType: string, recordType: string) {
  const { data: existingData, error: selectError } = await supabaseClient
    .from('api_usage_stats')
    .select('*')
    .eq('date_key', dateKey)
    .eq('usage_type', usageType)
    .single()

  if (selectError && selectError.code !== 'PGRST116') {
    console.error(`${usageType}統計取得エラー:`, selectError)
    return
  }

  const updateData: any = {
    month_key: monthKey,
    updated_at: new Date().toISOString()
  }

  if (recordType === 'api_call') {
    updateData.api_calls = (existingData?.api_calls || 0) + 1
    updateData.data_submissions = existingData?.data_submissions || 0
  } else if (recordType === 'data_submission') {
    updateData.api_calls = existingData?.api_calls || 0
    updateData.data_submissions = (existingData?.data_submissions || 0) + 1
  }

  if (existingData) {
    const { error: updateError } = await supabaseClient
      .from('api_usage_stats')
      .update(updateData)
      .eq('date_key', dateKey)
      .eq('usage_type', usageType)

    if (updateError) {
      console.error(`${usageType}統計更新エラー:`, updateError)
    }
  } else {
    const insertData = {
      date_key: dateKey,
      month_key: monthKey,
      usage_type: usageType,
      api_calls: recordType === 'api_call' ? 1 : 0,
      data_submissions: recordType === 'data_submission' ? 1 : 0,
      device_count: 0
    }

    const { error: insertError } = await supabaseClient
      .from('api_usage_stats')
      .insert(insertData)

    if (insertError) {
      console.error(`${usageType}統計挿入エラー:`, insertError)
    }
  }
}

// 日次統計更新（日変更時の自動リセット付き）
async function updateDailyStatsWithReset(supabaseClient: any, today: string, currentMonth: string, recordType: string) {
  // 既存の日次統計を取得
  const { data: existingDailyData, error: selectError } = await supabaseClient
    .from('api_usage_stats')
    .select('*')
    .eq('usage_type', 'daily')
    .single()

  if (selectError && selectError.code !== 'PGRST116') {
    console.error('日次統計取得エラー:', selectError)
    return
  }

  // 日が変わったかチェック
  const shouldReset = existingDailyData && existingDailyData.date_key !== today

  if (shouldReset) {
    // 新しい日の統計を0から開始
    const newDailyData = {
      date_key: today,
      month_key: currentMonth,
      usage_type: 'daily',
      api_calls: recordType === 'api_call' ? 1 : 0,
      data_submissions: recordType === 'data_submission' ? 1 : 0,
      device_count: 0,
      updated_at: new Date().toISOString()
    }

    // 既存レコードを更新（新日データで上書き）
    const { error: resetError } = await supabaseClient
      .from('api_usage_stats')
      .update(newDailyData)
      .eq('usage_type', 'daily')

    if (resetError) {
      console.error('日次統計リセットエラー:', resetError)
    } else {
      console.log(`📅 日次統計を新日 ${today} でリセットしました`)
    }
  } else {
    // 通常の日次統計更新
    await updateUsageStats(supabaseClient, today, currentMonth, 'daily', recordType)
  }
}

// 月次統計更新（月変更時の自動リセット付き）
async function updateMonthlyStatsWithReset(supabaseClient: any, currentMonth: string, recordType: string) {
  // 既存の月次統計を取得
  const { data: existingMonthlyData, error: selectError } = await supabaseClient
    .from('api_usage_stats')
    .select('*')
    .eq('usage_type', 'monthly')
    .single()

  if (selectError && selectError.code !== 'PGRST116') {
    console.error('月次統計取得エラー:', selectError)
    return
  }

  // 月が変わったかチェック
  const shouldReset = existingMonthlyData && existingMonthlyData.date_key !== currentMonth

  if (shouldReset) {
    // 新しい月の統計を0から開始
    const newMonthlyData = {
      date_key: currentMonth,
      month_key: currentMonth,
      usage_type: 'monthly',
      api_calls: recordType === 'api_call' ? 1 : 0,
      data_submissions: recordType === 'data_submission' ? 1 : 0,
      device_count: 0,
      updated_at: new Date().toISOString()
    }

    // 既存レコードを更新（新月データで上書き）
    const { error: resetError } = await supabaseClient
      .from('api_usage_stats')
      .update(newMonthlyData)
      .eq('usage_type', 'monthly')

    if (resetError) {
      console.error('月次統計リセットエラー:', resetError)
    } else {
      console.log(`🗓️ 月次統計を新月 ${currentMonth} でリセットしました`)
    }
  } else {
    // 通常の月次統計更新
    await updateUsageStats(supabaseClient, currentMonth, currentMonth, 'monthly', recordType)
  }
}

// デバイス数更新ヘルパー関数
async function updateDeviceCount(supabaseClient: any) {
  const { data: deviceData, error: deviceError } = await supabaseClient
    .from('device_usage_stats')
    .select('device_id')

  if (deviceError) {
    console.error('デバイス数取得エラー:', deviceError)
    return
  }

  const deviceCount = deviceData?.length || 0

  // 全ての統計レコードでデバイス数を更新
  const { error: updateError } = await supabaseClient
    .from('api_usage_stats')
    .update({ device_count: deviceCount })
    .neq('id', 0) // 全レコード更新

  if (updateError) {
    console.error('デバイス数更新エラー:', updateError)
  }
}
