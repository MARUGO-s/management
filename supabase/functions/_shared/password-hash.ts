// Password hashing for password-manager.
// New records: pbkdf2_sha256$<iterations>$<salt base64url>$<hash base64url> (WebCrypto PBKDF2-HMAC-SHA256).
// Old records (bare SHA-256 hex) still verify once so existing logins keep working, and are
// reported with needsRehash so the caller can replace them with a PBKDF2 record.

export const PBKDF2_ITERATIONS = 310000
const MIN_ITERATIONS = 100000
const SALT_BYTES = 16
const HASH_BYTES = 32
const SCHEME = 'pbkdf2_sha256'
const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, length * 8)
  return new Uint8Array(bits)
}

async function sha256Hex(password: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(password)))
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, HASH_BYTES)
  return `${SCHEME}$${PBKDF2_ITERATIONS}$${base64url(salt)}$${base64url(hash)}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<{ valid: boolean, needsRehash: boolean }> {
  const rejected = { valid: false, needsRehash: false }
  if (typeof password !== 'string' || password.length === 0 || typeof stored !== 'string' || stored.length === 0) return rejected

  if (stored.startsWith(`${SCHEME}$`)) {
    const parts = stored.split('$')
    if (parts.length !== 4) return rejected
    const iterations = Number(parts[1])
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > 10_000_000) return rejected
    let salt: Uint8Array
    let expected: Uint8Array
    try {
      salt = fromBase64url(parts[2])
      expected = fromBase64url(parts[3])
    } catch {
      return rejected
    }
    if (salt.length < 8 || expected.length < 16) return rejected
    const actual = await pbkdf2(password, salt, iterations, expected.length)
    const valid = equalBytes(actual, expected)
    return { valid, needsRehash: valid && iterations < PBKDF2_ITERATIONS }
  }

  if (/^[0-9a-f]{64}$/.test(stored)) {
    const valid = equalBytes(encoder.encode(await sha256Hex(password)), encoder.encode(stored))
    return { valid, needsRehash: valid }
  }

  return rejected
}
