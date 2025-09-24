import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { url } = await req.json()

    if (!url) {
      throw new Error('URL is required')
    }

    console.log('📸 Screenshot request for:', url)

    // Puppeteerを使用してスクリーンショットを撮影
    const screenshot = await captureScreenshot(url)
    
    // Groq APIでOCR実行
    const text = await extractTextFromImage(screenshot)
    
    // Groq APIでレシピ解析
    const recipeData = await analyzeRecipe(text)

    return new Response(
      JSON.stringify({
        ok: true,
        data: recipeData,
        screenshot: screenshot
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
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

async function captureScreenshot(url: string): Promise<string> {
  try {
    // Puppeteerを使用してスクリーンショットを撮影
    const puppeteer = await import('https://deno.land/x/puppeteer@16.2.0/mod.ts')
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    
    // ページサイズを設定
    await page.setViewport({ width: 1200, height: 800 })
    
    // ページにアクセス
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    
    // 少し待機してページの読み込みを完了
    await page.waitForTimeout(3000)
    
    // スクリーンショットを撮影
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      fullPage: false
    })
    
    await browser.close()
    
    // Base64エンコード
    const base64 = btoa(String.fromCharCode(...new Uint8Array(screenshot)))
    return `data:image/jpeg;base64,${base64}`
    
  } catch (error) {
    console.error('Screenshot capture error:', error)
    throw new Error(`Screenshot capture failed: ${error.message}`)
  }
}

async function extractTextFromImage(imageData: string): Promise<string> {
  try {
    // Groq APIキーを環境変数から取得
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured')
    }
    
    // Base64データ部分のみを抽出
    const base64Image = imageData.split(',')[1]
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'penai/gpt-oss-120b',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'この画像からテキストを抽出してください。レシピの画像の場合は、材料、分量、手順などの情報を正確に読み取ってください。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const result = await response.json()
    
    if (result.choices && result.choices[0] && result.choices[0].message) {
      return result.choices[0].message.content || ''
    } else {
      return ''
    }
    
  } catch (error) {
    console.error('OCR error:', error)
    throw new Error(`OCR failed: ${error.message}`)
  }
}

async function analyzeRecipe(text: string): Promise<any> {
  try {
    // Groq APIキーを環境変数から取得
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured')
    }
    
    const prompt = `
以下のレシピページのテキストを解析して、JSON形式で構造化データを抽出してください。

テキスト:
${text}

以下のJSON形式で返してください:
{
  "title": "レシピのタイトル",
  "description": "レシピの説明（あれば）",
  "ingredients": [
    {
      "item": "材料名",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    "手順1",
    "手順2",
    "手順3"
  ]
}

注意事項:
- 材料の分量と単位を正確に分離してください
- 手順は番号付きリストから抽出してください
- 日本語以外の場合は日本語に翻訳してください
- 単位は標準的な形式（g、ml、個、本など）に統一してください
`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'penai/gpt-oss-120b',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4096,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const result = await response.json()
    
    if (result.choices && result.choices[0] && result.choices[0].message) {
      const text = result.choices[0].message.content
      
      // JSONを抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      } else {
        throw new Error('JSON data not found in response')
      }
    } else {
      throw new Error('Invalid response from Groq API')
    }
    
  } catch (error) {
    console.error('Recipe analysis error:', error)
    throw new Error(`Recipe analysis failed: ${error.message}`)
  }
}


