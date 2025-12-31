# GitHub Pagesへのデプロイ手順

このガイドでは、かき氷レシピアーカイブをGitHub Pagesにデプロイする方法を説明します。

## 📋 事前準備

### 必要なもの
- GitHubアカウント
- Gitがインストールされていること

## 🚀 デプロイ手順

### ステップ1: 静的版のrecipes.htmlを生成

新しいレシピを追加した後、以下のコマンドで静的版を生成します：

```bash
cd dome
node generate-recipes-static.js
```

このコマンドで `recipes.html` が生成されます（サーバー機能なし、純粋なHTML）。

### ステップ2: Gitリポジトリの準備

まだGitリポジトリを初期化していない場合：

```bash
cd /Users/yoshito/Downloads/management-main-50
git init
git add .
git commit -m "Initial commit: かき氷レシピアーカイブ"
```

### ステップ3: GitHubにリポジトリを作成

1. GitHubにログイン
2. 右上の「+」→「New repository」をクリック
3. リポジトリ名を入力（例：`management`）
4. Publicを選択
5. 「Create repository」をクリック

### ステップ4: リモートリポジトリに接続

```bash
git remote add origin https://github.com/MARUGO-s/management.git
git branch -M main
git push -u origin main
```

**注意**: `MARUGO-s` を自分のGitHubユーザー名に置き換えてください。

### ステップ5: GitHub Pagesの設定

1. GitHubのリポジトリページに移動
2. 「Settings」タブをクリック
3. 左サイドバーの「Pages」をクリック
4. 「Source」で「Deploy from a branch」を選択
5. 「Branch」で `main` を選択し、フォルダは `/root` を選択
6. 「Save」をクリック

数分後、以下のようなURLでサイトが公開されます：
```
https://marugo-s.github.io/management/
```

### ステップ6: domeフォルダへのアクセス

レシピページは以下のURLでアクセスできます：
```
https://marugo-s.github.io/management/dome/recipes.html
```

## 📝 新しいレシピを追加する方法

### 1. ローカルで新しいレシピを追加

```bash
# domeフォルダに新しいレシピファイルを追加
# 例: 202602.html（2026年2月のレシピ）
```

### 2. 静的版recipes.htmlを再生成

```bash
cd dome
node generate-recipes-static.js
```

### 3. GitHubにプッシュ

```bash
git add dome/202602.html dome/recipes.html
git commit -m "Add recipe for February 2026"
git push origin main
```

数分後、GitHub Pagesに自動的に反映されます！

## 🔄 更新の流れ

```
ローカル環境
   ↓
1. 新しいレシピHTMLファイルを追加（例：202602.html）
   ↓
2. node generate-recipes-static.js を実行
   ↓
3. git add, commit, push
   ↓
GitHub Pages（自動デプロイ）
   ↓
数分後にサイトが更新される
```

## ⚠️ 重要な注意事項

### GitHub Pagesの制限

- **サーバーサイド機能は使えません**
  - ファイルアップロード機能は動作しません
  - 更新ボタンは動作しません
  - `server.js` は使用されません

- **静的ファイルのみホスティング可能**
  - HTML、CSS、JavaScriptのみ
  - Node.jsサーバーは動作しません

### 推奨ワークフロー

**ローカル開発環境（自分のPC）:**
- `node generate-recipes-static.js` でrecipes.htmlを生成
- 新しいレシピファイルを追加
- Gitでコミット＆プッシュ

**GitHub Pages（公開サイト）:**
- 静的なレシピ一覧ページとして閲覧のみ
- 自動的に最新版が反映される

## 📁 デプロイされるファイル

```
management/
├── dome/
│   ├── recipes.html          # レシピ一覧（静的版）
│   ├── 202512.html          # 2025年12月のレシピ
│   ├── 202601.html          # 2026年1月のレシピ
│   └── 202602.html          # 2026年2月のレシピ（新規追加時）
├── index.html                # トップページ
├── pages/
│   └── marugo.html          # データページ
└── ... その他のファイル
```

## 🛠️ トラブルシューティング

### サイトが表示されない

1. GitHub Pagesの設定を確認
2. ブランチが `main` になっているか確認
3. URLが正しいか確認（https://ユーザー名.github.io/リポジトリ名/）

### レシピが更新されない

1. `generate-recipes-static.js` を実行したか確認
2. `git push` したか確認
3. GitHub Actionsのデプロイが完了しているか確認（数分かかる場合があります）

### 404エラーが出る

- ファイルパスが正しいか確認
- `dome/recipes.html` にアクセスしているか確認

## 💡 Tips

### GitHub Actionsで自動化

将来的に、GitHub Actionsを使って以下を自動化できます：

1. 新しいレシピファイルがpushされたら自動的に `generate-recipes-static.js` を実行
2. 自動的にrecipes.htmlを更新してコミット
3. 自動デプロイ

（詳細は別途ドキュメント化可能）

## 🔗 有用なリンク

- [GitHub Pages公式ドキュメント](https://docs.github.com/ja/pages)
- [Gitの基本コマンド](https://git-scm.com/doc)

---

**最終更新**: 2025年12月31日
