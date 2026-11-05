# ログイン試行の回数制限（2026-11-05）

## 仕組み

- 対象：`password-manager` の `verify`（入力画面のシステムパスワード、管理画面の管理者パスワード、パスワード変更時の確認）。
- 同じ接続元（IPアドレス）× パスワード種別ごとに、直近10分間の失敗が10回に達すると、最も古い失敗から10分たつまで照合せずに `429` を返す。
  - 応答：`{ success:false, isValid:false, locked:true, retryAfterSeconds }`。`Retry-After` ヘッダーも付ける。
- ログインに成功すると、その接続元・種別の失敗記録を消す。
- 失敗記録は `public.login_failures` に保存する（`supabase/migrations/20261105000200_create_login_failures.sql`）。
  - key は「IP|種別」の SHA-256 で、生のIPアドレスは保存しない。
  - RLS は有効、policy はなし。anon と authenticated からは読み書きできない。
  - 1日より古い記録は、失敗を記録するときに削除する。
- 制限用テーブルの読み書きに失敗しても、ログイン自体は止めない（fail-open）。
- 画面の表示：
  - ロック中は「ログインの失敗が続いたため、一時的にログインできません。約N分後にもう一度お試しください」と表示する（入力画面・管理画面）。
  - 通常の失敗は、これまでどおり「パスワードが正しくありません」と表示する。
  - パスワード欄はどちらの場合も空にする。

## 注意

- 同じ店舗のWi-Fiなど、同じIPアドレスを共有している端末どうしでは、失敗回数も共有される。誰かが10回間違えると、その店舗では最長10分ログインできなくなる。

## 確認

- `scripts/test_login_rate_limit_local.py` で次を確認した。
  - 9回失敗した後でも、正しいパスワードで入れ、失敗記録が消える。
  - 10回失敗するとロックされ、正しいパスワードでも429になる。ロック中の試行は数えない。
  - 他の接続元と、もう一方の種別には影響しない。
  - 10分より前の失敗は数えない。
  - テーブルが壊れていても、正しいパスワードで入れる。
  - IPアドレスはハッシュで保存している。
- `scripts/test_session_input_recovery.cjs` に2件追加した：ロック中の表示文言と、ロック後の通常の失敗の文言。
- 修正前のコードでは、どちらのテストも失敗することを確認した。
- migration：使い捨ての supabase/postgres 17.6.1.143 に2回適用し、2回とも成功した。RLSが有効・policyが0件で、anon は permission denied になることも確認した。
- テスト結果：Node 294件、Deno 11件、Python 3種がすべて成功。

## 公開手順（承認後）

1. SQL Editor で migration を実行し、service_role が使えること（`has_table_privilege`）を確認する。
2. `password-manager` を配備する（アクセストークンが必要）。
3. PRをmergeする（画面の文言が Pages で公開される）。
4. 確認：ログイン前の状態確認（get）が200を返すこと。管理画面と入力画面で、正しいパスワードで入れること。

## 戻し方

- 関数：main の1つ前の `password-manager` を再配備する（`management-hardening-20261105/deployed-backup` には v10 の控えがある。v11 はこのPRの1つ前のmain）。
- テーブル：残しておいても害はない。消す場合は `drop table public.login_failures;`。
