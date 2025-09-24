/**
 * Groq AI 解析モジュール
 * 高速な推論に最適化された材料解析
 */

class GroqAnalyzer {
  constructor() {
    this.provider = 'groq';
    this.model = 'llama-3.1-8b-instant';
    this.maxTokens = 2048;
    this.temperature = 0.1;
    this.endpoint = 'call-groq-api';
  }

  /**
   * OCRテキストをGroqで解析してレシピデータを生成
   */
  async analyzeRecipe(extractedText, supabaseClient) {
    console.log('🚀 Groq AI解析を開始:', this.model);
    
    const prompt = this.createOptimizedPrompt(extractedText);
    
    try {
      const { data: result, error } = await supabaseClient.functions.invoke(this.endpoint, {
        body: {
          prompt,
          model: this.model,
          maxTokens: this.maxTokens,
          temperature: this.temperature
        }
      });

      if (error) {
        throw new Error(`Groq API エラー: ${error.message}`);
      }

      if (!result?.success) {
        throw new Error(`Groq API レスポンスエラー: ${result?.error || 'Unknown error'}`);
      }

      const generatedText = result.content || '';
      console.log('📄 Groq生成テキスト:', generatedText.substring(0, 200) + '...');

      return this.parseGroqResponse(generatedText, extractedText);

    } catch (error) {
      console.error('❌ Groq解析エラー:', error);
      throw error;
    }
  }

  /**
   * Groq用に最適化されたプロンプトを作成
   */
  createOptimizedPrompt(extractedText) {
    return `以下のOCRで抽出したレシピテキストを解析し、JSON形式で構造化してください。

【Groq最適化指示】
- 高速処理に特化した簡潔な解析
- 材料リストの正確な抽出を優先
- 分量・単位・価格の分離に重点
- 不要な説明文は最小限に

【入力テキスト】
${extractedText}

【出力形式】
{
  "title": "料理名",
  "description": "簡潔な説明",
  "servings": 2,
  "ingredients": [
    {"item": "材料名", "quantity": "分量", "unit": "単位", "price": "価格"}
  ],
  "steps": ["手順1", "手順2"],
  "notes": "メモ"
}

【重要】
- 材料は必ずingredients配列に含める
- 価格情報（円）はpriceフィールドに分離
- 分量と単位は正確に分離
- JSONのみ出力（説明文なし）`;
  }

  /**
   * Groqのレスポンスを解析
   */
  parseGroqResponse(generatedText, originalText) {
    try {
      // JSONのクリーンアップ
      let cleanJson = (generatedText || '').trim();

      // ```json ... ``` コードフェンスを除去
      const fencedMatch = cleanJson.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
      if (fencedMatch) {
        cleanJson = fencedMatch[1].trim();
      }

      // 全角引用符を半角に正規化
      cleanJson = cleanJson
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

      // JSONブロックのみ抽出
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}') + 1;
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleanJson = cleanJson.substring(jsonStart, jsonEnd);
      }

      // 未引用の分数値を文字列化
      cleanJson = cleanJson.replace(/:\s*(-?\d[\d\s]*\/\s*\d[\d\s]*)/g, (_, value) => {
        const normalized = value.replace(/\s+/g, ' ').trim();
        return `: "${normalized}"`;
      });

      const recipeData = JSON.parse(cleanJson);
      
      // データの妥当性チェック
      if (!recipeData.title && !recipeData.ingredients && !recipeData.steps) {
        throw new Error('有効なレシピデータが含まれていません');
      }

      // 材料データの正規化
      if (recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
        recipeData.ingredients = recipeData.ingredients.map(ingredient => 
          this.normalizeIngredient(ingredient)
        );
      }

      console.log('✅ Groq解析成功:', {
        title: recipeData.title,
        ingredientsCount: recipeData.ingredients?.length || 0,
        stepsCount: recipeData.steps?.length || 0
      });

      return recipeData;

    } catch (error) {
      console.error('❌ Groqレスポンス解析エラー:', error);
      console.log('🔄 フォールバック処理に移行');
      return this.fallbackAnalysis(originalText);
    }
  }

  /**
   * 材料データの正規化
   */
  normalizeIngredient(ingredient) {
    if (!ingredient) {
      return { item: '', quantity: '', unit: '', price: '' };
    }

    if (typeof ingredient === 'string') {
      return { item: ingredient, quantity: '', unit: '', price: '' };
    }

    return {
      item: String(ingredient.item || '').trim(),
      quantity: ingredient.quantity != null ? String(ingredient.quantity).trim() : '',
      unit: ingredient.unit != null ? String(ingredient.unit).trim() : '',
      price: ingredient.price != null ? String(ingredient.price).trim() : ''
    };
  }

  /**
   * フォールバック解析（Groq失敗時）
   */
  fallbackAnalysis(extractedText) {
    console.log('🔄 Groqフォールバック解析を開始');
    
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
      title: 'Groq解析レシピ',
      description: 'Groq AIで解析されたレシピです',
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
window.GroqAnalyzer = GroqAnalyzer;
