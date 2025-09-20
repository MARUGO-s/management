import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type IndicatorSettingsPayload = {
  action?: 'get' | 'save' | 'reset'
  settings?: {
    orange?: number
    yellow?: number
    red?: number
  }
  updatedBy?: string
}

type IndicatorSettingsRow = {
  orange_threshold: number
  yellow_threshold: number
  red_threshold: number
  updated_by: string | null
  updated_at: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_SETTINGS = {
  orange: 900,
  yellow: 1500,
  red: 2400,
}

function normalizeSettings(input?: { orange?: unknown; yellow?: unknown; red?: unknown }) {
  const parsed = {
    orange: Number(input?.orange ?? DEFAULT_SETTINGS.orange),
    yellow: Number(input?.yellow ?? DEFAULT_SETTINGS.yellow),
    red: Number(input?.red ?? DEFAULT_SETTINGS.red),
  }

  if (
    !Number.isFinite(parsed.orange) ||
    !Number.isFinite(parsed.yellow) ||
    !Number.isFinite(parsed.red)
  ) {
    throw new Error('Invalid threshold values')
  }

  const rounded = {
    orange: Math.max(0, Math.round(parsed.orange)),
    yellow: Math.max(0, Math.round(parsed.yellow)),
    red: Math.max(0, Math.round(parsed.red)),
  }

  if (!(rounded.orange < rounded.yellow && rounded.yellow < rounded.red)) {
    throw new Error('Thresholds must satisfy orange < yellow < red')
  }

  if (rounded.red > 10000) {
    throw new Error('Maximum threshold exceeds allowed limit (10,000)')
  }

  return rounded
}

function mapRowToResponse(row: IndicatorSettingsRow | null) {
  if (!row) {
    return {
      settings: { ...DEFAULT_SETTINGS },
      updatedBy: 'system',
      updatedAt: null,
    }
  }

  return {
    settings: {
      orange: row.orange_threshold,
      yellow: row.yellow_threshold,
      red: row.red_threshold,
    },
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
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

    let payload: IndicatorSettingsPayload
    try {
      payload = await req.json()
    } catch (_error) {
      payload = {}
    }

    const action = payload.action ?? 'get'

    if (action === 'get') {
      const { data, error } = await supabase
        .from<IndicatorSettingsRow>('indicator_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (error) {
        console.error('インジケーター設定取得エラー:', error)
        throw new Error('Failed to fetch indicator settings')
      }

      if (!data) {
        await supabase
          .from('indicator_settings')
          .upsert({
            id: 1,
            orange_threshold: DEFAULT_SETTINGS.orange,
            yellow_threshold: DEFAULT_SETTINGS.yellow,
            red_threshold: DEFAULT_SETTINGS.red,
            updated_by: 'system',
            updated_at: new Date().toISOString(),
          })
      }

      const { data: refreshed } = await supabase
        .from<IndicatorSettingsRow>('indicator_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      const responsePayload = mapRowToResponse(refreshed ?? null)

      return new Response(JSON.stringify({
        success: true,
        ...responsePayload,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset') {
      const { error } = await supabase
        .from('indicator_settings')
        .upsert({
          id: 1,
          orange_threshold: DEFAULT_SETTINGS.orange,
          yellow_threshold: DEFAULT_SETTINGS.yellow,
          red_threshold: DEFAULT_SETTINGS.red,
          updated_by: payload.updatedBy?.slice(0, 120) ?? 'admin',
          updated_at: new Date().toISOString(),
        })

      if (error) {
        console.error('インジケーター設定リセットエラー:', error)
        throw new Error('Failed to reset indicator settings')
      }

      return new Response(JSON.stringify({
        success: true,
        settings: { ...DEFAULT_SETTINGS },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'save') {
      const settings = normalizeSettings(payload.settings)
      const updatedBy = payload.updatedBy?.slice(0, 120) ?? 'admin'

      const { data, error } = await supabase
        .from('indicator_settings')
        .upsert({
          id: 1,
          orange_threshold: settings.orange,
          yellow_threshold: settings.yellow,
          red_threshold: settings.red,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('インジケーター設定保存エラー:', error)
        throw new Error('Failed to save indicator settings')
      }

      return new Response(JSON.stringify({
        success: true,
        settings: {
          orange: data.orange_threshold,
          yellow: data.yellow_threshold,
          red: data.red_threshold,
        },
        updatedBy,
        updatedAt: data.updated_at,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid action',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('indicator-settings function error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message ?? 'Unexpected error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
