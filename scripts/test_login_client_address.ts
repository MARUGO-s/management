import { loginThrottleKey } from '../supabase/functions/_shared/login-throttle.ts'

function request(headers: Record<string, string>): Request {
  return new Request('https://example.invalid', { headers })
}
function equal(a: unknown, b: unknown, message: string) {
  if (a !== b) throw new Error(message)
}
Deno.test('managed ingress CF address wins over caller-controlled forwarding prefixes', async () => {
  const trusted = { 'cf-connecting-ip': '198.51.100.7' }
  const base = await loginThrottleKey(request(trusted), 'system')
  equal(await loginThrottleKey(request({ ...trusted, 'x-forwarded-for': '203.0.113.1, 198.51.100.7', 'x-real-ip': '203.0.113.2' }), 'system'), base, 'spoofed forwarding headers must not change the counter')
  equal(await loginThrottleKey(request({ ...trusted, 'x-forwarded-for': '203.0.113.3, 198.51.100.7' }), 'system'), base, 'rotating a prefix must not obtain a fresh counter')
})
Deno.test('without CF, use the proxy-appended rightmost XFF address, never the caller prefix', async () => {
  const a = await loginThrottleKey(request({ 'x-forwarded-for': '203.0.113.1, 198.51.100.7' }), 'system')
  const b = await loginThrottleKey(request({ 'x-forwarded-for': '203.0.113.2, 198.51.100.7' }), 'system')
  equal(a, b, 'leftmost XFF is untrusted')
})
Deno.test('untrusted real-IP alone cannot create arbitrary counters; type and trusted source remain separate', async () => {
  const a = await loginThrottleKey(request({ 'x-real-ip': '203.0.113.1' }), 'system')
  equal(a, await loginThrottleKey(request({ 'x-real-ip': '203.0.113.2' }), 'system'), 'ignore standalone untrusted real-IP')
  const system = await loginThrottleKey(request({ 'cf-connecting-ip': '198.51.100.7' }), 'system')
  const admin = await loginThrottleKey(request({ 'cf-connecting-ip': '198.51.100.7' }), 'admin')
  if (system === admin) throw new Error('password types must remain isolated')
  if (system === await loginThrottleKey(request({ 'cf-connecting-ip': '198.51.100.8' }), 'system')) throw new Error('trusted sources must remain isolated')
  equal(/^[a-f0-9]{64}$/.test(system), true, 'persist only SHA256')
})
