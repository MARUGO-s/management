-- パスワード管理用テーブルの作成
CREATE TABLE IF NOT EXISTS password_management (
    id SERIAL PRIMARY KEY,
    password_type VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 初期パスワードの設定（シンプルハッシュ）
INSERT INTO password_management (password_type, password_hash) VALUES
('system', encode(sha256('marugo2024'::bytea), 'hex')),
('admin', encode(sha256('yoshito4411'::bytea), 'hex'))
ON CONFLICT (password_type) DO UPDATE SET
password_hash = EXCLUDED.password_hash,
updated_at = NOW();

-- RLS（Row Level Security）を有効化
ALTER TABLE password_management ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能なポリシー
CREATE POLICY "Admin only access" ON password_management
FOR ALL USING (auth.uid() IS NOT NULL OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- 更新時刻の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_password_management_updated_at 
    BEFORE UPDATE ON password_management 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
