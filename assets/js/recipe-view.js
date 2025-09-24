// レシピ表示画面専用の機能

// 設定を読み込む関数
const getSettings = () => {
  try {
    const stored = localStorage.getItem('recipe-box-settings');
    const defaultSettings = {
      aiApi: 'groq',
      groqModel: 'gemini-1.5-flash'
    };
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch (error) {
    console.error('設定の読み込みエラー:', error);
    return {
      aiApi: 'groq',
      groqModel: 'gemini-1.5-flash'
    };
  }
};

// 現在のGroqモデルを取得する関数
const getCurrentGroqModel = () => {
  const settings = getSettings();
  const model = settings.groqModel || 'gemini-1.5-flash';
  
  // 無効なモデルの場合はデフォルトに戻す
  const validModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'gemma2-9b-it', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  if (!validModels.includes(model)) {
    console.warn('⚠️ 無効なモデルです。Gemini 1.5 Flashに切り替えます。');
    return 'gemini-1.5-flash';
  }
  
  return model;
};

// レシピ表示の初期化
async function initRecipeView() {
  const id = getRecipeId();
  if (!id) {
    alert('レシピIDが見つかりません');
    return;
  }

  debugLog('レシピ表示を初期化中 - ID:', id);
  
  try {
    // レシピデータを取得
    const recipe = await getRecipe(id);
    if (!recipe) {
      alert('レシピが見つかりません');
      return;
    }

    // 元のレシピIDを保存（翻訳データ保存時に使用）
    window.originalRecipeId = id;
    debugLog('元のレシピIDを保存:', id);

    // タイトルを設定
    setElementText('recipeTitle', recipe.title || '無題のレシピ');
    
    // 言語タグを確認して自動翻訳
    const languageTag = recipe.tags?.find(tag => tag.startsWith('翻訳:'));
    if (languageTag) {
      const targetLanguage = languageTag.replace('翻訳:', '');
      debugLog('言語タグを検出:', languageTag, '対象言語:', targetLanguage);
      // 自動翻訳を実行
      await autoTranslateRecipe(targetLanguage);
      return; // 自動翻訳の場合は早期リターン
    }
    
    // HTML形式のレシピかどうかチェック
    if (recipe.display_format === 'html') {
      debugLog('HTML形式のレシピを読み込み中...');
      await loadHTMLFormatRecipe(recipe);
      return; // HTML形式の場合は早期リターン
    }
    
    // 通常のレシピ表示
    await displayNormalRecipe(recipe, id);
    
  } catch (error) {
    errorLog('レシピ表示初期化エラー:', error);
    alert('レシピの読み込みに失敗しました');
  }
}

// 通常のレシピ表示
async function displayNormalRecipe(recipe, id) {
  // グローバル変数にレシピデータを設定
  window.currentRecipe = recipe;
  console.log('✅ window.currentRecipeを設定しました:', window.currentRecipe);
  
  // メタ情報の表示
  const metaEl = getElement('meta');
  if (metaEl) {
    const dt = recipe.updated_at || recipe.created_at;
    metaEl.textContent = dt ? `更新: ${formatDate(dt)}` : '';
  }

  // カテゴリーとタグの表示
  displayCategoryAndTags(recipe);
  
  // 画像の表示
  displayRecipeImage(recipe);
  
  // 翻訳データの取得・表示
  await displayTranslationData(id);
  
  // 2言語表示レイアウトの表示（翻訳レイアウト情報がある場合）
  if (recipe.translation_layout && recipe.translation_layout.dual_language_layout) {
    displayDualLanguageLayout(recipe);
  }
  
  // 通常の材料・手順表示（翻訳データがない場合）
  await displayNormalIngredientsAndSteps(id);
}

// カテゴリーとタグの表示
function displayCategoryAndTags(recipe) {
  const categoryDisplay = getElement('categoryDisplay');
  const categoryText = getElement('categoryText');
  const tagsDisplay = getElement('tagsDisplay');
  const tagsContainer = getElement('tagsContainer');
  
  // カテゴリー表示
  if (recipe.category && recipe.category.trim()) {
    categoryText.textContent = recipe.category;
    categoryDisplay.style.display = 'block';
  } else {
    categoryDisplay.style.display = 'none';
  }
  
  // タグ表示
  if (recipe.tags && recipe.tags.length > 0) {
    tagsContainer.innerHTML = recipe.tags.map(tag => 
      `<span class="tag">${escapeHtml(tag)}</span>`
    ).join('');
    tagsDisplay.style.display = 'block';
  } else {
    tagsDisplay.style.display = 'none';
  }
  
  // 翻訳レイアウト情報の表示
  displayTranslationLayoutInfo(recipe);
}

// 翻訳レイアウト情報の表示
function displayTranslationLayoutInfo(recipe) {
  const translationInfo = getElement('translationInfo');
  
  if (!translationInfo) {
    // 翻訳情報表示エリアが存在しない場合は作成
    const recipeHeader = getElement('recipeHeader');
    if (recipeHeader && recipe.translation_layout) {
      const translationDiv = document.createElement('div');
      translationDiv.id = 'translationInfo';
      translationDiv.className = 'translation-layout-info';
      
      // 双言語レイアウトの場合は特別な表示
      if (recipe.translation_layout.dual_language_layout) {
        translationDiv.innerHTML = `
          <div class="translation-info-card">
            <h4><i class="fas fa-language"></i> 双言語翻訳レイアウト</h4>
            <p><strong>翻訳言語:</strong> ${recipe.translation_layout.translation_language}</p>
            <p><strong>翻訳日時:</strong> ${new Date(recipe.translation_layout.translation_date).toLocaleString('ja-JP')}</p>
            <p><strong>元レシピID:</strong> ${recipe.translation_layout.original_recipe_id}</p>
            <p><strong>レイアウト保持:</strong> ${recipe.translation_layout.layout_preserved ? '✅ 保持済み' : '❌ 未保持'}</p>
            <p><strong>双言語表示:</strong> ${recipe.translation_layout.dual_language_layout ? '✅ 有効' : '❌ 無効'}</p>
          </div>
        `;
      } else {
        translationDiv.innerHTML = `
          <div class="translation-info-card">
            <h4><i class="fas fa-language"></i> 翻訳レイアウト情報</h4>
            <p><strong>翻訳言語:</strong> ${recipe.translation_layout.translation_language}</p>
            <p><strong>翻訳日時:</strong> ${new Date(recipe.translation_layout.translation_date).toLocaleString('ja-JP')}</p>
            <p><strong>元レシピID:</strong> ${recipe.translation_layout.original_recipe_id}</p>
            <p><strong>レイアウト保持:</strong> ${recipe.translation_layout.layout_preserved ? '✅ 保持済み' : '❌ 未保持'}</p>
          </div>
        `;
      }
      recipeHeader.appendChild(translationDiv);
    }
  } else if (recipe.translation_layout) {
    // 既存の翻訳情報エリアを更新
    if (recipe.translation_layout.dual_language_layout) {
      translationInfo.innerHTML = `
        <div class="translation-info-card">
          <h4><i class="fas fa-language"></i> 双言語翻訳レイアウト</h4>
          <p><strong>翻訳言語:</strong> ${recipe.translation_layout.translation_language}</p>
          <p><strong>翻訳日時:</strong> ${new Date(recipe.translation_layout.translation_date).toLocaleString('ja-JP')}</p>
          <p><strong>元レシピID:</strong> ${recipe.translation_layout.original_recipe_id}</p>
          <p><strong>レイアウト保持:</strong> ${recipe.translation_layout.layout_preserved ? '✅ 保持済み' : '❌ 未保持'}</p>
          <p><strong>双言語表示:</strong> ${recipe.translation_layout.dual_language_layout ? '✅ 有効' : '❌ 無効'}</p>
        </div>
      `;
    } else {
      translationInfo.innerHTML = `
        <div class="translation-info-card">
          <h4><i class="fas fa-language"></i> 翻訳レイアウト情報</h4>
          <p><strong>翻訳言語:</strong> ${recipe.translation_layout.translation_language}</p>
          <p><strong>翻訳日時:</strong> ${new Date(recipe.translation_layout.translation_date).toLocaleString('ja-JP')}</p>
          <p><strong>元レシピID:</strong> ${recipe.translation_layout.original_recipe_id}</p>
          <p><strong>レイアウト保持:</strong> ${recipe.translation_layout.layout_preserved ? '✅ 保持済み' : '❌ 未保持'}</p>
        </div>
      `;
    }
    translationInfo.style.display = 'block';
  } else {
    // 翻訳情報がない場合は非表示
    if (translationInfo) {
      translationInfo.style.display = 'none';
    }
  }
}

// 2言語表示レイアウトの表示
function displayDualLanguageLayout(recipe) {
  console.log('🌐 2言語表示レイアウトを表示:', recipe.translation_layout);
  
  // レシピタイトルの2言語表示
  const recipeTitle = getElement('recipeTitle');
  if (recipeTitle && recipe.translation_layout.translated_title) {
    recipeTitle.innerHTML = `
      <div class="translated-title">
        <span class="translated-text">${escapeHtml(recipe.translation_layout.translated_title)}</span>
        <span class="original-text">（${escapeHtml(recipe.translation_layout.original_title)}）</span>
      </div>
    `;
  }
  
  // レシピ説明の2言語表示
  const recipeDescription = getElement('recipeDescription');
  if (recipeDescription && recipe.translation_layout.translated_description) {
    recipeDescription.innerHTML = `
      <div class="translated-description">
        <div class="translated-text">${escapeHtml(recipe.translation_layout.translated_description)}</div>
        <div class="original-text">（${escapeHtml(recipe.translation_layout.original_description)}）</div>
      </div>
    `;
  }
  
  // 2言語表示レイアウトのスタイルを適用
  applyDualLanguageStyles();
  
  // 2言語表示レイアウトの手順表示
  displayDualLanguageSteps(recipe);
}

// 2言語表示レイアウトの手順表示
async function displayDualLanguageSteps(recipe) {
  console.log('📝 2言語表示レイアウトの手順表示開始');
  
  // 翻訳手順データを取得
  const translatedSteps = await getTranslatedSteps(recipe.id);
  // 元の手順データを取得
  const originalSteps = await getOriginalSteps(recipe.translation_layout.original_recipe_id);
  
  if (translatedSteps && originalSteps) {
    // 2言語表示レイアウトの手順を表示
    displayDualLanguageStepsLayout(translatedSteps, originalSteps, recipe.translation_layout.translation_language);
  }
}

// 翻訳手順データの取得
async function getTranslatedSteps(recipeId) {
  try {
    const { data: steps, error } = await sb
      .from('recipe_steps')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('step_number', { ascending: true });
    
    if (error) {
      console.error('翻訳手順データ取得エラー:', error);
      return null;
    }
    
    return steps;
  } catch (error) {
    console.error('翻訳手順データ取得エラー:', error);
    return null;
  }
}

// 元の手順データの取得
async function getOriginalSteps(originalRecipeId) {
  try {
    const { data: steps, error } = await sb
      .from('recipe_steps')
      .select('*')
      .eq('recipe_id', originalRecipeId)
      .order('step_number', { ascending: true });
    
    if (error) {
      console.error('元の手順データ取得エラー:', error);
      return null;
    }
    
    return steps;
  } catch (error) {
    console.error('元の手順データ取得エラー:', error);
    return null;
  }
}

// 2言語表示レイアウトの手順表示
function displayDualLanguageStepsLayout(translatedSteps, originalSteps, language) {
  console.log('📝 2言語表示レイアウトの手順表示:', { translatedSteps, originalSteps, language });
  
  const stepsContainer = getElement('stepsContainer');
  if (!stepsContainer) {
    console.error('手順コンテナが見つかりません');
    return;
  }
  
  // 言語名のマッピング
  const languageNames = {
    'en': 'English',
    'fr': 'French',
    'it': 'Italian',
    'es': 'Spanish',
    'de': 'German',
    'zh': 'Chinese',
    'ko': 'Korean'
  };
  
  const languageName = languageNames[language] || language;
  
  // 2言語表示レイアウトの手順HTMLを生成
  let stepsHTML = `
    <div class="dual-language-steps">
      <h3 class="steps-title">
        <i class="fas fa-list-ol"></i>
        ${languageName} Instructions
      </h3>
      <div class="translated-steps">
  `;
  
  // 翻訳手順を表示
  translatedSteps.forEach((step, index) => {
    stepsHTML += `
      <div class="step-item">
        <div class="step-number">${index + 1}</div>
        <div class="step-content">
          <div class="translated-text">${escapeHtml(step.instruction)}</div>
        </div>
      </div>
    `;
  });
  
  stepsHTML += `
      </div>
      
      <h3 class="steps-title">
        <i class="fas fa-list-ol"></i>
        Instrucciones originales
      </h3>
      <div class="original-steps">
  `;
  
  // 元の手順を表示
  originalSteps.forEach((step, index) => {
    stepsHTML += `
      <div class="step-item">
        <div class="step-number">手順${index + 1}</div>
        <div class="step-content">
          <div class="original-text">${escapeHtml(step.instruction)}</div>
        </div>
      </div>
    `;
  });
  
  stepsHTML += `
      </div>
    </div>
  `;
  
  stepsContainer.innerHTML = stepsHTML;
  
  // 2言語表示レイアウトのスタイルを適用
  applyDualLanguageStepsStyles();
}

// 2言語表示レイアウトの手順スタイル適用
function applyDualLanguageStepsStyles() {
  // 既存のスタイルが適用されていない場合のみ追加
  if (!document.getElementById('dual-language-steps-styles')) {
    const style = document.createElement('style');
    style.id = 'dual-language-steps-styles';
    style.textContent = `
      .dual-language-steps {
        margin: 2rem 0;
        padding: 1.5rem;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      }
      
      .steps-title {
        color: #333;
        margin: 0 0 1rem 0;
        font-size: 1.2rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border-bottom: 2px solid #667eea;
        padding-bottom: 0.5rem;
      }
      
      .translated-steps, .original-steps {
        margin-bottom: 2rem;
      }
      
      .step-item {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 1rem;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 8px;
        border-left: 4px solid #667eea;
        transition: all 0.2s ease;
      }
      
      .step-item:hover {
        background: rgba(255, 255, 255, 1);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      
      .step-number {
        background: #667eea;
        color: white;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.9rem;
        flex-shrink: 0;
      }
      
      .step-content {
        flex: 1;
      }
      
      .translated-text {
        font-size: 1rem;
        color: #333;
        line-height: 1.6;
      }
      
      .original-text {
        font-size: 0.9rem;
        color: #666;
        line-height: 1.5;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }
}

// 双言語レイアウトのスタイル適用
function applyDualLanguageStyles() {
  // 既存のスタイルが適用されていない場合のみ追加
  if (!document.getElementById('dual-language-styles')) {
    const style = document.createElement('style');
    style.id = 'dual-language-styles';
    style.textContent = `
      .translated-title {
        font-size: 0.9em;
        color: #ffffff;
        font-style: italic;
        margin-top: 0.25rem;
        margin-bottom: 0.5rem;
        padding-left: 0.5rem;
        border-left: 3px solid #ddd;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .translated-text {
        font-size: 1em;
      }
      
      .original-text {
        font-size: 0.7em;
        color: #cccccc;
        margin-left: 0.5rem;
      }
      
      .translated-description {
        margin: 1rem 0;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        border-left: 4px solid #667eea;
      }
    `;
    document.head.appendChild(style);
  }
}

// レシピ画像の表示
function displayRecipeImage(recipe) {
  const recipeImage = getElement('recipeImage');
  const recipeImageContainer = getElement('recipeImageContainer');
  
  if (recipe.image_url && recipe.image_url.trim()) {
    recipeImage.src = recipe.image_url;
    recipeImageContainer.style.display = 'flex';
    debugLog('📸 レシピ画像を表示しました');
  } else {
    recipeImageContainer.style.display = 'none';
    console.warn('⚠️ 画像データがありません');
  }
}

// 翻訳データの表示
async function displayTranslationData(id) {
  let translationRecipes = null;
  try {
    debugLog('翻訳データを取得中... recipe_id:', id);
    
    // 翻訳レシピテーブルから翻訳データを取得
    translationRecipes = await getTranslationRecipes(id);
    debugLog('翻訳レシピ取得結果:', translationRecipes);
    
    if (translationRecipes && translationRecipes.length > 0) {
      debugLog('翻訳データが見つかりました:', translationRecipes[0]);
      await displayTranslatedRecipe(translationRecipes[0]);
      return true; // 翻訳データが表示された
    } else {
      debugLog('翻訳データが見つかりませんでした');
    }
  } catch (error) {
    errorLog('翻訳データ取得エラー:', error);
  }
  
  return false; // 翻訳データが表示されなかった
}

// 通常の材料・手順表示
async function displayNormalIngredientsAndSteps(id) {
  // 材料の表示
  await displayIngredients(id);
  
  // 手順の表示
  await displaySteps(id);
}

// 材料の表示
async function displayIngredients(id) {
  const ingredientsEl = getElement('ingredients');
  if (!ingredientsEl) return;
  
  try {
    debugLog('材料データを取得中 - ID:', id);
    const ingredients = await getRecipeIngredients(id);
    debugLog('取得した材料データ:', ingredients);
    if (ingredients && ingredients.length > 0) {
      const columnMapping = {
        'position': '番号',
        'item': '材料名',
        'quantity': '分量',
        'unit': '単位',
        'price': '価格',
        'html_content': 'HTML形式'
      };
      
      const cols = ['position', 'item', 'quantity', 'unit'].filter(k => ingredients[0].hasOwnProperty(k));
      const thead = `<thead><tr>${cols.map(c=>`<th>${escapeHtml(columnMapping[c] || c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${ingredients.map(row=>`<tr>${cols.map(c=>`<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
      ingredientsEl.innerHTML = `<div style="overflow-x: auto; width: 100%;"><table class="table">${thead}${tbody}</table></div>`;
    } else {
      debugLog('材料データが空です');
      ingredientsEl.innerHTML = '<div class="muted">未登録</div>';
    }
  } catch (error) {
    errorLog('材料表示エラー:', error);
    ingredientsEl.innerHTML = '<div class="muted">エラーが発生しました</div>';
  }
}

// 手順の表示
async function displaySteps(id) {
  const stepsEl = getElement('steps');
  if (!stepsEl) return;
  
  try {
    debugLog('手順データを取得中 - ID:', id);
    const steps = await getRecipeSteps(id);
    debugLog('取得した手順データ:', steps);
    if (steps && steps.length > 0) {
      const stepsHTML = steps.map((step, index) => `
        <li>
          <span class="step-number">${index + 1}</span>
          <span class="step-text">${escapeHtml(step.instruction || step.step || step.description || step.body || '')}</span>
        </li>
      `).join('');
      stepsEl.innerHTML = `<ol>${stepsHTML}</ol>`;
    } else {
      debugLog('手順データが空です');
      stepsEl.innerHTML = '<div class="muted">未登録</div>';
    }
  } catch (error) {
    errorLog('手順表示エラー:', error);
    stepsEl.innerHTML = '<div class="muted">エラーが発生しました</div>';
  }
}

// HTML形式レシピの読み込み
async function loadHTMLFormatRecipe(recipe) {
  debugLog('HTML形式のレシピを読み込み中...');
  
  // タイトル
  setElementText('recipeTitle', recipe.title || '無題のレシピ');
  
  // 説明（HTML形式）
  const notesEl = getElement('notes');
  if (notesEl && recipe.notes) {
    notesEl.innerHTML = recipe.notes;
  }
  
  // 材料（HTML形式）
  const ingredientsEl = getElement('ingredients');
  if (ingredientsEl && recipe.ingredients) {
    ingredientsEl.innerHTML = recipe.ingredients;
  }
  
  // 手順（HTML形式）
  const stepsEl = getElement('steps');
  if (stepsEl && recipe.steps) {
    stepsEl.innerHTML = recipe.steps;
  }
  
  // メタ情報
  const metaEl = getElement('meta');
  if (metaEl) {
    const dt = recipe.updated_at || recipe.created_at;
    metaEl.textContent = dt ? `更新: ${formatDate(dt)}` : '';
  }
  
  // カテゴリーとタグ
  displayCategoryAndTags(recipe);
  
  // 画像
  displayRecipeImage(recipe);
}

// 翻訳ポップアップの表示
function showTranslatePopup() {
  const popup = getElement('translatePopup');
  if (popup) popup.style.display = 'block';
}

// 翻訳ポップアップの非表示
function closeTranslatePopup() {
  const popup = getElement('translatePopup');
  if (popup) popup.style.display = 'none';
}

// 翻訳ローディングの表示
function showTranslateLoading() {
  const loading = getElement('translateLoading');
  if (loading) loading.style.display = 'block';
}

// 翻訳ローディングの非表示
function hideTranslateLoading() {
  const loading = getElement('translateLoading');
  if (loading) loading.style.display = 'none';
}

// 翻訳開始
async function startTranslation(language) {
  debugLog('翻訳開始:', language);
  
  // 翻訳開始時に「翻訳」カテゴリを自動追加
  if (typeof selectedCategories !== 'undefined' && Array.isArray(selectedCategories)) {
    if (!selectedCategories.includes('翻訳')) {
      selectedCategories.push('翻訳');
      console.log('✅ 翻訳機能使用により「翻訳」カテゴリを自動追加しました');
      console.log('現在の選択されたカテゴリ:', selectedCategories);
      
      // UIを更新（updateCategorySelect関数が存在する場合）
      if (typeof updateCategorySelect === 'function') {
        updateCategorySelect();
      }
    } else {
      console.log('✅ 「翻訳」カテゴリは既に選択されています');
    }
  }
  
  showTranslateLoading();
  
  try {
    // レシピデータを取得
    const recipe = await getRecipe(window.originalRecipeId);
    if (!recipe) {
      throw new Error('レシピデータが見つかりません');
    }
    
    // 材料と手順を取得
    const ingredients = await getRecipeIngredients(window.originalRecipeId);
    const steps = await getRecipeSteps(window.originalRecipeId);
    
    // 翻訳データを作成
    const recipeData = {
      title: recipe.title,
      description: recipe.notes,
      ingredients: ingredients.map(ing => ({
        item: ing.item,
        quantity: ing.quantity,
        unit: ing.unit
      })),
      steps: steps.map(step => step.instruction || step.step || step.description || step.body || '')
    };
    
    // 翻訳実行
    await translateRecipe(recipeData, language);
    
  } catch (error) {
    errorLog('翻訳エラー:', error);
    alert('翻訳に失敗しました: ' + error.message);
  } finally {
    hideTranslateLoading();
    closeTranslatePopup();
  }
}

// レシピの翻訳
async function translateRecipe(recipeData, targetLanguage) {
  debugLog('レシピ翻訳開始:', { recipeData, targetLanguage });
  
  try {
    // 翻訳プロンプトを作成
    const prompt = createTranslationPrompt(recipeData, targetLanguage);
    
    // Groq APIを呼び出し
    const response = await invokeGroqAPI(prompt);
    
    // 翻訳結果を解析
    const translatedData = parseTranslatedResponse(response);
    
    // 翻訳結果を表示
    await showTranslatedResult(translatedData, targetLanguage);
    
  } catch (error) {
    errorLog('翻訳処理エラー:', error);
    throw error;
  }
}

// 翻訳プロンプトの作成
function createTranslationPrompt(recipeData, targetLanguage) {
  const languageNames = {
    'en': '英語',
    'fr': 'フランス語',
    'de': 'ドイツ語',
    'it': 'イタリア語',
    'es': 'スペイン語',
    'zh': '中国語'
  };
  
  const targetLanguageName = languageNames[targetLanguage] || targetLanguage;
  
  return `
以下のレシピを${targetLanguageName}に翻訳してください。

タイトル: ${recipeData.title}
説明: ${recipeData.description}

材料:
${recipeData.ingredients.map(ing => `- ${ing.item}: ${ing.quantity} ${ing.unit}`).join('\n')}

手順:
${recipeData.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

翻訳結果は以下のJSON形式で返してください:
{
  "title": "翻訳されたタイトル",
  "description": "翻訳された説明",
  "ingredients": [
    {"item": "翻訳された材料名", "quantity": "分量", "unit": "単位"}
  ],
  "steps": ["翻訳された手順1", "翻訳された手順2", ...]
}
`;
}

// Groq APIの呼び出し
async function invokeGroqAPI(prompt) {
  const { data, error } = await sb.functions.invoke('call-groq-api', {
    body: {
      prompt,
      model: getCurrentGroqModel(),
      maxTokens: 4096,
      temperature: 0.1
    }
  });

  if (error || !data?.success) {
    throw new Error(`API呼び出しエラー: ${data?.error || error?.message || 'unknown'}`);
  }

  return data.content || '';
}

// 翻訳レスポンスの解析
function parseTranslatedResponse(responseText) {
  try {
    // JSON部分を抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON形式のレスポンスが見つかりません');
    }
    
    const translatedData = JSON.parse(jsonMatch[0]);
    
    // 必須フィールドのチェック
    if (!translatedData.title || !translatedData.ingredients || !translatedData.steps) {
      throw new Error('翻訳データが不完全です');
    }
    
    return translatedData;
  } catch (error) {
    errorLog('翻訳レスポンス解析エラー:', error);
    throw new Error('翻訳結果の解析に失敗しました');
  }
}

// 翻訳結果の表示
async function showTranslatedResult(translatedData, language) {
  debugLog('翻訳結果を表示中:', translatedData);
  
  // タイトルを翻訳版に変更
  const titleEl = getElement('recipeTitle');
  if (titleEl) {
    titleEl.textContent = translatedData.title;
    
    // 翻訳タイトル要素に元のタイトルを表示
    const translatedTitleEl = getElement('translatedTitle');
    if (translatedTitleEl) {
      const flagEmoji = getFlagEmoji(language);
      translatedTitleEl.innerHTML = `
        <span class="original-text">（${translatedData.originalTitle || ''}）</span>
        <span class="flag-emoji">${flagEmoji}</span>
      `;
      translatedTitleEl.style.display = 'block';
    }
  }
  
  // 説明を翻訳版に変更
  if (translatedData.description) {
    const notesEl = getElement('notes');
    if (notesEl) {
      notesEl.innerHTML = `
        <div class="translated-description">
          <div class="translated-text">${escapeHtml(translatedData.description)}</div>
          <div class="original-text">（${escapeHtml(translatedData.originalDescription || '')}）</div>
        </div>
      `;
    }
  }
  
  // 翻訳された材料を表示
  if (translatedData.ingredients && translatedData.ingredients.length > 0) {
    const ingredientsEl = getElement('ingredients');
    if (ingredientsEl) {
      const translations = uiTranslations[language] || {};
      const translatedIngredientsHTML = `
        <div class="translated-section">
          <h4>${translations.ingredients || 'Ingredients'}</h4>
          <div style="overflow-x: auto; width: 100%;">
            <table class="table">
              <thead>
                <tr>
                  <th>${translations.number || '番号'}</th>
                  <th>${translations.ingredient_name || '材料名'}</th>
                  <th>${translations.quantity || '分量'}</th>
                  <th>${translations.unit || '単位'}</th>
                </tr>
              </thead>
              <tbody>
                ${translatedData.ingredients.map((ing, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(ing.item || '')}</td>
                    <td>${escapeHtml(ing.quantity || '')}</td>
                    <td>${escapeHtml(ing.unit || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      ingredientsEl.innerHTML = translatedIngredientsHTML;
    }
  }
  
  // 翻訳された手順を表示
  if (translatedData.steps && translatedData.steps.length > 0) {
    const stepsEl = getElement('steps');
    if (stepsEl) {
      const translations = uiTranslations[language] || {};
      const translatedStepsHTML = `
        <div class="translated-section">
          <h4>${translations.instructions || 'Instructions'}</h4>
          <ol>
            ${translatedData.steps.map(step => `
              <li>${escapeHtml(step)}</li>
            `).join('')}
          </ol>
        </div>
      `;
      stepsEl.innerHTML = translatedStepsHTML;
    }
  }
  
  // UI要素を翻訳
  translateUI(language);
  
  // 翻訳完了 - 自動的に翻訳版を保存
  debugLog('翻訳表示完了。自動的に翻訳版を保存します。');
  
  // 自動的に翻訳版を保存
  try {
    await saveCombinedRecipe(translatedData, language);
    debugLog('翻訳版を自動保存しました');
  } catch (error) {
    errorLog('翻訳版自動保存エラー:', error);
    alert('翻訳版の自動保存に失敗しました: ' + error.message);
  }
}

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initRecipeView,
    displayNormalRecipe,
    displayCategoryAndTags,
    displayRecipeImage,
    displayTranslationData,
    displayNormalIngredientsAndSteps,
    displayIngredients,
    displaySteps,
    loadHTMLFormatRecipe,
    showTranslatePopup,
    closeTranslatePopup,
    showTranslateLoading,
    hideTranslateLoading,
    startTranslation,
    translateRecipe,
    createTranslationPrompt,
    invokeGroqAPI,
    parseTranslatedResponse,
    showTranslatedResult,
    showReadableText,
    closeReadableTextModal,
    copyReadableText
  };

  // 読みやすいテキスト表示機能
  window.showReadableText = function(recipe) {
    console.log('📝 読みやすいテキスト表示開始:', recipe);
    
    if (!recipe.readable_text) {
      console.log('📝 読みやすいテキストが保存されていません。動的に生成します。');
      
      // 動的に読みやすいテキストを生成
      const readableTextData = {
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
        notes: recipe.notes
      };
      
      const generatedText = window.generateReadableText ? 
        window.generateReadableText(readableTextData) : 
        generateReadableTextFallback(readableTextData);
      
      console.log('📝 動的に生成された読みやすいテキスト:', generatedText);
      
      const modal = document.getElementById('readableTextModal');
      const content = document.getElementById('readableTextContent');
      
      if (modal && content) {
        content.textContent = generatedText;
        modal.style.display = 'flex';
      }
      return;
    }
    
    const modal = document.getElementById('readableTextModal');
    const content = document.getElementById('readableTextContent');
    
    if (modal && content) {
      content.textContent = recipe.readable_text;
      modal.style.display = 'flex';
    }
  }
  
  // フォールバック用の読みやすいテキスト生成関数
  function generateReadableTextFallback(recipeData) {
    let text = `# ${recipeData.title}\n\n`;
    
    if (recipeData.description) {
      text += `## 説明\n${recipeData.description}\n\n`;
    }
    
    if (recipeData.servings) {
      text += `## 人数\n${recipeData.servings}人分\n\n`;
    }
    
    if (recipeData.ingredients && recipeData.ingredients.length > 0) {
      text += `## 材料\n`;
      recipeData.ingredients.forEach(ingredient => {
        text += `- ${ingredient.item}: ${ingredient.quantity}${ingredient.unit}\n`;
      });
      text += `\n`;
    }
    
    if (recipeData.steps && recipeData.steps.length > 0) {
      text += `## 作り方\n`;
      recipeData.steps.forEach((step, index) => {
        text += `### ステップ${index + 1}\n${step.step}\n\n`;
      });
    }
    
    if (recipeData.notes) {
      text += `## メモ\n${recipeData.notes}\n`;
    }
    
    return text;
  }

  window.closeReadableTextModal = function() {
    const modal = document.getElementById('readableTextModal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  window.copyReadableText = function() {
    const content = document.getElementById('readableTextContent');
    if (content) {
      navigator.clipboard.writeText(content.textContent).then(() => {
        alert('読みやすいテキストをクリップボードにコピーしました！');
      }).catch(err => {
        console.error('コピーに失敗しました:', err);
        alert('コピーに失敗しました。');
      });
    }
  };
}

// グローバル関数を明示的に設定
window.showReadableText = window.showReadableText || function(recipe) {
  console.log('📝 読みやすいテキスト表示開始:', recipe);
  
  if (!recipe.readable_text) {
    console.log('📝 読みやすいテキストが保存されていません。動的に生成します。');
    
    // 動的に読みやすいテキストを生成
    const readableTextData = {
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      notes: recipe.notes
    };
    
    const generatedText = window.generateReadableText ? 
      window.generateReadableText(readableTextData) : 
      generateReadableTextFallback(readableTextData);
    
    console.log('📝 動的に生成された読みやすいテキスト:', generatedText);
    
    const modal = document.getElementById('readableTextModal');
    const content = document.getElementById('readableTextContent');
    
    if (modal && content) {
      content.textContent = generatedText;
      modal.style.display = 'flex';
    }
    return;
  }
  
  const modal = document.getElementById('readableTextModal');
  const content = document.getElementById('readableTextContent');
  
  if (modal && content) {
    content.textContent = recipe.readable_text;
    modal.style.display = 'flex';
  }
};

window.closeReadableTextModal = window.closeReadableTextModal || function() {
  const modal = document.getElementById('readableTextModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

window.copyReadableText = window.copyReadableText || function() {
  const content = document.getElementById('readableTextContent');
  if (content) {
    navigator.clipboard.writeText(content.textContent).then(() => {
      alert('読みやすいテキストをクリップボードにコピーしました！');
    }).catch(err => {
      console.error('コピーに失敗しました:', err);
      alert('コピーに失敗しました。');
    });
  }
};

// 編集モードの切り替え
window.toggleReadableTextEdit = window.toggleReadableTextEdit || function() {
  const content = document.getElementById('readableTextContent');
  const editBtn = document.getElementById('readableTextEditBtn');
  const saveBtn = document.getElementById('readableTextSaveBtn');
  const cancelBtn = document.getElementById('readableTextCancelBtn');
  
  if (content && editBtn && saveBtn && cancelBtn) {
    // 編集モードに切り替え
    content.contentEditable = 'true';
    content.style.border = '2px solid #007bff';
    content.style.backgroundColor = '#f8f9fa';
    content.focus();
    
    // ボタンの表示切り替え
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    
    // 元の内容を保存（キャンセル用）
    window.originalReadableText = content.textContent;
  }
};

// 編集を保存
window.saveReadableText = window.saveReadableText || async function() {
  const content = document.getElementById('readableTextContent');
  const editBtn = document.getElementById('readableTextEditBtn');
  const saveBtn = document.getElementById('readableTextSaveBtn');
  const cancelBtn = document.getElementById('readableTextCancelBtn');
  
  if (!content || !window.currentRecipe) {
    alert('レシピデータが読み込まれていません。');
    return;
  }
  
  try {
    const updatedText = content.textContent.trim();
    
    // Supabaseに保存
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('recipes')
      .update({ readable_text: updatedText })
      .eq('id', window.currentRecipe.id);
    
    if (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + error.message);
      return;
    }
    
    // 現在のレシピデータを更新
    window.currentRecipe.readable_text = updatedText;
    
    // 編集モードを終了
    content.contentEditable = 'false';
    content.style.border = '1px solid #e1e8ed';
    content.style.backgroundColor = '#ffffff';
    
    // ボタンの表示切り替え
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    
    alert('読みやすいテキストを保存しました！');
    
  } catch (error) {
    console.error('保存エラー:', error);
    alert('保存に失敗しました: ' + error.message);
  }
};

// 編集をキャンセル
window.cancelReadableTextEdit = window.cancelReadableTextEdit || function() {
  const content = document.getElementById('readableTextContent');
  const editBtn = document.getElementById('readableTextEditBtn');
  const saveBtn = document.getElementById('readableTextSaveBtn');
  const cancelBtn = document.getElementById('readableTextCancelBtn');
  
  if (content && editBtn && saveBtn && cancelBtn) {
    // 元の内容に戻す
    if (window.originalReadableText !== undefined) {
      content.textContent = window.originalReadableText;
    }
    
    // 編集モードを終了
    content.contentEditable = 'false';
    content.style.border = '1px solid #e1e8ed';
    content.style.backgroundColor = '#ffffff';
    
    // ボタンの表示切り替え
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
  }
};

// フォールバック用の読みやすいテキスト生成関数（Geminiスタイル）
function generateReadableTextFallback(recipeData) {
  let text = `${recipeData.title}\n\n`;
  
  if (recipeData.description) {
    text += `${recipeData.description}\n\n`;
  }
  
  if (recipeData.servings) {
    text += `人数: ${recipeData.servings}人分\n\n`;
  }
  
  if (recipeData.ingredients && recipeData.ingredients.length > 0) {
    text += `材料:\n`;
    recipeData.ingredients.forEach(ingredient => {
      text += `- ${ingredient.item}: ${ingredient.quantity}${ingredient.unit}\n`;
    });
    text += `\n`;
  }
  
  if (recipeData.steps && recipeData.steps.length > 0) {
    recipeData.steps.forEach((step, index) => {
      text += `ステップ${index + 1}:\n${step.step}\n\n`;
    });
  }
  
  if (recipeData.notes) {
    text += `メモ:\n${recipeData.notes}\n`;
  }
  
  return text;
}

// グローバル関数を明示的に設定
window.toggleReadableTextEdit = window.toggleReadableTextEdit || function() {
  const content = document.getElementById('readableTextContent');
  const editBtn = document.getElementById('readableTextEditBtn');
  const saveBtn = document.getElementById('readableTextSaveBtn');
  const cancelBtn = document.getElementById('readableTextCancelBtn');
  
  if (content && editBtn && saveBtn && cancelBtn) {
    // 編集モードに切り替え
    content.contentEditable = 'true';
    content.style.border = '2px solid #007bff';
    content.style.backgroundColor = '#f8f9fa';
    content.focus();
    
    // ボタンの表示切り替え
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    
    // 元の内容を保存（キャンセル用）
    window.originalReadableText = content.textContent;
  }
};

window.saveReadableText = window.saveReadableText || async function() {
  const content = document.getElementById('readableTextContent');
  const editBtn = document.getElementById('readableTextEditBtn');
  const saveBtn = document.getElementById('readableTextSaveBtn');
  const cancelBtn = document.getElementById('readableTextCancelBtn');
  
  if (!content || !window.currentRecipe) {
    alert('レシピデータが読み込まれていません。');
    return;
  }
  
  try {
    const updatedText = content.textContent.trim();
    
    // Supabaseに保存
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('recipes')
      .update({ readable_text: updatedText })
      .eq('id', window.currentRecipe.id);
    
    if (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + error.message);
      return;
    }
    
    // 現在のレシピデータを更新
    window.currentRecipe.readable_text = updatedText;
    
    // 編集モードを終了
    content.contentEditable = 'false';
    content.style.border = '1px solid #e1e8ed';
    content.style.backgroundColor = '#ffffff';
    
    // ボタンの表示切り替え
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    
    alert('読みやすいテキストを保存しました！');
    
  } catch (error) {
    console.error('保存エラー:', error);
    alert('保存に失敗しました: ' + error.message);
  }
};

window.cancelReadableTextEdit = window.cancelReadableTextEdit || function() {
  const content = document.getElementById('readableTextContent');
  const editBtn = document.getElementById('readableTextEditBtn');
  const saveBtn = document.getElementById('readableTextSaveBtn');
  const cancelBtn = document.getElementById('readableTextCancelBtn');
  
  if (content && editBtn && saveBtn && cancelBtn) {
    // 元の内容に戻す
    if (window.originalReadableText !== undefined) {
      content.textContent = window.originalReadableText;
    }
    
    // 編集モードを終了
    content.contentEditable = 'false';
    content.style.border = '1px solid #e1e8ed';
    content.style.backgroundColor = '#ffffff';
    
    // ボタンの表示切り替え
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
  }
};
