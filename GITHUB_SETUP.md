# 🔒 GitHubにアップする前の重要な手順

## ⚠️ **重要: セキュリティ対策が必要です**

このプロジェクトには機密情報が含まれているため、**そのままGitHubにアップしてはいけません**。以下の手順に従ってください。

---

## 📋 アップロード前のチェックリスト

### ✅ **1. config.jsの保護**

現在の`config.js`には**本番環境の認証情報**が含まれています。これをGitHubにアップすると、誰でもあなたのデータベースにアクセスできてしまいます。

#### **対応方法**:

1. **`config.js`をバックアップ**（ローカルに保存）
   ```bash
   cp config.js config.js.backup
   ```

2. **`config.example.js`を参照用に残す**
   - `config.example.js`には実際の値が含まれていないので、安全にアップできます

3. **`.gitignore`で`config.js`を除外**
   - すでに`.gitignore`に追加済みです ✅

---

### ✅ **2. .gitignoreの確認**

以下のファイルが`.gitignore`に含まれていることを確認してください:

```gitignore
# 機密情報
config.js
.env
.env.local

# Supabase
.branches
.temp
supabase/.temp

# テスト用ファイル
test_*.html
test_*.js
test_*.sql

# バックアップ
*.bak
*.backup
```

✅ **すでに設定済みです**

---

### ✅ **3. 環境変数の確認**

Google API KeyはSupabase Edge Functionsの環境変数で管理されているため、安全です ✅

---

## 🚀 GitHubへのアップロード手順

### **ステップ1: Gitリポジトリの初期化**

```bash
cd /Users/yoshito/Downloads/management-main-46
git init
```

### **ステップ2: .gitignoreの確認**

```bash
cat .gitignore
```

`config.js`が含まれていることを確認してください。

### **ステップ3: ファイルの追加**

```bash
git add .
```

### **ステップ4: 除外ファイルの確認**

```bash
git status
```

**`config.js`が`Untracked files`に表示されていないことを確認してください。**

### **ステップ5: コミット**

```bash
git commit -m "Initial commit: 本番用システム完成"
```

### **ステップ6: GitHubリポジトリの作成**

1. **GitHub**にアクセス: https://github.com/
2. **New repository**をクリック
3. **リポジトリ名**を入力: `management`
4. **Private**を選択（推奨）
5. **Create repository**をクリック

**既存のリポジトリの場合:**
- リポジトリURL: `https://github.com/MARUGO-s/management`
- GitHub Pages URL: `https://marugo-s.github.io/management/`

### **ステップ7: リモートリポジトリの追加**

```bash
git remote add origin https://github.com/MARUGO-s/management.git
```

### **ステップ8: プッシュ**

```bash
git branch -M main
git push -u origin main
```

---

## 📝 README.mdの作成

GitHubにアップする前に、`README.md`を作成しましょう:

```markdown
# 貸借管理システム

## 概要
Google Sheets APIを使用した貸借管理システムです。

## セットアップ

### 1. config.jsの作成

`config.example.js`を`config.js`にコピーして、実際の値を入力してください:

\`\`\`bash
cp config.example.js config.js
\`\`\`

### 2. 環境変数の設定

- `SUPABASE_URL`: SupabaseプロジェクトURL
- `SUPABASE_ANON_KEY`: Supabase匿名キー
- `SPREADSHEET_ID`: Google SpreadsheetsのID

### 3. ローカルサーバーの起動

\`\`\`bash
python3 -m http.server 3000
\`\`\`

アクセス: `http://localhost:3000/index.html`

## ドキュメント

- [本番用システムガイド](PRODUCTION_READY_SYSTEM.md)
- [セキュリティガイド](docs/SECURITY.md)

## ライセンス

Private
```

---

## 🔐 セキュリティのベストプラクティス

### **✅ やるべきこと**

1. **Privateリポジトリを使用**
2. **`.gitignore`で機密情報を除外**
3. **環境変数で認証情報を管理**
4. **定期的にキーをローテーション**

### **❌ やってはいけないこと**

1. **`config.js`をGitHubにアップ**
2. **APIキーをコードに直接記述**
3. **Publicリポジトリに機密情報を含める**
4. **`.gitignore`を忘れる**

---

## 🆘 万が一、機密情報をアップしてしまった場合

1. **すぐにキーを無効化**
   - Supabase Dashboard → Settings → API → Reset keys

2. **コミット履歴から削除**
   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch config.js' \
     --prune-empty --tag-name-filter cat -- --all
   ```

3. **強制プッシュ**
   ```bash
   git push origin --force --all
   ```

4. **新しいキーを生成**

---

## ✅ 最終確認

GitHubにアップする前に、以下を確認してください:

- [ ] `.gitignore`で`config.js`を除外
- [ ] `config.example.js`を作成
- [ ] `git status`で`config.js`が表示されない
- [ ] `README.md`を作成
- [ ] Privateリポジトリを選択

**すべて確認できたら、安全にGitHubにアップできます！** 🚀

---

## 📞 サポート

質問がある場合は、プロジェクト管理者に連絡してください。

