# 🚀 本番用システム - 完全ガイド

## 📋 システム概要

このシステムは、Google Sheets APIを使用した貸借管理システムの本番版です。データの送信、照合、不一致レポート機能を提供します。

## 🏗️ システム構成

### **フロントエンド**
- **メインシステム**: `pages/marugo.html` - データ送信・照合
- **管理画面**: `admin.html` - システム管理・監視
- **データ修正**: `pages/correction.html` - データ修正機能

### **バックエンド**
- **Supabase**: データベース・認証・Edge Functions
- **Google Sheets API**: データ保存・取得

## 📊 主要機能

### **1. データ送信・照合システム**
- ✅ データ送信時のバリデーション
- ✅ 送信データと登録データの自動照合
- ✅ 不一致検出時の詳細レポート
- ✅ 環境情報の自動収集

### **2. 管理・監視システム**
- ✅ データ不一致レポート管理
- ✅ API使用量監視
- ✅ データ保持ポリシー管理
- ✅ システム統計表示

### **3. セキュリティ機能**
- ✅ パスワード認証システム
- ✅ 環境情報の詳細記録
- ✅ データ暗号化・保護

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

## 🚀 デプロイ手順

### **1. Supabase設定**
```bash
# プロジェクトの初期化
supabase init

# マイグレーションの適用
supabase db push

# Edge Functionsのデプロイ
supabase functions deploy api-usage-tracker
supabase functions deploy data-mismatch-reports
supabase functions deploy password-manager
supabase functions deploy send-alert-email
```

### **2. 環境変数の設定**
```javascript
// config.js
window.SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
};
```

### **3. ローカルサーバーの起動**
```bash
# ポート3000でサーバー起動
python3 -m http.server 3000

# アクセスURL
http://localhost:3000/index.html
```

## 📈 運用監視

### **管理画面での監視項目**
1. **データ不一致レポート** - 送信データの整合性
2. **API使用量** - Google Sheets APIの使用状況
3. **データ保持状況** - 6ヶ月間のデータ保持状況
4. **システム統計** - アクセス数・デバイス数

### **アラート機能**
- API使用量の上限接近時
- データ不一致の発生時
- システムエラーの発生時

## 🔧 メンテナンス

### **定期メンテナンス**
1. **データクリーンアップ** - 6ヶ月以上古いデータの削除
2. **ログローテーション** - 古いログの整理
3. **パフォーマンス監視** - システム負荷の確認

### **トラブルシューティング**
1. **CORSエラー** - ローカルサーバーの確認
2. **認証エラー** - Supabase設定の確認
3. **データ不一致** - 送信データの形式確認

## 📚 技術仕様

### **使用技術**
- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **バックエンド**: Supabase, Edge Functions (Deno)
- **データベース**: PostgreSQL (Supabase)
- **API**: Google Sheets API v4

### **ブラウザ対応**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🛡️ セキュリティ

### **データ保護**
- パスワードのハッシュ化
- 環境情報の暗号化
- アクセスログの記録

### **認証・認可**
- 管理者パスワード認証
- API キーの安全な管理
- セッション管理

## 📞 サポート

### **ログ確認**
- ブラウザの開発者ツール（Console）
- Supabase Dashboard（Logs）
- 管理画面の統計情報

### **よくある問題**
1. **「データの取得に失敗しました」** → ローカルサーバーの確認
2. **「CORSエラー」** → `http://localhost:3000`でのアクセス確認
3. **「認証エラー」** → Supabase設定の確認

---

## 🎯 本番運用開始

システムは本番運用の準備が完了しています。上記の手順に従ってデプロイし、管理画面でシステムの動作を確認してください。

**運用開始日**: 2025年10月16日
**システムバージョン**: v1.0.0
**最終更新**: 2025年10月16日
