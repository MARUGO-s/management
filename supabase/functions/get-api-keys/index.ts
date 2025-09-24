import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// レート制限用のMAP
const requestCounts = new Map<string, { count: number, resetTime: number }>()
const RATE_LIMIT = 10 // 10分間に10リクエスト
const RATE_WINDOW = 10 * 60 * 1000 // 10分

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // レート制限チェック
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const userKey = `${clientIP}`
    
    const userStats = requestCounts.get(userKey)
    if (userStats) {
      if (now < userStats.resetTime) {
        if (userStats.count >= RATE_LIMIT) {
          return new Response(
            JSON.stringify({ success: false, error: 'リクエストが多すぎます。しばらく待ってから再度お試しください。' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
          )
        }
        userStats.count++
      } else {
        requestCounts.set(userKey, { count: 1, resetTime: now + RATE_WINDOW })
      }
    } else {
      requestCounts.set(userKey, { count: 1, resetTime: now + RATE_WINDOW })
    }

    const { keyName } = await req.json()

    if (!keyName) {
      throw new Error('キー名が指定されていません')
    }

    // 入力検証
    if (typeof keyName !== 'string' || keyName.length === 0 || keyName.length > 50) {
      throw new Error('無効なキー名')
    }

    // 許可されたキー名のみ返す
    const allowedKeys = ['GROQ_API_KEY', 'CHATGPT_API_KEY', 'GOOGLE_API_KEY', 'VISION_API_KEY']
    if (!allowedKeys.includes(keyName)) {
      throw new Error('許可されていないキー名です')
    }

    // ログ記録(本番環境ではキーは記録しない)
    console.log(`🔑 APIキーリクエスト: ${keyName} from ${clientIP}`)

    // 環境変数名のマッピング
    let envVarName = keyName
    if (keyName === 'CHATGPT_API_KEY') {
      // ChatGPT APIキーは複数の環境変数名で設定されている可能性がある
      envVarName = Deno.env.get('OPENAI_API_KEY') ? 'OPENAI_API_KEY' : 
                   Deno.env.get('chatgpt') ? 'chatgpt' : 
                   'CHATGPT_API_KEY'
    }

    const apiKey = Deno.env.get(envVarName)

    return new Response(
      JSON.stringify({
        success: true,
        hasKey: !!apiKey
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ APIキー取得エラー:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
