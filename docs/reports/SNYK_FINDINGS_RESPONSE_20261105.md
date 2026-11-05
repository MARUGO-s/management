# Snyk検出31件への対応（2026-11-05）

## 状態

**公開前の修正・検証・独立レビュー記録。2026-11-05にユーザーの公開承認を受領。**

本書の未公開・未commitという記述は検証完了時点の履歴。実際の公開状態・確定commit・Pages runと配信確認は、Obsidianの別記録「2026-11-05_Snyk対策の本番反映」で管理する。

- 基準：公開main `5c31229da396e076a33c8ffd901eb8ac5b797e76`。
- 作業branch：`fix/snyk-xss-hardening`。
- 作業場所：`/Users/yoshito/.hermes/cache/scratch/management-snyk-fixes-20261105/worktree`。
- ユーザーの「優先度順に修正」「検査に引っかかったもの全てに対応」に基づき、原検出ID0〜30を全件分類した。17検出レコードは修正・防御強化、14検出レコードは意図した仕様／非該当を実行・sourceで検証。重複を含む検出レコード数であり、独立した17個の欠陥という意味ではない。
- 公開anonキー・テスト用固定値を隠したり、スキャナignoreを追加して検出をゼロに見せたりしていない。

## 修正内容（優先順）

1. **高：修正画面XSS**。URL／storage／取得データがデバッグ表示からHTMLとして実行されないよう、`updateDebugDisplay`・`displayOriginalData`・`renderNameList`をDOMとtextContent／option.valueで構築する方式へ変更。ログの非表示だけに依存しない。JSのcache keyを`2026110502`へ更新。
2. **中：管理画面のレポート一覧・詳細**。環境情報、報告値、JSON表示をエスケープ。操作IDは非負のsafe integerに限定し、不正IDの操作ボタンを無効化。アクセスログのID属性もエスケープ。
3. **中：API応答・例外・storage表示**。パスワード状態、月次グラフ、最適化結果、制限状況、通知履歴、データ保持・クリーンアップ結果を安全に文字表示。style幅も有限の0〜100%へ制約。cleanupの通常エラーだけでなく予期しない例外も安全化。
4. **中：一覧ページの状態表示**。もともとエラーはtextContentだったが、loading分岐も動的HTMLをやめ、既存spinnerと文字ノードで構築。表示・送信の機能は維持。

## 修正不要と確認した14検出レコード

| 種類 | 件数 | 対応 |
|---|---:|---|
| 公開anonキー | 3 | JWTのroleがanonであることを自動検査。秘密のservice_roleキーではないため、必要な公開キーは維持。値を記録しない。RLS全体の再監査は別スコープ。 |
| テスト用固定ダミー値 | 7 | ローカル偽DB／ハッシュ検証用。本番パスワードではなく、必要な試験を維持。 |
| ローカルビルド出力先 | 2 | 外部HTTP入力ではなく実行者の指定出力先。公開allowlist・バイト一致の既存試験を再実行し、出力機能を維持。 |
| CSV Blobダウンロード | 1 | text/csv Blobの生成URLをリンクへ渡す経路で、CSVをHTML解析していない。実メソッドのCSV引用・URL解放を検証。CSV数式の安全性まで保証したものではない。 |
| mailto固定リンク | 1 | 実メソッドで悪性候補を含む4入力を実行し、任意HTTP／javascript schemeへ変更できないことと件名・本文encodeを確認。 |

## Snyk再検査の実結果

- 同じアプリsource59ファイルのsnapshotを使い、`snyk_code_scan(severity_threshold=low, include_ignores=true)`を再実行した。
- 比較可能な初回コード範囲：29検出 → 16検出。別adapterのGAS2件（公開anonキー）は本文不変のため前回結果を維持。**原全体31 → 残る自動検出18**。Snykゼロとは報告しない。
- 残る18：公開anonキー3、ダミー固定値7、CLI出力先2、mailto1、管理画面DOM検出5（同根本原因の重複を含む）。
- 残DOM5件は独立レビューで全て追跡し、文字列のescape・ID型制約・配列index・Date/数値化、またはCSV Blob経路を確認した。スキャナがデータフローの安全性を推論しきれず残る検出と、本当に未修正の穴を区別する。
- npmライブラリ・Deno関数・GAS・DB・認証方式・パスワードは今回変更していない。前回SCAの「検査用npm10コンポーネントに既知0件」は前回検査結果で、今回新たに全ランタイムを保証したという意味ではない。

