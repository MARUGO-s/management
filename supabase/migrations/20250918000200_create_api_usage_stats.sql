-- API使用量統計テーブル作成
CREATE TABLE IF NOT EXISTS public.api_usage_stats (
    id BIGSERIAL PRIMARY KEY,
    date_key VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD' 形式
    month_key VARCHAR(7) NOT NULL, -- 'YYYY-MM' 形式
    usage_type VARCHAR(20) NOT NULL, -- 'daily', 'monthly', 'total'
    api_calls INTEGER NOT NULL DEFAULT 0,
    data_submissions INTEGER NOT NULL DEFAULT 0,
    device_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 一意制約：同じ日付・タイプの重複防止
    UNIQUE(date_key, usage_type)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_api_usage_date_key ON public.api_usage_stats(date_key);
CREATE INDEX IF NOT EXISTS idx_api_usage_month_key ON public.api_usage_stats(month_key);
CREATE INDEX IF NOT EXISTS idx_api_usage_type ON public.api_usage_stats(usage_type);

-- デバイス別統計テーブル
CREATE TABLE IF NOT EXISTS public.device_usage_stats (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    device_info JSONB,
    first_access TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_access TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_api_calls INTEGER NOT NULL DEFAULT 0,
    total_data_submissions INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 一意制約：デバイスID重複防止
    UNIQUE(device_id)
);

-- デバイステーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_device_usage_device_id ON public.device_usage_stats(device_id);
CREATE INDEX IF NOT EXISTS idx_device_usage_last_access ON public.device_usage_stats(last_access);

-- 初期データ挿入（今日の日付で初期化）
INSERT INTO public.api_usage_stats (date_key, month_key, usage_type, api_calls, data_submissions, device_count)
VALUES 
    (CURRENT_DATE::TEXT, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'daily', 0, 0, 0),
    (TO_CHAR(CURRENT_DATE, 'YYYY-MM'), TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'monthly', 0, 0, 0),
    ('total', 'total', 'total', 0, 0, 0)
ON CONFLICT (date_key, usage_type) DO NOTHING;

-- RLS (Row Level Security) 有効化
ALTER TABLE public.api_usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_usage_stats ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザーに読み取り・更新権限を付与
CREATE POLICY "Allow anonymous read api_usage_stats" ON public.api_usage_stats
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous update api_usage_stats" ON public.api_usage_stats
    FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous insert api_usage_stats" ON public.api_usage_stats
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous read device_usage_stats" ON public.device_usage_stats
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous update device_usage_stats" ON public.device_usage_stats
    FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous insert device_usage_stats" ON public.device_usage_stats
    FOR INSERT WITH CHECK (true);

-- 更新時刻自動更新のトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- トリガー設定
CREATE TRIGGER update_api_usage_stats_updated_at 
    BEFORE UPDATE ON public.api_usage_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_usage_stats_updated_at 
    BEFORE UPDATE ON public.device_usage_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
