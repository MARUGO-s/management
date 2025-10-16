# 🏢 貸借管理システム

## 📋 概要

Google Sheets APIを使用した貸借管理システムです。データの送信、照合、不一致レポート機能を提供します。

## ✨ 主要機能

- ✅ **データ送信・照合**: Google Sheetsへのデータ送信と自動照合
- ✅ **不一致検出**: 送信データと登録データの差異を自動検出
- ✅ **環境情報記録**: 詳細なアクセス環境の記録
- ✅ **API使用量監視**: 月間API使用量の追跡と制限
- ✅ **データ保持ポリシー**: 6ヶ月間のデータ自動保持

## 🚀 セットアップ

### **1. リポジトリのクローン**

```bash
git clone https://github.com/YOUR_USERNAME/management-system.git
cd management-system
```

### **2. config.jsの作成**

`config.example.js`を`config.js`にコピーして、実際の値を入力してください:

```bash
cp config.example.js config.js
```

`config.js`を編集:

```javascript
const SUPABASE_CONFIG = {
  url: 'YOUR_SUPABASE_URL',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
  spreadsheetId: 'YOUR_SPREADSHEET_ID'
}
```

### **3. Supabaseのセットアップ**

```bash
# マイグレーションの適用
supabase db push

# Edge Functionsのデプロイ
supabase functions deploy api-usage-tracker
supabase functions deploy data-mismatch-reports
supabase functions deploy password-manager
supabase functions deploy send-alert-email
```

### **4. ローカルサーバーの起動**

```bash
python3 -m http.server 3000
```

アクセス: `http://localhost:3000/index.html`

## 📊 システム構成

### **フロントエンド**

- **トップページ**: `index.html`
- **メインシステム**: `pages/marugo.html`
- **管理画面**: `admin.html`
- **データ修正**: `pages/correction.html`

### **バックエンド**

- **Supabase**: データベース・認証・Edge Functions
- **Google Sheets API**: データ保存・取得

## 🗄️ データベース構成

### **主要テーブル**

1. **`api_usage_stats`** - API使用量統計
2. **`data_mismatch_reports`** - データ不一致レポート
3. **`password_management`** - パスワード管理
4. **`access_logs`** - アクセスログ

### **Edge Functions**

1. **`api-usage-tracker`** - API使用量追跡
2. **`data-mismatch-reports`** - 不一致レポート管理
3. **`password-manager`** - パスワード管理
4. **`send-alert-email`** - アラートメール送信

## 📚 ドキュメント

- [本番用システムガイド](PRODUCTION_READY_SYSTEM.md)
- [GitHubセットアップガイド](GITHUB_SETUP.md)
- [セキュリティガイド](docs/SECURITY.md)
- [APIドキュメント](docs/API_OPTIMIZATION_GUIDE.md)

## 🔧 トラブルシューティング

### **CORSエラー**

ファイルを直接開くとCORSエラーが発生します。必ずローカルサーバーを起動してください:

```bash
python3 -m http.server 3000
```

### **認証エラー**

Supabase設定を確認してください:

- `config.js`が正しく設定されているか
- Supabase Edge Functionsがデプロイされているか

### **データ不一致**

送信データの形式を確認してください:

- 必須フィールドが入力されているか
- データ型が正しいか

## 🛡️ セキュリティ

### **機密情報の管理**

- ✅ `config.js`は`.gitignore`で除外
- ✅ 環境変数で認証情報を管理
- ✅ Privateリポジトリを推奨

### **データ保護**

- パスワードのハッシュ化
- 環境情報の暗号化
- アクセスログの記録

## 📞 サポート

### **ログ確認**

- ブラウザの開発者ツール（Console）
- Supabase Dashboard（Logs）
- 管理画面の統計情報

### **よくある質問**

1. **「データの取得に失敗しました」** → ローカルサーバーの確認
2. **「CORSエラー」** → `http://localhost:3000`でのアクセス確認
3. **「認証エラー」** → Supabase設定の確認

## 📝 ライセンス

Private

## 🎯 バージョン

**v1.0.0** - 2025年10月16日

---

## 🚨 重要: GitHubにアップする前に

**必ず`GITHUB_SETUP.md`を読んでください！**

機密情報を誤ってアップしないよう、セキュリティ対策を実施してください。

---

Made with ❤️ for secure data management

