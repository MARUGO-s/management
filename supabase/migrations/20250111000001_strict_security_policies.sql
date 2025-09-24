-- より厳格なセキュリティポリシー（オプション）
-- このファイルは将来のユーザー認証システム実装時に使用

-- 注意: このマイグレーションは現在実行しないでください
-- ユーザー認証システムが実装されてから実行すること

/*
-- 1. Recipes テーブルの厳格なポリシー（将来用）

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Allow recipe updates" ON recipes;
DROP POLICY IF EXISTS "Allow recipe deletes" ON recipes;

-- 厳格なポリシーを作成
CREATE POLICY "Users can only update own recipes" ON recipes
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can only delete own recipes" ON recipes
    FOR DELETE USING (auth.uid() = created_by);

-- 2. Recipe Ingredients の厳格なポリシー
DROP POLICY IF EXISTS "Allow recipe_ingredients update" ON recipe_ingredients;
DROP POLICY IF EXISTS "Allow recipe_ingredients delete" ON recipe_ingredients;

CREATE POLICY "Users can only update ingredients of own recipes" ON recipe_ingredients
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = recipe_ingredients.recipe_id 
            AND recipes.created_by = auth.uid()
        )
    );

CREATE POLICY "Users can only delete ingredients of own recipes" ON recipe_ingredients
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = recipe_ingredients.recipe_id 
            AND recipes.created_by = auth.uid()
        )
    );

-- 3. Recipe Steps の厳格なポリシー
DROP POLICY IF EXISTS "Allow recipe_steps update" ON recipe_steps;
DROP POLICY IF EXISTS "Allow recipe_steps delete" ON recipe_steps;

CREATE POLICY "Users can only update steps of own recipes" ON recipe_steps
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = recipe_steps.recipe_id 
            AND recipes.created_by = auth.uid()
        )
    );

CREATE POLICY "Users can only delete steps of own recipes" ON recipe_steps
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = recipe_steps.recipe_id 
            AND recipes.created_by = auth.uid()
        )
    );

-- 4. レシピ作成時に created_by を自動設定するトリガー
CREATE OR REPLACE FUNCTION set_recipe_owner()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_by = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_recipe_owner_trigger
    BEFORE INSERT ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION set_recipe_owner();

-- 5. セキュリティ監査ログテーブル
CREATE TABLE IF NOT EXISTS security_audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    user_id UUID,
    record_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. セキュリティ監査トリガー関数
CREATE OR REPLACE FUNCTION log_security_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO security_audit_log (table_name, operation, user_id, record_id)
    VALUES (TG_TABLE_NAME, TG_OP, auth.uid(), 
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- レシピの重要な操作をログに記録
CREATE TRIGGER recipes_security_log_trigger
    AFTER UPDATE OR DELETE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION log_security_event();
*/

-- 現在のセキュリティ設定確認用クエリ
SELECT 
    'Current Security Status' as info,
    'Run this query to check current policies:' as instruction,
    'SELECT * FROM security_audit ORDER BY tablename, operation;' as query;