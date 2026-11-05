-- Run only on a disposable/local test database after the login migrations.
-- Roll back every fixture. The HTTP/concurrency probe additionally exercises
-- password-manager against PostgREST; these assertions cover the DB contract.
begin;
do $$
declare
  k text := repeat('e', 64);
  k2 text := repeat('f', 64);
  a jsonb; b jsonb; c jsonb; result jsonb;
begin
  a := public.reserve_login_attempt(k);
  b := public.reserve_login_attempt(k);
  c := public.reserve_login_attempt(k);
  result := public.reserve_login_attempt(k);
  assert (result->>'locked')::boolean, 'fourth reservation must be denied';
  assert (result->>'retry_after_seconds')::integer between 1 and 600;
  result := public.reserve_login_attempt(k2);
  assert not (result->>'locked')::boolean, 'keys must be independent';
  perform public.finish_login_attempt(k, (b->>'attempt_id')::bigint, true);
  -- The later c reservation survives successful b completion.
  assert (select count(*) = 1 from public.login_failures where key = k);
  assert (select id = (c->>'attempt_id')::bigint from public.login_failures where key = k);
  perform public.finish_login_attempt(k, (c->>'attempt_id')::bigint, false);
  assert (select count(*) = 0 from public.login_failures where key = k);
  -- Releasing one failed DB read must not delete an earlier wrong-password slot.
  a := public.reserve_login_attempt(k);
  b := public.reserve_login_attempt(k);
  perform public.finish_login_attempt(k, (b->>'attempt_id')::bigint, false);
  assert (select count(*) = 1 from public.login_failures where key = k);
  perform public.finish_login_attempt(k, (a->>'attempt_id')::bigint, true);
  perform public.finish_login_attempt(k2, (result->>'attempt_id')::bigint, true);
end;
$$;
reset role;

do $$
declare
  k text := repeat('d', 64);
  result jsonb;
  bad text;
begin
  foreach bad in array array[null, '', repeat('a', 63), repeat('a', 65), repeat('g', 64), 'raw-ip|system'] loop
    begin
      perform public.reserve_login_attempt(bad);
      raise exception 'invalid key accepted';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform public.finish_login_attempt(bad, 1, true);
      raise exception 'invalid completion key accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  insert into public.login_failures(key, failed_at) values (repeat('0',64), clock_timestamp() - interval '25 hours');
  insert into public.login_failures(key, failed_at) values
    (k, clock_timestamp() - interval '11 minutes'),
    (k, clock_timestamp() - interval '9 minutes'),
    (k, clock_timestamp() - interval '9 minutes');
  result := public.reserve_login_attempt(k);
  assert not exists (select from public.login_failures where key = repeat('0',64)), 'global 24-hour retention cleanup must be preserved';
  assert not (result->>'locked')::boolean, 'expired row must not consume a slot';
  result := public.reserve_login_attempt(k);
  assert (result->>'locked')::boolean;
  assert (result->>'retry_after_seconds')::integer between 1 and 60, 'retry must follow oldest live row';
  assert (select relrowsecurity from pg_class where oid = 'public.login_failures'::regclass);
  assert not has_function_privilege('anon', 'public.reserve_login_attempt(text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.reserve_login_attempt(text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.finish_login_attempt(text,bigint,boolean)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.finish_login_attempt(text,bigint,boolean)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.reserve_login_attempt(text)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.finish_login_attempt(text,bigint,boolean)', 'EXECUTE');
end;
$$;

set local role service_role;
do $$
declare
  reservation jsonb;
begin
  reservation := public.reserve_login_attempt(repeat('c',64));
  assert not (reservation->>'locked')::boolean;
  perform public.finish_login_attempt(repeat('c',64), (reservation->>'attempt_id')::bigint, true);
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.reserve_login_attempt(repeat('a',64));
    raise exception 'anon called reserve';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_login_attempt(repeat('a',64), 1, true);
    raise exception 'anon called finish';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role authenticated;
do $$
begin
  begin
    perform public.reserve_login_attempt(repeat('a',64));
    raise exception 'authenticated called reserve';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_login_attempt(repeat('a',64), 1, true);
    raise exception 'authenticated called finish';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
