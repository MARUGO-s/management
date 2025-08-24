document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase === 'undefined') {
        alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
        return;
    }

    const sb = supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");

    const cardListEl = document.getElementById('cardList');
    const tabsContainer = document.querySelector('.tabs');
    const newButtons = document.querySelectorAll('.js-new');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const categoryButtons = document.querySelectorAll('.category-btn');

    if (!cardListEl || !tabsContainer) {
        console.error("Element with id 'cardList' or class 'tabs' not found.");
        return;
    }

    let allRecipes = [];
    let favoriteRecipes = [];
    let currentTab = 'all';
    let currentCategoryFilter = 'all';
    let currentSearchTerm = '';
    let filteredRecipes = [];

    const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>\"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
    
    const getClientId = () => {
        let clientId = localStorage.getItem("client_id");
        if (!clientId) {
            clientId = crypto?.randomUUID?.() || String(Math.random()).slice(2);
            localStorage.setItem("client_id", clientId);
        }
        return clientId;
    };

    const fetchAllRecipes = async () => {
        console.log('Fetching all recipes from Supabase...');
        const { data, error } = await sb.from("recipes").select("id,title,category,created_at").order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch recipes:', error);
            throw error;
        }
        console.log(`Fetched ${data?.length || 0} recipes`);
        return data || [];
    };

    const fetchFavoriteRecipes = async () => {
        console.log('Fetching favorite recipes from Supabase...');
        const { data, error } = await sb.from("favorites").select("recipes!inner(id,title,category,created_at)").eq("client_id", getClientId()).order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch favorites:', error);
            throw error;
        }
        const favorites = (data || []).map(x => x.recipes);
        console.log(`Fetched ${favorites.length} favorite recipes`);
        return favorites;
    };

    const updateStats = () => {
        const totalRecipes = allRecipes.length;
        const favoriteCount = favoriteRecipes.length;

        const totalEl = document.getElementById('totalRecipes');
        const favoriteEl = document.getElementById('favoriteRecipes');
        
        if (totalEl) totalEl.textContent = totalRecipes;
        if (favoriteEl) favoriteEl.textContent = favoriteCount;
    };



    const filterRecipes = () => {
        let recipes = currentTab === 'favorites' ? favoriteRecipes : allRecipes;

        // カテゴリーフィルター
        if (currentCategoryFilter !== 'all' && currentCategoryFilter !== 'favorites') {
            recipes = recipes.filter(r => (r.category || 'その他') === currentCategoryFilter);
        }

        // 検索フィルター
        if (currentSearchTerm.trim()) {
            const searchLower = currentSearchTerm.toLowerCase();
            recipes = recipes.filter(r => 
                r.title.toLowerCase().includes(searchLower) ||
                (r.category && r.category.toLowerCase().includes(searchLower))
            );
        }

        filteredRecipes = recipes;
        return recipes;
    };
    
    const renderCards = (recipes) => {
        cardListEl.innerHTML = '';
        
        if (!recipes || recipes.length === 0) {
            const emptyMessage = document.getElementById('empty-message');
            if (currentSearchTerm.trim()) {
                cardListEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <h2>検索結果が見つかりません</h2>
                        <p>"${escapeHtml(currentSearchTerm)}" に一致するレシピがありません。</p>
                        <button class="btn primary" onclick="clearSearch()">
                            <i class="fas fa-times"></i>
                            検索をクリア
                        </button>
                    </div>
                `;
            } else {
                emptyMessage.style.display = 'block';
            }
            return;
        }

        document.getElementById('empty-message').style.display = 'none';

        // カテゴリーでグループ化（すべて表示時のみ）
        if (currentTab === 'all' && !currentSearchTerm.trim()) {
            const groupedRecipes = recipes.reduce((acc, recipe) => {
                const category = recipe.category || 'その他';
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(recipe);
                return acc;
            }, {});

            const categoryOrder = ['アミューズ', '前菜', 'スープ', 'パスタ', '魚料理', '肉料理', 'メイン', 'デザート', 'パン', 'その他'];
            const sortedCategories = Object.keys(groupedRecipes).sort((a, b) => {
                const indexA = categoryOrder.indexOf(a);
                const indexB = categoryOrder.indexOf(b);
                if (indexA > -1 && indexB > -1) return indexA - indexB;
                if (indexA > -1) return -1;
                if (indexB > -1) return 1;
                return a.localeCompare(b);
            });

            sortedCategories.forEach(category => {
                const categorySection = document.createElement('section');
                categorySection.className = 'category-section';
                const header = document.createElement('h2');
                header.className = 'category-header';
                header.textContent = category;
                categorySection.appendChild(header);

                const recipeGroup = document.createElement('div');
                recipeGroup.className = 'recipe-group';
                groupedRecipes[category].forEach(r => {
                    recipeGroup.appendChild(createRecipeCard(r));
                });
                categorySection.appendChild(recipeGroup);
                cardListEl.appendChild(categorySection);
            });
        } else {
            // フィルター時はシンプルなグリッド表示
            cardListEl.className = 'card-grid';
            recipes.forEach(r => {
                cardListEl.appendChild(createRecipeCard(r));
            });
        }
    };

    const createRecipeCard = (recipe) => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        
        const date = new Date(recipe.created_at);
        const formattedDate = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const isFavorite = favoriteRecipes.some(fav => fav.id === recipe.id);
        
        card.innerHTML = `
            <div class="recipe-header">
                <h3 class="recipe-title">${escapeHtml(recipe.title)}</h3>
                <button class="favorite-btn ${isFavorite ? 'is-favorite' : ''}" data-recipe-id="${recipe.id}">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
        `;
        
        return card;
    };

    const updateView = () => {
        cardListEl.className = '';
        const recipes = filterRecipes();
        renderCards(recipes);
        updateCategoryButtons();
    };



    const setupTabs = () => {
        tabsContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('.tab');
            if (tab) {
                currentTab = tab.dataset.tab;
                updateActiveTab();
                updateView();
            }
        });
        updateActiveTab();
    };

    const updateActiveTab = () => {
        tabsContainer.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('is-active', t.dataset.tab === currentTab);
        });
    };

    const updateCategoryButtons = () => {
        categoryButtons.forEach(btn => {
            const category = btn.dataset.category;
            btn.classList.toggle('active', category === currentCategoryFilter);
        });
    };

    const setupSearch = () => {
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchTerm = e.target.value;
                searchClear.style.display = currentSearchTerm ? 'block' : 'none';
                updateView();
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearSearch();
                }
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', clearSearch);
        }
    };

    const clearSearch = () => {
        if (searchInput) {
            searchInput.value = '';
            currentSearchTerm = '';
            searchClear.style.display = 'none';
            updateView();
        }
    };

    const setupCategoryFilter = () => {
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                currentCategoryFilter = btn.dataset.category;
                updateView();
            });
        });
    };



    const setupFavoriteToggle = () => {
        cardListEl.addEventListener('click', async (e) => {
            const favoriteBtn = e.target.closest('.favorite-btn');
            if (favoriteBtn) {
                e.stopPropagation();
                const recipeId = favoriteBtn.dataset.recipeId;
                const isFavorite = favoriteBtn.classList.contains('is-favorite');
                
                try {
                    if (isFavorite) {
                        await sb.from('favorites').delete()
                            .eq('recipe_id', recipeId)
                            .eq('client_id', getClientId());
                    } else {
                        await sb.from('favorites').insert({
                            recipe_id: recipeId,
                            client_id: getClientId()
                        });
                    }
                    
                    // お気に入りリストを再取得
                    favoriteRecipes = await fetchFavoriteRecipes();
                    updateStats();
                    updateView();
                } catch (error) {
                    console.error('Failed to toggle favorite:', error);
                }
            }
        });
    };

    // イベントリスナーの設定
    if (newButtons) {
        newButtons.forEach(btn => btn.addEventListener('click', () => location.href = 'recipe_edit.html'));
    }

    // 空の状態の新規作成ボタン
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-new-empty')) {
            location.href = 'recipe_edit.html';
        }
    });

    cardListEl.addEventListener('click', (e) => {
        const card = e.target.closest('.recipe-card');
        if (card && !e.target.closest('.favorite-btn')) {
            location.href = `recipe_view.html?id=${encodeURIComponent(card.dataset.id)}`;
        }
    });

    const init = async () => {
        cardListEl.innerHTML = '<div class="loading-spinner"></div>';
        
        try {
            console.log('Fetching recipes...');
            const [allResult, favResult] = await Promise.allSettled([
                fetchAllRecipes(), 
                fetchFavoriteRecipes()
            ]);

            if (allResult.status === 'rejected') {
                console.error('Failed to fetch all recipes:', allResult.reason);
            }
            if (favResult.status === 'rejected') {
                console.error('Failed to fetch favorites:', favResult.reason);
            }

            allRecipes = allResult.status === 'fulfilled' ? allResult.value : [];
            favoriteRecipes = favResult.status === 'fulfilled' ? favResult.value : [];

            console.log(`Loaded ${allRecipes.length} recipes, ${favoriteRecipes.length} favorites`);
            updateStats();
            updateView();
            setupTabs();
            setupSearch();
            setupCategoryFilter();
            setupFavoriteToggle();
        } catch (error) {
            console.error('Failed to initialize:', error);
            cardListEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2>データの読み込みに失敗しました</h2>
                    <p>エラー: ${error.message}</p>
                    <button class="btn primary" onclick="location.reload()">
                        <i class="fas fa-redo"></i>
                        再読み込み
                    </button>
                </div>
            `;
        }
    };

    // グローバル関数として公開
    window.clearSearch = clearSearch;

    init();
});