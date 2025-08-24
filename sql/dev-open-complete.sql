
-- dev-open-complete.sql
-- すべて匿名で使える開発モード（本番では絶対に使わないでください）

create extension if not exists pgcrypto;

begin;

-- === NOT NULL を外す（存在すれば） =========================
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='recipes'
      and column_name='user_id' and is_nullable='NO'
  ) then
    execute 'alter table public.recipes alter column user_id drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='cost_runs'
      and column_name='user_id' and is_nullable='NO'
  ) then
    execute 'alter table public.cost_runs alter column user_id drop not null';
  end if;
end $$;

-- === favorites を作成（無ければ） =========================
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid,           -- 将来の本番RLS用
  client_id  text,           -- ログイン無しの識別子（ブラウザ毎）
  recipe_id  uuid not null references public.recipes(id) on delete cascade
);

-- インデックス & 部分ユニーク
create index if not exists idx_fav_recipe on public.favorites(recipe_id);
create index if not exists idx_fav_client on public.favorites(client_id);
create index if not exists idx_fav_user   on public.favorites(user_id);
create unique index if not exists uq_fav_user_recipe
  on public.favorites(user_id, recipe_id) where user_id is not null;
create unique index if not exists uq_fav_client_recipe
  on public.favorites(client_id, recipe_id) where client_id is not null;

-- === RLS をON =============================================
alter table if exists public.recipes            enable row level security;
alter table if exists public.recipe_ingredients enable row level security;
alter table if exists public.recipe_steps       enable row level security;
alter table if exists public.cost_runs          enable row level security;
alter table if exists public.cost_items         enable row level security;
alter table if exists public.favorites          enable row level security;

-- === 全開放ポリシー（drop -> create） =====================
-- recipes
drop policy if exists "open recipes select" on public.recipes;
create policy "open recipes select" on public.recipes for select using (true);
drop policy if exists "open recipes insert" on public.recipes;
create policy "open recipes insert" on public.recipes for insert with check (true);
drop policy if exists "open recipes update" on public.recipes;
create policy "open recipes update" on public.recipes for update using (true);
drop policy if exists "open recipes delete" on public.recipes;
create policy "open recipes delete" on public.recipes for delete using (true);

-- recipe_ingredients
drop policy if exists "open ings select" on public.recipe_ingredients;
create policy "open ings select" on public.recipe_ingredients for select using (true);
drop policy if exists "open ings insert" on public.recipe_ingredients;
create policy "open ings insert" on public.recipe_ingredients for insert with check (true);
drop policy if exists "open ings update" on public.recipe_ingredients;
create policy "open ings update" on public.recipe_ingredients for update using (true);
drop policy if exists "open ings delete" on public.recipe_ingredients;
create policy "open ings delete" on public.recipe_ingredients for delete using (true);

-- recipe_steps
drop policy if exists "open steps select" on public.recipe_steps;
create policy "open steps select" on public.recipe_steps for select using (true);
drop policy if exists "open steps insert" on public.recipe_steps;
create policy "open steps insert" on public.recipe_steps for insert with check (true);
drop policy if exists "open steps update" on public.recipe_steps;
create policy "open steps update" on public.recipe_steps for update using (true);
drop policy if exists "open steps delete" on public.recipe_steps;
create policy "open steps delete" on public.recipe_steps for delete using (true);

-- cost_runs
drop policy if exists "open runs select" on public.cost_runs;
create policy "open runs select" on public.cost_runs for select using (true);
drop policy if exists "open runs insert" on public.cost_runs;
create policy "open runs insert" on public.cost_runs for insert with check (true);
drop policy if exists "open runs update" on public.cost_runs;
create policy "open runs update" on public.cost_runs for update using (true);
drop policy if exists "open runs delete" on public.cost_runs;
create policy "open runs delete" on public.cost_runs for delete using (true);

-- cost_items
drop policy if exists "open items select" on public.cost_items;
create policy "open items select" on public.cost_items for select using (true);
drop policy if exists "open items insert" on public.cost_items;
create policy "open items insert" on public.cost_items for insert with check (true);
drop policy if exists "open items update" on public.cost_items;
create policy "open items update" on public.cost_items for update using (true);
drop policy if exists "open items delete" on public.cost_items;
create policy "open items delete" on public.cost_items for delete using (true);

-- favorites
drop policy if exists "open fav select" on public.favorites;
create policy "open fav select" on public.favorites for select using (true);
drop policy if exists "open fav insert" on public.favorites;
create policy "open fav insert" on public.favorites for insert with check (true);
drop policy if exists "open fav delete" on public.favorites;
create policy "open fav delete" on public.favorites for delete using (true);

commit;
