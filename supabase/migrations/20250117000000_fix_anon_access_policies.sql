-- 匿名ユーザーアクセスの修正
-- 実行日: 2025年1月17日

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Authenticated users can insert categories" ON categories;
DROP POLICY IF EXISTS "Authenticated users can update categories" ON categories;
DROP POLICY IF EXISTS "Authenticated users can delete categories" ON categories;

DROP POLICY IF EXISTS "Authenticated users can insert tags" ON tags;
DROP POLICY IF EXISTS "Authenticated users can update tags" ON tags;
DROP POLICY IF EXISTS "Authenticated users can delete tags" ON tags;

-- 匿名ユーザーも許可する新しいポリシーを作成
CREATE POLICY "Allow insert for categories" ON categories
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Allow update for categories" ON categories
    FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Allow delete for categories" ON categories
    FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Allow insert for tags" ON tags
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Allow update for tags" ON tags
    FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Allow delete for tags" ON tags
    FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
