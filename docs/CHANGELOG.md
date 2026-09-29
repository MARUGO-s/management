# 変更履歴

## 2026-09-29 — 二重登録防止（本番GASバージョン71対応）

- 通常・修正登録に永続受付IDを追加。同じ内容での再送・途中成功したバッチの再送・画面再読み込み後の再送を、同じ受付IDで処理する。
- GAS参考実装で同じ受付IDの再登録を防止。貸借行とID・内容ハッシュを同じ行A:Mに保存し、ScriptLock内で照合する。
- 修正画面のno-cors自動フォールバック送信を除去し、接続テストを読み取り専用GETに変更。
- 保存エラー・非対応サーバーは送信前に停止。同一ブラウザの複数タブをWeb Locksで排他する。
- 正当な同内容の別取引は確認後に別IDを発行する。過去の重複候補の削除は行わない。
- 本番GASを既存デプロイのまま70→71へ更新し、GETで受付方式の有効化とL/Mの利用可否を確認済み。公開URL・アクセス設定は維持した。
- 詳細・制限・GAS先行反映手順: [DUPLICATE_PREVENTION.md](DUPLICATE_PREVENTION.md)。実コード検証を含む21件のモックテストが成功。本番取引のテスト挿入は行っていない。

## ホットフィックス — 2026-06-03（送信経路の根本修正・GAS 同時実行ガード）

### 修正（クライアント: `main.js` / `js/main.js` / `pages/js/main.js` の3ファイル同一適用）

- **送信経路の `no-cors` を廃止**: 新関数 `postToGas()` で GAS のレスポンス（JSON）を読み取り、書き込み成否を確認するように変更。`Content-Type: text/plain;charset=utf-8` で CORS プリフライトを回避（GAS は `e.postData.contents` で生ボディを受け取るため改修不要）。送信失敗時は `submitData` が以降の送信を中断してエラー表示する。
- **データ不一致レポートの誤検知（False Positive）を根本停止**: 送信成否は GAS 応答で確定するため、読み戻しの曖昧比較による自動の不一致アラートを停止（`hasMismatch`/`mismatchCount`/`mismatchDetails` を中立化）。登録データの表示は参考情報として継続し、NG ボタンは手動の問題報告のみとする。
- **JST 日時解析を追加**: 新関数 `parseJstDateTimeMs()` で入力日時（J列）をブラウザのタイムゾーンに依存せず JST 固定でパース。
- **`normalizeValue` の見直し**: 日付は `new Date()` を使わず文字列処理で `YYYY/MM/DD` に統一（TZ・2桁年の誤変換と非日付文字列の破壊を防止）。数値はカンマ・¥・空白のみ除去し小数点を保持（`"12.5"→"125"` の誤変換を防止）。
- **読み取り範囲・待機の拡張**: 確認画面の読み戻しを `貸借表!A2:K{件数+20}` に拡張し、件数に応じてクッション時間を延長。
- **`calculateAmountForRow`**: 単価を `parseInt`→`parseFloat` に変更し小数単価に対応。
- 関連コミット: `b01a740`, `4eac8a9`。

### GAS（同時実行ガード）

- **`processNormalData` / `processCorrectionData` の行挿入を `LockService` で直列化**: `getScriptLock()` → `tryLock(30000)`（取得失敗時は ERROR 応答）→ 挿入処理 → `SpreadsheetApp.flush()` で確定 → `finally` で `releaseLock()`。複数端末・ダブルクリックによる `insertRowBefore`/`setValues` の競合（空行発生の原因）をサーバ側で防止。
- `docs/gas_scripts/gas_code_complete.gs`・`gas_code_complete_updated.gs` に反映（コミット `9c0d97a`）。本番スクリプト（`コード.js`）にも同内容を適用。

### デプロイ

- 本番 GAS Web アプリのデプロイ（`AKfycbxxrH8ZtjpadlxvdnbFFOvyc4kCsANrZt-aOu5HZ2RhlbSgDwFsJzq7AfMGW58w3HTW` = クライアント `GAS_URL` の `/exec`）を **@69 → @70** に更新（`clasp redeploy`）。デプロイ ID・URL は不変のためクライアント改修は不要。
- ロールバック手順: `clasp redeploy AKfycbxxrH8ZtjpadlxvdnbFFOvyc4kCsANrZt-aOu5HZ2RhlbSgDwFsJzq7AfMGW58w3HTW -V 69`。

### Git

- リポジトリ `https://github.com/MARUGO-s/management` の `main` に `b01a740` / `4eac8a9` / `9c0d97a` を反映。

### バージョン表記

- 本ホットフィックスでは `index.html` の `main.js?v=` クエリおよびコンソールのビルド表記は **据え置き**（アプリ `1.2.0` / ビルド ID `2026040110`）。キャッシュバスト用のバージョン更新が必要な場合は別途対応する。

### 運用メモ

- 過去の同時実行レースで生じた**空行**がスプレッドシートに残っている場合は、行ごと手動削除する。
- 動作確認はテスト送信ではなく実運用の送信で行う（テスト送信は本番表に実データ1行を挿入し、`sendBorrowerEmail_` が実メールを送信するため）。

