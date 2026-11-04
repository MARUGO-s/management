-- 2026-11-05 本番へ管理画面から適用済みの変更を記録する（再実行しても安全）。
-- password_management と使用量2テーブルは Edge Function が service role で使うだけなので、
-- anon / ログイン利用者向けの policy を置かない（RLS は有効のまま。service role は RLS を通らない）。
-- 新規登録の停止は Authentication の設定（Allow new users to sign up = OFF）で行い、supabase/config.toml にも記録する。

drop policy if exists "Admin only access" on public.password_management;

drop policy if exists "Allow anonymous insert api_usage_stats" on public.api_usage_stats;
drop policy if exists "Allow anonymous read api_usage_stats" on public.api_usage_stats;
drop policy if exists "Allow anonymous update api_usage_stats" on public.api_usage_stats;

drop policy if exists "Allow anonymous insert device_usage_stats" on public.device_usage_stats;
drop policy if exists "Allow anonymous read device_usage_stats" on public.device_usage_stats;
drop policy if exists "Allow anonymous update device_usage_stats" on public.device_usage_stats;

alter table public.password_management enable row level security;
alter table public.api_usage_stats enable row level security;
alter table public.device_usage_stats enable row level security;
