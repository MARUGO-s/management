import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3456;

// CORSを有効化
app.use(cors());
app.use(express.json());

// domeフォルダを静的ファイルとして提供
app.use(express.static(__dirname));

// Multer設定（ファイルアップロード用）
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname); // domeフォルダに保存
    },
    filename: function (req, file, cb) {
        // ファイル名を検証（YYYYMM.html形式のみ許可）
        const filename = file.originalname;
        const isValidFormat = /^\d{6}\.html$/.test(filename);

        if (!isValidFormat) {
            return cb(new Error('ファイル名はYYYYMM.html形式である必要があります（例：202602.html）'));
        }

        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // HTMLファイルのみ許可
        if (file.mimetype !== 'text/html' && !file.originalname.endsWith('.html')) {
            return cb(new Error('HTMLファイルのみアップロード可能です'));
        }
        cb(null, true);
    }
});

// ファイルアップロードエンドポイント
app.post('/api/upload', upload.single('recipeFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'ファイルが選択されていません'
        });
    }

    console.log(`📤 アップロード成功: ${req.file.filename}`);

    // アップロード後、自動的にレシピページを再生成
    exec('node generate-recipes.js', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ 生成エラー:', error);
            return res.status(500).json({
                success: false,
                error: 'ファイルはアップロードされましたが、ページの再生成に失敗しました',
                details: error.message
            });
        }

        console.log(stdout);
        res.json({
            success: true,
            message: `${req.file.filename} をアップロードしてレシピページを更新しました！`,
            filename: req.file.filename,
            output: stdout
        });
    });
});

// レシピ生成エンドポイント
app.post('/api/generate-recipes', (req, res) => {
    console.log('📝 Generating recipes...');

    exec('node generate-recipes.js', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Error:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
                stderr: stderr
            });
        }

        console.log(stdout);
        res.json({
            success: true,
            message: 'レシピページを更新しました！',
            output: stdout
        });
    });
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`
🚀 レシピサーバーが起動しました！

📖 レシピページ: http://localhost:${PORT}/recipes.html

ℹ️  使い方:
   1. ブラウザで recipes.html を開く
   2. 「🔄 レシピを更新」ボタンをクリック
   3. 自動的にページが更新されます

⏹️  サーバーを停止: Ctrl+C
`);
});
