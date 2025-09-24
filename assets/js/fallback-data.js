/**
 * フォールバックデータ - データベーステーブルが存在しない場合の代替データ
 */

// サンプルレシピデータ
window.FALLBACK_DATA = {
  recipes: [
    {
      id: 'sample-001',
      title: 'シンプルなトマトパスタ',
      description: '基本的なトマトソースパスタのレシピです。',
      category: 'パスタ',
      tags: ['イタリアン', '簡単', '30分以内'],
      servings: 2,
      prep_time: 10,
      cook_time: 20,
      total_time: 30,
      difficulty: 'easy',
      source_url: null,
      image_url: null,
      notes: 'トマトの酸味とニンニクの香りがポイントです。',
      nutrition_info: null,
      created_at: '2025-01-15T09:00:00Z',
      updated_at: '2025-01-15T09:00:00Z'
    },
    {
      id: 'sample-002',
      title: 'チョコレートケーキ',
      description: 'しっとりとしたチョコレートケーキのレシピです。',
      category: 'デザート',
      tags: ['お菓子', 'チョコレート', '記念日'],
      servings: 8,
      prep_time: 30,
      cook_time: 45,
      total_time: 75,
      difficulty: 'medium',
      source_url: null,
      image_url: null,
      notes: '焼き時間は様子を見ながら調整してください。',
      nutrition_info: null,
      created_at: '2025-01-15T10:00:00Z',
      updated_at: '2025-01-15T10:00:00Z'
    },
    {
      id: 'sample-003',
      title: '野菜炒め',
      description: 'シンプルで栄養満点の野菜炒めです。',
      category: 'メイン',
      tags: ['簡単', '健康的', '10分以内'],
      servings: 2,
      prep_time: 5,
      cook_time: 5,
      total_time: 10,
      difficulty: 'easy',
      source_url: null,
      image_url: null,
      notes: '野菜はお好みのものを使ってください。',
      nutrition_info: null,
      created_at: '2025-01-15T11:00:00Z',
      updated_at: '2025-01-15T11:00:00Z'
    },
    {
      id: 'sample-004',
      title: 'フランスパン',
      description: '本格的なフランスパンを自宅で作ります。',
      category: 'パン',
      tags: ['手作りパン', 'フランス料理'],
      servings: 4,
      prep_time: 120,
      cook_time: 30,
      total_time: 150,
      difficulty: 'hard',
      source_url: null,
      image_url: null,
      notes: '発酵時間をしっかり取ることが重要です。',
      nutrition_info: null,
      created_at: '2025-01-15T12:00:00Z',
      updated_at: '2025-01-15T12:00:00Z'
    },
    {
      id: 'sample-005',
      title: 'AIが提案するカレー',
      description: 'AIが最適な配合で提案するカレーレシピです。',
      category: 'メイン',
      tags: ['AI制作', 'カレー', 'スパイス'],
      servings: 4,
      prep_time: 20,
      cook_time: 40,
      total_time: 60,
      difficulty: 'medium',
      source_url: null,
      image_url: null,
      notes: 'AIが計算した最適なスパイスバランスです。',
      nutrition_info: null,
      created_at: '2025-01-15T13:00:00Z',
      updated_at: '2025-01-15T13:00:00Z'
    },
    {
      id: 'sample-006',
      title: 'オンラインレシピのパスタ',
      description: '人気サイトから取得したパスタレシピです。',
      category: 'パスタ',
      tags: ['イタリアン', 'オンライン'],
      servings: 2,
      prep_time: 15,
      cook_time: 15,
      total_time: 30,
      difficulty: 'medium',
      source_url: 'https://example.com/pasta-recipe',
      image_url: null,
      notes: 'オンラインから取得したレシピを参考にしています。',
      nutrition_info: null,
      created_at: '2025-01-15T14:00:00Z',
      updated_at: '2025-01-15T14:00:00Z'
    }
  ],

  categories: [
    { id: 1, name: 'アミューズ', created_at: '2025-01-15T09:00:00Z' },
    { id: 2, name: '前菜', created_at: '2025-01-15T09:00:00Z' },
    { id: 3, name: 'ソース', created_at: '2025-01-15T09:00:00Z' },
    { id: 4, name: 'スープ', created_at: '2025-01-15T09:00:00Z' },
    { id: 5, name: 'パスタ', created_at: '2025-01-15T09:00:00Z' },
    { id: 6, name: '魚料理', created_at: '2025-01-15T09:00:00Z' },
    { id: 7, name: '肉料理', created_at: '2025-01-15T09:00:00Z' },
    { id: 8, name: 'メイン', created_at: '2025-01-15T09:00:00Z' },
    { id: 9, name: 'デザート', created_at: '2025-01-15T09:00:00Z' },
    { id: 10, name: 'パン', created_at: '2025-01-15T09:00:00Z' },
    { id: 11, name: 'その他', created_at: '2025-01-15T09:00:00Z' }
  ],

  recipe_ingredients: [
    { id: 1, recipe_id: 'sample-001', position: 1, item: 'パスタ', quantity: '200', unit: 'g', created_at: '2025-01-15T09:00:00Z' },
    { id: 2, recipe_id: 'sample-001', position: 2, item: 'トマト缶', quantity: '1', unit: '缶', created_at: '2025-01-15T09:00:00Z' },
    { id: 3, recipe_id: 'sample-001', position: 3, item: 'にんにく', quantity: '2', unit: '片', created_at: '2025-01-15T09:00:00Z' },
    { id: 4, recipe_id: 'sample-001', position: 4, item: 'オリーブオイル', quantity: '大さじ2', unit: '', created_at: '2025-01-15T09:00:00Z' },
    { id: 5, recipe_id: 'sample-002', position: 1, item: 'チョコレート', quantity: '200', unit: 'g', created_at: '2025-01-15T09:00:00Z' },
    { id: 6, recipe_id: 'sample-002', position: 2, item: 'バター', quantity: '100', unit: 'g', created_at: '2025-01-15T09:00:00Z' },
    { id: 7, recipe_id: 'sample-002', position: 3, item: '卵', quantity: '3', unit: '個', created_at: '2025-01-15T09:00:00Z' },
    { id: 8, recipe_id: 'sample-002', position: 4, item: '薄力粉', quantity: '80', unit: 'g', created_at: '2025-01-15T09:00:00Z' }
  ],

  recipe_steps: [
    { id: 1, recipe_id: 'sample-001', position: 1, instruction: 'パスタを茹でる準備をします。大きな鍋にたっぷりの湯を沸かし、塩を加えます。', created_at: '2025-01-15T09:00:00Z' },
    { id: 2, recipe_id: 'sample-001', position: 2, instruction: 'にんにくをみじん切りにし、オリーブオイルで炒めます。', created_at: '2025-01-15T09:00:00Z' },
    { id: 3, recipe_id: 'sample-001', position: 3, instruction: 'トマト缶を加えて煮込み、塩胡椒で味を調えます。', created_at: '2025-01-15T09:00:00Z' },
    { id: 4, recipe_id: 'sample-001', position: 4, instruction: '茹でたパスタとソースを和えて完成です。', created_at: '2025-01-15T09:00:00Z' },
    { id: 5, recipe_id: 'sample-002', position: 1, instruction: 'チョコレートとバターを湯煎で溶かします。', created_at: '2025-01-15T09:00:00Z' },
    { id: 6, recipe_id: 'sample-002', position: 2, instruction: '卵を一つずつ加えてよく混ぜます。', created_at: '2025-01-15T09:00:00Z' },
    { id: 7, recipe_id: 'sample-002', position: 3, instruction: '薄力粉をふるって加え、さっくりと混ぜます。', created_at: '2025-01-15T09:00:00Z' },
    { id: 8, recipe_id: 'sample-002', position: 4, instruction: '型に流し入れ、180度のオーブンで45分焼きます。', created_at: '2025-01-15T09:00:00Z' }
  ],

  favorites: [
    { id: 1, recipe_id: 'sample-001', client_id: 'default_client', created_at: '2025-01-15T09:00:00Z' },
    { id: 2, recipe_id: 'sample-002', client_id: 'default_client', created_at: '2025-01-15T09:00:00Z' }
  ]
};

