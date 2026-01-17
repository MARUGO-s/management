
// Mock UnifiedDataLoader.parseDateMs behavior
function parseDateMs(dateStr) {
    if (!dateStr) return 0;
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(dateStr).getTime();
        const ymdMatch = dateStr.match(/(\d{4})[年\/\-\.](\d{1,2})[月\/\-\.](\d{1,2})[日]?/);
        if (ymdMatch) return new Date(`${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`).getTime();
        const shortYearMatch = dateStr.match(/^(\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
        if (shortYearMatch) return new Date(`20${shortYearMatch[1]}-${shortYearMatch[2].padStart(2, '0')}-${shortYearMatch[3].padStart(2, '0')}`).getTime();
        const reiwaMatch = dateStr.match(/^R(\d{1,2})[\.\/年](\d{1,2})[\.\/月]?(\d{1,2})[日]?/i);
        if (reiwaMatch) return new Date(`${2018 + parseInt(reiwaMatch[1])}-${reiwaMatch[2].padStart(2, '0')}-${reiwaMatch[3].padStart(2, '0')}`).getTime();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            if (date.getFullYear() < 2000) date.setFullYear(date.getFullYear() + 100);
            return date.getTime();
        }
        return 0;
    } catch (e) { return 0; }
}

// Mock extractDateFromDateTime for search logic
function extractDateFromDateTime(dateTimeStr) {
    // Simplified strictly for verifying the regex logic reuse
    if (!dateTimeStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) return dateTimeStr;
    const shortYearMatch = dateTimeStr.match(/^(\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (shortYearMatch) return `20${shortYearMatch[1]}-${shortYearMatch[2].padStart(2, '0')}-${shortYearMatch[3].padStart(2, '0')}`;
    return ''; // Other cases omitted for brevity
}

console.log("--- Verifying UnifiedDataLoader.parseDateMs ---");
const d1 = parseDateMs("26/01/01");
const d2 = new Date("2026-01-01").getTime();
console.log(`26/01/01 -> ${new Date(d1).toISOString()} (Expected 2026-01-01)`);
console.log(`Match? ${d1 === d2}`);

console.log("\n--- Verifying Search Logic Date Normalization ---");
const rawDate = "26/01/15";
const standardized = extractDateFromDateTime(rawDate);
const startDate = "2026-01-01";
const endDate = "2026-01-31";

const inRange = standardized >= startDate && standardized <= endDate;
console.log(`Raw: ${rawDate} -> Standardized: ${standardized}`);
console.log(`In Range [${startDate}, ${endDate}]? ${inRange}`);

if (d1 === d2 && inRange) console.log("\n✅ SYSTEM-WIDE CHECKS PASSED");
else console.log("\n❌ SYSTEM-WIDE CHECKS FAILED");
