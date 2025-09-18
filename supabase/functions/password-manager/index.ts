import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// パスワード管理用のEdge Function（データベースベース）
serve(async (req) => {
  // CORS対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const { action, passwordType, currentPassword, newPassword } = await req.json()
    
    // Supabaseクライアントを初期化
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // SHA256ハッシュ生成関数
    const hashPassword = async (password: string) => {
      const encoder = new TextEncoder()
      const data = encoder.encode(password)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }
    
    switch (action) {
      case 'verify':
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
        
        // 入力されたパスワードをハッシュ化して比較
        const inputHash = await hashPassword(currentPassword)
        const storedHash = passwordData.password_hash
        const isValid = inputHash === storedHash
        
        console.log(`🔍 パスワード検証詳細:`)
        console.log(`  タイプ: ${passwordType}`)
        console.log(`  入力値: "${currentPassword}"`)
        console.log(`  入力ハッシュ: ${inputHash}`)
        console.log(`  保存ハッシュ: ${storedHash}`)
        console.log(`  検証結果: ${isValid}`)
        
        return new Response(JSON.stringify({
          success: true,
          isValid: isValid,
          debug: {
            passwordType: passwordType,
            hasStoredPassword: !!storedHash,
            hasInputPassword: !!currentPassword,
            inputLength: currentPassword?.length || 0,
            hashMatch: isValid
          }
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })

      case 'change':
        // まず現在のパスワードを検証
        const { data: currentPasswordData, error: currentFetchError } = await supabase
          .from('password_management')
          .select('password_hash')
          .eq('password_type', passwordType)
          .single()
        
        if (currentFetchError) {
          return new Response(JSON.stringify({
            success: false,
            error: '現在のパスワード取得に失敗しました'
          }), { status: 500 })
        }
        
        // 現在のパスワードを検証
        const currentInputHash = await hashPassword(currentPassword)
        if (currentInputHash !== currentPasswordData.password_hash) {
          return new Response(JSON.stringify({
            success: false,
            error: '現在のパスワードが正しくありません'
          }), { status: 401 })
        }
        
        // 新しいパスワードをハッシュ化して更新
        const newPasswordHash = await hashPassword(newPassword)
        const { error: updateError } = await supabase
          .from('password_management')
          .update({ 
            password_hash: newPasswordHash,
            updated_at: new Date().toISOString()
          })
          .eq('password_type', passwordType)
        
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

      case 'get':
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
