-- RLS（Row Level Security）の設定

-- RLSを有効化
ALTER TABLE translation_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_recipe_steps ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能
CREATE POLICY "Allow read access to translation_recipes" ON translation_recipes
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to translation_recipe_ingredients" ON translation_recipe_ingredients
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to translation_recipe_steps" ON translation_recipe_steps
  FOR SELECT USING (true);

-- 全ユーザーが挿入可能
CREATE POLICY "Allow insert access to translation_recipes" ON translation_recipes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow insert access to translation_recipe_ingredients" ON translation_recipe_ingredients
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow insert access to translation_recipe_steps" ON translation_recipe_steps
  FOR INSERT WITH CHECK (true);

-- 全ユーザーが更新可能
CREATE POLICY "Allow update access to translation_recipes" ON translation_recipes
  FOR UPDATE USING (true);

CREATE POLICY "Allow update access to translation_recipe_ingredients" ON translation_recipe_ingredients
  FOR UPDATE USING (true);

CREATE POLICY "Allow update access to translation_recipe_steps" ON translation_recipe_steps
  FOR UPDATE USING (true);

-- 全ユーザーが削除可能
CREATE POLICY "Allow delete access to translation_recipes" ON translation_recipes
  FOR DELETE USING (true);

CREATE POLICY "Allow delete access to translation_recipe_ingredients" ON translation_recipe_ingredients
  FOR DELETE USING (true);

CREATE POLICY "Allow delete access to translation_recipe_steps" ON translation_recipe_steps
  FOR DELETE USING (true);


