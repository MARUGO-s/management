-- Supabaseデータベーススキーマ修正用SQL
-- recipesテーブルにservingsカラムを追加

-- 1. 現在のテーブル構造を確認
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'recipes' 
ORDER BY ordinal_position;

-- 2. servingsカラムを追加（存在しない場合）
ALTER TABLE recipes 
ADD COLUMN IF NOT EXISTS servings INTEGER;

-- 3. 既存のレコードにデフォルト値を設定
UPDATE recipes 
SET servings = 4 
WHERE servings IS NULL;

-- 4. 修正後のテーブル構造を確認
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'recipes' 
ORDER BY ordinal_position;

-- 5. サンプルデータでテスト
SELECT id, title, servings FROM recipes LIMIT 5;
