# セキュリティガイド

このドキュメントでは、Recipe Boxアプリケーションのセキュリティ対策について説明します。

## 🔒 実装済みセキュリティ対策

### 1. APIキー管理の強化 ✅
- **問題**: クライアントサイドにAPIキーがハードコーディング
- **解決**: Supabase Functionsの環境変数で管理
- **実装**: `get-api-keys` function with rate limiting

### 2. XSS攻撃対策 ✅
- **対策**: HTMLエスケープ関数 `esc()` を使用
- **場所**: 全てのinnerHTML使用箇所
- **実装**: `esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }`

### 3. データベースRLSポリシーの修正 🔄
- **問題**: 過度に寛容な `USING (true)` ポリシー
- **解決**: 適切な権限分離を実装
- **マイグレーション**: `20250111000000_secure_rls_policies.sql`

## 🛡️ セキュリティポリシー詳細

### データベースアクセス制御

#### Categories / Tags テーブル
- **読み取り**: 全ユーザー
- **作成・更新・削除**: 認証済みユーザーのみ

#### Recipes テーブル
- **読み取り**: 全ユーザー
- **作成**: 認証済みユーザー
- **更新・削除**: 一時的に全ユーザー（将来は作成者のみ）

### API関数のセキュリティ

#### get-api-keys Function
- **レート制限**: 10分間に10リクエスト
- **入力検証**: キー名の妥当性チェック
- **許可されたキー**: GROQ_API_KEY, CHATGPT_API_KEY, GOOGLE_API_KEY, VISION_API_KEY
- **返却値**: APIキーの有無のみ（キー本体は返却しない）
- **ログ記録**: リクエスト元IPの記録

## 🚀 今後の改善予定

### 1. ユーザー認証システムの実装
```sql
-- 将来実装予定のポリシー例
CREATE POLICY "Users can only update own recipes" ON recipes
    FOR UPDATE USING (auth.uid() = created_by);
```

### 2. セキュリティ監査ログ
- レシピの重要な操作をログに記録
- 不正アクセスの検出と追跡

### 3. CSRF対策
- CSRFトークンの実装
- SameSite Cookieの設定

## ⚠️ セキュリティ注意事項

### 現在の制限事項
1. **匿名ユーザー**: 現在は誰でもレシピを変更・削除可能
2. **認証なし**: ユーザー認証システムが未実装
3. **セッション管理**: セッション固定攻撃への対策が不十分

### 運用時の注意点
1. **定期的なセキュリティ監査**: `SELECT * FROM security_audit;`
2. **ログの確認**: Supabase Functionsのログを定期確認
3. **依存関係の更新**: セキュリティパッチの適用

## 🔧 セキュリティ設定の確認方法

### データベースポリシーの確認
```sql
SELECT * FROM security_audit ORDER BY tablename, operation;
```

### API関数のログ確認
```bash
# Supabase CLI
supabase functions logs get-api-keys
```

## 📞 セキュリティインシデント対応

### インシデント発生時の手順
1. **即座の対応**: 問題のあるポリシーを一時無効化
2. **ログ収集**: 関連するアクセスログを収集
3. **影響範囲の特定**: 被害の範囲を調査
4. **修正**: セキュリティパッチの適用
5. **再発防止**: ポリシーとプロセスの見直し

### 緊急時のSQL
```sql
-- 緊急時: レシピへの書き込みを一時停止
DROP POLICY IF EXISTS "Allow recipe updates" ON recipes;
DROP POLICY IF EXISTS "Allow recipe deletes" ON recipes;
```

## 🔍 セキュリティチェックリスト

- [x] APIキーのハードコーディング除去
- [x] XSS攻撃対策の実装
- [x] データベースRLSポリシーの修正
- [x] API関数のレート制限実装
- [ ] ユーザー認証システムの実装
- [ ] CSRF対策の実装
- [ ] セキュリティ監査ログの実装
- [ ] 定期的なセキュリティ監査の実施

---

**最終更新**: 2025年1月11日  
**担当**: Claude Code  
**次回見直し予定**: ユーザー認証システム実装時
