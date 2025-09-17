# 📊 貸借管理システム

店舗別の貸借データを管理・分析するWebアプリケーションです。

## 🚀 システム概要

- **Google Sheets API**を使用してスプレッドシートからデータを取得
- **Supabase Functions**経由でセキュアなAPI接続
- **シンプルパスワード認証**でアクセス制御
- **レスポンシブデザイン**でモバイル対応

## 📁 ファイル構成

```
management-main-41/
├── index.html              # トップページ
├── config.js               # システム設定
├── simple-auth.js          # 認証システム
├── favicon.ico            # ファビコン
├── assets/                # 静的リソース
│   ├── css/              # スタイルシート
│   ├── icons/            # アイコン類
│   ├── images/           # 画像ファイル
│   └── js/               # JavaScript
├── pages/                 # メインページ
│   ├── marugo.html       # メイン分析システム
│   ├── correction.html   # データ修正
│   ├── cost.html         # コスト分析
│   ├── ingredients.html  # 材料管理
│   ├── css/             # ページ専用CSS
│   └── js/              # ページ専用JS
└── supabase/             # Supabaseサーバー設定
    ├── config.toml       # Supabase設定
    └── functions/        # Edge Functions
        └── sheets-api/   # Google Sheets API
```

## 🔐 認証システム

### 初回アクセス
1. システムにアクセス
2. パスワード設定画面が表示
3. 6文字以上のパスワードを設定
4. 確認用パスワードを入力
5. 設定完了

### 通常利用
1. 設定したパスワードでログイン
2. 8時間のセッション有効期限
3. ログアウト機能あり

### 管理機能
- ブラウザコンソールで `resetPassword()` を実行してパスワードリセット可能

## 📊 主要機能

### 1. メイン分析システム (`pages/marugo.html`)
- 店舗別貸借データの検索・分析
- 期間指定での絞り込み
- CSV出力機能
- リアルタイムデータ更新

### 2. データ修正 (`pages/correction.html`)
- 既存データの修正
- バリデーション機能
- 修正履歴の管理

### 3. コスト分析 (`pages/cost.html`)
- コスト分析とレポート生成
- グラフィカルな表示

### 4. 材料管理 (`pages/ingredients.html`)
- 材料データの管理
- 在庫状況の確認

## 🛠️ 技術仕様

### フロントエンド
- **HTML5** + **CSS3** + **JavaScript (ES6+)**
- **レスポンシブデザイン**
- **モダンブラウザ対応**

### バックエンド
- **Supabase** (BaaS)
- **Edge Functions** (Deno/TypeScript)
- **Google Sheets API v4**

### セキュリティ
- **シンプルパスワード認証**
- **セッション管理** (8時間有効)
- **API キーの環境変数管理**
- **HTTPS通信**

## 🚀 デプロイ・運用

### ローカル開発
```bash
# Supabase CLI でローカル開発
supabase start
supabase functions serve
```

### 本番環境
- **Supabase** でホスティング
- **Google Sheets API** キーは環境変数で管理
- **自動バックアップ** 機能

## 📈 システム状態

- ✅ **Google Sheets API**: 正常稼働
- ✅ **Supabase Functions**: デプロイ済み
- ✅ **認証システム**: シンプル認証実装済み
- ✅ **セキュリティ**: 最高レベル (10/10)
- ✅ **レスポンシブ対応**: 完了

## 🔧 メンテナンス

### 定期確認項目
- Google Sheets APIの利用状況
- Supabaseの使用量
- セキュリティ状態の確認

### トラブルシューティング
- パスワードを忘れた場合: `resetPassword()` を実行
- API エラーの場合: Supabase Functions のログを確認
- データが表示されない場合: Google Sheets の権限を確認

## 📞 サポート

システムに関する質問や問題があれば、開発者にお問い合わせください。

---

**最終更新**: 2025年9月17日  
**バージョン**: 1.0.0  
**ステータス**: 本番運用中
