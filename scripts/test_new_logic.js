
// Logic similar to refined marugo.html

function extractDateFromDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) { return dateTimeStr; }
        // 4-digit
        const ymdMatch = dateTimeStr.match(/(\d{4})[年\/\-\.](\d{1,2})[月\/\-\.](\d{1,2})[日]?/);
        if (ymdMatch) {
            const [, year, month, day] = ymdMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // 2-digit (assume 20xx)
        const shortYearMatch = dateTimeStr.match(/^(\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
        if (shortYearMatch) {
            const [, year, month, day] = shortYearMatch;
            return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // Reiwa
        const reiwaMatch = dateTimeStr.match(/^R(\d{1,2})[\.\/年](\d{1,2})[\.\/月]?(\d{1,2})[日]?/i);
        if (reiwaMatch) {
            const [, rYear, month, day] = reiwaMatch;
            const year = 2018 + parseInt(rYear);
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // Fallback
        const date = new Date(dateTimeStr);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const finalYear = year < 2000 ? year + 100 : year;
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${finalYear}-${month}-${day}`;
        }
        return '';
    } catch (error) { return ''; }
}

const testCases = [
    { input: "2026-01-01", expected: "2026-01-01" },
    { input: "2026/01/01", expected: "2026-01-01" },
    { input: "2026.01.01", expected: "2026-01-01" },
    { input: "26/01/01", expected: "2026-01-01" },
    { input: "26-01-01", expected: "2026-01-01" },
    { input: "26.01.01", expected: "2026-01-01" },
    { input: "R8.01.01", expected: "2026-01-01" }, // R8 = 2026
    { input: "R8/01/01", expected: "2026-01-01" },
    { input: "R8年1月1日", expected: "2026-01-01" },
    { input: "Jan 1, 2026", expected: "2026-01-01" }
];

console.log("Verifying new logic:");
let allPassed = true;
testCases.forEach(tc => {
    const actual = extractDateFromDateTime(tc.input);
    const pass = actual === tc.expected;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] Input: "${tc.input}" -> Expected: ${tc.expected}, Got: ${actual}`);
    if (!pass) allPassed = false;
});

if (allPassed) console.log("\n✅ ALL TESTS PASSED");
else console.log("\n❌ SOME TESTS FAILED");
