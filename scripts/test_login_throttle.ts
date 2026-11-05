import { reserveLoginAttempt, finishLoginAttempt } from '../supabase/functions/_shared/login-throttle.ts'

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
}
const key = 'a'.repeat(64)

Deno.test('reserve returns the server lock and bigint reservation without precision loss', async () => {
  const calls: unknown[] = []
  const client = { rpc(name: string, args: unknown) {
    calls.push([name, args])
    return Promise.resolve({ data: { locked: false, attempt_id: '9007199254740993', retry_after_seconds: 0 }, error: null })
  } }
  equal(await reserveLoginAttempt(client, key), { locked: false, retryAfterSeconds: 0, attemptId: '9007199254740993' })
  equal(calls, [['reserve_login_attempt', { p_key: key }]])
  equal(await reserveLoginAttempt({ rpc: () => ({ data: { locked: true, attempt_id: null, retry_after_seconds: 599 } }) }, key),
    { locked: true, retryAfterSeconds: 599, attemptId: null })
})

Deno.test('missing RPC, network exceptions and malformed responses fail open', async () => {
  for (const rpc of [
    () => ({ error: { code: 'PGRST202', message: 'old database' } }),
    () => { throw new Error('network unavailable') },
    () => ({ data: null }),
    () => ({ data: { locked: true, retry_after_seconds: null } }),
    () => ({ data: { locked: false, attempt_id: 9007199254740992 } }),
  ]) equal(await reserveLoginAttempt({ rpc }, key), { locked: false, retryAfterSeconds: 0, attemptId: null })
})

Deno.test('finish scopes success and pre-comparison release to the exact reservation', async () => {
  const calls: unknown[] = []
  const client = { rpc(name: string, args: unknown) { calls.push([name, args]); return { error: null } } }
  await finishLoginAttempt(client, key, '9007199254740993', true)
  await finishLoginAttempt(client, key, '9007199254740994', false)
  await finishLoginAttempt(client, key, null, true)
  equal(calls, [
    ['finish_login_attempt', { p_key: key, p_attempt_id: '9007199254740993', p_success: true }],
    ['finish_login_attempt', { p_key: key, p_attempt_id: '9007199254740994', p_success: false }],
  ])
  await finishLoginAttempt({ rpc: () => ({ error: new Error('write unavailable') }) }, key, '1', true)
  await finishLoginAttempt({ rpc: () => { throw new Error('network unavailable') } }, key, '1', false)
})
