# 本番環境デプロイメントガイド

## 前提条件
- Supabaseアカウント
- Google Cloud Platformアカウント
- GitHubアカウント

## 1. Supabase設定

### 1.1 プロジェクト作成
```bash
# Supabase CLIのインストール
npm install -g supabase

# プロジェクトの初期化
supabase init

# ログイン
supabase login

# プロジェクトリンク
supabase link --project-ref YOUR_PROJECT_REF
```

### 1.2 マイグレーション実行
```bash
# マイグレーションファイルの実行
supabase db push

# Edge Functionsのデプロイ
supabase functions deploy
```

### 1.3 環境変数設定
```bash
# Supabase URLとキーを取得
supabase status

# 設定ファイルの作成
cp config.example.js config.js
# config.jsを編集してSupabaseの設定を追加
```

## 2. Google Sheets API設定

### 2.1 Google Cloud Console設定
1. Google Cloud Consoleにアクセス
2. 新しいプロジェクトを作成
3. Google Sheets APIを有効化
4. サービスアカウントを作成
5. 認証情報をダウンロード

### 2.2 スプレッドシート設定
1. Google Sheetsでスプレッドシートを作成
2. サービスアカウントに編集権限を付与
3. スプレッドシートIDをconfig.jsに設定

## 3. 本番環境デプロイ

### 3.1 Netlifyでのデプロイ
```bash
# リポジトリをGitHubにプッシュ
git add .
git commit -m "本番環境用設定"
git push origin main

# Netlifyでデプロイ
# 1. Netlifyにログイン
# 2. 新しいサイトを作成
# 3. GitHubリポジトリを選択
# 4. ビルド設定を設定
```

### 3.2 環境変数設定
```bash
# Netlifyの環境変数設定
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SPREADSHEET_ID=your_spreadsheet_id
```

## 4. セキュリティ設定

### 4.1 CORS設定
```javascript
// SupabaseのCORS設定
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://your-domain.netlify.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
}
```

### 4.2 認証設定
```sql
-- RLSポリシーの設定
ALTER TABLE public.data_mismatch_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role to manage data_mismatch_reports" ON public.data_mismatch_reports
FOR ALL
USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
```

## 5. 監視・メンテナンス

### 5.1 ログ監視
- Supabaseダッシュボードでログを確認
- エラーアラートの設定
- 使用量監視

### 5.2 バックアップ
- データベースの定期バックアップ
- 設定ファイルのバックアップ
- コードのバージョン管理

## 6. トラブルシューティング

### 6.1 よくある問題
- CORSエラー: ドメイン設定を確認
- 認証エラー: APIキーの確認
- データベースエラー: マイグレーションの確認

### 6.2 デバッグ方法
```javascript
// デバッグモードの有効化
window._debugMode = true;

// API使用量の確認
window.showCumulativeAPIUsage();

// エラーログの確認
console.log('エラーログ:', error);
```

## 7. パフォーマンス最適化

### 7.1 キャッシュ設定
- ブラウザキャッシュの活用
- CDNの使用
- 画像の最適化

### 7.2 データベース最適化
- インデックスの追加
- クエリの最適化
- データの定期クリーンアップ

## 8. セキュリティチェックリスト

- [ ] HTTPSの有効化
- [ ] 環境変数の保護
- [ ] APIキーの管理
- [ ] アクセス制御の設定
- [ ] ログの監視
- [ ] バックアップの設定
- [ ] セキュリティヘッダーの設定
- [ ] 定期的なセキュリティ監査
