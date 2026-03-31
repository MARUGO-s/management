# スプレッドシート・送信先レジストリ（台帳）

システムは**ファイル名ではなく ID と URL**で本番を決めます。運用・障害対応・引き継ぎ用に、**ここを正**としてください。

## 本番レコード（現在値）

| 項目 | 値 | 備考 |
|------|-----|------|
| スプレッドシート表示名 | Loan management | Google 上のタイトル（変更可。ID は不変） |
| **SPREADSHEET_ID**（GAS・API 共通の本番 ID） | `1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY` | 変える場合は下記チェックリスト必須 |
| ブラウザで開く URL | https://docs.google.com/spreadsheets/d/1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY/edit | ブックマーク推奨 |
| フロント `spreadsheetId` | 上記と同一 | `config.js` の `SUPABASE_CONFIG.spreadsheetId` |
| GAS 定数 | `SPREADSHEET_ID` | `docs/gas_scripts/gas_code_complete*.gs` 先頭 |
| GAS Web アプリ URL | `main.js` 等の `GAS_URL` | デプロイし直すと変わることがある |

### GAS_URL が定義されているファイル（変更時はすべて揃える）

リポジトリ内で `GAS_URL` を検索し、同一 URL に更新してください。

- 例: `main.js`, `pages/js/main.js`, `pages/js/correction.js`

### 主要シート名（参照用）

- 貸借データ: `貸借表`
- マスタ: `マスタ`
- コスト系: `食材コスト`, `原価リスト`（GAS サンプル内参照）

### Google Apps Script をリポジトリと揃えるとき

`getActiveSpreadsheet().getId()` のままだとコンテナと実体がずれやすいです。リポジトリの `docs/gas_scripts/gas_code_complete.gs` 先頭は **`const SPREADSHEET_ID = '…';` の明示 ID** と、食材・原価は **`openById(SPREADSHEET_ID)`** です。Google 側を同じにしたうえでデプロイを更新してください。

---

## 固定フォルダ・バックアップ（運用ルール）

1. **本番ブック**は Google ドライブ上の決めたフォルダに置く（スターまたはショートカット併用推奨）。
2. **バックアップ出力先**は別フォルダにする（誤って本番と同じ操作をしないため）。
3. ゴミ箱に入れても ID はしばらく有効なため「アプリは動くがドライブで見えない」状態になり得る。迷ったら**この台帳の URL で直接開く**。

---

## ID を変えたときのチェックリスト

- [ ] このファイル `docs/SPREADSHEET_REGISTRY.md` の表を更新
- [ ] `config.js` の `spreadsheetId`
- [ ] `docs/gas_scripts/gas_code_complete.gs` の先頭 `SPREADSHEET_ID`
- [ ] `docs/gas_scripts/gas_code_complete_updated.gs` の先頭 `SPREADSHEET_ID`
- [ ] Google 上の GAS を編集・**再デプロイ**（コンテナを変えた場合は特に）
- [ ] Supabase Edge Function 等で `SPREADSHEET_ID` を環境変数にしている場合はそちらも更新
- [ ] サービスアカウントに新ブックの**編集権限**を付与

---

## ステージング用（任意・コピーして記入）

| 項目 | 値 |
|------|-----|
| 表示名 | |
| SPREADSHEET_ID | |
| URL | |

本番とステージングで ID が違う場合は、`config.js` を環境ごとに差し替えるか、ビルド／デプロイ時に上書きする運用にしてください。
