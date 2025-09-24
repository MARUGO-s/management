import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    const { contents } = await req.json()

    if (!contents) {
      throw new Error('コンテンツが提供されていません')
    }

    // Google API キー（環境変数から取得）
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!googleApiKey) {
      throw new Error('Google API キーが設定されていません')
    }

    // Google Gemini Vision API を呼び出し
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
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
      throw new Error(`Google Vision API エラー: ${response.status} - ${errorData}`)
    }

    const result = await response.json()
    console.log('📸 Google Vision API レスポンス:', result)

    // Gemini API の応答をそのまま返す
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const extractedText = result.candidates[0].content.parts[0].text || ''

      console.log('✅ Google Vision API テキスト抽出成功:', extractedText.substring(0, 100) + '...')

      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    throw new Error('Google Vision API から有効なテキストを取得できませんでした')

  } catch (error) {
    console.error('❌ Google Vision API エラー:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause
    })

    return new Response(
      JSON.stringify({
        error: error.message,
        errorType: error.name,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

