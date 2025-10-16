-- 2025年10月1日〜15日までのダミーデータを挿入
-- 日別データ（usage_type = 'daily'）

INSERT INTO public.api_usage_stats (date_key, month_key, usage_type, api_calls, data_submissions, device_count, created_at, updated_at)
VALUES 
    -- 10月1日（火） - 軽い使用
    ('2025-10-01', '2025-10', 'daily', 12, 3, 1, '2025-10-01 09:30:00+09', '2025-10-01 18:45:00+09'),
    
    -- 10月2日（水） - 中程度の使用
    ('2025-10-02', '2025-10', 'daily', 28, 7, 2, '2025-10-02 08:15:00+09', '2025-10-02 19:20:00+09'),
    
    -- 10月3日（木） - 軽い使用
    ('2025-10-03', '2025-10', 'daily', 8, 2, 1, '2025-10-03 10:00:00+09', '2025-10-03 17:30:00+09'),
    
    -- 10月4日（金） - 高使用
    ('2025-10-04', '2025-10', 'daily', 45, 12, 3, '2025-10-04 07:45:00+09', '2025-10-04 20:15:00+09'),
    
    -- 10月5日（土） - 休日軽使用
    ('2025-10-05', '2025-10', 'daily', 5, 1, 1, '2025-10-05 14:20:00+09', '2025-10-05 16:45:00+09'),
    
    -- 10月6日（日） - 休日軽使用
    ('2025-10-06', '2025-10', 'daily', 3, 1, 1, '2025-10-06 11:30:00+09', '2025-10-06 15:20:00+09'),
    
    -- 10月7日（月） - 週明け高使用
    ('2025-10-07', '2025-10', 'daily', 52, 15, 4, '2025-10-07 08:00:00+09', '2025-10-07 21:30:00+09'),
    
    -- 10月8日（火） - 中程度の使用
    ('2025-10-08', '2025-10', 'daily', 31, 8, 2, '2025-10-08 09:15:00+09', '2025-10-08 18:45:00+09'),
    
    -- 10月9日（水） - 軽い使用
    ('2025-10-09', '2025-10', 'daily', 15, 4, 1, '2025-10-09 10:30:00+09', '2025-10-09 17:15:00+09'),
    
    -- 10月10日（木） - 中程度の使用
    ('2025-10-10', '2025-10', 'daily', 38, 10, 3, '2025-10-10 08:45:00+09', '2025-10-10 19:20:00+09'),
    
    -- 10月11日（金） - 高使用
    ('2025-10-11', '2025-10', 'daily', 48, 13, 4, '2025-10-11 07:30:00+09', '2025-10-11 20:45:00+09'),
    
    -- 10月12日（土） - 休日軽使用
    ('2025-10-12', '2025-10', 'daily', 7, 2, 1, '2025-10-12 13:15:00+09', '2025-10-12 16:30:00+09'),
    
    -- 10月13日（日） - 休日軽使用
    ('2025-10-13', '2025-10', 'daily', 4, 1, 1, '2025-10-13 12:00:00+09', '2025-10-13 14:45:00+09'),
    
    -- 10月14日（月） - 週明け最高使用
    ('2025-10-14', '2025-10', 'daily', 67, 18, 5, '2025-10-14 07:15:00+09', '2025-10-14 22:00:00+09'),
    
    -- 10月15日（火） - 高使用
    ('2025-10-15', '2025-10', 'daily', 55, 14, 4, '2025-10-15 08:00:00+09', '2025-10-15 21:15:00+09')

ON CONFLICT (date_key, usage_type) 
DO UPDATE SET 
    api_calls = EXCLUDED.api_calls,
    data_submissions = EXCLUDED.data_submissions,
    device_count = EXCLUDED.device_count,
    updated_at = EXCLUDED.updated_at;

-- 月次統計も更新
INSERT INTO public.api_usage_stats (date_key, month_key, usage_type, api_calls, data_submissions, device_count, created_at, updated_at)
VALUES 
    ('2025-10', '2025-10', 'monthly', 377, 101, 5, '2025-10-01 00:00:00+09', '2025-10-15 21:15:00+09')

ON CONFLICT (date_key, usage_type) 
DO UPDATE SET 
    api_calls = EXCLUDED.api_calls,
    data_submissions = EXCLUDED.data_submissions,
    device_count = EXCLUDED.device_count,
    updated_at = EXCLUDED.updated_at;

-- 総計統計も更新
INSERT INTO public.api_usage_stats (date_key, month_key, usage_type, api_calls, data_submissions, device_count, created_at, updated_at)
VALUES 
    ('total', 'total', 'total', 377, 101, 5, '2025-10-01 00:00:00+09', '2025-10-15 21:15:00+09')

ON CONFLICT (date_key, usage_type) 
DO UPDATE SET 
    api_calls = EXCLUDED.api_calls,
    data_submissions = EXCLUDED.data_submissions,
    device_count = EXCLUDED.device_count,
    updated_at = EXCLUDED.updated_at;
