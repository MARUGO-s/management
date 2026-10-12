import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { authorizeLoanSession } from '../_shared/session.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-loan-session',
}

serve(async (req) => {
  // CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await authorizeLoanSession(req, 'admin')
    if (auth.error) return auth.error
    console.log('📧 Alert email function called')

    const body = await req.json()
    const { to, subject, body: emailBody, priority = 'normal' } = body

    if (!to || !subject || !emailBody) {
      throw new Error('to, subject, and body are required')
    }

    console.log('📧 Email request:', { to, subject: subject.substring(0, 50) + '...', priority })

    // 実際のメール送信実装
    // 注意: 実際の本番環境では、SendGrid、Resend、またはSupabase Authのメール機能を使用してください
    
    // 現在はログ出力のみ（開発・テスト用）
    console.log('📧 ===== アラートメール内容 =====')
    console.log('宛先:', to)
    console.log('件名:', subject)
    console.log('本文:')
    console.log(emailBody)
    console.log('優先度:', priority)
    console.log('送信時刻:', new Date().toISOString())
    console.log('📧 ===== メール内容終了 =====')

    // 本番環境での実装例（コメントアウト）
    /*
    // SendGrid を使用する場合の例
    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')
    
    if (SENDGRID_API_KEY) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: to }],
              subject: subject
            }
          ],
          from: { email: 'noreply@yourdomain.com' },
          content: [
            {
              type: 'text/plain',
              value: emailBody
            }
          ]
        })
      })

      if (!response.ok) {
        throw new Error(`SendGrid error: ${response.status}`)
      }
    }
    */

    // 成功レスポンス
    const result = {
      success: true,
      message: 'Alert email processed successfully',
      timestamp: new Date().toISOString(),
      recipient: to,
      subject: subject,
      priority: priority,
      // 開発環境では実際の送信は行わず、ログ出力のみ
      actualSent: false,
      note: 'Development mode: Email logged but not sent. Configure email service for production.'
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Alert email error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
