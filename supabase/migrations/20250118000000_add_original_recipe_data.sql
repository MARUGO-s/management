-- 翻訳前データを保存するためのカラムを追加
ALTER TABLE recipes 
ADD COLUMN original_recipe_data JSONB;

-- カラムにコメントを追加
COMMENT ON COLUMN recipes.original_recipe_data IS '海外サイトから取り込んだ場合の翻訳前データ（JSON形式）';

-- インデックスを追加（JSONBクエリのパフォーマンス向上）
CREATE INDEX idx_recipes_original_recipe_data ON recipes USING GIN (original_recipe_data);

-- 既存のレシピでoriginal_recipe_dataがNULLの場合は空のJSONオブジェクトを設定
UPDATE recipes 
SET original_recipe_data = '{}'::jsonb 
WHERE original_recipe_data IS NULL;
