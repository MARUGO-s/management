import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// domeフォルダのパス
const domeDir = __dirname;

// ファイル名から年月を抽出して日本語表記に変換
function parseFileName(filename) {
    const match = filename.match(/^(\d{4})(\d{2})\.html$/);
    if (!match) return null;

    const year = match[1];
    const month = match[2];

    const monthNames = {
        '01': '1月', '02': '2月', '03': '3月', '04': '4月',
        '05': '5月', '06': '6月', '07': '7月', '08': '8月',
        '09': '9月', '10': '10月', '11': '11月', '12': '12月'
    };

    const monthNamesEn = {
        '01': 'January', '02': 'February', '03': 'March', '04': 'April',
        '05': 'May', '06': 'June', '07': 'July', '08': 'August',
        '09': 'September', '10': 'October', '11': 'November', '12': 'December'
    };

    return {
        filename: filename,
        year: year,
        month: month,
        displayDate: `${year}年${monthNames[month]}`,
        displayDateEn: `${monthNamesEn[month]} ${year}`,
        sortKey: `${year}${month}`
    };
}

// HTMLファイルからタイトルと説明を抽出
function extractMetadata(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // <title>タグから抽出
        const titleMatch = content.match(/<title>(.*?)<\/title>/i);
        let title = titleMatch ? titleMatch[1].trim() : '';

        // <h1>タグから抽出（タイトルがない場合）
        if (!title) {
            const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
            title = h1Match ? h1Match[1].trim() : 'レシピ';
        }

        // 簡単な説明を生成（最初のテーブルやセクションから）
        let description = '';
        const h2Matches = content.match(/<h2[^>]*>(.*?)<\/h2>/gi);
        if (h2Matches && h2Matches.length > 0) {
            // 最初の3つのh2タグからテキストを抽出
            const items = h2Matches.slice(0, 3).map(h2 => {
                const text = h2.replace(/<[^>]+>/g, '').trim();
                // 番号やマークを削除
                return text.replace(/^[\d\s.．、]+/, '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
            });
            description = items.join('、') + 'などの詳細レシピと原価計算';
        } else {
            description = 'かき氷の詳細レシピと配合表';
        }

        return { title, description };
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error.message);
        return { title: 'レシピ', description: 'かき氷の詳細レシピ' };
    }
}

// 静的版recipes.htmlを生成（サーバー機能なし）
function generateStaticRecipesPage(recipes) {
    // 日付順にソート（新しい順）
    recipes.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    const recipeCards = recipes.map(recipe => `
            <!-- ${recipe.displayDate} -->
            <div class="recipe-card" onclick="location.href='${recipe.filename}'">
                <div class="recipe-card-header">
                    <div class="recipe-date">${recipe.displayDate}</div>
                    <div class="recipe-year">${recipe.displayDateEn}</div>
                </div>
                <div class="recipe-card-body">
                    <div class="recipe-title">${recipe.title}</div>
                    <div class="recipe-description">
                        ${recipe.description}
                    </div>
                    <a href="${recipe.filename}" class="recipe-link">レシピを見る →</a>
                </div>
            </div>`).join('\n');

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>レシピ一覧 - かき氷レシピアーカイブ</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Arial', 'ヒラギノ角ゴ Pro', sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            padding: 40px 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        header {
            background: linear-gradient(135deg, #1f4e78 0%, #4472c4 100%);
            color: white;
            padding: 60px 40px;
            text-align: center;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            margin-bottom: 40px;
        }

        header h1 {
            font-size: 48px;
            margin-bottom: 10px;
            font-weight: bold;
        }

        header p {
            font-size: 18px;
            opacity: 0.9;
            font-style: italic;
        }

        .recipe-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }

        .recipe-card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            cursor: pointer;
        }

        .recipe-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .recipe-card-header {
            background: linear-gradient(135deg, #4472c4 0%, #5a8ed6 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .recipe-date {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .recipe-year {
            font-size: 14px;
            opacity: 0.9;
        }

        .recipe-card-body {
            padding: 25px;
        }

        .recipe-title {
            font-size: 20px;
            font-weight: bold;
            color: #333;
            margin-bottom: 15px;
        }

        .recipe-description {
            font-size: 14px;
            color: #666;
            margin-bottom: 20px;
            line-height: 1.6;
        }

        .recipe-link {
            display: inline-block;
            background: #4472c4;
            color: white;
            text-decoration: none;
            padding: 12px 30px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: bold;
            transition: background 0.3s ease;
        }

        .recipe-link:hover {
            background: #1f4e78;
        }

        .info-box {
            background: white;
            border-radius: 12px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
            padding: 30px;
            margin-top: 40px;
        }

        .info-box h2 {
            color: #4472c4;
            font-size: 24px;
            margin-bottom: 15px;
            border-bottom: 3px solid #4472c4;
            padding-bottom: 10px;
        }

        .info-box p {
            color: #666;
            font-size: 14px;
            line-height: 1.8;
        }

        footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 12px;
            margin-top: 40px;
        }

        @media (max-width: 768px) {
            .recipe-grid {
                grid-template-columns: 1fr;
            }

            header h1 {
                font-size: 32px;
            }

            header p {
                font-size: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>かき氷レシピアーカイブ</h1>
            <p>月別レシピ一覧 - Monthly Recipe Collection</p>
        </header>

        <div class="recipe-grid">
${recipeCards}
        </div>

        <div class="info-box">
            <h2>このアーカイブについて</h2>
            <p>
                このページは、月別に整理されたかき氷レシピのアーカイブです。各レシピには材料の配合、分量、原価計算などの詳細情報が含まれています。<br>
                新しいレシピは月ごとに追加され、過去のレシピもいつでも参照することができます。<br><br>
                各カードをクリックすると、その月のレシピページに移動します。
            </p>
        </div>

        <footer>
            © 2025-2026 かき氷レシピアーカイブ - All Rights Reserved<br>
            最終更新: ${new Date().toLocaleString('ja-JP')}
        </footer>
    </div>
</body>
</html>`;

    return html;
}

// メイン処理
function main() {
    console.log('🔍 Scanning dome folder for recipe files (GitHub Pages用静的版)...\n');

    // domeフォルダ内のファイルを取得
    const files = fs.readdirSync(domeDir);

    const recipes = [];

    files.forEach(file => {
        // recipes.html以外のHTMLファイルを対象
        if (file.endsWith('.html') && file !== 'recipes.html') {
            const parsed = parseFileName(file);
            if (parsed) {
                const filePath = path.join(domeDir, file);
                const metadata = extractMetadata(filePath);

                recipes.push({
                    ...parsed,
                    ...metadata
                });

                console.log(`✅ Found: ${file} → ${parsed.displayDate}`);
                console.log(`   Title: ${metadata.title}`);
                console.log(`   Description: ${metadata.description}\n`);
            }
        }
    });

    if (recipes.length === 0) {
        console.log('⚠️  No recipe files found (YYYYMM.html format)');
        return;
    }

    // 静的版recipes.htmlを生成
    const html = generateStaticRecipesPage(recipes);
    const outputPath = path.join(domeDir, 'recipes.html');
    fs.writeFileSync(outputPath, html, 'utf-8');

    console.log(`\n✨ Successfully generated static recipes.html for GitHub Pages with ${recipes.length} recipe(s)!`);
    console.log(`📝 Output: ${outputPath}`);
    console.log(`\n📌 このファイルはGitHub Pagesで動作します（サーバー不要）\n`);
}

// 実行
main();
