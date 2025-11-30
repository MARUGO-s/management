import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALERT_THRESHOLD = 30
const KEEP_LIMIT = 50
const DISPLAY_LIMIT = 50
const LOG_SELECT_COLUMNS = 'id, event_type, actor, description, device_info, api_call_count, alert_flag, acknowledged, acknowledged_at, acknowledged_by, created_at'

type AccessLogPayload = {
  action?: 'record' | 'list' | 'acknowledge' | 'delete' | 'prune'
  eventType?: string
  actor?: string
  description?: string
  deviceInfo?: Record<string, unknown>
  apiCallCount?: number | string
  logId?: number
  acknowledged?: boolean
  updatedBy?: string
}

type AccessLogRow = {
  id: number
  event_type: string
  actor: string | null
  description: string | null
  device_info: Record<string, unknown> | null
  api_call_count: number | null
  alert_flag: boolean | null
  acknowledged: boolean | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  created_at: string
}

async function fetchLatestLogs(client: ReturnType<typeof createClient>): Promise<AccessLogRow[]> {
  const logsMap = new Map<number, AccessLogRow>()

  const { data: recentLogs, error: recentError } = await client
    .from<AccessLogRow>('access_logs')
    .select(LOG_SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(DISPLAY_LIMIT)

  if (recentError) {
    console.error('アクセスログ取得エラー:', recentError)
    throw new Error('Failed to fetch access logs')
  }

  recentLogs?.forEach(log => logsMap.set(log.id, log))

  const { data: pendingLogs, error: pendingError } = await client
    .from<AccessLogRow>('access_logs')
    .select(LOG_SELECT_COLUMNS)
    .eq('alert_flag', true)
    .eq('acknowledged', false)
    .order('created_at', { ascending: false })

  if (pendingError) {
    console.warn('未確認アクセスログ取得エラー:', pendingError)
  } else {
    pendingLogs?.forEach(log => logsMap.set(log.id, log))
  }

  const combined = Array.from(logsMap.values())
  combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return combined
}

async function pruneOverflowingLogs(client: ReturnType<typeof createClient>) {
  const { data: overflow, error } = await client
    .from('access_logs')
    .select('id')
    .eq('acknowledged', true)
    .order('created_at', { ascending: false })
    .range(KEEP_LIMIT, KEEP_LIMIT + 200)

  if (error) {
    console.error('アクセスログ削除候補取得エラー:', error)
    return
  }

  if (!overflow || overflow.length === 0) {
    return
  }

  const idsToDelete = overflow.map(entry => entry.id)

  const { error: deleteError } = await client
    .from('access_logs')
    .delete()
    .in('id', idsToDelete)

  if (deleteError) {
    console.error('アクセスログ削除エラー:', deleteError)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!serviceRoleKey) {
      throw new Error('Service role key is not configured')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey
    )

    let payload: AccessLogPayload
    try {
      payload = await req.json()
    } catch (_error) {
      payload = {}
    }

    const action = payload.action ?? 'list'

    const fetchAndRespond = async () => {
      const logs = await fetchLatestLogs(supabase)
      return new Response(JSON.stringify({
        success: true,
        logs,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'record') {
      const eventType = payload.eventType?.trim()
      if (!eventType) {
        return new Response(JSON.stringify({
          success: false,
          error: 'eventType is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const actor = payload.actor?.slice(0, 120) ?? null
      const description = payload.description?.slice(0, 500) ?? null
      const deviceInfo = payload.deviceInfo ?? {}

      let apiCallCount = 0
      if (typeof payload.apiCallCount === 'number' && Number.isFinite(payload.apiCallCount)) {
        apiCallCount = Math.max(0, Math.round(payload.apiCallCount))
      } else if (typeof payload.apiCallCount === 'string') {
        const parsed = Number(payload.apiCallCount)
        if (Number.isFinite(parsed)) {
          apiCallCount = Math.max(0, Math.round(parsed))
        }
      }

      const alertFlag = apiCallCount >= ALERT_THRESHOLD
      const acknowledged = alertFlag ? false : true
      const timestamp = new Date().toISOString()
      const updatedBy = payload.updatedBy?.slice(0, 120) ?? 'system'

      const { error: insertError } = await supabase
        .from('access_logs')
        .insert({
          event_type: eventType,
          actor,
          description,
          device_info: deviceInfo,
          api_call_count: apiCallCount,
          alert_flag: alertFlag,
          acknowledged,
          acknowledged_at: acknowledged ? timestamp : null,
          acknowledged_by: acknowledged ? updatedBy : null,
        })

      if (insertError) {
        console.error('アクセスログ記録エラー:', insertError)
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to record access log'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await pruneOverflowingLogs(supabase)
      return await fetchAndRespond()
    }

    if (action === 'acknowledge') {
      const logId = Number(payload.logId)
      if (!Number.isFinite(logId) || logId <= 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'logId is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const acknowledged = payload.acknowledged === false ? false : true
      const updatedBy = payload.updatedBy?.slice(0, 120) ?? 'admin_panel'

      const { error: updateError } = await supabase
        .from('access_logs')
        .update({
          acknowledged,
          acknowledged_at: acknowledged ? new Date().toISOString() : null,
          acknowledged_by: acknowledged ? updatedBy : null,
        })
        .eq('id', logId)

      if (updateError) {
        console.error('アクセスログ更新エラー:', updateError)
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to update access log'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await pruneOverflowingLogs(supabase)
      return await fetchAndRespond()
    }

    if (action === 'delete') {
      const logId = Number(payload.logId)
      if (!Number.isFinite(logId) || logId <= 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'logId is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: deleteError } = await supabase
        .from('access_logs')
        .delete()
        .eq('id', logId)

      if (deleteError) {
        console.error('アクセスログ削除エラー:', deleteError)
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to delete access log'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await pruneOverflowingLogs(supabase)
      return await fetchAndRespond()
    }

    if (action === 'prune') {
      await pruneOverflowingLogs(supabase)
      return await fetchAndRespond()
    }

    // default: list
    return await fetchAndRespond()
  } catch (error) {
    console.error('アクセスログ関数エラー:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message ?? 'Unexpected error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
