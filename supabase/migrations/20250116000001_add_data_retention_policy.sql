-- データ保持ポリシー: 6ヶ月分のデータのみ保持
-- 古いデータは自動的に削除される

-- データ保持期間の設定（6ヶ月 = 180日）
CREATE OR REPLACE FUNCTION cleanup_old_usage_data()
RETURNS void AS $$
BEGIN
    -- 6ヶ月前の日付を計算
    DECLARE
        cutoff_date DATE := CURRENT_DATE - INTERVAL '6 months';
        cutoff_date_str TEXT := to_char(cutoff_date, 'YYYY-MM-DD');
    BEGIN
        -- 古い日次データを削除
        DELETE FROM public.api_usage_stats 
        WHERE usage_type = 'daily' 
        AND date_key < cutoff_date_str;
        
        -- 古い月次データを削除（6ヶ月前の月より古いもの）
        DELETE FROM public.api_usage_stats 
        WHERE usage_type = 'monthly' 
        AND date_key < to_char(cutoff_date, 'YYYY-MM');
        
        -- 古いデバイス統計を削除（6ヶ月間アクセスがないデバイス）
        DELETE FROM public.device_usage_stats 
        WHERE last_access < cutoff_date;
        
        -- ログ出力
        RAISE NOTICE 'Cleaned up data older than %', cutoff_date_str;
    END;
END;
$$ LANGUAGE plpgsql;

-- データクリーンアップ用の関数（手動実行用）
CREATE OR REPLACE FUNCTION manual_cleanup_old_data()
RETURNS TABLE(
    deleted_daily_count INTEGER,
    deleted_monthly_count INTEGER,
    deleted_device_count INTEGER,
    cutoff_date TEXT
) AS $$
DECLARE
    cutoff_date DATE := CURRENT_DATE - INTERVAL '6 months';
    cutoff_date_str TEXT := to_char(cutoff_date, 'YYYY-MM-DD');
    daily_count INTEGER;
    monthly_count INTEGER;
    device_count INTEGER;
BEGIN
    -- 削除前の件数を取得
    SELECT COUNT(*) INTO daily_count 
    FROM public.api_usage_stats 
    WHERE usage_type = 'daily' AND date_key < cutoff_date_str;
    
    SELECT COUNT(*) INTO monthly_count 
    FROM public.api_usage_stats 
    WHERE usage_type = 'monthly' AND date_key < to_char(cutoff_date, 'YYYY-MM');
    
    SELECT COUNT(*) INTO device_count 
    FROM public.device_usage_stats 
    WHERE last_access < cutoff_date;
    
    -- データを削除
    DELETE FROM public.api_usage_stats 
    WHERE usage_type = 'daily' AND date_key < cutoff_date_str;
    
    DELETE FROM public.api_usage_stats 
    WHERE usage_type = 'monthly' AND date_key < to_char(cutoff_date, 'YYYY-MM');
    
    DELETE FROM public.device_usage_stats 
    WHERE last_access < cutoff_date;
    
    -- 結果を返す
    RETURN QUERY SELECT 
        daily_count,
        monthly_count,
        device_count,
        cutoff_date_str;
END;
$$ LANGUAGE plpgsql;

-- 自動クリーンアップ用のスケジュール設定（pg_cron拡張が必要）
-- 注意: pg_cronが有効でない場合は、アプリケーション側で定期実行する必要があります
-- SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_usage_data();');

-- データ保持ポリシーの確認用ビュー
CREATE OR REPLACE VIEW data_retention_status AS
SELECT 
    'daily' as data_type,
    COUNT(*) as record_count,
    MIN(date_key) as oldest_date,
    MAX(date_key) as newest_date,
    MIN(date_key)::DATE as oldest_date_parsed,
    MAX(date_key)::DATE as newest_date_parsed,
    (MAX(date_key)::DATE - MIN(date_key)::DATE) as date_range_days
FROM public.api_usage_stats 
WHERE usage_type = 'daily'

UNION ALL

SELECT 
    'monthly' as data_type,
    COUNT(*) as record_count,
    MIN(date_key) as oldest_date,
    MAX(date_key) as newest_date,
    MIN(date_key)::DATE as oldest_date_parsed,
    MAX(date_key)::DATE as newest_date_parsed,
    (MAX(date_key)::DATE - MIN(date_key)::DATE) as date_range_days
FROM public.api_usage_stats 
WHERE usage_type = 'monthly'

UNION ALL

SELECT 
    'devices' as data_type,
    COUNT(*) as record_count,
    MIN(last_access::TEXT) as oldest_date,
    MAX(last_access::TEXT) as newest_date,
    MIN(last_access::DATE) as oldest_date_parsed,
    MAX(last_access::DATE) as newest_date_parsed,
    (MAX(last_access::DATE) - MIN(last_access::DATE)) as date_range_days
FROM public.device_usage_stats;

-- データ保持ポリシーの設定を記録
INSERT INTO public.api_usage_stats (
    date_key, month_key, usage_type, api_calls, data_submissions, device_count, created_at, updated_at
) VALUES 
    ('data_retention_policy', 'system', 'policy', 180, 0, 0, NOW(), NOW())
ON CONFLICT (date_key, usage_type) 
DO UPDATE SET 
    api_calls = 180,  -- 保持期間（日数）
    updated_at = NOW();
