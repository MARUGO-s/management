# Recipe Box - レシピ管理アプリ

## 📁 プロジェクト構造

```
app-main-11/
├── assets/                    # 静的リソース
│   ├── css/
│   │   └── style.css         # メインスタイルシート
│   ├── icons/                # ファビコン・アイコン
│   │   ├── favicon.ico
│   │   ├── favicon-v2.ico
│   │   ├── icon-*.png        # 各種サイズのアイコン
│   ├── images/
│   │   └── finger.png        # 画像リソース
│   └── js/
│       ├── app-edit.js       # レシピ編集ページのJavaScript
│       └── app-index.js      # メインページのJavaScript
├── docs/
│   └── SECURITY.md           # セキュリティ情報
├── supabase/                 # Supabase設定・関数
│   ├── config.toml           # Supabase設定ファイル
│   ├── functions/            # Edge Functions
│   │   ├── call-vision-api/      # Vision API呼び出し
│   │   ├── call-groq-api/        # Generative Language API プロキシ（構造化）
│   │   ├── call-openai-api/      # OpenAI APIプロキシ
│   │   ├── get-api-keys/         # APIキー存在チェック
│   │   ├── ocr-recipe-extraction/# OCR レシピ抽出
│   │   └── screenshot-recipe/    # スクリーンショット処理
│   └── migrations/           # データベースマイグレーション
│       ├── 20250110000000_add_source_url_to_recipes.sql
│       ├── 20250111000000_secure_rls_policies.sql
│       └── 20250111000001_strict_security_policies.sql
├── config.js                 # アプリケーション設定
├── index.html                # メインページ（レシピ一覧）
├── recipe_edit.html          # レシピ編集ページ
├── recipe_view.html          # レシピ表示ページ
└── README.md                 # このファイル
```

## 🚀 機能

### 主要機能
- **レシピ管理**: 作成、編集、削除、表示
- **画像アップロード**: レシピ画像のアップロード・表示
- **OCR機能**: 画像からレシピ情報を自動抽出
- **URL読み込み**: 外部サイトからレシピ情報を取得
- **AI翻訳**: レシピの多言語翻訳
- **カテゴリ・タグ管理**: レシピの分類・検索

### AI機能
- **Groq API**: 画像解析・OCR・レシピ生成・翻訳
- **AIアドバイス**: レシピ改善提案

## 🛠 技術スタック

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **バックエンド**: Supabase (PostgreSQL, Edge Functions)
- **AI**: Groq API (Llama 3.1 70B)
- **認証**: Supabase Auth
- **ストレージ**: Supabase Storage

## 📋 セットアップ

### 前提条件
- Node.js (v16以上)
- Supabase CLI
- Groq アカウント（API用）

### インストール
1. リポジトリをクローン
2. Supabaseプロジェクトにリンク
3. 環境変数を設定
4. データベースマイグレーションを実行

### 環境変数
```bash
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Groq API
GROQ_API_KEY=your_groq_api_key
```

## 🔧 開発

### ローカル開発
```bash
# Supabaseローカル環境を起動
supabase start

# 開発サーバーを起動
python3 -m http.server 8080
```

### デプロイ
```bash
# Supabase Functionsをデプロイ
supabase functions deploy

# データベースマイグレーションを実行
supabase db push
```

## 📱 使用方法

1. **レシピ作成**: 「新規レシピを作成」ボタンから開始
2. **画像アップロード**: 画像をドラッグ&ドロップまたは選択
3. **OCR解析**: 「画像解析」ボタンで自動抽出
4. **URL読み込み**: 外部サイトのURLを入力
5. **翻訳**: 「翻訳」ボタンで多言語対応

## 🔒 セキュリティ

- Row Level Security (RLS) を有効化
- APIキーは環境変数で管理
- 入力値の検証・サニタイゼーション
- CORS設定の適切な管理

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🤝 貢献

プルリクエストやイシューの報告を歓迎します。

## 📞 サポート

問題が発生した場合は、GitHubのIssuesページで報告してください。
