/**
 * Gemini AI 解析モジュール
 * 高精度な解析に最適化された材料解析
 */

class GeminiAnalyzer {
  constructor() {
    this.provider = 'gemini';
    this.model = 'gemini-1.5-flash';
    this.maxTokens = 4096;
    this.temperature = 0.2;
    this.endpoint = 'call-vision-api';
  }

  /**
   * OCRテキストをGeminiで解析してレシピデータを生成
   */
  async analyzeRecipe(extractedText, supabaseClient) {
    console.log('🚀 Gemini AI解析を開始:', this.model);
    
    const prompt = this.createOptimizedPrompt(extractedText);
    
    try {
      const { data: result, error } = await supabaseClient.functions.invoke(this.endpoint, {
        body: {
          contents: [{
            parts: [
              { text: prompt }
            ]
          }]
        }
      });

      if (error) {
        throw new Error(`Gemini API エラー: ${error.message}`);
      }

      if (!result?.candidates || !result.candidates[0]?.content) {
        throw new Error('Gemini API から有効なレスポンスを取得できませんでした');
      }

      const generatedText = result.candidates[0].content.parts[0].text || '';
      console.log('📄 Gemini生成テキスト:', generatedText.substring(0, 200) + '...');

      return this.parseGeminiResponse(generatedText, extractedText);

    } catch (error) {
      console.error('❌ Gemini解析エラー:', error);
      throw error;
    }
  }

  /**
   * Gemini用に最適化されたプロンプトを作成
   */
  createOptimizedPrompt(extractedText) {
    return `以下のOCRで抽出したレシピテキストを詳細に解析し、高精度なJSON形式で構造化してください。

【Gemini高精度解析指示】
- 複雑なレシピ構造の正確な理解
- 材料の分量・単位・価格の精密な分離
- 料理名と説明の適切な抽出
- 手順の論理的な整理
- 多言語対応と文化的な理解

【入力テキスト】
${extractedText}

【出力形式】
{
  "title": "料理名（適切な料理名を推測）",
  "description": "レシピの詳細な説明",
  "servings": 2,
  "ingredients": [
    {"item": "材料名", "quantity": "分量", "unit": "単位", "price": "価格"}
  ],
  "steps": ["詳細な手順1", "詳細な手順2"],
  "notes": "調理のコツや注意点"
}

【重要】
- 材料は必ずingredients配列に含める
- 価格情報（円）はpriceフィールドに分離
- 分量と単位は正確に分離
- 料理名は文脈から適切に推測
- 手順は論理的な順序で整理
- JSONのみ出力（説明文なし）`;
  }

  /**
   * Geminiのレスポンスを解析
   */
  parseGeminiResponse(generatedText, originalText) {
    try {
      // JSONのクリーンアップ
      let cleanJson = (generatedText || '').trim();

      // ```json ... ``` のコードフェンスを削除
      const fencedMatch = cleanJson.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
      if (fencedMatch) {
        cleanJson = fencedMatch[1].trim();
      }

      // 全角引用符を標準の引用符に変換
      cleanJson = cleanJson
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

      // ブレース部分のみを抽出
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}') + 1;
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleanJson = cleanJson.substring(jsonStart, jsonEnd);
      }

      // 未引用の分数値 (例: 1/2, 1 1/2) を文字列として扱う
      cleanJson = cleanJson.replace(/:\s*(-?\d[\d\s]*\/\s*\d[\d\s]*)/g, (_, value) => {
        const normalized = value.replace(/\s+/g, ' ').trim();
        return `: "${normalized}"`;
      });

      const recipeData = JSON.parse(cleanJson);
      
      // データの妥当性チェック
      if (!recipeData.title && !recipeData.ingredients && !recipeData.steps) {
        throw new Error('有効なレシピデータが含まれていません');
      }

      // 材料データの正規化と検証
      if (recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
        recipeData.ingredients = recipeData.ingredients.map(ingredient => 
          this.normalizeIngredient(ingredient)
        );
      }

      // 料理名の推測（空の場合）
      if (!recipeData.title || recipeData.title.trim() === '') {
        recipeData.title = this.inferRecipeTitle(originalText, recipeData.ingredients);
      }

      // 説明の生成（空の場合）
      if (!recipeData.description || recipeData.description.trim() === '') {
        recipeData.description = this.generateDescription(recipeData.ingredients);
      }

      console.log('✅ Gemini解析成功:', {
        title: recipeData.title,
        ingredientsCount: recipeData.ingredients?.length || 0,
        stepsCount: recipeData.steps?.length || 0
      });