## 実行した確認

- **Node/stdlibのみの全体試験302件成功**（NODE_PATHを外して確認）。Chromeが必要な14件は既存Node-only CIから分離し、`scripts/browser_correction_xss.js`として別に実行、**14/14成功**。
- 管理画面実関数の無通信VM試験20件成功、境界確認3件・cache1件成功。これらはNode全体試験内のものを含むため、重複して総数へ加算しない。
- Deno17件、Python3種（認可25アサーション含む）成功。変更前の安全期待値が失敗するRED、修正版GREEN、原版snapshot mutationも確認。
- 親の隔離Chromeで390px／1440pxの管理画面の通常一覧・詳細・ボタン・幅が基準版と一致。悪性文字列は文字表示となり、イベント実行0、モーダルを閉じられる。CSS全ブロック不変、コンソールpageerrorなし、本番要求0。
- 修正画面の計算・送信・受付ID・認証・日付・逆取引を含む他24関数は基準とbyte-identical。Chromeで未入力データ保持・URL/local/session入力・逆取引payload・名前選択を実行確認。
- 独立レビューpassed、must-fix／security_concerns／logic_errorsいずれも空。実レビュー9ファイルのSHA-256を親が再確認した。本番実認証・実取引登録・実機Safariは未実施。

## 31件の対応表

IDは原監査で固定。再走査による並び替えでは振り直さない。

