# 貸借管理システム

## 概要
Google Sheets APIとSupabaseを活用した貸借管理システムです。データの送信、問題報告、使用量監視などの機能を提供します。

## 機能
- 📊 データ送信・管理
- 🔍 問題報告システム
- 📈 使用量監視
- 📱 モバイル対応
- 🔒 セキュアな認証

## セットアップ

### 1. 環境設定
```bash
# 設定ファイルのコピー
cp config.example.js config.js

# config.jsを編集してSupabaseの設定を追加
```

### 2. Supabase設定
```bash
# Supabase CLIのインストール
npm install -g supabase

# プロジェクトの初期化
supabase init

# マイグレーションの実行
supabase db push

# Edge Functionsのデプロイ
supabase functions deploy
```

### 3. ローカルサーバーの起動
```bash
# 開発サーバーの起動
./scripts/start-local-server.sh

# または手動で起動
python3 -m http.server 8000
```

## アクセス
- メインページ: `http://localhost:8000`
- 管理画面: `http://localhost:8000/admin.html`

## 本番環境へのデプロイ
1. GitHubリポジトリにプッシュ
2. Netlify/Vercelでデプロイ
3. 環境変数の設定
4. Supabaseの本番環境設定

## GitHubリポジトリ
- **リポジトリURL**: `https://github.com/MARUGO-s/management`
- **GitHub Pages URL**: `https://marugo-s.github.io/management/`

## ライセンス
MIT License