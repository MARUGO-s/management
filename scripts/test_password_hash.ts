import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { hashPassword, PBKDF2_ITERATIONS, verifyPassword } from '../supabase/functions/_shared/password-hash.ts'

async function legacySha256(password: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.test('new hashes are salted PBKDF2 records, not bare SHA-256', async () => {
  const first = await hashPassword('correct horse battery staple')
  const second = await hashPassword('correct horse battery staple')
  const [scheme, iterations, salt, hash, extra] = first.split('$')
  assertEquals(scheme, 'pbkdf2_sha256')
  assertEquals(Number(iterations), PBKDF2_ITERATIONS)
  assert(PBKDF2_ITERATIONS >= 310000)
  assert(salt.length >= 22 && hash.length >= 43)
  assertEquals(extra, undefined)
  assertNotEquals(first, second, 'the same password must get a different salt each time')
  assertNotEquals(first, await legacySha256('correct horse battery staple'))
})

Deno.test('PBKDF2 records verify only the right password and need no rehash', async () => {
  const stored = await hashPassword('right-password')
  assertEquals(await verifyPassword('right-password', stored), { valid: true, needsRehash: false })
  assertEquals(await verifyPassword('wrong-password', stored), { valid: false, needsRehash: false })
})

Deno.test('legacy SHA-256 records still log in and are marked for upgrade', async () => {
  const legacy = await legacySha256('old-password')
  assertEquals(await verifyPassword('old-password', legacy), { valid: true, needsRehash: true })
  assertEquals(await verifyPassword('other', legacy), { valid: false, needsRehash: false })
})

Deno.test('malformed or empty records never verify', async () => {
  for (const stored of ['', 'pbkdf2_sha256$1$x$y', 'pbkdf2_sha256$abc$AAAA$BBBB', 'pbkdf2_sha256$310000$$', 'plain-text-password', null, undefined]) {
    assertEquals(await verifyPassword('plain-text-password', stored as string), { valid: false, needsRehash: false })
  }
  assertEquals(await verifyPassword('', await legacySha256('')), { valid: false, needsRehash: false })
})
