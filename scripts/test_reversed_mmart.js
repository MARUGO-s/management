
// Simulate analyzeMmart from marugo.html
function analyzeMmart(data, startDate, endDate) {
    return data.filter(row => {
        // ORIGINAL LOGIC (approximate)
        const isMmart = row.category && row.category.match(/^m-mart/i);
        if (!isMmart) return false;

        // Current check: Lender MUST be Honbu
        const isFromHonbu = row.lender && row.lender.toUpperCase() === '本部';
        if (!isFromHonbu) return false;

        return true;
    });
}

function analyzeMmartFixed(data, startDate, endDate) {
    return data.filter(row => {
        const isMmart = row.category && row.category.match(/^m-mart/i);
        if (!isMmart) return false;

        // FIXED LOGIC: Either Lender OR Borrower is Honbu
        const lender = row.lender ? row.lender.toUpperCase() : '';
        const borrower = row.borrower ? row.borrower.toUpperCase() : '';

        const isHonbuInvolved = (lender === '本部' || borrower === '本部');

        // Exclude Honbu-to-Honbu just in case
        if (lender === '本部' && borrower === '本部') return false;

        if (!isHonbuInvolved) return false;

        return true;
    });
}

const mockData = [
    { category: "M-mart", lender: "本部", borrower: "StoreA" }, // Normal
    { category: "M-mart", lender: "StoreB", borrower: "本部" }, // Reversed (2026 style)
    { category: "Other", lender: "本部", borrower: "StoreC" }
];

console.log("--- Testing Original Logic ---");
const originalResults = analyzeMmart(mockData);
console.log(`Found ${originalResults.length} items (Expected 1)`);
originalResults.forEach(r => console.log(`  Found: ${r.lender} -> ${r.borrower}`));

console.log("\n--- Testing Fixed Logic ---");
const fixedResults = analyzeMmartFixed(mockData);
console.log(`Found ${fixedResults.length} items (Expected 2)`);
fixedResults.forEach(r => {
    // Logic to identify store
    const lender = r.lender.toUpperCase();
    const borrower = r.borrower.toUpperCase();
    let store = '';
    if (lender === '本部') store = r.borrower;
    else if (borrower === '本部') store = r.lender;

    console.log(`  Found: ${r.lender} -> ${r.borrower} (Identified Store: ${store})`);
});
