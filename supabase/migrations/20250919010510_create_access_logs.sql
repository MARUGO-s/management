-- アクセス履歴テーブルの作成
CREATE TABLE IF NOT EXISTS access_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(120),
    description TEXT,
    device_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 作成日時で参照しやすいようインデックスを追加
CREATE INDEX IF NOT EXISTS access_logs_created_at_idx ON access_logs (created_at DESC);

-- RLS（Row Level Security）有効化
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- service_role からのみアクセス可能
CREATE POLICY "Service role manage access logs" ON access_logs
FOR ALL
USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
