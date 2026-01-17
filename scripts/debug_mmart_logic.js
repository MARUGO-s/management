
// Mocking the environment logic from marugo.html

function extractDateFromDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) { return dateTimeStr; }
        const date = new Date(dateTimeStr);
        if (!isNaN(date.getTime())) {
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
    } catch (error) { return ''; }
}

function analyzeMmart(data, startDate, endDate) {
    return data.filter(row => {
        // category check
        const isMmart = row.category && row.category.startsWith('M-mart');
        if (!isMmart) return false;

        // lender check
        const isFromHonbu = row.lender && row.lender.toUpperCase() === '本部';
        if (!isFromHonbu) return false;

        // date check
        const rowDate = row.date ? new Date(row.date) : null;
        if (startDate && (!rowDate || rowDate < new Date(startDate))) {
            return false;
        }
        if (endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            if (!rowDate || rowDate > endOfDay) {
                return false;
            }
        }
        return true;
    });
}

const mockData = [
    { date: extractDateFromDateTime("2025-12-31"), category: "M-mart", lender: "本部", item: "Item1" },
    { date: extractDateFromDateTime("2026-01-01"), category: "M-mart", lender: "本部", item: "Item2" },
    { date: extractDateFromDateTime("2026/01/02"), category: "M-mart", lender: "本部", item: "Item3" },
    { date: extractDateFromDateTime("2026年1月3日"), category: "M-mart", lender: "本部", item: "Item4" },
    { date: extractDateFromDateTime("26-01-04"), category: "M-mart", lender: "本部", item: "Item5 (2 digit year)" }, // Will fail default regex?
    { date: extractDateFromDateTime("Jan 5, 2026"), category: "M-mart", lender: "本部", item: "Item6" }
];

console.log("Mock Data Parsed Dates:");
mockData.forEach(d => console.log(`Raw Date for ${d.item}: ${d.date}`));

const startDate = "2026-01-01";
const endDate = "2026-12-31";

console.log(`\nFiltering from ${startDate} to ${endDate}...`);
const results = analyzeMmart(mockData, startDate, endDate);

console.log(`\nResults (${results.length}):`);
results.forEach(r => console.log(JSON.stringify(r)));

// timezone check
console.log("\nTimezone Checks:");
const d1 = new Date("2026-01-01");
console.log(`new Date("2026-01-01") -> ${d1.toISOString()} (UTC)`);
const dLocal = new Date();
const offset = dLocal.getTimezoneOffset();
console.log(`Local Timezone Offset: ${offset} minutes`);
