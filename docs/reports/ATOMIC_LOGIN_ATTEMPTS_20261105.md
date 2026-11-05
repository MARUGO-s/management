# ログイン枠の原子的予約（2026-11-05、未配備）

[初期実装の報告](LOGIN_RATE_LIMIT_20261105.md)を補足・訂正する。以下はローカル修正と実試験の結果であり、この変更の本番適用・merge・commit は行っていない。

## 修正した境界

- `verify` の開始時に `passwordType` が文字列かつ `system` / `admin` のどちらか、`currentPassword` が文字列かを検査する。不正値は400で拒否し、DB読取・ログイン枠予約・トークン発行を行わない。配列 `['system']` を文字列へ変換して扱うことはしない。
- 新しい additive migration `20261105000300_atomic_login_attempts.sql` は既存 `public.login_failures(id,key,failed_at)` を再利用する。以前の migration は変更しない。
- `reserve_login_attempt(p_key)` はキー単位の advisory transaction lock を取得してから、DBの現在時刻で直近10分の枠を数え、3件未満のときだけ予約行を INSERT する。件数確認と予約は同じDBトランザクションで不可分。予約後に初めてパスワードを取得・照合するため、未完了の照合も枠を使用する。
- 失敗時は予約をそのまま残す。成功時は `finish_login_attempt(p_key,p_attempt_id,true)` が同キーの `id <= 自分の予約id` だけ削除する。後から開始した照合の予約・失敗は削除しない。
- パスワード読取がエラー・例外・不正な応答だった場合は照合前なので `finish_login_attempt(...,false)` で自分の予約だけ解放する。枠解放自体が失敗した場合は記録が残り、10分窓で失効する。応答が失われた予約、プロセス停止の予約も同様に保守的に残る。
- 予約idは bigint を文字列で往復させ、JavaScriptの整数精度を超えても削除境界を壊さない。
- RPCの引数から時刻・窓・上限を指定できない。DB内で3回・10分に固定し、キーは小文字64hexのみ許可する。両RPCは `SECURITY DEFINER` / 空の `search_path`、`PUBLIC`・`anon`・`authenticated` の実行権限は revoke、`service_role` のみに grant する。
- 24時間を超える古い行は予約時に全キーを対象として削除し、初期実装の保持期間を維持する。10分を超えた行は物理削除前でも制限には数えない。

接続元IPの選択は別の修正で `CF-Connecting-IP` → XFF右端 → `unknown` となり、単独 `X-Real-IP` は使わない。親担当の本番GET診断では偽XFF先頭は上書きされ、元コードの先頭選択による本番回避は再現しなかった。ローカルでの不適切な信頼境界と本番で確認できた挙動を区別する。この報告の子担当は本番へアクセスしていない。

## 混在バージョン・障害時

- 制限DB/RPCが失敗した場合は従来どおり **fail-open**。正しいパスワードはログインでき、誤ったパスワードはログインできない。ただし回数制限は保証できない。
- 新Edge Functionを新RPCのない古いDBへ先に配備すると、PostgRESTの `PGRST202` / 404 が上記fail-openとして扱われる。古い非原子的な SELECT → count → INSERT にはフォールバックしない。ログイン互換は保つが、migration が有効になるまで回数制限は働かない。
- 古いEdge Functionを残したまま新migrationだけ適用しても、新RPCは使われないため競合は直らない。公開時は既存テーブル用migration、新RPC用migration、Edge Functionの順に適用し、PostgRESTのschema cache更新と `service_role` のRPC実行権限を確認する。
- 本変更の巻き戻しはEdge Functionを元に戻すだけで可能。新RPC・テーブルを残しても既存呼出には影響しない。ただし旧関数には同時実行の欠陥が戻る。

## RED → GREEN の証拠

証拠の基点：`/Users/yoshito/.hermes/cache/scratch/management-hardening-20261105/rl-fix/`

- `red-types.log`：配列 `['system']` を400拒否する安全期待値に対し、旧実装は200・認証成功で失敗。`green-types.log` は入力検査後に成功。
- `red-atomic.log`：実ローカルPostgreSQL/PostgREST + 実Edge Functionへの40並列で39照合・1拒否・39行となり、安全期待値「3照合のみ」に失敗。
- `green-atomic.log`：同じ試験で3照合・37拒否・3行。
- `full-local.log` / `full-result.json`：40並列を3ラウンド実行し、毎回パスワードDB読取3件・200が3件・429が37件・予約3件を確認。型不正16種、成功clear、10分TTL、別type/IP分離、遅い成功による後発失敗保持、照合前読取エラー5回の枠解放、旧DB相当404と実RPC権限エラーのfail-open、完了書込失敗時のログイン継続、RLS/ACL、migration二回適用で既存行維持も確認した。
- `sql-contract.log`：リポジトリの `scripts/test_atomic_login_attempts.sql` を実PostgreSQLで実行。キー検査・TTL・成功id境界・個別解放・ロール実行拒否をトランザクション内で確認しROLLBACK。
- `node.log`：Node 294件成功。`deno.log`：既存11件 + throttle3件 + IP3件、計17件成功。`python-*.log`：既存Python3種成功。
- 同じHEAD `59f14d05350c6d562a6d338f7144d9dd1dbde70b` のsecret除外snapshotでも既存Node/Deno/Pythonが全成功。`deno check` は baseline / candidate とも同一の既存2診断（`passwordStatus` のTS7053、外側catchのTS18046）で失敗し、新規診断はない。

実DBの再実行は、使い捨てローカルDBに両migrationを適用してから `psql -v ON_ERROR_STOP=1 -f scripts/test_atomic_login_attempts.sql`。上記HTTPハーネスは既存 `review-rl` の `real_function_probe.py` / `proxy.py` とローカルJWT fixtureを再利用する。Docker対象はローカルUnix socketの `rlrev-pg` / `rlrev-rest` のみ。固定テストポート8000/9999は試験間で解放する。
