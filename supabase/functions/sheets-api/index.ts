import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔧 Sheets API function called')

    // 環境変数の確認
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY')

    console.log('🔧 Environment variables check:')
    console.log('🔧 GOOGLE_API_KEY exists:', !!googleApiKey)

    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set')
    }

    const body = await req.json()
    console.log('🔧 Request body keys:', Object.keys(body))

    const { spreadsheetId, range, method = 'GET', values } = body

    if (!spreadsheetId || !range) {
      throw new Error('spreadsheetId and range are required')
    }

    console.log('🔍 Sheets API request:', { spreadsheetId, range, method })

    let url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    let fetchOptions: any = {
      headers: {
        'Content-Type': 'application/json',
      }
    }

    if (method === 'GET') {
      // GET request - データ取得
      url += `?key=${googleApiKey}`
    } else if (method === 'POST' || method === 'PUT') {
      // POST/PUT request - データ更新
      url += `?key=${googleApiKey}`
      fetchOptions.method = method
      if (values) {
        fetchOptions.body = JSON.stringify({
          values: values,
          majorDimension: 'ROWS'
        })
      }
    } else if (method === 'APPEND') {
      // APPEND request - データ追加
      url += `?key=${googleApiKey}&valueInputOption=RAW&insertDataOption=INSERT_ROWS`
      fetchOptions.method = 'POST'
      if (values) {
        fetchOptions.body = JSON.stringify({
          values: values,
          majorDimension: 'ROWS'
        })
      }
    }

    console.log('🔧 Making Google Sheets API request:', url.replace(googleApiKey, '[REDACTED]'))

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Google Sheets API error: ${response.status} - ${errorData}`)
    }

    const result = await response.json()
    console.log('🔧 Google Sheets API response received')

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error message:', error.message)

    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
        stack: error.stack,
        details: {
          name: error.name,
          message: error.message
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})