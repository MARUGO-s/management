# セキュリティ強化（2026-11-05）

## 本番で実施済み（管理画面から、利用者の承認後）

- Supabase Auth の新規登録を停止した（Allow new users to sign up = OFF）。Authアカウントは0件。
- `password_management` と使用量2テーブルから、anon とログイン利用者向けの policy 7件を削除した。
  - Edge Function は service role で使うため影響はない。
  - 同じ内容を `supabase/migrations/20261105000100_tighten_rls_policies.sql` に記録した（再実行しても安全）。
  - 残っている policy は、access_logs・data_mismatch_reports・indicator_settings の service role 用で、3表で計3件。
  - `supabase/config.toml` の `enable_signup` も false にした。

## このブランチの変更

1. **パスワードの保存形式**：塩付きPBKDF2-HMAC-SHA256（31万回）にした（`supabase/functions/_shared/password-hash.ts`）。
   - 旧形式（塩なしSHA-256）は、ログインに成功したときにPBKDF2へ置き換える。旧関数で通っていた記録は新関数でも必ず通るので、利用者が再設定する必要はない。
   - 置き換えは「読んだ時点の値と同じときだけ」書き換える。その間に変更された値を上書きしない。
   - 比較は一定時間で行う。保存済みの反復回数は、10万〜100万の数字だけを受け付ける（Edge Function の CPU 上限への配慮）。
2. **GitHub Pages の公開物**：画面用ファイル47件だけにした（`scripts/build-pages-site.js`、`.github/workflows/pages.yml`）。
   - 公開する：`index.html`、`admin.html`、`config.js`、`favicon.ico`、`pages/`、`js/`、`css/`、`assets/`、`dome/`。
   - 公開しない：`supabase/`、`docs/`、`scripts/`、README。
   - 47件の一覧をテストで固定した。workflow の書き込み権限は deploy ジョブだけに付け、アクションは commit SHA で固定した。
3. **CI**：Deno のテスト（ハッシュ6件・セッション4件）と、Python のテスト（パスワード関数・認可）を実行するようにした。

## 注意：リポジトリは公開（PUBLIC）

Pages の公開範囲を絞っても、`supabase/`・`docs/`・`scripts/` は github.com とその履歴で見られる状態のまま変わらない。

- 初期パスワードの平文：`supabase/migrations/20250918000147_create_password_management.sql`
- 塩なしSHA-256の値：`20250919010150`、`20250919010200`、`20250919010300` の各migration

このため、**system と admin のパスワード変更（公開手順7）は必須**とする。可能ならリポジトリを非公開にすることも検討する。ただし非公開リポジトリで Pages を使うには、有料プランが必要。

## 確認

- Node 291件、Deno 10件、Python 2種（パスワード関数・認可）が成功。
- 修正前のコードと、わざと壊した変更では失敗することを確認した。
  - 条件付き置き換えを外す → Pythonテストが失敗。
  - `pages/cost.html` を外す → Pagesテストが失敗。
  - workflow 全体に書き込み権限を付ける → Pagesテストが失敗。
- 公開47ファイル：今の公開サイトとバイト単位で一致（Jekyll の処理で中身は変わっていなかった）。
- 画面を開いたときの要求：全リポジトリを配信した場合と同じで、404は0件（7画面＋独立レビューの11URL）。
- 独立レビュー：`review/review-result.json`（scratch）。high 1件（リポジトリ公開）と medium 3件に対応済み。

## 公開手順（承認後）

1. `gh api -X PUT repos/MARUGO-s/management/pages -f build_type=workflow` で、配信を GitHub Actions に切り替える。**merge より先に行う**（旧方式のまま workflow が動くのを避けるため）。切り替えの間も、前回公開した内容はそのまま配信される。
2. PRをmergeする。Pages workflow が自動で動いて公開する。
3. 確認：画面の47ファイルが一致すること。`supabase/…`・`docs/…`・`scripts/…` の各ファイルが404になること。
4. `supabase functions deploy password-manager --project-ref mzismgyctulktrihcwfg` で関数を配備する。貸借管理アカウントのアクセストークンが必要。
5. 署名鍵 `SESSION_SIGNING_SECRET` を新しいランダム値にする。値はチャットや画面に出さない。全員のログインが切れるので、再ログインが必要。
6. 管理画面にログインして動作を確認する。この最初のログインで、admin の記録がPBKDF2に置き換わる。
7. **system と admin のパスワードを、管理画面から新しい値に変える（必須）。** 新しい値は利用者が決めて入力する。

## 戻し方

- **Pages**：`gh api -X PUT repos/MARUGO-s/management/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'`
- **関数**：mainの1つ前のcommitの `password-manager` を再配備する。
  - 旧関数はPBKDF2の記録を照合できないため、admin も管理画面に入れなくなる。
  - 戻す前に SQL Editor で、利用者が決めた仮パスワードを旧形式で書き戻す。
    `update public.password_management set password_hash = encode(extensions.digest('<仮パスワード>', 'sha256'), 'hex') where password_type in ('system','admin');`
    `<仮パスワード>` は利用者が入力する。チャットには書かない。実行後、SQL Editor の履歴から消す。
- **policy**：`management-audit-20261104/supabase-hardening/rollback.sql`（scratch）。

## 残る課題（このPRの対象外）

- **ログイン試行の回数制限**：verify は1回あたり約70ms の計算をする。今は回数の制限がないので、IP ごとの制限を別途検討する。
- **「最終更新」の表示**：旧形式の置き換えでも、トリガーにより管理画面の「最終更新」が更新される。
- **migration の適用順**：既存の `20250116000001` は、空のDBへ順に適用すると失敗する（本番には影響なし）。
