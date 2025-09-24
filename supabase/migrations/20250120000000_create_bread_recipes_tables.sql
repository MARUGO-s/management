-- パン用レシピ（ベーカーズパーセンテージ対応）テーブル作成
-- 作成日: 2025-01-20

-- パン用レシピメインテーブル
CREATE TABLE IF NOT EXISTS bread_recipes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    flour_total_g INTEGER NOT NULL DEFAULT 500,
    pieces INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- パン用レシピの粉グループテーブル
CREATE TABLE IF NOT EXISTS bread_recipe_flours (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bread_recipe_id UUID NOT NULL REFERENCES bread_recipes(id) ON DELETE CASCADE,
    flour_name TEXT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    grams INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- パン用レシピの材料テーブル（粉以外）
CREATE TABLE IF NOT EXISTS bread_recipe_ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bread_recipe_id UUID NOT NULL REFERENCES bread_recipes(id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    grams INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_bread_recipes_created_at ON bread_recipes(created_at);
CREATE INDEX IF NOT EXISTS idx_bread_recipe_flours_recipe_id ON bread_recipe_flours(bread_recipe_id);
CREATE INDEX IF NOT EXISTS idx_bread_recipe_ingredients_recipe_id ON bread_recipe_ingredients(bread_recipe_id);

-- RLS（Row Level Security）ポリシー設定
ALTER TABLE bread_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bread_recipe_flours ENABLE ROW LEVEL SECURITY;
ALTER TABLE bread_recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザーでも読み書き可能なポリシー
CREATE POLICY "Allow all operations for bread_recipes" ON bread_recipes
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for bread_recipe_flours" ON bread_recipe_flours
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for bread_recipe_ingredients" ON bread_recipe_ingredients
    FOR ALL USING (true) WITH CHECK (true);

-- 更新日時自動更新のトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 更新日時自動更新トリガー
CREATE TRIGGER update_bread_recipes_updated_at 
    BEFORE UPDATE ON bread_recipes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- コメント追加
COMMENT ON TABLE bread_recipes IS 'パン用レシピ（ベーカーズパーセンテージ対応）のメインテーブル';
COMMENT ON TABLE bread_recipe_flours IS 'パン用レシピの粉グループ（小麦粉、全粒粉など）';
COMMENT ON TABLE bread_recipe_ingredients IS 'パン用レシピの材料（粉以外：水、塩、砂糖など）';

COMMENT ON COLUMN bread_recipes.flour_total_g IS '粉の総重量（グラム）';
COMMENT ON COLUMN bread_recipes.pieces IS '分割数（何個に分けるか）';

COMMENT ON COLUMN bread_recipe_flours.percentage IS '粉に対する割合（常に100%）';
COMMENT ON COLUMN bread_recipe_flours.grams IS '粉の重量（グラム）';

COMMENT ON COLUMN bread_recipe_ingredients.percentage IS '粉総量に対する割合（%）';
COMMENT ON COLUMN bread_recipe_ingredients.grams IS '材料の重量（グラム）';
