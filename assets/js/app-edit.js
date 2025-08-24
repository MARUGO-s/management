document.addEventListener('DOMContentLoaded', () => {
  if (typeof supabase === 'undefined') {
    alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
    return;
  }

  // 修正点1: APIキーを最新化
  const sb = supabase.createClient(
    "https://ctxyawinblwcbkovfsyj.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q"
  );

  // --- Elements ---
  const titleEl = document.getElementById('title');
  const categoryEl = document.getElementById('category');
  const tagsEl = document.getElementById('tags');
  const servingsEl = document.getElementById('servings');
  const notesEl = document.getElementById('notes');
  const ingredientsEditor = document.getElementById('ingredientsEditor');
  const stepsEditor = document.getElementById('stepsEditor');
  const addIngBtn = document.getElementById('addIng');
  const addStepBtn = document.getElementById('addStep');
  const saveBtn = document.querySelector('.js-save');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const customCategoriesContainer = document.getElementById('customCategories');
  
  // カテゴリー選択モーダル要素
  const categorySelectBtn = document.getElementById('categorySelectBtn');
  const selectedCategoryText = document.getElementById('selectedCategoryText');
  const categoryModal = document.getElementById('category-modal');
  const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
  const categoryOptionsContainer = document.getElementById('category-options');
  const customCategoryGroup = document.getElementById('custom-category-group');
  const customCategoryOptions = document.getElementById('custom-category-options');
  const categoryOkBtn = document.getElementById('category-ok-btn');
  const categoryCancelBtn = document.getElementById('category-cancel-btn');
  
  // タグ選択モーダル要素
  const tagSelectBtn = document.getElementById('tagSelectBtn');
  const selectedTagsText = document.getElementById('selectedTagsText');
  const tagModal = document.getElementById('tag-modal');
  const tagModalCloseBtn = document.getElementById('tag-modal-close-btn');
  const tagOptionsContainer = document.getElementById('tag-options');
  const tagOkBtn = document.getElementById('tag-ok-btn');
  const tagCancelBtn = document.getElementById('tag-cancel-btn');

  // AIモーダル一式（既存UI）
  const aiModal = document.getElementById('ai-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const aiStep1 = document.getElementById('ai-step-1');
  const aiStep2 = document.getElementById('ai-step-2');
  const aiStep3 = document.getElementById('ai-step-3');
  const aiLoading = document.getElementById('ai-loading');
  const genreBtns = document.querySelectorAll('.genre-btn');
  const getSuggestionsBtn = document.getElementById('get-suggestions-btn');
  const menuSuggestionsContainer = document.getElementById('menu-suggestions');
  const generateFullRecipeBtn = document.getElementById('generate-full-recipe-btn');
  const aiCustomRequestEl = document.getElementById('ai-custom-request');
  const recipePreview = document.getElementById('recipe-preview');
  const applyRecipeBtn = document.getElementById('apply-recipe-btn');
  const aiWizardBtn = document.getElementById('ai-wizard-btn');
  
  // APIキー設定モーダル要素
  const apiKeyModal = document.getElementById('api-key-modal');
  const apiKeyModalCloseBtn = document.getElementById('api-key-modal-close-btn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiKeyCancelBtn = document.getElementById('apiKeyCancelBtn');
  const apiKeySaveBtn = document.getElementById('apiKeySaveBtn');
  
  // URL読み込みモーダル要素
  const urlImportBtn = document.getElementById('urlImportBtn');
  const urlImportModal = document.getElementById('url-import-modal');
  const urlImportModalCloseBtn = document.getElementById('url-import-modal-close-btn');
  const urlInput = document.getElementById('urlInput');
  const urlImportCancelBtn = document.getElementById('urlImportCancelBtn');
  const urlImportConfirmBtn = document.getElementById('urlImportConfirmBtn');
  
  // AIモーダル要素の存在確認
  console.log('AIモーダル要素の確認:');
  console.log('aiModal:', aiModal);
  console.log('modalCloseBtn:', modalCloseBtn);
  console.log('aiStep1:', aiStep1);
  console.log('aiStep2:', aiStep2);
  console.log('aiStep3:', aiStep3);
  console.log('aiLoading:', aiLoading);
  console.log('genreBtns:', genreBtns.length);
  console.log('getSuggestionsBtn:', getSuggestionsBtn);
  console.log('menuSuggestionsContainer:', menuSuggestionsContainer);
  console.log('generateFullRecipeBtn:', generateFullRecipeBtn);
  console.log('aiCustomRequestEl:', aiCustomRequestEl);
  console.log('recipePreview:', recipePreview);
  console.log('applyRecipeBtn:', applyRecipeBtn);
  console.log('aiWizardBtn:', aiWizardBtn);

  let selectedGenre = '';
  let selectedMenu = '';
  let finalRecipeData = null;
  let customCategories = [];
  let selectedCategory = 'メイン';
  let selectedTags = [];
  let tempSelectedCategory = '';
  let tempSelectedTags = [];
  let allCategories = [];
  let allTags = [];
  let customTags = [];
  let baseServings = 1; // 基準人数
  let originalIngredients = []; // 元の材料データ
  let currentRecipeType = 'normal'; // レシピタイプ: 'normal', 'bread', 'cake'

  // --- Helpers ---
  const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));

  // レシピタイプに応じて材料量を調整する関数
  const adjustIngredientsByServings = () => {
    const newValue = servingsEl?.value || '';
    
    if (!newValue) {
      alert('値を入力してください。');
      return;
    }
    
    let newServings, maxValue, errorMessage;
    
    // レシピタイプに応じて検証条件を設定
    switch (currentRecipeType) {
      case 'bread':
        newServings = parseFloat(newValue);
        maxValue = 2000;
        errorMessage = '総量は1〜2000gで入力してください。';
        break;
      case 'cake':
        newServings = parseFloat(newValue);
        maxValue = 50;
        errorMessage = 'サイズは1〜50cmで入力してください。';
        break;
      default: // normal
        newServings = parseInt(newValue);
        maxValue = 20;
        errorMessage = '人数は1〜20人前で入力してください。';
        break;
    }
    
    if (newServings < 1 || newServings > maxValue) {
      alert(errorMessage);
      return;
    }
    
    if (originalIngredients.length === 0) {
      // 現在の材料を基準として保存
      const currentIngredients = [];
      const ingredientRows = document.querySelectorAll('.ingredient-row');
      ingredientRows.forEach(row => {
        const itemInput = row.querySelector('.ing-item');
        const quantityInput = row.querySelector('.ing-qty');
        const unitInput = row.querySelector('.ing-unit');
        
        if (itemInput && itemInput.value.trim()) {
          currentIngredients.push({
            item: itemInput.value.trim(),
            quantity: quantityInput?.value?.trim() || '',
            unit: unitInput?.value?.trim() || ''
          });
        }
      });
      
      if (currentIngredients.length === 0) {
        alert('材料が入力されていません。');
        return;
      }
      
      originalIngredients = [...currentIngredients];
      baseServings = newServings;
    }
    
    // レシピタイプに応じた調整ロジック
    let ratio, successMessage;
    
    switch (currentRecipeType) {
      case 'bread':
        // パンの場合：粉の量を基準に他の材料を比例調整
        const flourIngredient = originalIngredients.find(ing => 
          ing.item.toLowerCase().includes('粉') || 
          ing.item.toLowerCase().includes('小麦粉') ||
          ing.item.toLowerCase().includes('強力粉') ||
          ing.item.toLowerCase().includes('薄力粉')
        );
        
        if (flourIngredient && flourIngredient.quantity) {
          const targetFlourWeight = newServings;
          const currentFlourWeight = parseFloat(flourIngredient.quantity);
          ratio = targetFlourWeight / currentFlourWeight;
          successMessage = `材料量を${currentFlourWeight}gから${targetFlourWeight}gに調整しました。`;
        } else {
          // 粉が見つからない場合は通常の比例調整
          ratio = newServings / baseServings;
          successMessage = `材料量を${baseServings}gから${newServings}gに調整しました。`;
        }
        break;
        
      case 'cake':
        // ケーキの場合：型のサイズに応じて比例調整
        ratio = newServings / baseServings;
        successMessage = `材料量を${baseServings}cm型から${newServings}cm型に調整しました。`;
        break;
        
      default: // normal
        // 通常の料理：人数に応じて比例調整
        ratio = newServings / baseServings;
        successMessage = `材料量を${baseServings}人前から${newServings}人前に調整しました。`;
        break;
    }
    
    // 材料量を調整
    const adjustedIngredients = originalIngredients.map(ing => {
      const adjusted = { ...ing };
      
      if (ing.quantity && !isNaN(parseFloat(ing.quantity))) {
        const originalQuantity = parseFloat(ing.quantity);
        const newQuantity = originalQuantity * ratio;
        
        // 小数点以下を適切に処理
        if (newQuantity < 1) {
          adjusted.quantity = newQuantity.toFixed(2);
        } else if (newQuantity < 10) {
          adjusted.quantity = newQuantity.toFixed(1);
        } else {
          adjusted.quantity = Math.round(newQuantity).toString();
        }
      }
      
      return adjusted;
    });
    
    // 材料エディターを更新
    if (ingredientsEditor) {
      ingredientsEditor.innerHTML = '';
      adjustedIngredients.forEach(ing => addIngredientRow(ing));
    }
    
    console.log(successMessage);
  };

  const addIngredientRow = (data = {}) => {
    console.log('addIngredientRow呼び出し:', data);
    if (!ingredientsEditor) {
      console.error('ingredientsEditorが見つかりません');
      return;
    }
    const div = document.createElement('div');
    div.className = 'ingredient-row';
    const quantityValue = data.quantity !== null && data.quantity !== undefined ? data.quantity : '';
    const itemValue = data.item || '';
    const unitValue = data.unit || '';
    
    console.log('材料行を作成:', { item: itemValue, quantity: quantityValue, unit: unitValue });
    
    div.innerHTML = `
      <input type="text" placeholder="材料名 *" value="${escapeHtml(itemValue)}" data-field="item" class="ing-item">
      <input type="text" placeholder="分量" value="${escapeHtml(quantityValue)}" data-field="quantity" class="ing-qty">
      <input type="text" placeholder="単位" value="${escapeHtml(unitValue)}" data-field="unit" class="ing-unit">
      <button type="button" class="btn danger small js-remove-row">削除</button>`;
    ingredientsEditor.appendChild(div);
    console.log('材料行を追加完了');
  };

  const addStepRow = (data = {}) => {
    console.log('addStepRow呼び出し:', data);
    if (!stepsEditor) {
      console.error('stepsEditorが見つかりません');
      return;
    }
    const instructionValue = data.instruction || '';
    console.log('手順行を作成:', { instruction: instructionValue });
    
    const div = document.createElement('div');
    div.className = 'step-row';
    div.innerHTML = `
      <input type="text" placeholder="手順 *" value="${escapeHtml(instructionValue)}" data-field="instruction" class="step-text">
      <button type="button" class="btn danger small js-remove-row">削除</button>`;
    stepsEditor.appendChild(div);
    console.log('手順行を追加完了');
  };

  // --- Category Management ---
  const loadCustomCategories = () => {
    const saved = localStorage.getItem('customCategories');
    if (saved) {
      customCategories = JSON.parse(saved);
      updateCategorySelect();
    }
  };

  const saveCustomCategories = () => {
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
  };

  const loadCustomTags = () => {
    const saved = localStorage.getItem('customTags');
    if (saved) {
      customTags = JSON.parse(saved);
      updateTagSelect();
    }
  };

  const saveCustomTags = () => {
    localStorage.setItem('customTags', JSON.stringify(customTags));
  };

  const addCustomCategory = (categoryName) => {
    if (!categoryName || categoryName.trim() === '') return;
    
    const trimmedName = categoryName.trim();
    if (!customCategories.includes(trimmedName)) {
      customCategories.push(trimmedName);
      saveCustomCategories();
      updateCategorySelect();
    }
  };

  const addCustomTag = (tagName) => {
    if (!tagName || tagName.trim() === '') return;
    
    const trimmedName = tagName.trim();
    if (!customTags.includes(trimmedName)) {
      customTags.push(trimmedName);
      saveCustomTags();
      updateTagSelect();
    }
  };

  const openCategoryModal = () => {
    if (categoryModal) {
      tempSelectedCategory = selectedCategory;
      updateCategoryModalSelection();
      categoryModal.style.display = 'flex';
    }
  };

  const closeCategoryModal = () => {
    if (categoryModal) {
      categoryModal.style.display = 'none';
    }
  };

  const updateCategoryModalSelection = () => {
    // 基本カテゴリーの選択状態を更新
    const categoryOptions = categoryOptionsContainer?.querySelectorAll('.category-option');
    categoryOptions?.forEach(option => {
      option.classList.toggle('selected', option.dataset.category === tempSelectedCategory);
    });
    
    // カスタムカテゴリーの表示を更新
    if (customCategories.length > 0) {
      customCategoryGroup.style.display = 'block';
      customCategoryOptions.innerHTML = '';
      
      customCategories.forEach(category => {
        const option = document.createElement('button');
        option.className = 'category-option custom';
        option.dataset.category = category;
        option.innerHTML = `
          ${escapeHtml(category)}
          <button type="button" class="remove-custom-item" data-category="${escapeHtml(category)}">
            <i class="fas fa-times"></i>
          </button>
        `;
        option.classList.toggle('selected', category === tempSelectedCategory);
        customCategoryOptions.appendChild(option);
      });
    } else {
      customCategoryGroup.style.display = 'none';
    }
  };

  const openTagModal = () => {
    if (tagModal) {
      tempSelectedTags = [...selectedTags];
      updateTagModalSelection();
      tagModal.style.display = 'flex';
    }
  };

  const closeTagModal = () => {
    if (tagModal) {
      tagModal.style.display = 'none';
    }
  };

  const updateTagModalSelection = () => {
    // 基本タグの選択状態を更新
    const tagOptions = tagOptionsContainer?.querySelectorAll('.tag-option');
    tagOptions?.forEach(option => {
      option.classList.toggle('selected', tempSelectedTags.includes(option.dataset.tag));
    });
    
    // カスタムタグの表示を更新
    if (customTags.length > 0) {
      const customTagGroup = document.getElementById('custom-tag-group');
      const customTagOptions = document.getElementById('custom-tag-options');
      
      if (customTagGroup && customTagOptions) {
        customTagGroup.style.display = 'block';
        customTagOptions.innerHTML = '';
        
        customTags.forEach(tag => {
          const option = document.createElement('button');
          option.className = 'tag-option custom';
          option.dataset.tag = tag;
          option.innerHTML = `
            ${escapeHtml(tag)}
            <button type="button" class="remove-custom-item" data-tag="${escapeHtml(tag)}">
              <i class="fas fa-times"></i>
            </button>
          `;
          option.classList.toggle('selected', tempSelectedTags.includes(tag));
          customTagOptions.appendChild(option);
        });
      }
    } else {
      const customTagGroup = document.getElementById('custom-tag-group');
      if (customTagGroup) {
        customTagGroup.style.display = 'none';
      }
    }
  };

  const removeCustomCategory = (categoryName) => {
    customCategories = customCategories.filter(cat => cat !== categoryName);
    saveCustomCategories();
    updateCategorySelect();
    
    // 削除されたカテゴリーが現在選択されている場合は選択をクリア
    if (selectedCategory === categoryName) {
      selectedCategory = '';
      updateCategorySelect();
    }
  };

  const removeCustomTag = (tagName) => {
    customTags = customTags.filter(tag => tag !== tagName);
    saveCustomTags();
    updateTagSelect();
    
    // 削除されたタグが現在選択されている場合は選択から削除
    selectedTags = selectedTags.filter(tag => tag !== tagName);
    updateTagSelect();
  };



  const updateCategorySelect = () => {
    // カテゴリー選択ボタンのテキストを更新
    if (selectedCategoryText) {
      selectedCategoryText.textContent = selectedCategory || 'カテゴリーを選択';
    }
    
    // カテゴリに応じてレシピタイプとUIを更新
    updateRecipeTypeByCategory();
  };
  
  const updateRecipeTypeByCategory = () => {
    const servingsField = document.querySelector('.servings-field');
    const servingsLabel = servingsField?.querySelector('label[for="servings"]');
    const servingsInput = servingsField?.querySelector('#servings');
    const servingsUnit = servingsField?.querySelector('.servings-unit');
    const adjustButton = servingsField?.querySelector('#adjustServingsBtn');
    
    if (!servingsField || !servingsLabel || !servingsInput || !servingsUnit || !adjustButton) return;
    
    // カテゴリに応じてレシピタイプを判定
    const category = selectedCategory.toLowerCase();
    
    if (category.includes('パン') || category.includes('bread')) {
      currentRecipeType = 'bread';
      servingsLabel.textContent = '出来上がり総量';
      servingsInput.placeholder = '例: 500';
      servingsUnit.textContent = 'g';
      adjustButton.textContent = '総量に応じて材料量を調整';
    } else if (category.includes('ケーキ') || category.includes('cake') || category.includes('デザート') || category.includes('dessert')) {
      currentRecipeType = 'cake';
      servingsLabel.textContent = '出来上がりサイズ';
      servingsInput.placeholder = '例: 18cm';
      servingsUnit.textContent = '型';
      adjustButton.textContent = 'サイズに応じて材料量を調整';
    } else {
      currentRecipeType = 'normal';
      servingsLabel.textContent = '出来上がり人数';
      servingsInput.placeholder = '例: 4';
      servingsUnit.textContent = '人前';
      adjustButton.textContent = '人数に応じて材料量を調整';
    }
    
    console.log(`レシピタイプを${currentRecipeType}に変更しました`);
  };

  const updateTagSelect = () => {
    // タグ選択ボタンのテキストを更新
    if (selectedTagsText) {
      if (selectedTags.length === 0) {
        selectedTagsText.textContent = 'タグを選択';
      } else if (selectedTags.length === 1) {
        selectedTagsText.textContent = selectedTags[0];
      } else if (selectedTags.length === 2) {
        selectedTagsText.textContent = selectedTags.join('、');
      } else {
        // 3つ以上のタグがある場合は、最初のタグと残りの数を表示
        selectedTagsText.textContent = `${selectedTags[0]} 他${selectedTags.length - 1}個`;
      }
    }
  };

  const loadCategoriesFromDB = async () => {
    try {
      const { data, error } = await sb.from('recipes').select('category').not('category', 'is', null);
      if (error) throw error;
      
      // ユニークなカテゴリーを取得
      const uniqueCategories = [...new Set(data.map(r => r.category).filter(Boolean))];
      allCategories = uniqueCategories.sort();
      
      // カテゴリーオプションを生成
      if (categoryOptionsContainer) {
        categoryOptionsContainer.innerHTML = '';
        allCategories.forEach(category => {
          const option = document.createElement('button');
          option.className = 'category-option';
          option.dataset.category = category;
          option.textContent = category;
          categoryOptionsContainer.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadTagsFromDB = async () => {
    try {
      const { data, error } = await sb.from('recipes').select('tags').not('tags', 'is', null);
      if (error) throw error;
      
      // すべてのタグをフラット化してユニークを取得
      const allTagsFromDB = data.flatMap(r => r.tags || []).filter(Boolean);
      const uniqueTags = [...new Set(allTagsFromDB)];
      allTags = uniqueTags.sort();
      
      // タグオプションを生成
      if (tagOptionsContainer) {
        tagOptionsContainer.innerHTML = '';
        allTags.forEach(tag => {
          const option = document.createElement('button');
          option.className = 'tag-option';
          option.dataset.tag = tag;
          option.textContent = tag;
          tagOptionsContainer.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  // --- フォーム保存機能 ---
  const saveRecipe = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const recipeId = params.get('id');
      
      const title = titleEl?.value?.trim() || '';
      const category = selectedCategory || '';
      const tags = selectedTags || [];
      const notes = notesEl?.value?.trim() || '';

      if (!title) {
        alert('料理名を入力してください。');
        return;
      }

      const ingredientRows = Array.from(ingredientsEditor?.querySelectorAll('.ingredient-row') || []);
      const ingredients = ingredientRows.map((row, index) => {
        const item = row.querySelector('[data-field="item"]')?.value?.trim() || '';
        const quantity = row.querySelector('[data-field="quantity"]')?.value?.trim() || '';
        const unit = row.querySelector('[data-field="unit"]')?.value?.trim() || '';
        if (!item) return null;
        return { position: index + 1, item, quantity: quantity || null, unit: unit || null };
      }).filter(Boolean);

      const stepRows = Array.from(stepsEditor?.querySelectorAll('.step-row') || []);
      const steps = stepRows.map((row, index) => {
        const instruction = row.querySelector('[data-field="instruction"]')?.value?.trim() || '';
        if (!instruction) return null;
        return { position: index + 1, instruction };
      }).filter(Boolean);

      const recipeData = { 
        title, 
        category: category || null, 
        tags: tags.length > 0 ? tags : null, 
        notes: notes || null 
      };
      
      // servingsカラムが存在する場合のみ追加
      if (servingsEl?.value) {
        recipeData.servings = parseInt(servingsEl.value);
      }

      let recipeResult;
      try {
        if (recipeId) {
          recipeResult = await sb.from('recipes').update(recipeData).eq('id', recipeId).select('id').single();
        } else {
          recipeResult = await sb.from('recipes').insert(recipeData).select('id').single();
        }

        if (recipeResult.error) {
          console.error('レシピ保存エラーの詳細:', recipeResult.error);
          throw new Error('レシピの保存に失敗しました: ' + recipeResult.error.message);
        }
      } catch (error) {
        // servingsカラムが存在しない場合の回避策
        if (error.message.includes('servings') || error.message.includes('column')) {
          console.log('servingsカラムが存在しないため、servingsを除外して保存を試行します');
          
          // servingsを除外して再試行
          const { servings, ...recipeDataWithoutServings } = recipeData;
          
          if (recipeId) {
            recipeResult = await sb.from('recipes').update(recipeDataWithoutServings).eq('id', recipeId).select('id').single();
          } else {
            recipeResult = await sb.from('recipes').insert(recipeDataWithoutServings).select('id').single();
          }
          
          if (recipeResult.error) {
            throw new Error('レシピの保存に失敗しました: ' + recipeResult.error.message);
          }
          
          console.log('servingsを除外してレシピを保存しました');
        } else {
          throw error;
        }
      }
      const savedRecipeId = recipeResult.data.id;

      await sb.from('recipe_ingredients').delete().eq('recipe_id', savedRecipeId);
      await sb.from('recipe_steps').delete().eq('recipe_id', savedRecipeId);

      if (ingredients.length > 0) {
        const ingredientsToInsert = ingredients.map(ing => ({ ...ing, recipe_id: savedRecipeId }));
        const ingredientsResult = await sb.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingredientsResult.error) { throw new Error('材料の保存に失敗しました: ' + ingredientsResult.error.message); }
      }

      if (steps.length > 0) {
        const stepsToInsert = steps.map(step => ({ ...step, recipe_id: savedRecipeId }));
        const stepsResult = await sb.from('recipe_steps').insert(stepsToInsert);
        if (stepsResult.error) { throw new Error('手順の保存に失敗しました: ' + stepsResult.error.message); }
      }

      alert('レシピを保存しました！');
      window.location.href = `recipe_view.html?id=${encodeURIComponent(savedRecipeId)}`;

    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + (error.message || error));
    }
  };

  // --- AIモーダル制御（既存ロジック） ---
  const openModal = () => { 
    console.log('AIモーダルを開こうとしています...');
    
    // 材料の入力状況をチェック
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    const validIngredients = [];
    
    ingredientRows.forEach(row => {
      const itemInput = row.querySelector('.ing-item');
      const item = itemInput ? itemInput.value.trim() : '';
      if (item) {
        validIngredients.push(item);
      }
    });
    
    console.log('入力された材料:', validIngredients);
    
    if (validIngredients.length === 0) {
      // 材料が何も入力されていない場合
      const baseIngredient = prompt('何をベースに創作しますか？\n例: 鶏肉、トマト、卵 など');
      if (!baseIngredient || baseIngredient.trim() === '') {
        console.log('材料入力がキャンセルされました');
        return; // キャンセルされた場合
      }
      // 入力された材料を最初の行に追加
      if (ingredientRows.length > 0) {
        const firstRow = ingredientRows[0];
        const itemInput = firstRow.querySelector('.ing-item');
        if (itemInput) {
          itemInput.value = baseIngredient.trim();
        }
      }
      console.log('材料が追加されました:', baseIngredient);
    } else if (validIngredients.length === 1) {
      // 材料が1種類の場合、その材料をベースに創作
      console.log(`材料「${validIngredients[0]}」をベースにAI創作を開始します`);
    } else {
      // 材料が複数の場合、全ての材料を使った創作
      console.log(`材料「${validIngredients.join('、')}」を全て使ったAI創作を開始します`);
    }
    
    // モーダルの状態をリセット
    if (aiStep1) aiStep1.style.display = 'block';
    if (aiStep2) aiStep2.style.display = 'none';
    if (aiStep3) aiStep3.style.display = 'none';
    if (aiLoading) aiLoading.style.display = 'none';
    
    // ボタンの状態をリセット
    if (getSuggestionsBtn) getSuggestionsBtn.disabled = true;
    if (generateFullRecipeBtn) generateFullRecipeBtn.disabled = true;
    
    // 選択状態をリセット
    genreBtns.forEach(b => b.classList.remove('selected'));
    selectedGenre = '';
    selectedMenu = '';
    finalRecipeData = null;
    
    // 入力フィールドをクリア
    if (aiCustomRequestEl) aiCustomRequestEl.value = '';
    if (menuSuggestionsContainer) menuSuggestionsContainer.innerHTML = '';
    if (recipePreview) recipePreview.innerHTML = '';
    
    console.log('AIモーダルを表示します');
    if(aiModal) {
      aiModal.style.display = 'flex';
      console.log('AIモーダルが表示されました');
    } else {
      console.error('AIモーダル要素が見つかりません');
    }
  };
  const closeModal = () => { if(aiModal) aiModal.style.display = 'none'; resetModal(); };
  const resetModal = () => {
    if (!aiStep1 || !aiStep2 || !aiStep3 || !aiLoading) return;
    aiStep1.style.display = 'block';
    aiStep2.style.display = 'none';
    aiStep3.style.display = 'none';
    aiLoading.style.display = 'none';
    genreBtns.forEach(b => b.classList.remove('selected'));
    if (getSuggestionsBtn) getSuggestionsBtn.disabled = true;
    if (generateFullRecipeBtn) generateFullRecipeBtn.disabled = true;
    if (aiCustomRequestEl) aiCustomRequestEl.value = '';
    if (menuSuggestionsContainer) menuSuggestionsContainer.innerHTML = '';
    if (recipePreview) recipePreview.innerHTML = '';
    selectedGenre = ''; selectedMenu = ''; finalRecipeData = null;
  };

  // 修正点2: AIとの通信部分を安定化
  function extractLLMText(r) {
    try {
      if (!r) return '';
      let text = '';
      if (typeof r === 'string') { text = r; }
      else if (Array.isArray(r.candidates) && r.candidates.length) {
        const cand = r.candidates[0];
        if (cand && cand.content && Array.isArray(cand.content.parts)) {
          text = cand.content.parts.map(p => (p && p.text) ? p.text : '').join('\n');
        }
      }
      if (!text) return '';
      
      console.log('AIからの生テキスト:', text);
      
      // JSONの開始と終了を探す
      const startIndex = text.indexOf('{');
      const endIndex = text.lastIndexOf('}');
      
      if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
        const jsonText = text.substring(startIndex, endIndex + 1);
        console.log('抽出されたJSON:', jsonText);
        
        // JSONの妥当性をチェック
        try {
          JSON.parse(jsonText);
          return jsonText;
        } catch (parseError) {
          console.error('JSON解析エラー:', parseError);
          console.error('問題のあるJSON:', jsonText);
          return jsonText; // 解析できなくても返す
        }
      }
      
      console.error('JSONが見つかりませんでした');
      return text;
    } catch (e) {
      console.error('extractLLMText error', e, r);
      return '';
    }
  }

  async function callGemini(prompt, responseSchema) {
    const { data, error } = await sb.functions.invoke('call-gemini', { body: { prompt, responseSchema } });
    if (error) throw new Error(`Edge Function Error: ${error.message}`);
    if (data.error) throw new Error(`API Error from Edge Function: ${data.error}`);
    const jsonText = extractLLMText(data);
    window._debug_ai_response = jsonText;
    if (!jsonText) throw new Error('AIからの応答が空でした。');
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON Parse Error:", e, "Raw Text:", jsonText);
      throw new Error('AIからの応答をJSONとして解析できませんでした。');
    }
  }

  // --- クリックハンドラ ---
  if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
  if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
  if (saveBtn) saveBtn.addEventListener('click', saveRecipe);
  
  // 人数調整ボタン
  const adjustServingsBtn = document.getElementById('adjustServingsBtn');
  if (adjustServingsBtn) {
    adjustServingsBtn.addEventListener('click', adjustIngredientsByServings);
  }
  
  // カテゴリー選択ボタン
  if (categorySelectBtn) {
    categorySelectBtn.addEventListener('click', () => {
      openCategoryModal();
    });
  }

  // カテゴリー選択モーダルの閉じるボタン
  if (categoryModalCloseBtn) {
    categoryModalCloseBtn.addEventListener('click', closeCategoryModal);
  }

  // カテゴリー選択モーダルの背景クリックで閉じる
  if (categoryModal) {
    categoryModal.addEventListener('click', (e) => {
      if (e.target === categoryModal) {
        closeCategoryModal();
      }
    });
  }

  // カテゴリーオプションのクリック
  if (categoryOptionsContainer) {
    categoryOptionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.category-option');
      if (option) {
        tempSelectedCategory = option.dataset.category;
        updateCategoryModalSelection();
      }
    });
  }

  // カスタムカテゴリーオプションのクリック
  if (customCategoryOptions) {
    customCategoryOptions.addEventListener('click', (e) => {
      const option = e.target.closest('.category-option');
      if (option && !e.target.closest('.remove-custom-item')) {
        tempSelectedCategory = option.dataset.category;
        updateCategoryModalSelection();
      }
    });
  }

  // カスタムカテゴリーの削除
  if (customCategoryOptions) {
    customCategoryOptions.addEventListener('click', (e) => {
      if (e.target.closest('.remove-custom-item')) {
        e.stopPropagation();
        const category = e.target.closest('.remove-custom-item').dataset.category;
        removeCustomCategory(category);
        updateCategoryModalSelection();
      }
    });
  }

  // カテゴリーOKボタン
  if (categoryOkBtn) {
    categoryOkBtn.addEventListener('click', () => {
      selectedCategory = tempSelectedCategory;
      updateCategorySelect();
      closeCategoryModal();
    });
  }

  // カテゴリーキャンセルボタン
  if (categoryCancelBtn) {
    categoryCancelBtn.addEventListener('click', closeCategoryModal);
  }

  // タグ選択ボタン
  if (tagSelectBtn) {
    tagSelectBtn.addEventListener('click', () => {
      openTagModal();
    });
  }

  // タグ選択モーダルの閉じるボタン
  if (tagModalCloseBtn) {
    tagModalCloseBtn.addEventListener('click', closeTagModal);
  }

  // タグ選択モーダルの背景クリックで閉じる
  if (tagModal) {
    tagModal.addEventListener('click', (e) => {
      if (e.target === tagModal) {
        closeTagModal();
      }
    });
  }

  // タグオプションのクリック
  if (tagOptionsContainer) {
    tagOptionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.tag-option');
      if (option && !e.target.closest('.remove-custom-item')) {
        const tag = option.dataset.tag;
        if (tempSelectedTags.includes(tag)) {
          tempSelectedTags = tempSelectedTags.filter(t => t !== tag);
        } else {
          tempSelectedTags.push(tag);
        }
        updateTagModalSelection();
      }
    });
  }

  // カスタムタグの削除
  const customTagOptions = document.getElementById('custom-tag-options');
  if (customTagOptions) {
    customTagOptions.addEventListener('click', (e) => {
      if (e.target.closest('.remove-custom-item')) {
        e.stopPropagation();
        const tag = e.target.closest('.remove-custom-item').dataset.tag;
        removeCustomTag(tag);
        updateTagModalSelection();
      }
    });
  }

  // カスタムタグオプションのクリック
  if (customTagOptions) {
    customTagOptions.addEventListener('click', (e) => {
      const option = e.target.closest('.tag-option');
      if (option && !e.target.closest('.remove-custom-item')) {
        const tag = option.dataset.tag;
        if (tempSelectedTags.includes(tag)) {
          tempSelectedTags = tempSelectedTags.filter(t => t !== tag);
        } else {
          tempSelectedTags.push(tag);
        }
        updateTagModalSelection();
      }
    });
  }

  // タグOKボタン
  if (tagOkBtn) {
    tagOkBtn.addEventListener('click', () => {
      selectedTags = [...tempSelectedTags];
      updateTagSelect();
      closeTagModal();
    });
  }

  // タグキャンセルボタン
  if (tagCancelBtn) {
    tagCancelBtn.addEventListener('click', closeTagModal);
  }

  // 新規カテゴリー追加ボタン
  const addNewCategoryBtn = document.getElementById('add-new-category-btn');
  if (addNewCategoryBtn) {
    addNewCategoryBtn.addEventListener('click', () => {
      const newCategory = prompt('新しいカテゴリ名を入力してください:');
      if (newCategory) {
        addCustomCategory(newCategory);
        updateCategoryModalSelection();
      }
    });
  }

  // 新規タグ追加ボタン
  const addNewTagBtn = document.getElementById('add-new-tag-btn');
  if (addNewTagBtn) {
    addNewTagBtn.addEventListener('click', () => {
      const newTag = prompt('新しいタグ名を入力してください:');
      if (newTag) {
        addCustomTag(newTag);
        updateTagModalSelection();
      }
    });
  }


  
  // カスタムカテゴリ削除
  if (customCategoriesContainer) {
    customCategoriesContainer.addEventListener('click', (e) => {
      if (e.target.closest('.remove-category')) {
        const category = e.target.closest('.remove-category').dataset.category;
        removeCustomCategory(category);
      }
    });
  }
  
  if (document.querySelector('form')) {
    document.querySelector('form').addEventListener('click', (e) => {
      if (e.target.classList.contains('js-remove-row')) {
        const row = e.target.closest('.ingredient-row, .step-row');
        if (row) row.remove();
      }
    });
  }

  if (aiWizardBtn) {
    console.log('AI創作ボタンが見つかりました');
    aiWizardBtn.addEventListener('click', openModal);
  } else {
    console.error('AI創作ボタンが見つかりません');
  }
  
  if (modalCloseBtn) {
    console.log('モーダル閉じるボタンが見つかりました');
    modalCloseBtn.addEventListener('click', closeModal);
  } else {
    console.error('モーダル閉じるボタンが見つかりません');
  }
  
  // AIモーダルの背景クリックで閉じる
  if (aiModal) {
    aiModal.addEventListener('click', (e) => {
      if (e.target === aiModal) {
        closeModal();
      }
    });
  }

  if (genreBtns) genreBtns.forEach(btn => btn.addEventListener('click', () => {
    genreBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedGenre = btn.dataset.genre;
    if (getSuggestionsBtn) getSuggestionsBtn.disabled = false;
  }));

  // AIワザード機能
  if (getSuggestionsBtn) {
    getSuggestionsBtn.addEventListener('click', async () => {
      if (!selectedGenre) return;
      aiStep1.style.display = 'none';
      aiLoading.style.display = 'block';
      try {
        // 材料の入力状況を取得
        const ingredientRows = document.querySelectorAll('.ingredient-row');
        const validIngredients = [];
        
        ingredientRows.forEach(row => {
          const itemInput = row.querySelector('.ing-item');
          const item = itemInput ? itemInput.value.trim() : '';
          if (item) {
            validIngredients.push(item);
          }
        });
        
        const customRequest = aiCustomRequestEl?.value?.trim() || '';
        let prompt = `${selectedGenre}料理のメニューを5つ提案してください。`;
        
        // 材料に応じてプロンプトを調整
        if (validIngredients.length === 1) {
          prompt += `\n\n主材料として「${validIngredients[0]}」を使用した料理を提案してください。`;
          
          // 材料に応じたタグのヒントを追加
          const ingredient = validIngredients[0].toLowerCase();
          if (ingredient.includes('肉') || ingredient.includes('牛') || ingredient.includes('豚') || ingredient.includes('鶏')) {
            prompt += `\n\nタグのヒント: 肉料理、メイン、本格 など`;
          } else if (ingredient.includes('魚') || ingredient.includes('鮭') || ingredient.includes('マグロ')) {
            prompt += `\n\nタグのヒント: 魚料理、和食、ヘルシー など`;
          } else if (ingredient.includes('野菜') || ingredient.includes('トマト') || ingredient.includes('キャベツ')) {
            prompt += `\n\nタグのヒント: 野菜料理、ヘルシー、簡単 など`;
          } else if (ingredient.includes('りんご') || ingredient.includes('バナナ') || ingredient.includes('イチゴ')) {
            prompt += `\n\nタグのヒント: デザート、スイーツ、簡単 など`;
          }
        } else if (validIngredients.length > 1) {
          prompt += `\n\n以下の材料を全て使用した料理を提案してください：${validIngredients.join('、')}`;
          
          // 複数材料の場合のタグヒント
          const hasMeat = validIngredients.some(ing => ing.toLowerCase().includes('肉') || ing.toLowerCase().includes('牛') || ing.toLowerCase().includes('豚') || ing.toLowerCase().includes('鶏'));
          const hasFish = validIngredients.some(ing => ing.toLowerCase().includes('魚') || ing.toLowerCase().includes('鮭') || ing.toLowerCase().includes('マグロ'));
          const hasVegetable = validIngredients.some(ing => ing.toLowerCase().includes('野菜') || ing.toLowerCase().includes('トマト') || ing.toLowerCase().includes('キャベツ'));
          
          if (hasMeat) {
            prompt += `\n\nタグのヒント: 肉料理、メイン、本格 など`;
          } else if (hasFish) {
            prompt += `\n\nタグのヒント: 魚料理、和食、ヘルシー など`;
          } else if (hasVegetable) {
            prompt += `\n\nタグのヒント: 野菜料理、ヘルシー、簡単 など`;
          }
        }
        
        if (customRequest) {
          prompt += `\n\n追加要望: ${customRequest}`;
        }
        
        prompt += `\n\n---
各メニューには、そのメニューのコンセプトや意図を30字程度の短い文章で添えてください。
必ず以下のJSON形式で、JSONオブジェクトのみを返してください。解説や前置き、Markdownのコードブロックなどは一切不要です。
{"suggestions": [{"name": "メニュー名1", "intent": "メニューの意図1"}, {"name": "メニュー名2", "intent": "メニューの意図2"}]}`;
        
        const result = await callGemini(prompt, { type: "OBJECT", properties: { suggestions: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, intent: { type: "STRING" } }, required: ["name", "intent"] } } }, required: ["suggestions"] });
        
        aiLoading.style.display = 'none';
        aiStep2.style.display = 'block';
        
        if (menuSuggestionsContainer && result.suggestions) {
          menuSuggestionsContainer.innerHTML = '';
          result.suggestions.forEach(menu => {
            const item = document.createElement('div');
            item.className = 'menu-suggestions-item';
            item.innerHTML = `<div class="menu-name">${escapeHtml(menu.name)}</div><div class="menu-intent">${escapeHtml(menu.intent)}</div>`;
            item.addEventListener('click', () => {
              menuSuggestionsContainer.querySelectorAll('.menu-suggestions-item').forEach(i => i.classList.remove('selected'));
              item.classList.add('selected');
              selectedMenu = menu.name;
              if (generateFullRecipeBtn) generateFullRecipeBtn.disabled = false;
            });
            menuSuggestionsContainer.appendChild(item);
          });
        }
      } catch (error) {
        console.error('メニュー提案エラー:', error);
        aiLoading.style.display = 'none';
        aiStep1.style.display = 'block';
        alert(`メニュー提案の取得に失敗しました: ${error.message}\n\nAIからの応答:\n${window._debug_ai_response || '(取得できず)'}`);
      }
    });
  }

  if (generateFullRecipeBtn) {
    generateFullRecipeBtn.addEventListener('click', async () => {
      if (!selectedMenu) return;
      aiStep2.style.display = 'none';
      aiLoading.style.display = 'block';
      try {
        // 材料の入力状況を取得
        const ingredientRows = document.querySelectorAll('.ingredient-row');
        const validIngredients = [];
        
        ingredientRows.forEach(row => {
          const itemInput = row.querySelector('.ing-item');
          const item = itemInput ? itemInput.value.trim() : '';
          if (item) {
            validIngredients.push(item);
          }
        });
        
        let prompt = `「${selectedMenu}」の詳細なレシピを作成してください。プロの料理人レベルの正確な分量と手順でお願いします。`;
        
        // 材料に応じてプロンプトを調整
        if (validIngredients.length === 1) {
          prompt += `\n\n主材料として「${validIngredients[0]}」を使用したレシピを作成してください。`;
        } else if (validIngredients.length > 1) {
          prompt += `\n\n以下の材料を全て使用したレシピを作成してください：${validIngredients.join('、')}`;
        }
        
        prompt += `\n\n---
重要: 必ず以下のJSON形式で、JSONオブジェクトのみを返してください。解説や前置き、Markdownのコードブロック、改行、余分な文字は一切不要です。

材料の単位は以下の標準単位のみを使用してください：
- 重量: g（グラム）、kg（キログラム）
- 容量: ml（ミリリットル）、L（リットル）
- 個数: 個、枚、本、束
- その他: 適量、少々

小さじ、大さじ、カップなどの表記は禁止です。

メモ部分は、超一流のプロの料理人が他のプロの料理人と考察するような専門的な内容にしてください。調理技術、火加減、タイミング、食材の特性、味のバランス、見た目の美しさなどについて、具体的で実践的なアドバイスを含めてください。

材料と分量は、実際のレシピサイトや料理本を参考にして、正確で実現可能な分量にしてください。出来上がりの数（何人前）も明確にしてください。

タグは料理の特徴を表す適切なタグを2-4個選んでください。例：
- 肉料理、魚料理、野菜料理、デザート
- 和食、洋食、中華、エスニック
- 定番、創作、簡単、本格
- 前菜、メイン、サイド、スープ

JSONレスポンス例:
{"title":"ビーフステーキ","category":"メイン","tags":["肉料理","洋食","本格"],"notes":"火加減のコントロールが重要。肉の表面をしっかり焼いてから中火でじっくりと。","servings":"2人前","ingredients":[{"item":"牛もも肉","quantity":"200","unit":"g"},{"item":"塩","quantity":"3","unit":"g"}],"steps":["肉を室温に戻す","塩胡椒を振る","強火で表面を焼く"]}`;
        
        console.log('AIに送信するプロンプト:', prompt);
        const result = await callGemini(prompt, { 
          type: "OBJECT", 
          properties: { 
            title: { type: "STRING" }, 
            category: { type: "STRING" }, 
            tags: { type: "ARRAY", items: { type: "STRING" } }, 
            notes: { type: "STRING" }, 
            servings: { type: "STRING" }, 
            ingredients: { 
              type: "ARRAY", 
              items: { 
                type: "OBJECT", 
                properties: { 
                  item: { type: "STRING" }, 
                  quantity: { type: "STRING" }, 
                  unit: { type: "STRING" } 
                }, 
                required: ["item"] 
              } 
            }, 
            steps: { type: "ARRAY", items: { type: "STRING" } } 
          }, 
          required: ["title", "ingredients", "steps"] 
        });
        
        console.log('AIからのレスポンス:', result);
        
        // 材料の単位を標準化
        if (result.ingredients && Array.isArray(result.ingredients)) {
          result.ingredients.forEach(ing => {
            if (ing.unit) {
              // 小さじ・大さじ・カップなどの表記を標準単位に変換
              const unit = ing.unit.trim();
              if (unit.includes('小さじ') || unit.includes('小匙')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 5).toString();
                }
              } else if (unit.includes('大さじ') || unit.includes('大匙')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 15).toString();
                }
              } else if (unit.includes('カップ') || unit.includes('cup')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 200).toString();
                }
              } else if (unit.includes('合')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 180).toString();
                }
              }
            }
          });
        }
        
        finalRecipeData = result;
        aiLoading.style.display = 'none';
        aiStep3.style.display = 'block';
        if (recipePreview) {
          console.log('レシピプレビュー用データ（単位変換後）:', result);
          
          let preview = `📝 タイトル: ${result.title || '(タイトルなし)'}\n\n`;
          preview += `🏷️ カテゴリ: ${result.category || '(カテゴリなし)'}\n`;
          preview += `🏷️ タグ: ${(result.tags || []).length > 0 ? result.tags.join(', ') : '(タグなし)'}\n`;
          if (result.servings) {
            preview += `👥 出来上がり: ${result.servings}\n`;
          }
          if (result.notes) {
            preview += `\n📝 プロの技術解説:\n${result.notes}\n`;
          }
          
          preview += `\n🥘 材料 (${(result.ingredients || []).length}個):\n`;
          if (result.ingredients && result.ingredients.length > 0) {
            // シンプルなリスト形式で表示
            result.ingredients.forEach((ing, index) => {
              const item = ing.item || '(材料名なし)';
              const quantity = ing.quantity || '';
              const unit = ing.unit || '';
              const quantityText = quantity && unit ? `${quantity}${unit}` : quantity || unit || '';
              preview += `• ${item}${quantityText ? ` - ${quantityText}` : ''}\n`;
            });
          } else {
            preview += `(材料なし)\n`;
          }
          
          preview += `\n👨‍🍳 手順 (${(result.steps || []).length}個):\n`;
          if (result.steps && result.steps.length > 0) {
            result.steps.forEach((step, index) => {
              preview += `${index + 1}. ${step || '(手順なし)'}\n`;
            });
          } else {
            preview += `(手順なし)\n`;
          }
          
          recipePreview.textContent = preview;
          console.log('レシピプレビューを更新:', preview);
        }
      } catch (error) {
        console.error('レシピ生成エラー:', error);
        console.error('AIからの生レスポンス:', window._debug_ai_response);
        aiLoading.style.display = 'none';
        aiStep2.style.display = 'block';
        
        let errorMessage = 'レシピ生成に失敗しました: ' + (error.message || error);
        if (window._debug_ai_response) {
          errorMessage += '\n\nAIからの応答:\n' + window._debug_ai_response.substring(0, 500) + '...';
        }
        
        alert(errorMessage);
      }
    });
  }

  if (applyRecipeBtn) {
    applyRecipeBtn.addEventListener('click', () => {
      console.log('レシピをフォームに反映します:', finalRecipeData);
      if (!finalRecipeData) {
        console.error('finalRecipeDataが存在しません');
        return;
      }
      
      // タイトルを設定
      if (titleEl) {
        titleEl.value = finalRecipeData.title || '';
        console.log('タイトルを設定:', finalRecipeData.title);
      }
      
      // カテゴリーを設定
      if (finalRecipeData.category) {
        selectedCategory = finalRecipeData.category;
        updateCategorySelect();
        console.log('カテゴリーを設定:', finalRecipeData.category);
      }
      
      // タグを設定
      if (finalRecipeData.tags && Array.isArray(finalRecipeData.tags)) {
        selectedTags = finalRecipeData.tags;
        updateTagSelect();
        console.log('タグを設定:', finalRecipeData.tags);
      }
      
      // 出来上がり人数を設定
      if (servingsEl && finalRecipeData.servings) {
        // "4人前"のような文字列から数字を抽出
        const servingsMatch = finalRecipeData.servings.match(/(\d+)/);
        if (servingsMatch) {
          servingsEl.value = servingsMatch[1];
          console.log('出来上がり人数を設定:', servingsMatch[1]);
        }
      }
      
      // メモを設定（servings情報は除外）
      if (notesEl) {
        notesEl.value = finalRecipeData.notes || '';
        console.log('メモを設定:', finalRecipeData.notes);
      }
      
      // 材料を設定
      if (ingredientsEditor) {
        ingredientsEditor.innerHTML = '';
        console.log('材料を設定:', finalRecipeData.ingredients);
        if (finalRecipeData.ingredients && Array.isArray(finalRecipeData.ingredients) && finalRecipeData.ingredients.length > 0) {
          finalRecipeData.ingredients.forEach((ing, index) => {
            console.log(`材料${index + 1}を追加:`, ing);
            // 材料データの正規化
            const normalizedIng = {
              item: ing.item || '',
              quantity: ing.quantity || '',
              unit: ing.unit || ''
            };
            addIngredientRow(normalizedIng);
          });
        } else {
          console.log('材料データが空または無効です');
          addIngredientRow(); // 空の行を追加
        }
      }
      
      // 手順を設定
      if (stepsEditor) {
        stepsEditor.innerHTML = '';
        console.log('手順を設定:', finalRecipeData.steps);
        if (finalRecipeData.steps && Array.isArray(finalRecipeData.steps) && finalRecipeData.steps.length > 0) {
          finalRecipeData.steps.forEach((step, index) => {
            console.log(`手順${index + 1}を追加:`, step);
            addStepRow({ instruction: step || '' });
          });
        } else {
          console.log('手順データが空または無効です');
          addStepRow(); // 空の行を追加
        }
      }
      
      closeModal();
      alert('レシピデータをフォームに反映しました！');
    });
  }

  // --- APIキー設定機能 ---
  const actions = document.querySelector('.header-actions');
  if (actions) {
    const apiKeyBtn = document.createElement('button');
    apiKeyBtn.className = 'btn ghost';
    apiKeyBtn.textContent = 'API設定';
    apiKeyBtn.style.marginRight = '0.5rem';
    actions.insertBefore(apiKeyBtn, actions.firstChild);
    
    apiKeyBtn.addEventListener('click', () => {
      // 保存されたAPIキーを表示
      if (apiKeyInput) {
        apiKeyInput.value = window.APP_CONFIG?.GEMINI_API_KEY || '';
      }
      apiKeyModal.style.display = 'block';
    });
  }

  // APIキー設定モーダルのイベント
  apiKeyModalCloseBtn?.addEventListener('click', () => {
    apiKeyModal.style.display = 'none';
  });

  apiKeyCancelBtn?.addEventListener('click', () => {
    apiKeyModal.style.display = 'none';
  });

  apiKeySaveBtn?.addEventListener('click', () => {
    const apiKey = apiKeyInput?.value?.trim();
    if (apiKey) {
      setGeminiApiKey(apiKey);
      alert('APIキーが保存されました。');
      apiKeyModal.style.display = 'none';
    } else {
      alert('APIキーを入力してください。');
    }
  });

  // --- URL読み込み機能 ---
  urlImportBtn?.addEventListener('click', () => {
    urlImportModal.style.display = 'block';
    urlInput.focus();
  });

  urlImportModalCloseBtn?.addEventListener('click', () => {
    urlImportModal.style.display = 'none';
  });

  urlImportCancelBtn?.addEventListener('click', () => {
    urlImportModal.style.display = 'none';
  });

  urlImportConfirmBtn?.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      alert('URLを入力してください。');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      alert('有効なURLを入力してください。');
      return;
    }

    // レシピサイトのURLかどうかを簡易チェック
    const recipeSites = ['cookpad.com', 'rakuten.co.jp', 'kyounoryouri.jp', 'kurashiru.com', 'delishkitchen.tv'];
    const isRecipeSite = recipeSites.some(site => url.includes(site));
    
    if (!isRecipeSite) {
      const confirmResult = confirm('このURLは一般的なレシピサイトではありません。\n\nレシピ情報の抽出が困難な場合がありますが、続行しますか？');
      if (!confirmResult) return;
    }

    try {
      urlImportConfirmBtn.disabled = true;
      urlImportConfirmBtn.textContent = '読み込み中...';
      
      let recipeData = null;
      
      // まずSupabase Edge Functionを試す
      try {
        const { data, error } = await sb.functions.invoke('extract-recipe', {
          body: { url }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        
        if (data && data.ok && data.data) {
          recipeData = data.data;
        }
      } catch (edgeFunctionError) {
        console.log('Edge Function failed, trying client-side extraction:', edgeFunctionError);
        
        // Edge Functionが失敗した場合、クライアントサイドで抽出を試す
        try {
          recipeData = await extractRecipeFromURL(url);
        } catch (clientError) {
          console.error('Client-side extraction also failed:', clientError);
          throw new Error('レシピの抽出に失敗しました。手動入力モードをご利用ください。');
        }
      }

      if (recipeData && recipeData.title) {
        // フォームにデータを設定
        if (titleEl) titleEl.value = recipeData.title || '';
        if (notesEl) notesEl.value = recipeData.description || recipeData.notes || '';
        
        // 材料を設定
        if (ingredientsEditor && recipeData.ingredients) {
          ingredientsEditor.innerHTML = '';
          recipeData.ingredients.forEach(ing => {
            addIngredientRow({
              item: ing.item || ing.name || '',
              quantity: ing.quantity || ing.amount || '',
              unit: ing.unit || ''
            });
          });
        }
        
        // 手順を設定
        if (stepsEditor && recipeData.steps) {
          stepsEditor.innerHTML = '';
          recipeData.steps.forEach(step => {
            addStepRow({ instruction: step });
          });
        }

        // 人数を設定（あれば）
        if (servingsEl && recipeData.servings) {
          servingsEl.value = recipeData.servings;
        }

        urlImportModal.style.display = 'none';
        urlInput.value = '';
        alert('レシピの読み込みが完了しました！');
      } else {
        throw new Error('レシピデータを取得できませんでした。');
      }
    } catch (error) {
      console.error('URL読み込みエラー:', error);
      
      // より詳細なエラーメッセージを表示
      let errorMessage = 'レシピの読み込みに失敗しました: ' + error.message;
      
      if (error.message.includes('non-2xx status code')) {
        errorMessage = 'サーバーエラーが発生しました。しばらく時間をおいてから再度お試しください。';
      } else if (error.message.includes('fetch')) {
        errorMessage = 'ネットワークエラーが発生しました。インターネット接続を確認してください。';
      } else if (error.message.includes('JSON')) {
        errorMessage = 'レシピデータの解析に失敗しました。別のレシピサイトをお試しください。';
      }
      
      alert(errorMessage);
    } finally {
      urlImportConfirmBtn.disabled = false;
      urlImportConfirmBtn.textContent = '読み込み開始';
    }
  });

  // クライアントサイドでのレシピ抽出機能
  async function extractRecipeFromURL(url) {
    try {
      // CORSの問題を回避するため、プロキシサービスを使用
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      const data = await response.json();
      
      if (!data.contents) {
        throw new Error('ページの内容を取得できませんでした。');
      }
      
      const html = data.contents;
      
      // Gemini APIを使用した解析を試す
      try {
        const recipeData = await extractWithGemini(html, url);
        if (recipeData && recipeData.title) {
          return recipeData;
        }
      } catch (geminiError) {
        console.log('Gemini解析に失敗、CSSセレクターでフォールバック:', geminiError);
      }
      
      // Geminiが失敗した場合、CSSセレクターで抽出
      return extractWithCSSSelectors(html);
    } catch (error) {
      console.error('Client-side extraction error:', error);
      throw new Error('レシピデータの抽出に失敗しました: ' + error.message);
    }
  }

  // Gemini APIを使用したレシピ解析
  async function extractWithGemini(html, url) {
    try {
      // Gemini APIキーを設定から取得
      const GEMINI_API_KEY = window.APP_CONFIG?.GEMINI_API_KEY || '';
      
      if (!GEMINI_API_KEY) {
        throw new Error('Gemini APIキーが設定されていません。設定画面でAPIキーを入力してください。');
      }

      // HTMLからテキストを抽出（タグを除去）
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 不要な要素を除去
      const elementsToRemove = doc.querySelectorAll('script, style, nav, footer, header, .ad, .advertisement, .sidebar');
      elementsToRemove.forEach(el => el.remove());
      
      const textContent = doc.body.textContent.trim();
      
      // Gemini APIに送信するプロンプト
      const prompt = `
以下のHTMLからレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url}

HTML内容:
${textContent.substring(0, 10000)} // 最初の10000文字のみ

以下のJSON形式で返してください：
{
  "title": "レシピのタイトル",
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
    "手順1",
    "手順2"
  ]
}

注意：
- 材料は「材料名」「分量」「単位」に分けてください
- 手順は番号付きで配列にしてください
- 人数は数字のみで返してください
- 不明な場合は空文字列にしてください
`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API エラー: ${response.status}`);
      }

      const result = await response.json();
      const generatedText = result.candidates[0].content.parts[0].text;
      
      // JSONを抽出
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('GeminiからJSONが取得できませんでした');
      }
      
      const recipeData = JSON.parse(jsonMatch[0]);
      
      // データの検証と正規化
      return {
        title: recipeData.title || '',
        description: recipeData.description || '',
        servings: recipeData.servings || '',
        ingredients: Array.isArray(recipeData.ingredients) ? recipeData.ingredients : [],
        steps: Array.isArray(recipeData.steps) ? recipeData.steps : []
      };
      
    } catch (error) {
      console.error('Gemini解析エラー:', error);
      throw error;
    }
  }

  // CSSセレクターを使用した従来の抽出方法
  function extractWithCSSSelectors(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // レシピデータを抽出
    const recipeData = {
      title: '',
      description: '',
      ingredients: [],
      steps: [],
      servings: ''
    };
    
    // タイトルの抽出
    const titleSelectors = [
      'h1',
      '.recipe-title',
      '.recipe-name',
      '.title',
      '.name',
      '[class*="title"]',
      '[class*="name"]',
      'h1.recipe-title',
      'h1.title',
      '.recipe h1',
      '.recipe-header h1'
    ];
    
    for (const selector of titleSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        recipeData.title = element.textContent.trim();
        break;
      }
    }
    
    // 説明の抽出
    const descSelectors = [
      '.recipe-description',
      '.recipe-summary',
      '.description',
      '[class*="description"]',
      '[class*="summary"]'
    ];
    
    for (const selector of descSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        recipeData.description = element.textContent.trim();
        break;
      }
    }
    
    // 材料の抽出
    const ingredientSelectors = [
      '.ingredient',
      '.ingredients li',
      '.ingredients-item',
      '.recipe-ingredient',
      '.recipe-ingredients li',
      '.ingredient-item',
      '[class*="ingredient"]',
      '.material',
      '.materials li',
      '.recipe-material',
      '.recipe-materials li'
    ];
    
    for (const selector of ingredientSelectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const text = el.textContent.trim();
          if (text) {
            recipeData.ingredients.push({
              item: text,
              quantity: '',
              unit: ''
            });
          }
        });
        break;
      }
    }
    
    // 手順の抽出
    const stepSelectors = [
      '.step',
      '.recipe-step',
      '.instruction',
      '.recipe-instruction',
      '.recipe-steps li',
      '.steps li',
      '.step-item',
      '.instruction-item',
      '[class*="step"]',
      '[class*="instruction"]',
      '.method',
      '.recipe-method',
      '.cooking-step',
      '.cooking-instruction'
    ];
    
    for (const selector of stepSelectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const text = el.textContent.trim();
          if (text) {
            recipeData.steps.push(text);
          }
        });
        break;
      }
    }
    
    // 人数の抽出
    const servingsSelectors = [
      '.servings',
      '.recipe-servings',
      '[class*="serving"]',
      '[class*="portion"]'
    ];
    
    for (const selector of servingsSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        const text = element.textContent.trim();
        const match = text.match(/(\d+)/);
        if (match) {
          recipeData.servings = match[1];
        }
        break;
      }
    }
    
    return recipeData;
  }

  // URL入力でEnterキーでも読み込み開始
  urlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      urlImportConfirmBtn.click();
    }
  });

  // 手動入力モードボタン
  const manualInputBtn = document.getElementById('manualInputBtn');
  manualInputBtn?.addEventListener('click', () => {
    urlImportModal.style.display = 'none';
    
    // 手動入力用のモーダルを表示
    const manualModal = document.createElement('div');
    manualModal.className = 'modal-overlay';
    manualModal.style.display = 'block';
    manualModal.innerHTML = `
      <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
        <div class="modal-header">
          <h2 class="modal-title">レシピ情報を手動入力</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label for="manualTitle">料理名</label>
            <input id="manualTitle" type="text" class="input" placeholder="例: カレーライス" />
          </div>
          <div class="field">
            <label for="manualDescription">レシピの説明</label>
            <textarea id="manualDescription" class="input" rows="3" placeholder="レシピの特徴やコツを入力してください"></textarea>
          </div>
          <div class="field">
            <label for="manualServings">出来上がり人数</label>
            <input id="manualServings" type="number" class="input" min="1" max="20" placeholder="例: 4" />
          </div>
          <div class="field">
            <label>材料（1行に1つ、形式: 材料名 分量 単位）</label>
            <textarea id="manualIngredients" class="input" rows="8" placeholder="例:
豚肉 200 g
玉ねぎ 1 個
にんじん 1 本
カレールー 100 g
水 400 ml"></textarea>
          </div>
          <div class="field">
            <label>手順（1行に1つ）</label>
            <textarea id="manualSteps" class="input" rows="8" placeholder="例:
1. 野菜を切る
2. 肉を炒める
3. 水を加えて煮込む
4. ルーを溶かす"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
          <button class="btn primary" id="applyManualData">適用</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(manualModal);
    
    // 適用ボタンのイベントリスナー
    document.getElementById('applyManualData').addEventListener('click', () => {
      const title = document.getElementById('manualTitle').value.trim();
      const description = document.getElementById('manualDescription').value.trim();
      const servings = document.getElementById('manualServings').value.trim();
      const ingredientsText = document.getElementById('manualIngredients').value.trim();
      const stepsText = document.getElementById('manualSteps').value.trim();
      
      if (!title) {
        alert('料理名を入力してください。');
        return;
      }
      
      // フォームにデータを適用
      if (titleEl) titleEl.value = title;
      if (notesEl) notesEl.value = description;
      if (servingsEl && servings) servingsEl.value = servings;
      
      // 材料を解析して設定
      if (ingredientsEditor && ingredientsText) {
        ingredientsEditor.innerHTML = '';
        const ingredientLines = ingredientsText.split('\n').filter(line => line.trim());
        ingredientLines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const item = parts[0];
            const quantity = parts[1];
            const unit = parts[2] || '';
            addIngredientRow({ item, quantity, unit });
          }
        });
      }
      
      // 手順を解析して設定
      if (stepsEditor && stepsText) {
        stepsEditor.innerHTML = '';
        const stepLines = stepsText.split('\n').filter(line => line.trim());
        stepLines.forEach(line => {
          const step = line.replace(/^\d+\.\s*/, '').trim(); // 番号を除去
          if (step) {
            addStepRow({ instruction: step });
          }
        });
      }
      
      manualModal.remove();
      alert('レシピ情報を適用しました！');
    });
  });

  // --- 起動時：既存レシピ読み込みまたは空行追加 ---
  (function initializeForm(){
    try{
      // カスタムカテゴリとタグを読み込み
      loadCustomCategories();
      loadCustomTags();
      
      // データベースからカテゴリーとタグを読み込み
      loadCategoriesFromDB();
      loadTagsFromDB();
      
      // 初期レシピタイプを設定
      updateRecipeTypeByCategory();
      
      const aiRecipe = localStorage.getItem('ai_generated_recipe');
      if (aiRecipe) {
        const data = JSON.parse(aiRecipe);
        if (titleEl) titleEl.value = data.title || '';
        selectedCategory = data.category || '';
        selectedTags = data.tags || [];
        updateCategorySelect();
        updateTagSelect();
        if (notesEl) notesEl.value = data.notes || '';
        if (ingredientsEditor) ingredientsEditor.innerHTML = '';
        (data.ingredients || []).forEach(ing => addIngredientRow(ing));
        if (stepsEditor) stepsEditor.innerHTML = '';
        (data.steps || []).forEach(step => addStepRow({ instruction: step }));
        localStorage.removeItem('ai_generated_recipe');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const recipeId = params.get('id');
      if (recipeId) {
        loadExistingRecipe(recipeId);
      } else {
        addIngredientRow(); 
        addStepRow();
      }
    }catch(e){
      console.error('フォーム初期化エラー:', e);
      addIngredientRow(); 
      addStepRow();
    }
  })();

  // 既存レシピの読み込み
  async function loadExistingRecipe(id) {
    try {
      const { data: recipe, error } = await sb.from('recipes').select('*').eq('id', id).single();
      if (error) throw error;
      if (titleEl) titleEl.value = recipe.title || '';
      selectedCategory = recipe.category || '';
      selectedTags = Array.isArray(recipe.tags) ? recipe.tags : [];
      updateCategorySelect();
      updateTagSelect();
      if (servingsEl && recipe.servings !== undefined) {
        servingsEl.value = recipe.servings || '';
      }
      if (notesEl) notesEl.value = recipe.notes || '';
      const { data: ingredients } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position');
      if (ingredientsEditor) ingredientsEditor.innerHTML = '';
      if (ingredients && ingredients.length > 0) {
        ingredients.forEach(ing => addIngredientRow(ing));
      } else {
        addIngredientRow();
      }
      const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position');
      if (stepsEditor) stepsEditor.innerHTML = '';
      if (steps && steps.length > 0) {
        steps.forEach(step => addStepRow({ instruction: step.instruction || '' }));
      } else {
        addStepRow();
      }
    } catch (error) {
      console.error('既存レシピ読み込みエラー:', error);
      addIngredientRow();
      addStepRow();
    }
  }
});