# 📁 プロジェクト構造（v4.0）

## 🎯 **最終整理済みフォルダ構成（包括的API管理システム対応）**

```
management-main-41/
├── 📄 admin.html                   # 管理画面（v4.0新機能）
├── 📄 config.js                    # メイン設定ファイル
├── 📄 favicon.ico                  # ファビコン
├── 📄 index.html                   # エントリーポイント
│
├── 📁 assets/                      # 静的リソース
│   ├── 📁 css/                     # スタイルシート
│   │   ├── drawer.vertical.css
│   │   ├── style.css
│   │   └── styles-form.css
│   ├── 📁 icons/                   # アイコンファイル
│   │   ├── favicon.ico
│   │   ├── icon-16x16.png
│   │   ├── icon-32x32.png
│   │   ├── icon-180x180.png
│   │   ├── icon-192x192.png
│   │   └── icon-512x512.png
│   ├── 📁 images/                  # 画像ファイル
│   │   └── finger.png
│   └── 📁 js/                      # 共通JavaScript（削除済み）
│   └── 📄 site.webmanifest         # PWAマニフェスト
│
├── 📁 js/                          # 共通JavaScript（v4.0新構成）
│   ├── quota-alert-system.js       # API使用量監視システム
│   ├── simple-auth.js              # Supabaseベース認証
│   ├── simple-optimization.js      # API最適化システム
│   ├── unified-data-loader.js      # 統合データローダー
│   └── usage-indicator.js          # 使用量インジケーター（v4.0新機能）
│
├── 📁 docs/                        # ドキュメント
│   ├── API_OPTIMIZATION_GUIDE.md   # API最適化ガイド
│   ├── API_TOKEN_CALCULATION.md    # APIトークン計算書
│   ├── COMPLETE_SYSTEM_GUIDE.md    # 完全システムガイド
│   ├── PROJECT_STRUCTURE.md        # このファイル
│   └── README.md                   # プロジェクト概要
│
├── 📁 js/                          # コアJavaScript
│   ├── quota-alert-system.js       # API使用量監視・アラート
│   ├── simple-auth.js              # シンプル認証システム
│   ├── simple-optimization.js      # シンプル最適化（無効化済み）
│   └── unified-data-loader.js      # 統合データローダー（メイン最適化）
│
├── 📁 pages/                       # アプリケーションページ
│   ├── 📄 correction.html          # データ修正ページ
│   ├── 📄 cost.html                # 原価計算ページ
│   ├── 📄 ingredients.html         # 食材管理ページ
│   ├── 📄 marugo.html              # メインアプリケーション
│   ├── 📁 css/                     # ページ専用CSS
│   │   └── styles.css
│   └── 📁 js/                      # ページ専用JavaScript
│       ├── correction.js           # 修正ページロジック
│       ├── ingredients.js          # 食材ページロジック
│       ├── main.js                 # メインページロジック
│       └── scripts.js              # 共通スクリプト
│
├── 📁 scripts/                     # ユーティリティスクリプト
│   └── start-local-server.sh       # ローカルサーバー起動
│
├── 📁 supabase/                    # Supabaseバックエンド
│   ├── 📄 config.toml              # Supabase設定
│   ├── 📁 migrations/              # データベースマイグレーション
│   │   └── 📄 *_create_password_management.sql
│   └── 📁 functions/               # Edge Functions
│       ├── 📁 api-usage-tracker/   # API使用量追跡（v4.0新機能）
│       │   └── index.ts
│       ├── 📁 password-manager/    # パスワード管理機能（v3.0）
│       │   └── index.ts
│       └── 📁 sheets-api/          # Google Sheets API
│           └── index.ts
│
└── 📄 admin.html                   # 管理者画面
```

## 🔧 **主要コンポーネント**

### **📊 コアシステム**

#### **1. config.js**
- Supabase設定
- callSheetsAPI関数（API使用量監視付き）
- recordAPIUsage関数
- recordDataSubmission関数
- デバッグ用関数

#### **2. unified-data-loader.js** 
- **メイン最適化システム**
- 複数API呼び出しを1回に統合
- 5分間キャッシュ
- 名前・品目・店舗リスト抽出

