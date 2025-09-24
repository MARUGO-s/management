-- AI創作レシピフラグを追加
-- 実行日: 2025年1月16日

-- recipesテーブルにis_ai_generatedカラムを追加
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- インデックスを追加（AI創作レシピの検索を高速化）
CREATE INDEX IF NOT EXISTS idx_recipes_is_ai_generated ON recipes(is_ai_generated);

-- コメントを追加
COMMENT ON COLUMN recipes.is_ai_generated IS 'AI創作レシピかどうかを示すフラグ';

-- 既存のレシピでsource_urlがnullまたは空の場合は、AI創作の可能性があるため
-- このマイグレーションでは既存データは変更しない（手動で必要に応じて更新）