      return recipeData;

    } catch (error) {
      console.error('❌ Geminiレスポンス解析エラー:', error);
      console.log('🔄 フォールバック処理に移行');
      return this.fallbackAnalysis(originalText);
    }
  }

  /**
   * 材料データの正規化と検証
   */
  normalizeIngredient(ingredient) {
    if (!ingredient) {
      return { item: '', quantity: '', unit: '', price: '' };
    }

    if (typeof ingredient === 'string') {
      return { item: ingredient, quantity: '', unit: '', price: '' };
    }

    // 材料名のクリーニング
    let item = String(ingredient.item || '').trim();
    if (item.startsWith('**') && item.endsWith('**')) {
      item = item.slice(2, -2).trim();
    }

    return {
      item,
      quantity: ingredient.quantity != null ? String(ingredient.quantity).trim() : '',
      unit: ingredient.unit != null ? String(ingredient.unit).trim() : '',
      price: ingredient.price != null ? String(ingredient.price).trim() : ''
    };
  }

  /**
   * 料理名を推測
   */
  inferRecipeTitle(originalText, ingredients) {
    // 材料から料理名を推測
    if (ingredients && ingredients.length > 0) {
      const items = ingredients.map(ing => ing.item).join(' ');
      
      // 一般的な料理パターン
      if (items.includes('牛乳') && items.includes('コンデンスミルク')) {
        return 'プリン';
      }
      if (items.includes('粉ゼラチン')) {
        return 'ゼリー';
      }
      if (items.includes('グラニュー糖') && items.includes('トリモリン')) {
        return 'お菓子';
      }
    }

    return 'OCR解析レシピ';
  }

  /**
   * 説明を生成
   */
  generateDescription(ingredients) {
    if (!ingredients || ingredients.length === 0) {
      return 'OCRで抽出されたレシピです';
    }

    const itemCount = ingredients.length;
    const hasPrice = ingredients.some(ing => ing.price);
    
    let description = `材料${itemCount}種類のレシピ`;
    if (hasPrice) {
      description += '（価格情報付き）';
    }
    
    return description;
  }

  /**
   * フォールバック解析（Gemini失敗時）
   */
  fallbackAnalysis(extractedText) {
    console.log('🔄 Geminiフォールバック解析を開始');
    
    const lines = extractedText.split('\n').filter(line => line.trim());
    const ingredients = [];
    
    // 材料らしい行を検出
    for (const line of lines) {
      if (this.isIngredientLine(line)) {
        const ingredient = this.parseIngredientLine(line);
        if (ingredient) {
          ingredients.push(ingredient);
        }
      }
    }

    return {
      title: this.inferRecipeTitle(extractedText, ingredients),
      description: this.generateDescription(ingredients),
      servings: 2,
      ingredients: ingredients,
      steps: [],
      notes: ''
    };
  }

  /**
   * 材料行かどうかを判定
   */
  isIngredientLine(line) {
    return line && 
           line.length > 1 && 
           line.match(/\d/) && 
           (line.match(/[gml個本枚大さじ小さじ]/) || line.match(/\d+円/)) &&
           !line.includes('作り方') && 
           !line.includes('手順') &&
           line.length < 100;
  }

  /**
   * 材料行を解析
   */
  parseIngredientLine(line) {
    // パターン1: "材料名 分量単位 価格円"
    const pattern1 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s+(\d+)円$/);
    if (pattern1) {
      return {
        item: pattern1[1].trim(),
        quantity: pattern1[2].trim(),
        unit: pattern1[3].trim(),
        price: pattern1[4].trim()
      };
    }

    // パターン2: "材料名 価格円"
    const pattern2 = line.match(/^(.+?)\s+(\d+)円$/);
    if (pattern2) {
      return {
        item: pattern2[1].trim(),
        quantity: '',
        unit: '',
        price: pattern2[2].trim()
      };
    }

    // パターン3: "材料名 分量単位"
    const pattern3 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/);
    if (pattern3) {
      return {
        item: pattern3[1].trim(),
        quantity: pattern3[2].trim(),
        unit: pattern3[3].trim(),
        price: ''
      };
    }

    // パターン4: "材料名 分量"
    const pattern4 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)$/);
    if (pattern4) {
      return {
        item: pattern4[1].trim(),
        quantity: pattern4[2].trim(),
        unit: '',
        price: ''
      };
    }

    return null;
  }

  /**
   * 解析統計を取得
   */
  getAnalysisStats(recipeData) {
    return {
      provider: this.provider,
      model: this.model,
      ingredientsCount: recipeData.ingredients?.length || 0,
      stepsCount: recipeData.steps?.length || 0,
      hasTitle: !!recipeData.title,
      hasDescription: !!recipeData.description,
      processingTime: Date.now() // 実際の処理時間を測定する場合は実装
    };
  }
}

// グローバルに公開
window.GeminiAnalyzer = GeminiAnalyzer;
