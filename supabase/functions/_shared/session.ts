// ログイン成功時に発行する有効期限付きトークン（HMAC-SHA256 署名）。
// 形式: base64url(JSON {typ, exp}) + "." + base64url(署名)。秘密鍵は SESSION_SIGNING_SECRET。

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 画面側のログイン有効時間（8時間）と揃える

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

async function signingKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('SESSION_SIGNING_SECRET') ?? ''
  if (secret.length < 32) throw new Error('SESSION_SIGNING_SECRET is not configured')
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function issueSessionToken(typ: string): Promise<{ token: string, expiresAt: number }> {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const body = base64url(encoder.encode(JSON.stringify({ typ, exp: expiresAt })))
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(body)))
  return { token: `${body}.${base64url(signature)}`, expiresAt }
}

// 有効なら {typ, exp}、無効・期限切れなら null。
export async function verifySessionToken(token: string | null | undefined): Promise<{ typ: string, exp: number } | null> {
  if (!token || typeof token !== 'string') return null
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return null
  try {
    const valid = await crypto.subtle.verify('HMAC', await signingKey(), fromBase64url(signature), encoder.encode(body))
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)))
    if (typeof payload?.typ !== 'string' || typeof payload?.exp !== 'number' || payload.exp <= Date.now()) return null
    return payload
  } catch (_) {
    return null
  }
}

// A public Supabase anon JWT only passes the gateway. Application access requires
// the separately signed loan-session header, with an explicit role check.
export async function authorizeLoanSession(req: Request, role: 'any' | 'admin'):
  Promise<{ session: { typ: string, exp: number } | null, error: Response | null }> {
  const session = await verifySessionToken(req.headers.get('x-loan-session'))
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (!session || !['system', 'admin'].includes(session.typ)) {
    return { session: null, error: new Response(JSON.stringify({ code: 'SESSION_REQUIRED', error: 'ログインが必要です。' }),
      { status: 401, headers }) }
  }
  if (role === 'admin' && session.typ !== 'admin') {
    return { session: null, error: new Response(JSON.stringify({ code: 'ADMIN_REQUIRED', error: '管理者権限が必要です。' }),
      { status: 403, headers }) }
  }
  return { session, error: null }
}
