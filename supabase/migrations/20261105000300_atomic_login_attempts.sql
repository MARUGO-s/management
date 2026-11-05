-- Reserve a comparison slot before password verification, serialized per SHA-256 key.
-- Failed comparisons retain their slot. Successful comparisons clear only slots at
-- or before their own reservation; later in-flight attempts must remain counted.
create or replace function public.reserve_login_attempt(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_count bigint;
  v_oldest timestamptz;
  v_id bigint;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid login attempt key' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key, 0));
  -- Read the clock after acquiring the lock, never from the caller.
  v_now := pg_catalog.clock_timestamp();
  -- Preserve the existing global 24-hour retention cleanup.
  delete from public.login_failures where failed_at < v_now - interval '24 hours';
  select count(*), min(failed_at) into v_count, v_oldest
    from public.login_failures
    where key = p_key and failed_at >= v_now - interval '10 minutes';
  if v_count >= 3 then
    return pg_catalog.jsonb_build_object('locked', true, 'attempt_id', null,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - v_now)))));
  end if;
  insert into public.login_failures (key, failed_at) values (p_key, v_now) returning id into v_id;
  -- JSON number would lose bigint precision in JavaScript.
  return pg_catalog.jsonb_build_object('locked', false, 'attempt_id', v_id::text, 'retry_after_seconds', 0);
end;
$$;

create or replace function public.finish_login_attempt(p_key text, p_attempt_id bigint, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' or p_attempt_id is null or p_attempt_id <= 0 or p_success is null then
    raise exception 'Invalid login attempt completion' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key, 0));
  if p_success then
    delete from public.login_failures where key = p_key and id <= p_attempt_id;
  else
    -- No password comparison began (e.g. its DB read failed): release only this slot.
    delete from public.login_failures where key = p_key and id = p_attempt_id;
  end if;
end;
$$;

revoke all on function public.reserve_login_attempt(text) from public, anon, authenticated;
revoke all on function public.finish_login_attempt(text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.reserve_login_attempt(text) to service_role;
grant execute on function public.finish_login_attempt(text, bigint, boolean) to service_role;
