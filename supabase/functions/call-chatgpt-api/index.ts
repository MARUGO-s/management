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

  // 認証ヘッダーの確認
  const authHeader = req.headers.get('authorization')
  console.log('🔐 認証ヘッダー:', authHeader ? '存在' : 'なし')
  
  try {
    const { text, url } = await req.json()
    console.log('📝 リクエスト受信:', { textLength: text?.length, url })
    
    if (!text) {
      throw new Error('テキストが提供されていません')
    }

    console.log('📄 ChatGPT API分析開始')
    console.log('URL:', url)
    console.log('テキスト長:', text.length)

    // ChatGPT APIでレシピ解析
    const recipeData = await analyzeRecipeWithChatGPT(text, url)
    console.log('📄 ChatGPT API分析完了')

    return new Response(
      JSON.stringify({
        ok: true,
        recipeData: recipeData,
        debug: {
          textLength: text.length,
          textPreview: text.substring(0, 500)
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
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

async function analyzeRecipeWithChatGPT(text: string, url?: string): Promise<any> {
  try {
    // OpenAI APIキーを環境変数から取得
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // URLに基づいてプロンプトを調整
    let prompt = '';
    
    if (url && url.includes('toptrading.co.jp')) {
      // Top Trading サイト専用のプロンプト
      prompt = `
以下のテキストはTop Tradingのレシピページから抽出されたものです。フランス料理のレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url}

テキスト:
${text}

以下の形式でJSONを返してください:
{
  "title": "料理名（日本語）",
  "originalTitle": "料理名（フランス語、もしあれば）",
  "description": "レシピの説明やコツ",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {
      "item": "材料名（日本語）",
      "originalItem": "材料名（フランス語、もしあれば）",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    {
      "step": "手順の説明（日本語）"
    }
  ],
  "notes": "メモやコツ（もしあれば）"
}

注意事項：
- 材料の分量で「大さじ」「小さじ」がある場合は、以下のように変換してください：
  - 大さじ1 = 15ml または 15g
  - 小さじ1 = 5ml または 5g
- 液体の場合はml、固体の場合はgを使用してください
- フランス語の材料名や料理名があれば、originalItemやoriginalTitleに記載してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
`;
    } else {
      // 一般的なレシピ用のプロンプト
      prompt = `
以下のテキストからレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url || '不明'}

テキスト:
${text}

以下の形式でJSONを返してください:
{
  "title": "料理名（日本語）",
  "originalTitle": "料理名（原語、もしあれば）",
  "description": "レシピの説明やコツ",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {
      "item": "材料名",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    {
      "step": "手順の説明"
    }
  ],
  "notes": "メモやコツ（もしあれば）"
}

注意事項：
- 材料の分量で「大さじ」「小さじ」がある場合は、以下のように変換してください：
  - 大さじ1 = 15ml または 15g
  - 小さじ1 = 5ml または 5g
- 液体の場合はml、固体の場合はgを使用してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
`;
    }

    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "あなたはレシピ解析の専門家です。与えられたテキストからレシピ情報を正確に抽出し、指定されたJSON形式で返してください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    }

    // OpenAI APIを呼び出し
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    
    // レスポンスからテキストを抽出
    const content = result.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI APIからレスポンスが取得できませんでした')
    }

    // JSONを解析
    try {
      const recipeData = JSON.parse(content)
      console.log('✅ ChatGPT API解析成功:', recipeData)
      return recipeData
    } catch (parseError) {
      console.error('❌ JSON解析エラー:', parseError)
      console.error('レスポンス内容:', content)
      
      // JSON解析に失敗した場合のフォールバック
      return {
        title: 'レシピ',
        description: 'レシピの解析に失敗しました',
        servings: '1',
        ingredients: [],
        steps: [],
        notes: 'ChatGPT APIからの応答を解析できませんでした'
      }
    }

  } catch (error) {
    console.error('❌ ChatGPT API呼び出しエラー:', error)
    throw new Error(`ChatGPT API呼び出しに失敗しました: ${error.message}`)
  }
}
