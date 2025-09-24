-- 翻訳レシピ用の新しいテーブル構造

-- 翻訳レシピメインテーブル
CREATE TABLE IF NOT EXISTS translation_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_recipe_id BIGINT REFERENCES recipes(id) ON DELETE CASCADE,
  translated_title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  translated_description TEXT,
  original_description TEXT,
  language_code VARCHAR(10) NOT NULL, -- 'fr', 'it', 'ja', 'zh', 'es', 'de', 'en'
  category TEXT DEFAULT '翻訳レシピ',
  tags TEXT[] DEFAULT ARRAY['翻訳', '多言語'],
  servings INTEGER DEFAULT 4,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 翻訳レシピ材料テーブル
CREATE TABLE IF NOT EXISTS translation_recipe_ingredients (
  id SERIAL PRIMARY KEY,
  translation_recipe_id UUID REFERENCES translation_recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  translated_item TEXT,
  original_item TEXT,
  quantity TEXT,
  unit TEXT,
  price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 翻訳レシピ手順テーブル
CREATE TABLE IF NOT EXISTS translation_recipe_steps (
  id SERIAL PRIMARY KEY,
  translation_recipe_id UUID REFERENCES translation_recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  translated_instruction TEXT,
  original_instruction TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_translation_recipes_original_recipe_id ON translation_recipes(original_recipe_id);
CREATE INDEX IF NOT EXISTS idx_translation_recipes_language_code ON translation_recipes(language_code);
CREATE INDEX IF NOT EXISTS idx_translation_recipe_ingredients_recipe_id ON translation_recipe_ingredients(translation_recipe_id);
CREATE INDEX IF NOT EXISTS idx_translation_recipe_steps_recipe_id ON translation_recipe_steps(translation_recipe_id);

-- コメントの追加
COMMENT ON TABLE translation_recipes IS '翻訳レシピのメインテーブル';
COMMENT ON TABLE translation_recipe_ingredients IS '翻訳レシピの材料テーブル';
COMMENT ON TABLE translation_recipe_steps IS '翻訳レシピの手順テーブル';

COMMENT ON COLUMN translation_recipes.original_recipe_id IS '元のレシピID（外部キー）';
COMMENT ON COLUMN translation_recipes.translated_title IS '翻訳された料理名';
COMMENT ON COLUMN translation_recipes.original_title IS '元の日本語料理名';
COMMENT ON COLUMN translation_recipes.translated_description IS '翻訳された説明';
COMMENT ON COLUMN translation_recipes.original_description IS '元の日本語説明';
COMMENT ON COLUMN translation_recipes.language_code IS '翻訳言語コード';


