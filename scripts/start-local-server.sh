#!/bin/bash

# 🚀 本番用ローカルサーバー起動スクリプト
# CORSエラーを回避するためのHTTPサーバーを起動します

echo "🚀 本番用ローカルサーバーを起動中..."
echo "📂 ディレクトリ: $(pwd)"
echo "🌐 URL: http://localhost:8000"
echo ""
echo "📋 利用可能なページ:"
echo "  - http://localhost:8000/index.html (トップページ)"
echo "  - http://localhost:8000/admin.html (管理画面)"
echo "  - http://localhost:8000/pages/marugo.html (メインシステム)"
echo "  - http://localhost:8000/pages/correction.html (データ修正)"
echo "  - http://localhost:8000/pages/cost.html (コスト分析)"
echo "  - http://localhost:8000/pages/ingredients.html (材料管理)"
echo ""
echo "🔧 本番環境設定:"
echo "  - Supabase: 設定済み"
echo "  - Google Sheets API: 設定済み"
echo "  - 問題報告システム: 有効"
echo "  - 使用量監視: 有効"
echo ""
echo "🛑 サーバーを停止するには Ctrl+C を押してください"
echo ""

# Pythonが利用可能かチェック
if command -v python3 &> /dev/null; then
    echo "✅ Python3を使用してサーバーを起動..."
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "✅ Pythonを使用してサーバーを起動..."
    python -m SimpleHTTPServer 8000
elif command -v node &> /dev/null; then
    echo "✅ Node.jsを使用してサーバーを起動..."
    npx http-server -p 8000 -c-1
else
    echo "❌ エラー: Python または Node.js が必要です"
    echo ""
    echo "📋 インストール方法:"
    echo "  Python: https://www.python.org/downloads/"
    echo "  Node.js: https://nodejs.org/ja/download/"
    echo ""
    echo "または、以下のコマンドを直接実行してください:"
    echo "  python3 -m http.server 8000"
    echo "  # または"
    echo "  npx http-server -p 8000"
fi
