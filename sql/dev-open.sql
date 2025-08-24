-- dev-open.sql — ログイン不要で使えるよう一時的に全開放（開発用）
-- 安全上の注意：公開デプロイには使わないでください。すべての閲覧・変更が匿名で可能になります。

-- 1) NOT NULL を外す（auth.uid() なしでもINSERTできるように）
alter table if exists public.recipes   alter column user_id drop not null;
alter table if exists public.cost_runs alter column user_id drop not null;
alter table if exists public.favorites alter column user_id drop not null;

-- 2) favorites に client_id を用意（ブラウザ毎に区別したい場合）
alter table if exists public.favorites add column if not exists client_id text;
create unique index if not exists uq_fav_client on public.favorites (client_id, recipe_id);

-- 3) RLS を有効化（既に有効でもOK）
alter table if exists public.recipes            enable row level security;
alter table if exists public.recipe_ingredients enable row level security;
alter table if exists public.recipe_steps       enable row level security;
alter table if exists public.cost_runs          enable row level security;
alter table if exists public.cost_items         enable row level security;
alter table if exists public.favorites          enable row level security;

-- 4) 全開放ポリシー（他の厳格ポリシーが残っていても、OR条件で読み書き可能になります）
-- recipes
create policy if not exists "open recipes select" on public.recipes for select using (true);
create policy if not exists "open recipes insert" on public.recipes for insert with check (true);
create policy if not exists "open recipes update" on public.recipes for update using (true);
create policy if not exists "open recipes delete" on public.recipes for delete using (true);

-- recipe_ingredients
create policy if not exists "open ings select" on public.recipe_ingredients for select using (true);
create policy if not exists "open ings insert" on public.recipe_ingredients for insert with check (true);
create policy if not exists "open ings update" on public.recipe_ingredients for update using (true);
create policy if not exists "open ings delete" on public.recipe_ingredients for delete using (true);

-- recipe_steps
create policy if not exists "open steps select" on public.recipe_steps for select using (true);
create policy if not exists "open steps insert" on public.recipe_steps for insert with check (true);
create policy if not exists "open steps update" on public.recipe_steps for update using (true);
create policy if not exists "open steps delete" on public.recipe_steps for delete using (true);

-- cost_runs
create policy if not exists "open runs select" on public.cost_runs for select using (true);
create policy if not exists "open runs insert" on public.cost_runs for insert with check (true);
create policy if not exists "open runs update" on public.cost_runs for update using (true);
create policy if not exists "open runs delete" on public.cost_runs for delete using (true);

-- cost_items
create policy if not exists "open items select" on public.cost_items for select using (true);
create policy if not exists "open items insert" on public.cost_items for insert with check (true);
create policy if not exists "open items update" on public.cost_items for update using (true);
create policy if not exists "open items delete" on public.cost_items for delete using (true);

-- favorites（client_id で端末紐付け。無指定でも閲覧可にしたい場合 using(true) にしてください）
create policy if not exists "open fav select" on public.favorites for select using (true);
create policy if not exists "open fav insert" on public.favorites for insert with check (true);
create policy if not exists "open fav delete" on public.favorites for delete using (true);