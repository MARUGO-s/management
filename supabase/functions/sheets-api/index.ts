import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifySessionToken } from '../_shared/session.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-loan-session',
}

// 読み取りを許可するスプレッドシートとシート。借主メールのある「マスタ」などは含めない。
const ALLOWED_SPREADSHEET_ID = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY'
const ALLOWED_SHEETS = new Set(['貸借表', '原価リスト', '食材コスト'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function sheetOf(range: string): string {
  const name = range.includes('!') ? range.slice(0, range.lastIndexOf('!')) : range
  return name.replace(/^'(.*)'$/, '$1').replace(/''/g, "'")
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// サービスアカウント（GOOGLE_SERVICE_ACCOUNT_JSON）の読み取り専用アクセストークン。非公開シートを読める。
let cachedAccess: { token: string, expiresAt: number } | null = null

async function serviceAccountToken(json: string): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) return cachedAccess.token
  const account = JSON.parse(json)
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(`${header}.${claims}`)))
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
  })
  if (!response.ok) throw new Error(`service account token error: ${response.status}`)
  const result = await response.json()
  cachedAccess = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 }
  return cachedAccess.token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ログインで発行したトークンがなければ読ませない。
    // 移行期間（SHEETS_REQUIRE_SESSION 未設定）だけ、トークンなしの旧画面を許可する。
    const sessionHeader = req.headers.get('x-loan-session')
    const session = await verifySessionToken(sessionHeader)
    const requireSession = Deno.env.get('SHEETS_REQUIRE_SESSION') === 'true'
    if (!session && (requireSession || sessionHeader)) {
      return json({ ok: false, code: 'SESSION_REQUIRED', error: 'ログインが必要です。' }, 401)
    }

    const { spreadsheetId, range, method = 'GET' } = await req.json()
    if (spreadsheetId !== ALLOWED_SPREADSHEET_ID || typeof range !== 'string' || !ALLOWED_SHEETS.has(sheetOf(range))) {
      return json({ ok: false, error: 'この範囲は読み取りできません。' }, 403)
    }
    // 書き込みはGAS経由のみ。ここは読み取り専用。
    if (method !== 'GET') {
      return json({ ok: false, error: '読み取り専用です。' }, 405)
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${ALLOWED_SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
    const serviceAccount = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    let response: Response
    if (serviceAccount) {
      response = await fetch(url, { headers: { Authorization: `Bearer ${await serviceAccountToken(serviceAccount)}` } })
    } else {
      // サービスアカウント登録前の移行期間のみ。APIキーはシートが公開されている間しか読めない。
      const googleApiKey = Deno.env.get('GOOGLE_API_KEY')
      if (!googleApiKey) throw new Error('Google credentials are not configured')
      response = await fetch(`${url}?key=${googleApiKey}`)
    }

    if (!response.ok) {
      console.error('Google Sheets API error:', response.status, await response.text())
      return json({ ok: false, error: `Google Sheets API error: ${response.status}` }, 502)
    }
    return json(await response.json())
  } catch (error) {
    console.error('sheets-api error:', error)
    return json({ ok: false, error: 'シートの読み取りに失敗しました。' }, 500)
  }
})
