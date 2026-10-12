import { assertEquals } from 'jsr:@std/assert@1'
import { authorizeLoanSession, issueSessionToken } from '../supabase/functions/_shared/session.ts'

Deno.env.set('SESSION_SIGNING_SECRET', 'local-test-secret-that-is-at-least-thirty-two-characters')

Deno.test('public anon credentials alone cannot access a protected function', async () => {
  const req = new Request('https://example.test/functions/v1/access-logs', {
    method: 'POST', headers: { Authorization: 'Bearer public-anon-key' },
  })
  const result = await authorizeLoanSession(req, 'admin')
  assertEquals(result.session, null)
  assertEquals(result.error?.status, 401)
})

Deno.test('system login cannot perform administrator operations', async () => {
  const { token } = await issueSessionToken('system')
  const req = new Request('https://example.test', { headers: { 'x-loan-session': token } })
  const result = await authorizeLoanSession(req, 'admin')
  assertEquals(result.session, null)
  assertEquals(result.error?.status, 403)
})

Deno.test('administrator login can use admin and ordinary operations', async () => {
  const { token } = await issueSessionToken('admin')
  const req = new Request('https://example.test', { headers: { 'x-loan-session': token } })
  const admin = await authorizeLoanSession(req, 'admin')
  assertEquals(admin.error, null)
  assertEquals(admin.session?.typ, 'admin')
  const ordinary = await authorizeLoanSession(req, 'any')
  assertEquals(ordinary.error, null)
  assertEquals(ordinary.session?.typ, 'admin')
})

Deno.test('expired, forged, or unrelated token type is rejected', async () => {
  for (const token of ['forged.token', (await issueSessionToken('other')).token]) {
    const req = new Request('https://example.test', { headers: { 'x-loan-session': token } })
    const result = await authorizeLoanSession(req, 'any')
    assertEquals(result.error?.status, 401)
  }
})