/**
 * フォールバックデータ取得関数
 */
window.getFallbackData = (tableName, filters = {}) => {
  console.log(`📦 フォールバックデータ取得: ${tableName}`, filters);

  if (!window.FALLBACK_DATA[tableName]) {
    console.warn(`⚠️ フォールバックデータが見つかりません: ${tableName}`);
    return [];
  }

  let data = [...window.FALLBACK_DATA[tableName]];

  // 簡単なフィルタリング機能
  Object.keys(filters).forEach(key => {
    if (filters[key] !== undefined && filters[key] !== null) {
      if (Array.isArray(filters[key])) {
        data = data.filter(item => filters[key].includes(item[key]));
      } else {
        data = data.filter(item => item[key] === filters[key]);
      }
    }
  });

  console.log(`✅ フォールバックデータ取得完了: ${data.length}件`);
  return data;
};

/**
 * Supabaseクエリの代替実装
 */
window.createFallbackSupabaseQuery = (tableName) => {
  return {
    select: (columns = '*') => {
      return {
        eq: (column, value) => ({
          then: (callback) => {
            const data = window.getFallbackData(tableName, { [column]: value });
            callback({ data, error: null });
            return { catch: () => {} };
          }
        }),
        in: (column, values) => ({
          then: (callback) => {
            const data = window.getFallbackData(tableName).filter(item =>
              values.includes(item[column])
            );
            callback({ data, error: null });
            return { catch: () => {} };
          }
        }),
        contains: (column, values) => ({
          then: (callback) => {
            const data = window.getFallbackData(tableName).filter(item => {
              if (!item[column] || !Array.isArray(item[column])) return false;
              return values.some(value => item[column].includes(value));
            });
            callback({ data, error: null });
            return { catch: () => {} };
          }
        }),
        or: (condition) => ({
          then: (callback) => {
            // 簡単なOR条件の実装（AIレシピ用）
            let data = [];
            if (condition.includes('tags.cs.')) {
              data = window.getFallbackData(tableName).filter(item => {
                return item.tags && (
                  item.tags.includes('AI制作') ||
                  item.tags.includes('GPT制作')
                );
              });
            }
            callback({ data, error: null });
            return { catch: () => {} };
          }
        }),
        not: (column, operator, value) => ({
          then: (callback) => {
            const data = window.getFallbackData(tableName).filter(item => {
              if (operator === 'is' && value === null) {
                return item[column] !== null && item[column] !== undefined;
              }
              return true;
            });
            callback({ data, error: null });
            return { catch: () => {} };
          }
        }),
        order: () => ({
          then: (callback) => {
            const data = window.getFallbackData(tableName);
            callback({ data, error: null });
            return { catch: () => {} };
          }
        }),
        then: (callback) => {
          const data = window.getFallbackData(tableName);
          callback({ data, error: null });
          return { catch: () => {} };
        }
      };
    }
  };
};

console.log('📦 フォールバックデータモジュール読み込み完了');