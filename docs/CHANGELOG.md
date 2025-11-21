# 変更履歴 (2025-09-20 更新)

## 追加・更新内容

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
