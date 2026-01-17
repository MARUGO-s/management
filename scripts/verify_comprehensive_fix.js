
// Simulate the normalized logic for Store Balance Analysis
const mockData = [
    { category: "M-mart", lender: "本部", borrower: "StoreA", amount: 1000 },
    { category: "M-mart", lender: "StoreB", borrower: "本部", amount: 2000 }, // Reversed
    { category: "Other", lender: "StoreC", borrower: "StoreD", amount: 3000 }
];

console.log("--- Testing Store Balance Normalization ---");
const storeData = {};

mockData.forEach(row => {
    let lender = row.lender;
    let borrower = row.borrower;
    let category = row.category;

    // Normalization logic
    if (category && category.match(/^m-mart/i)) {
        if (borrower && borrower.toUpperCase() === '本部') {
            const temp = lender;
            lender = borrower;
            borrower = temp;
        }
    }

    // Lender side
    if (lender) {
        if (!storeData[lender]) storeData[lender] = { lent: 0, borrowed: 0 };
        storeData[lender].lent += row.amount;
    }
    // Borrower side
    if (borrower) {
        if (!storeData[borrower]) storeData[borrower] = { lent: 0, borrowed: 0 };
        storeData[borrower].borrowed += row.amount;
    }
});

console.log("Store Data:", storeData);

// Verification
// Honbu should lend 1000 + 2000 = 3000
// StoreA should borrow 1000
// StoreB should borrow 2000 (NOT lend)
// StoreC should lend 3000
// StoreD should borrow 3000

const passHonbu = storeData["本部"] && storeData["本部"].lent === 3000;
const passStoreA = storeData["StoreA"] && storeData["StoreA"].borrowed === 1000;
const passStoreB = storeData["StoreB"] && storeData["StoreB"].borrowed === 2000 && storeData["StoreB"].lent === 0;

console.log(`Honbu Lent Correct: ${passHonbu} (Got: ${storeData["本部"]?.lent})`);
console.log(`StoreA Borrowed Correct: ${passStoreA} (Got: ${storeData["StoreA"]?.borrowed})`);
console.log(`StoreB Borrowed Correct: ${passStoreB} (Got: ${storeData["StoreB"]?.borrowed})`);

if (passHonbu && passStoreA && passStoreB) {
    console.log("✅ ALL CHECKS PASSED");
} else {
    console.log("❌ SOME CHECKS FAILED");
}
