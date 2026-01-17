
// Logic extracted from pages/marugo.html
function extractDateFromDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) {
            return dateTimeStr;
        }
        
        const date = new Date(dateTimeStr);
        if (!isNaN(date.getTime())) {
            // タイムゾーン問題を回避：ローカル日付として処理
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        
        const japaneseMatch = dateTimeStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (japaneseMatch) {
            const [, year, month, day] = japaneseMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        const slashMatch = dateTimeStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (slashMatch) {
            const [, year, month, day] = slashMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        const hyphenMatch = dateTimeStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (hyphenMatch) {
            const [, year, month, day] = hyphenMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        return '';
    } catch (error) {
        return '';
    }
}

const testCases = [
    "2025-12-31",
    "2026-01-01",
    "2026/01/01",
    "2026年1月1日",
    "2026.01.01", // Common in some excels but maybe not handled?
    "Jan 1, 2026",
    "2026-1-1"
];

console.log("Testing extractDateFromDateTime:");
testCases.forEach(tc => {
    console.log(`Input: "${tc}" => Output: "${extractDateFromDateTime(tc)}"`);
});
