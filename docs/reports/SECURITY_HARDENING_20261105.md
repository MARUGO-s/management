# セキュリティ強化（2026-11-05）

## 本番で実施済み（管理画面から、利用者の承認後）

- Supabase Auth の新規登録を停止（Allow new users to sign up = OFF）。Authアカウントは0件。
- `password_management` と使用量2テーブルの anon / ログイン利用者向け policy 7件を削除。
  - Edge Function は service role で使うため影響なし。
  - `supabase/migrations/20261105000100_tighten_rls_policies.sql` に同じ内容を記録（再実行しても安全）。
  - `supabase/config.toml` の `enable_signup` も false に変更。

## このブランチの変更

1. パスワードの保存形式を、塩付きPBKDF2-HMAC-SHA256（31万回）に変更（`supabase/functions/_shared/password-hash.ts`）。
   - 旧形式（塩なしSHA-256）は、ログインに成功したときにPBKDF2へ置き換える。
   - そのため利用者の再設定は不要。比較は一定時間で行う。
2. GitHub Pages の公開物を画面用ファイルだけにする（`scripts/build-pages-site.js`、`.github/workflows/pages.yml`）。
   - 公開する：`index.html`、`admin.html`、`config.js`、`favicon.ico`、`pages/`、`js/`、`css/`、`assets/`、`dome/`。
   - 公開しない：`supabase/`（migration・関数・config.toml）、`docs/`（GASの写し）、`scripts/`（DELETEを含むSQL）、README。
3. CIで Deno の認可テスト・ハッシュのテストと、Python のパスワード関数テストも実行する。

## 確認

- Node 291件。Deno 8件（ハッシュ4、セッション4）。
- Python パスワード関数テスト：旧形式のログインで置き換えられること、PBKDF2でのログイン、初期設定、セッションなしの拒否、パスワード変更を確認。
- Python 認可テスト。
- 公開ファイル47件：現在の公開サイトと完全に同じバイトであることを照合済み（Jekyllの処理で中身は変わっていなかった）。
- 7画面（ログイン前）の同一オリジン要求：全リポジトリを配信した場合と同じで、404は0件。

## 公開手順（承認後）

1. PRをmergeする。この時点ではまだ旧来の配信方式のまま。
2. `gh api -X PUT repos/MARUGO-s/management/pages -f build_type=workflow` で、配信をGitHub Actionsに切り替える。
3. Pages workflow を実行する。
4. 確認する：画面の47ファイルが一致すること、`supabase/…`・`docs/…`・`scripts/…` が404になること。
5. `password-manager` 関数を配備する（`supabase functions deploy password-manager --project-ref mzismgyctulktrihcwfg`）。
6. 署名鍵 `SESSION_SIGNING_SECRET` を新しいランダム値に変える。全員のログインが切れるので、再ログインが必要。
7. system / admin のパスワードを管理画面から新しい値に変える。新しい値はPBKDF2で保存される。

## 戻し方

- Pages：`gh api -X PUT repos/MARUGO-s/management/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'`
- 関数：mainの1つ前のcommitの `password-manager` を再配備する。
  - PBKDF2の記録は旧関数では照合できないため、戻す場合はパスワードを再設定する。
- policy：`management-audit-20261104/supabase-hardening/rollback.sql`（scratch）。
