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
    console.log('🔧 OCR function called')
    
    // 環境変数の確認
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');

    console.log('🔧 Environment variables check:');
    console.log('🔧 GOOGLE_API_KEY exists:', !!googleApiKey);

    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set');
    }

    const body = await req.json()
    console.log('🔧 Request body keys:', Object.keys(body))

    const { contents } = body

    if (!contents) {
      throw new Error('Contents are required')
    }

    console.log('🔍 OCR request with contents:', contents.length)

    // Google Gemini API でレシピ構造化
    console.log('🔧 Starting Google Gemini API analysis...')
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${googleApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: contents
      })
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Google Gemini API エラー: ${response.status} - ${errorData}`)
    }

    const result = await response.json()
    console.log('🔧 Google Gemini API analysis completed:', result)

    // Gemini API の応答をそのまま返す
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
