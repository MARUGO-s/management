// ログイン試行の回数制限（password-manager の verify で使う）。
// 同じ接続元（IPアドレス）× パスワード種別ごとに、直近10分間の失敗が10回に達したら、
// 最も古い失敗から10分たつまで照合せずに 429 を返す。
// 接続元はハッシュ化して保存し、生のIPアドレスは残さない。
// 制限用テーブルの読み書きに失敗した場合は、ログイン自体を止めない（fail-open）。

export const LOGIN_WINDOW_MS = 10 * 60 * 1000
export const LOGIN_MAX_FAILURES = 10
const CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000
const TABLE = 'login_failures'

// deno-lint-ignore no-explicit-any
type Client = any

function clientAddress(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('cf-connecting-ip')?.trim() || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function loginThrottleKey(req: Request, passwordType: string): Promise<string> {
  const data = new TextEncoder().encode(`${clientAddress(req)}|${passwordType}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function checkLoginLock(supabase: Client, key: string, now = Date.now()): Promise<{ locked: boolean, retryAfterSeconds: number }> {
  try {
    const since = new Date(now - LOGIN_WINDOW_MS).toISOString()
    const { data, error } = await supabase.from(TABLE)
      .select('failed_at')
      .eq('key', key)
      .gte('failed_at', since)
      .order('failed_at', { ascending: false })
      .limit(LOGIN_MAX_FAILURES)
    if (error || !Array.isArray(data)) {
      if (error) console.error('ログイン試行の確認エラー:', error.message ?? error)
      return { locked: false, retryAfterSeconds: 0 }
    }
    if (data.length < LOGIN_MAX_FAILURES) return { locked: false, retryAfterSeconds: 0 }
    // 直近10件のうち最も古い失敗が窓から外れるまで待つ。
    const oldest = Math.min(...data.map((row: { failed_at: string }) => Date.parse(row.failed_at)))
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 1000))
    return { locked: true, retryAfterSeconds }
  } catch (error) {
    console.error('ログイン試行の確認エラー:', error instanceof Error ? error.message : error)
    return { locked: false, retryAfterSeconds: 0 }
  }
}

export async function recordLoginFailure(supabase: Client, key: string, now = Date.now()): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE).insert({ key, failed_at: new Date(now).toISOString() })
    if (error) console.error('ログイン失敗の記録エラー:', error.message ?? error)
    // 1日より古い記録は残さない。
    await supabase.from(TABLE).delete().lt('failed_at', new Date(now - CLEANUP_AFTER_MS).toISOString())
  } catch (error) {
    console.error('ログイン失敗の記録エラー:', error instanceof Error ? error.message : error)
  }
}

export async function clearLoginFailures(supabase: Client, key: string): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('key', key)
    if (error) console.error('ログイン失敗記録の削除エラー:', error.message ?? error)
  } catch (error) {
    console.error('ログイン失敗記録の削除エラー:', error instanceof Error ? error.message : error)
  }
}
