
// Simulate the new logic in marugo.html

const mockData = [
    { category: "M-mart", lender: "本部", borrower: "StoreA" }, // Normal
    { category: "M-mart", lender: "StoreB", borrower: "本部" }, // Reversed
    { category: "M-mart", lender: "本部", borrower: "本部" }, // Should be excluded
    { category: "Other", lender: "本部", borrower: "StoreC" } // Wrong category
];

console.log("Mocking analyzeMmart logic...");
const results = mockData.filter(row => {
    const isMmart = row.category && row.category.match(/^m-mart/i);
    if (!isMmart) return false;

    const lender = row.lender ? row.lender.toUpperCase() : '';
    const borrower = row.borrower ? row.borrower.toUpperCase() : '';
    const isHonbuInvolved = (lender === '本部' || borrower === '本部');

    if (lender === '本部' && borrower === '本部') return false;
    if (!isHonbuInvolved) return false;

    return true;
});

console.log(`Filtered Results: ${results.length}`);

console.log("\nMocking displayMmartAnalysis logic...");
const storeCounts = {};

results.forEach(row => {
    let storeName = '';
    const lender = row.lender ? row.lender.toUpperCase() : '';
    const borrower = row.borrower ? row.borrower.toUpperCase() : '';

    if (lender === '本部') {
        storeName = row.borrower;
    } else if (borrower === '本部') {
        storeName = row.lender;
    } else {
        storeName = row.borrower;
    }

    console.log(`Row: Lender=${row.lender}, Borrower=${row.borrower} -> Identified Store: ${storeName}`);
    storeCounts[storeName] = (storeCounts[storeName] || 0) + 1;
});

console.log("\nStore Counts:");
console.log(storeCounts);

const finalCheck = storeCounts["StoreA"] === 1 && storeCounts["StoreB"] === 1;
console.log(`\nVerification Status: ${finalCheck ? 'PASS' : 'FAIL'}`);
