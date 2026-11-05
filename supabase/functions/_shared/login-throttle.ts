// ログイン試行の回数制限（password-manager の verify で使う）。
// 同じ接続元（IPアドレス）× パスワード種別ごとに、直近10分間の枠を照合前に予約する。
// 失敗・照合中の予約が3件あれば、最も古い予約が窓から外れるまで 429 を返す。
// 接続元はハッシュ化して保存し、生のIPアドレスは残さない。
// 制限用テーブルの読み書きに失敗した場合は、ログイン自体を止めない（fail-open）。

// 閾値と時刻は reserve_login_attempt RPC 内に固定（3回 / 10分）。

// deno-lint-ignore no-explicit-any
type Client = any

function clientAddress(req: Request): string {
  // Managed Supabase ingress is Cloudflare-fronted. Verified on this project:
  // CF-Connecting-IP is present/stable; forged CF headers are rejected upstream.
  // Never trust a caller-supplied leftmost X-Forwarded-For or standalone X-Real-IP.
  const cloudflare = req.headers.get('cf-connecting-ip')?.trim()
  const forwarded = (req.headers.get('x-forwarded-for') ?? '').split(',').map(value => value.trim()).filter(Boolean)
  return cloudflare || forwarded.at(-1) || 'unknown'
}

export async function loginThrottleKey(req: Request, passwordType: string): Promise<string> {
  const data = new TextEncoder().encode(`${clientAddress(req)}|${passwordType}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function reserveLoginAttempt(supabase: Client, key: string): Promise<{ locked: boolean, retryAfterSeconds: number, attemptId: string | null }> {
  try {
    const { data, error } = await supabase.rpc('reserve_login_attempt', { p_key: key })
    if (error) throw error
    if (data?.locked === true && Number.isInteger(data.retry_after_seconds) && data.retry_after_seconds > 0) {
      return { locked: true, retryAfterSeconds: data.retry_after_seconds, attemptId: null }
    }
    if (data?.locked === false && typeof data.attempt_id === 'string' && /^[1-9][0-9]*$/.test(data.attempt_id)) {
      return { locked: false, retryAfterSeconds: 0, attemptId: data.attempt_id }
    }
    throw new Error('Invalid login reservation response')
  } catch (error) {
    // Missing RPC on an older database is also fail-open; never fall back to
    // the non-atomic read/count/insert implementation.
    console.error('ログイン試行の予約エラー:', error instanceof Error ? error.message : error)
    return { locked: false, retryAfterSeconds: 0, attemptId: null }
  }
}

export async function finishLoginAttempt(supabase: Client, key: string, attemptId: string | null, success: boolean): Promise<void> {
  if (attemptId === null) return
  try {
    const { error } = await supabase.rpc('finish_login_attempt', { p_key: key, p_attempt_id: attemptId, p_success: success })
    if (error) throw error
  } catch (error) {
    console.error('ログイン試行の完了エラー:', error instanceof Error ? error.message : error)
  }
}
