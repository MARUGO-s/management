-- 読みやすいテキスト形式のカラムを追加
ALTER TABLE recipes 
ADD COLUMN readable_text TEXT;

-- インデックスを追加（必要に応じて）
CREATE INDEX idx_recipes_readable_text ON recipes USING GIN (to_tsvector('english', readable_text));
