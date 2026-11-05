import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { issueSessionToken, verifySessionToken, authorizeLoanSession } from '../_shared/session.ts'
import { hashPassword, verifyPassword } from '../_shared/password-hash.ts'
import { checkLoginLock, clearLoginFailures, loginThrottleKey, recordLoginFailure } from '../_shared/login-throttle.ts'

// パスワード管理用のEdge Function（データベースベース）
serve(async (req) => {
  // CORS対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-loan-session',
      },
    })
  }

  try {
    const { action, passwordType, currentPassword, newPassword, token } = await req.json()

    // GAS などサーバー側からのトークン確認。DBに触れないため先に処理する。
    if (action === 'check-token') {
      const session = await verifySessionToken(token)
      return new Response(JSON.stringify({ success: true, valid: !!session, typ: session?.typ ?? null }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    
    // Supabaseクライアントを初期化
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!serviceRoleKey) {
      throw new Error('Service role key is not configured')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey
    )
    
    // パスワードは塩付きPBKDF2で保存する（_shared/password-hash.ts）。
    // 旧形式（塩なしSHA-256）はログイン成功時にPBKDF2へ置き換える。

    switch (action) {
      case 'verify': {
        // 同じ接続元・種別で直近10分に10回失敗していたら、照合せずに断る。
        const throttleKey = await loginThrottleKey(req, String(passwordType))
        const lock = await checkLoginLock(supabase, throttleKey)
        if (lock.locked) {
          return new Response(JSON.stringify({
            success: false,
            isValid: false,
            locked: true,
            retryAfterSeconds: lock.retryAfterSeconds,
            error: 'ログインの失敗が続いたため、しばらくログインできません'
          }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Retry-After': String(lock.retryAfterSeconds),
            },
          })
        }

        // データベースからパスワードハッシュを取得
        const { data: passwordData, error: fetchError } = await supabase
          .from('password_management')
          .select('password_hash')
          .eq('password_type', passwordType)
          .single()
        
        if (fetchError) {
          console.error('パスワード取得エラー:', fetchError)
          return new Response(JSON.stringify({
            success: false,
            error: 'パスワード取得に失敗しました'
          }), { status: 500 })
        }
        
        // 入力されたパスワードを保存済みの形式で照合する
        const { valid: isValid, needsRehash } = await verifyPassword(currentPassword, passwordData.password_hash)
        if (isValid && needsRehash) {
          // 旧形式の記録を塩付きPBKDF2へ置き換える。失敗してもログイン自体は続ける。
          const { error: rehashError } = await supabase.from('password_management')
            .update({ password_hash: await hashPassword(currentPassword) })
            .eq('password_type', passwordType)
            .eq('password_hash', passwordData.password_hash)
          if (rehashError) console.error('パスワード形式の更新エラー:', rehashError.message)
        }

        console.log(`🔍 パスワード検証: type=${passwordType}, match=${isValid}`)
        if (isValid) {
          await clearLoginFailures(supabase, throttleKey)
        } else {
          await recordLoginFailure(supabase, throttleKey)
          // 総当たりを遅らせる。
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
        // 成功時はデータ読み取り・登録に使う有効期限付きトークンを発行する。
        const session = isValid ? await issueSessionToken(passwordType) : null
        
        return new Response(JSON.stringify({
          success: true,
          isValid: isValid,
          token: session?.token ?? null,
          expiresAt: session?.expiresAt ?? null
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      case 'change':
        {
        const auth = await authorizeLoanSession(req, 'admin')
        if (auth.error) return auth.error
        if (!['system', 'admin'].includes(passwordType) || typeof newPassword !== 'string' || newPassword.length < 6) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid password change' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } })
        }
        // An admin may initialize a missing system password, but changing an
        // existing password still requires its current value.
        const { data: currentPasswordData, error: currentFetchError } = await supabase
          .from('password_management')
          .select('password_hash')
          .eq('password_type', passwordType)
          .maybeSingle()
        
        if (currentFetchError) {
          return new Response(JSON.stringify({
            success: false,
            error: '現在のパスワード取得に失敗しました'
          }), { status: 500 })
        }
        
        // 現在のパスワードを検証
        if (!currentPasswordData && passwordType !== 'system') {
          return new Response(JSON.stringify({ success: false, error: '管理者パスワードが未設定です' }), { status: 409, headers: { 'Access-Control-Allow-Origin': '*' } })
        }
        const currentCheck = currentPasswordData ? await verifyPassword(currentPassword, currentPasswordData.password_hash) : null
        if (currentPasswordData && !currentCheck?.valid) {
          return new Response(JSON.stringify({
            success: false,
            error: '現在のパスワードが正しくありません'
          }), { status: 401 })
        }
        
        // 新しいパスワードをハッシュ化して更新
        const newPasswordHash = await hashPassword(newPassword)
        const passwordTable = supabase.from('password_management')
        const { error: updateError } = currentPasswordData
          ? await passwordTable.update({ password_hash: newPasswordHash, updated_at: new Date().toISOString() }).eq('password_type', passwordType)
          : await passwordTable.insert({ password_type: passwordType, password_hash: newPasswordHash })
        
        if (updateError) {
          console.error('パスワード更新エラー:', updateError)
          return new Response(JSON.stringify({
            success: false,
            error: 'パスワード更新に失敗しました'
          }), { status: 500 })
        }
        
        console.log(`✅ パスワード更新成功: ${passwordType}`)
        
        return new Response(JSON.stringify({
          success: true,
          message: `${passwordType}パスワードが正常に更新されました`
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })

        }

      case 'get':
        {
        // The login screen needs only the system-password setup flag.
        // Do not expose admin timestamps or password metadata to anonymous users.
        if (passwordType === 'system' && !req.headers.get('x-loan-session')) {
          const { data, error } = await supabase.from('password_management')
            .select('password_type').eq('password_type', 'system').maybeSingle()
          if (error) throw error
          return new Response(JSON.stringify({ success: true, passwords: { system: { status: data ? '設定済み' : '未設定' } } }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }
        const auth = await authorizeLoanSession(req, 'admin')
        if (auth.error) return auth.error
        // データベースからパスワード状況を取得
        const { data: allPasswords, error: getAllError } = await supabase
          .from('password_management')
          .select('password_type, created_at, updated_at')
        
        if (getAllError) {
          return new Response(JSON.stringify({
            success: false,
            error: 'パスワード状況取得に失敗しました'
          }), { status: 500 })
        }
        
        const passwordStatus = {}
        allPasswords.forEach(row => {
          passwordStatus[row.password_type] = {
            status: '設定済み',
            lastUpdated: row.updated_at
          }
        })
        
        return new Response(JSON.stringify({
          success: true,
          passwords: passwordStatus
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
        }

      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid action'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
    }
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})
