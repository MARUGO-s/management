import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, reportData } = await req.json()

    if (action === 'create') {
      // レポートIDを生成（例：DM-20250116-001）
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '')
      const reportId = `DM-${dateStr}-${timeStr}`

      const { data, error } = await supabaseClient
        .from('data_mismatch_reports')
        .insert({
          report_id: reportId,
          mismatch_count: reportData.mismatchCount || 0,
          sent_data_count: reportData.sentDataCount || 0,
          registered_data_count: reportData.registeredDataCount || 0,
          sent_data: reportData.sentData || null,
          registered_data: reportData.registeredData || null,
          mismatch_details: reportData.mismatchDetails || null,
          environment_info: reportData.environmentInfo || null
        })
        .select()

      if (error) {
        console.error('Error creating data mismatch report:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to create report' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          reportId: reportId,
          data: data[0] 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (action === 'get_all') {
      const { data, error } = await supabaseClient
        .from('data_mismatch_reports')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching data mismatch reports:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch reports' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          reports: data 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (action === 'delete_all') {
      const { error } = await supabaseClient
        .from('data_mismatch_reports')
        .delete()
        .neq('id', 0) // 全てのレコードを削除

      if (error) {
        console.error('Error deleting all reports:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to delete reports' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All reports deleted successfully' 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