| ID | 原重要度 | 原場所 | 対応 |
|---:|---|---|---|
| 0 | 中 | `admin.html:1877` | 修正・検証済み：既存escape済み本文に加えlog.id属性もescape。任意ID文字列の属性/要素注入をRED→GREENで対策。 |
| 1 | 中 | `admin.html:2902` | 修正・検証済み：API status/error text escaped; only fixed newline-to-br markup emitted; fixed callers use newline |
| 2 | 中 | `admin.html:3579` | 修正・検証済み：Escape API monthly total and stored apiLimit after locale formatting, including failure fallback; arithmetic results remain numeric |
| 3 | 中 | `admin.html:3695` | 修正・検証済み：Escape all report list display data; accept only nonnegative numeric safe-integer IDs for inline numeric actions; invalid IDs disable both actions |
| 4 | 中 | `admin.html:3781` | 修正・検証済み：Escape basic/environment/mismatch text and all JSON.stringify output; static modal markup and close events preserved |
| 5 | 中 | `admin.html:4094` | 修正・検証済み：Escape daily/monthly counts and dates, preserving static grid and retention policy |
| 6 | 中 | `admin.html:4129` | 修正・検証済み：Escape all success response counts/date; preserve confirmation, payload, pending/final button state |
| 7 | 中 | `admin.html:2095` | 仕様／非該当を検証済み：CSVはtext/csv Blob生成URLのダウンロードでHTML実行ではない。実メソッドのBlob/CSV引用/URL破棄を検証。 |
| 8 | 中 | `admin.html:3902` | 修正・検証済み：Same root and fix as ID 4; appendChild itself is unchanged |
| 9 | 低 | `scripts/test_password_bootstrap_local.py:125` | 仕様／非該当を検証済み：ローカル偽DB/ハッシュ試験用の固定ダミー。削除してテストを弱めず本番パスワードではないことを確認 |
| 10 | 低 | `scripts/test_password_bootstrap_local.py:130` | 仕様／非該当を検証済み：ローカル偽DB/ハッシュ試験用の固定ダミー。削除してテストを弱めず本番パスワードではないことを確認 |
| 11 | 低 | `scripts/test_password_bootstrap_local.py:132` | 仕様／非該当を検証済み：ローカル偽DB/ハッシュ試験用の固定ダミー。削除してテストを弱めず本番パスワードではないことを確認 |
| 12 | 低 | `scripts/test_password_bootstrap_local.py:135` | 仕様／非該当を検証済み：ローカル偽DB/ハッシュ試験用の固定ダミー。削除してテストを弱めず本番パスワードではないことを確認 |
| 13 | 低 | `scripts/test_password_bootstrap_local.py:152` | 仕様／非該当を検証済み：ローカル偽DB/ハッシュ試験用の固定ダミー。削除してテストを弱めず本番パスワードではないことを確認 |
| 14 | 低 | `scripts/test_password_bootstrap_local.py:134` | 仕様／非該当を検証済み：ローカル偽DB/ハッシュ試験用の固定ダミー。削除してテストを弱めず本番パスワードではないことを確認 |
| 15 | 中 | `admin.html:2470` | 修正・検証済み：Escape exception text from the actual non-OK monthly chart API body path |
| 16 | 中 | `admin.html:2967` | 修正・検証済み：Escape propagated quota-alert exception text |
| 17 | 中 | `admin.html:3072` | 修正・検証済み：Escape propagated optimization exception text; existing status content remains |
| 18 | 中 | `admin.html:3643` | 修正・検証済み：Escape non-CORS exception text including non-OK API body; fixed CORS guidance unchanged |
| 19 | 中 | `admin.html:4149` | 修正・検証済み：通常HTTP数値エラーに加え、将来や予期しない例外もescapeして安全表示。RED→GREEN。 |
| 20 | 中 | `pages/marugo.html:825` | 修正・検証済み：エラーだけでなくloadingもDOM/textContentへ統一。RED→GREEN済み |
| 21 | 中 | `admin.html:3142` | 修正・検証済み：Escape transformed level plus monthly count/percentage from parsed storage; static allowlisted class/icon unchanged |
| 22 | 中 | `admin.html:3218` | 修正・検証済み：Escape daily/monthly/locale total text in both provider and local fallback paths |
| 23 | 高 | `pages/js/correction.js:38` | 修正・検証済み：ログ/元データ/datalistをDOMとtextContent/option.valueで構築。Chrome14件とNode3件、旧版RED→新版GREEN。 |
| 24 | 高 | `config.js:5` | 仕様／非該当を検証済み：role=anonを値非表示で自動検査。サーバー秘密鍵ではないため削除・隠蔽しない |
| 25 | 低 | `scripts/test_password_hash.ts:4` | 仕様／非該当を検証済み：ローカル偽DB/ハッシュ試験用の固定ダミー。削除してテストを弱めず本番パスワードではないことを確認 |
| 26 | 中 | `js/quota-alert-system.js:712` | 仕様／非該当を検証済み：実メソッドを実行し4入力すべてmailto固定、件名本文encode済みを再検証 |
| 27 | 低 | `scripts/build-pages-site.js:51` | 仕様／非該当を検証済み：外部HTTP入力ではなくローカルビルドの指定出力先。既存test_pages_siteで許可ファイル限定・バイト一致を検証し機能維持 |
| 28 | 低 | `scripts/build-pages-site.js:54` | 仕様／非該当を検証済み：外部HTTP入力ではなくローカルビルドの指定出力先。既存test_pages_siteで許可ファイル限定・バイト一致を検証し機能維持 |
| 29 | 高 | `docs/gas_scripts/gas_code_complete_updated.gs:25` | 仕様／非該当を検証済み：role=anonを値非表示で自動検査。サーバー秘密鍵ではないため削除・隠蔽しない |
| 30 | 高 | `docs/gas_scripts/gas_code_complete.gs:25` | 仕様／非該当を検証済み：role=anonを値非表示で自動検査。サーバー秘密鍵ではないため削除・隠蔽しない |

## 保存先と残る工程

- 証拠：`/Users/yoshito/.hermes/cache/scratch/management-snyk-fixes-20261105/` の `all-31-final-disposition.json`、`snyk-rescan-summary.json`、`portable-all-node.log`、`final-browser-correction.log`、`review/review-result.json`、`browser-candidate/results.json`、`admin/`、`correction/`。
- 元のユーザー作業dirの未公開スマホ幅変更は未変更・未統合。現在の修正もまだcommit/push/merge/配備していない。
- 公開する場合は、この差分だけをcommitしてPRのCI成功を確認し、承認後にPagesを更新する。サーバー関数・GAS・DB変更は不要。
