-- データ不一致レポートテーブルの作成
CREATE TABLE IF NOT EXISTS data_mismatch_reports (
    id BIGSERIAL PRIMARY KEY,
    report_id VARCHAR(50) NOT NULL UNIQUE, -- レポートID（例：DM-20250116-001）
    mismatch_count INTEGER NOT NULL DEFAULT 0, -- 不一致項目数
    sent_data_count INTEGER NOT NULL DEFAULT 0, -- 送信データ数
    registered_data_count INTEGER NOT NULL DEFAULT 0, -- 登録データ数
    sent_data JSONB, -- 送信したデータ
    registered_data JSONB, -- 登録されたデータ
    mismatch_details JSONB, -- 不一致の詳細
    environment_info JSONB, -- 環境情報
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_data_mismatch_reports_report_id ON data_mismatch_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_data_mismatch_reports_created_at ON data_mismatch_reports(created_at DESC);

-- RLS（Row Level Security）有効化
ALTER TABLE data_mismatch_reports ENABLE ROW LEVEL SECURITY;

-- service_role からのみアクセス可能
CREATE POLICY "Service role manage data mismatch reports" ON data_mismatch_reports
FOR ALL
USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- 更新時刻の自動更新トリガー
CREATE OR REPLACE FUNCTION update_data_mismatch_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_data_mismatch_reports_updated_at 
    BEFORE UPDATE ON data_mismatch_reports 
    FOR EACH ROW EXECUTE FUNCTION update_data_mismatch_reports_updated_at();