#### **3. quota-alert-system.js**
- API使用量監視
- 段階的ポップアップ警告（1000/2000/2800件）
- ローカルストレージ統計管理

#### **4. simple-auth.js**
- パスワード認証（初期値: SystemSecure2409!）
- セッション管理

### **📱 アプリケーションページ**

#### **1. marugo.html** - メインアプリケーション
- データ入力・送信
- 検索・分析機能
- 統合データローダー使用

#### **2. correction.html** - データ修正
- 既存データの修正
- 統合データローダー使用

#### **3. cost.html** - 原価計算
- 原価リストシート使用
- 独立したAPI呼び出し

#### **4. ingredients.html** - 食材管理
- 食材コストシート使用

#### **5. admin.html** - 管理者画面
- API使用量ダッシュボード
- 警告設定
- システム状態監視

### **🗄️ バックエンド**

#### **Supabase Edge Functions:**
1. **sheets-api** - Google Sheets API プロキシ（`GOOGLE_API_KEY` シークレットが必要）
2. **password-manager** - パスワード管理・認証（`SERVICE_ROLE_KEY` シークレットが必要）
3. **api-usage-tracker** - API使用量の記録・集計
   - `action: 'record'` が使用量サマリを返すため、追加の `action: 'get'` 呼び出しは不要

## 📊 **API呼び出し最適化**

### **最適化前 → 最適化後**

```
ページ読み込み時:
8回のAPI呼び出し → 2回のAPI呼び出し (75%削減)

データ送信時:
2回のAPI呼び出し → 2回のAPI呼び出し (GAS + Supabase記録)

合計削減効果: 66%のAPI使用量削減
```

### **現在のAPI呼び出しパターン**

#### **メインページ (marugo.html):**
```
1. UnifiedDataLoader: GET 貸借表!A:K (1回)
   ├─ 名前リスト抽出
   ├─ 品目リスト抽出  
   ├─ 店舗リスト抽出
   └─ 検索データ準備

2. データ送信: POST via GAS_URL + Supabase `api-usage-tracker` (送信時のみ)
```

#### **修正ページ (correction.html):**
```
1. UnifiedDataLoader: キャッシュから取得 (新規API呼び出しなし)
```

#### **原価ページ (cost.html):**
```
1. GET 原価リスト!B:L (1回・独立)
```

## 🎯 **システムの特徴**

### **✅ 最適化済み機能**
- **統合データローダー**: 複数API呼び出しを1回に統合
- **インテリジェントキャッシュ**: 5分間の自動キャッシュ
- **重複防止**: 2秒以内の同一呼び出しをスキップ
- **詳細ログ**: 全API呼び出しの追跡・分析

### **🚨 監視機能**
- **リアルタイム使用量表示**: 日次/月次/総計
- **段階的警告システム**: 1000/2000/2800件でアラート
- **管理者ダッシュボード**: 使用状況の可視化

### **🔒 セキュリティ**
- **Supabase Edge Functions**: APIキーの安全な管理
- **パスワード認証**: 管理画面の保護
- **環境変数管理**: 機密情報の適切な管理

## 📋 **ファイル整理完了**

### **🗑️ 削除されたファイル**
- `simple-test.html` (テスト用)
- `optimization-test.html` (テスト用)
- `alert-system-setup.html` (セットアップ用)
- `API_TOKEN_CALCULATION.md` (重複)
- `docs/DYNAMIC_OPTIMIZATION_EXPLAINED.md` (不要)
- `docs/FREE_TIER_CAPACITY_ANALYSIS.md` (統合済み)
- `docs/MONTHLY_COST_CALCULATION.md` (統合済み)
- `js/optimization/` (ディレクトリ全体)
- `js/optimization-status-checker.js`

### **⚙️ 無効化されたシステム**
- `simple-optimization.js` のAPIラップ機能
- 複数の競合する最適化システム

### **📦 統合されたシステム**
- 全データ読み込み → `unified-data-loader.js`
- API使用量監視 → `config.js` + `quota-alert-system.js`
- 認証システム → `simple-auth.js`

**整理完了！クリーンで効率的なプロジェクト構成になりました。**