---

## [1.2.0] — 2026-04-01

### 修正

- **`main.js`（ルート）**: 重複定義していた `populateShops` を削除し、`Identifier 'populateShops' has already been declared` による構文エラーを解消。
- **データ不一致レポート**: `showRegisteredDataConfirmation` 内で、`compareSentAndRegisteredData` の戻り値に `registeredData` / `mismatchCount` / `mismatchDetails` を付与。Supabase・管理画面に送る `registeredDataCount` が常に 0 になる誤表示を解消（`main.js`, `js/main.js`, `pages/js/main.js`）。
- **GAS サンプル**（`docs/gas_scripts/gas_code_complete.gs`, `gas_code_complete_updated.gs`）: `SPREADSHEET_ID` を本番 ID の文字列リテラルで明示。`SpreadsheetApp.getActiveSpreadsheet().getId()` に依存しない。食材・原価シートは `openById(SPREADSHEET_ID)` に統一。

### ドキュメント・運用

- **`docs/SPREADSHEET_REGISTRY.md`**: 本番スプレッドシート ID・URL・GAS 同期・ID 変更時チェックリストを記載。
- **`.gitignore`**: `config.js` を除外（Supabase anon key 等の混入防止）。新規クローン時は `docs/reference/config.example.js` を元にローカルで `config.js` を作成。

### Git

- リポジトリ `https://github.com/MARUGO-s/management` の `main` に上記を反映。

### バージョン表記

- アプリ **1.2.0**（ビルド ID `2026040110`）。`index.html` の `main.js` クエリ、`main.js` / `js/main.js` / `pages/js/main.js` のコンソールログを更新。

---

## 追加・更新内容（2025-09-20 時点）

- **店舗別貸借り合計のサマリーカード表示の改善**
  - 店舗別貸借り合計表示時に、店舗別残高のサマリーカードを非表示に変更。
  - 貸し合計、借り合計、総計、店舗数のサマリーカードのみを表示するように改善。
  - 新関数 `updateStoreBalanceSummaryCardsWithoutStoreDetails()` を追加し、店舗別残高カードを除外したサマリーカードを生成。

- **店舗別貸借り合計のCSV出力の簡素化**
  - 店舗別貸借り合計のCSV出力時に、ポップアップ選択を表示せず「全てを表示」で直接エクスポートするように変更。
  - `exportResults()` 関数で店舗別貸借り合計の場合は直接 `performExport()` を呼び出すように改善。

- **アクセス履歴カードの拡張**
  - 管理画面の「アクセス履歴」に API 呼び出し回数と 30 回超の高負荷警告を表示。
  - ログアウト時にセッション中の API 利用差分を集計し、Supabase `access_logs` に保存するよう変更。
- **アクセス履歴の確認フローの整備**
  - 大量API検知時に確認ボタンを追加し、確認済みフラグを付与できるよう変更。
  - 確認前の履歴は自動削除対象から除外し、確認後のみ 50 件超で自動削除。
  - 警告表示中でも個別削除が可能（確認後に有効）。

- **アクセス履歴のCSV出力対応**
  - 現在画面で確認している履歴をCSV形式でダウンロード可能に変更。
  - 出力には確認状況・確認者・端末情報などの詳細情報を含める。
  - 取得済みデータをキャッシュして常に最新状態を出力し、CSVフォーマットもエスケープ処理を整備。

- **Edge Function: `access-logs` の刷新**
  - `api_call_count` カラムを追加し、履歴に API 呼び出し回数を保持。
  - 50 件を超過した古い履歴を自動削除。
  - 管理画面では取得した履歴に応じて警告ボックスを制御。

- **使用量インジケーター設定の Supabase 永続化**
  - 新テーブル `indicator_settings` と Edge Function `indicator-settings` を追加。
  - 管理画面の色設定は Supabase へ保存・取得・リセットできるよう変更。
  - 失敗時はローカル設定をフォールバックとして継続。

- **使用量インジケーター (右下ウィジェット) の改善**
  - 初期化時に Supabase の閾値を取得してキャッシュ。
  - `usage-indicator.js` が閾値変更を即座に反映し、フォールバック時にはローカル設定を使用。

## 新規 Supabase リソース

- **マイグレーション**
  - `20250919010510_create_access_logs.sql`
  - `20250920092000_add_api_call_count_to_access_logs.sql`
  - `20250920095500_create_indicator_settings.sql`
  - `20250920102000_enhance_access_logs_alerts.sql`

- **Edge Functions**
  - `access-logs`
  - `indicator-settings`

## デプロイ・操作ログ

1. `supabase login` → `supabase link --project-ref mzismgyctulktrihcwfg`
2. `supabase db push` で上記マイグレーションを適用
3. `supabase functions deploy access-logs` / `indicator-settings`
4. 動作確認として `cli-test` 名義で履歴・インジケーター設定を登録後、閾値はデフォルトへリセット済み

## 注意事項

- `access_logs` に残るテストデータ（`cli-test`）が不要であれば削除してください。
- Google Cloud Console の課金情報は別途 API 連携が必要であり、現状の管理画面には表示していません。
