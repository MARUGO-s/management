# 入力画面の認証復旧 — オフライン検証

状態: **2026-10-14、ローカル修正のみ。本番未反映**。バックエンド/GAS変更なし。

## 原因と修正境界

入力ページに `password-screen` がなかったため、`LoanSession.requireLogin()` が同じページへ遷移した。Sheets 401もセッションを消して遷移/リロードし、入力と失敗モーダルが消えた。送信前重複確認のcatchは認証コードを汎用エラーへ置き換えていた。

入力ページだけに `data-preserve-input` のログインUIを置き、既存 `SimpleAuth.verifyPassword()` の正規 `password-manager` 検証を使用する。認証切れのエラーを先に表示し、再ログインUIはボタン操作で開く。取消・失敗・成功のいずれでも同じ入力/受付履歴を保ち、認証成功では送信しない。パスワードの新しい保存機構は作らない。

GAS拒否の `written:false` は今回の要求の未書込だけを示し、以前の同じ受付IDの登録有無を証明しない。受付単位の `attempted` をPOST前に保存し、準備のみの初回と送信結果未確認を区別する。旧形式pending（attemptedなし）も未確認として扱う。認証切れの再確認では「今回のリクエストは未送信」「以前の送信結果は未確認・登録済みの可能性」を併記する。部分成功の登録件数を残し、登録後の表示用Sheets 401は登録済みとして案内する。SPの長いフォームでも失敗モーダルが画面内になるよう、認証/受付エラー表示中だけbodyのtransformを解除する。

PC/SP切替、5行のPC初期状態、既存の未使用preset除去、数量計算、重複判定、業務項目、送信先、GAS/サーバーは変更しない。未使用presetは元から送信直前に削除されるため、保持検証は**入力済み行/グループ内の全項目（空欄を含む）と元の入力DOM**を対象とする。

## 再実行

```sh
node --test scripts/*.cjs
# PlaywrightとChromeが利用可能な環境で実行（全URLをローカル応答に置換）
node scripts/browser-session-recovery.js <証跡出力先>
# 修正前コミットから通常payloadを採取する場合
BASELINE_REF=155e2cb node scripts/browser-session-recovery.js <正常baseline出力先>
# 修正前コミットの症状を再現する場合
BASELINE_REF=155e2cb node scripts/browser-session-recovery.js <RED出力先> --red
```

Playwrightが別ディレクトリにインストールされていれば `NODE_PATH=<そのnode_modules>` を指定する。テストコードにユーザー固有絶対パスは含まない。Node回帰14件は標準ライブラリだけで実行でき、CIの `scripts/*.cjs` に含めている。ブラウザーテストは依存環境を要するためCIには追加していない。

ブラウザーテストは `127.0.0.1:18763` の仮想ページをPlaywright routeで提供する（HTTPサーバー/実ポート待受は不要）。CDNを含む全リクエストを捕捉し、実バックエンドには接続しない。既存調査プロセス・ユーザーSafariは停止/操作しない。合成パスワード/合成セッションをモックへ送るだけで、実資格情報を使用/収集しない。

## 実測

- 修正前の独立RED: PC/SP × missing/expired/Sheets401の6件。すべてnavigation=2、GAS POST=0、失敗表示不可視、入力消失。
- ポータブル回帰: 認証コード消失3件、再ログイン/UI、GAS拒否・無トークンPOST・ログイン操作、補助API、登録後表示401の各REDを確認後に実装。
- 全Node: **207件成功、失敗0**。追加の認証復旧は14件。
- 実Chrome GREEN: **22シナリオ成功**。PC1440×900、SP390×900。missing/expired/Sheets401/追加グループSheets401は失敗時GAS POST=0、navigation=1、全入力業務値保持、可視モーダル。
- 復旧12ケース: 取消とパスワード検証失敗でも入力/受付履歴を保持。正規検証成功でも自動再送0。手動再送時だけ同じ受付IDでPOST（単一1件・追加グループ2件）。GAS SESSION_REQUIRED、2件中1件登録済みも含む。
- 初回ログインは無トークンのインジケーターAPI=0、ログイン後に署名セッションを添付して取得。補助APIだけ401でも通常POST=1。登録成功後の表示用Sheets401も遷移せず登録済みを案内。
- 変更前 `155e2cb` の正常PC/SP/追加グループ4件とGREENの18組を比較し、業務payload一致。receiptId（UUID）とinputDate（生成時刻）以外は一致。GAS拒否/部分成功の再送は、同じケースの初回POSTとの一致もブラウザーテストで確認。
- 変更JSの `node --check` と `git diff --check` 成功。

## この実行の証跡

- 実再現スクリプト: `/Users/yoshito/Library/CloudStorage/Dropbox/web/management-main/scripts/browser-session-recovery.js`
- RED: `/Users/yoshito/.hermes/cache/scratch/session-recovery-red/results.json`
- GREEN: `/Users/yoshito/.hermes/cache/scratch/session-recovery-green/results.json`
- 正常baseline: `/Users/yoshito/.hermes/cache/scratch/session-recovery-baseline/results.json`
- スクリーンショット/trace: 同ディレクトリの `<pc|sp>-<scenario>-failure.png`、`-success.png`、`-trace.zip`。
- 全Node TAP: `/Users/yoshito/.hermes/cache/scratch/session-full-tests.tap`

## 独立レビューブロッカーの追加修正（ローカルのみ）

- Node VMのREDで、通信断後の実 `confirmNoSimilarEntries` が「この内容は登録されていません」と誤表示することを実測。部分成功後の認証切れ再確認で確定件数が消える別REDも確認。
- 同一受付IDを維持し、受付履歴のPOST試行フラグを参照して過去の未確定と今回の未送信/拒否を区別。準備のみの初回未送信表示は維持。GASの今回の `written:false` でも過去unknownを否定しない。
- 全Node **213件成功、失敗0**（追加6件、既存partialテストを拡張）。missing/expired/Sheets401、旧pending、GAS拒否、部分成功件数、手動同ID確認まで検証。
- 実Chrome **PC/SP × lost-expired/lost-sheets401/first-missing = 6件成功**。以前未確認・登録済み可能性/ログインボタンの可視性、全入力保持、取消/認証失敗時保持、認証成功後POST0、手動同ID POST1、confirmedを検証。全通信/CDNモック。
- 再実行: `node scripts/browser-session-recovery.js <出力先> --lost-response`（Playwright用NODE_PATHが必要なら指定）。
- 証跡: `/Users/yoshito/.hermes/cache/scratch/receipt-auth-red.tap`、`receipt-auth-partial-red.tap`、`receipt-auth-green.tap`、`receipt-auth-browser/results.json` と同ディレクトリの画像/trace。

## 未検証/対象外

本番登録、デプロイ、push、PRは行っていない。店舗未指定なので実データ登録は行わない。実Safari/実サーバーの署名・通信・本番配備の状態はこのテストで保証しない。認証以外の登録結果表示失敗の既存リロードは変更しない。同一店舗の入力エラー等、認証以外の既存検証を今回の原因と断定しない。

Obsidian/Graphifyの同期と独立コードレビュー、本番反映の判断は親エージェントのリリース工程に引き継ぐ。この記録の正規入力は当リポジトリのCHANGELOGと本書。
