-- ログイン試行の回数制限用（password-manager の verify が service role で使う）。
-- key は「接続元IPアドレス|パスワード種別」の SHA-256。生のIPアドレスは保存しない。
-- anon / ログイン利用者からは読み書きできない（RLS 有効・policy なし）。
create table if not exists public.login_failures (
  id bigint generated always as identity primary key,
  key text not null,
  failed_at timestamptz not null default now()
);

create index if not exists login_failures_key_failed_at_idx on public.login_failures (key, failed_at desc);
create index if not exists login_failures_failed_at_idx on public.login_failures (failed_at);

alter table public.login_failures enable row level security;
revoke all on table public.login_failures from anon, authenticated;
