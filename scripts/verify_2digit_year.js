
function extractDateFromDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    try {
        // ... (standard regexes skipped for brevity, assuming fallthrough) ...

        // Simulating the fallback
        const date = new Date(dateTimeStr);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        return '';
    } catch (error) { return ''; }
}

const inputs = ["26/01/01", "26-01-01", "01/01/26"];

console.log("Testing 2-digit year parsing with new Date():");
inputs.forEach(input => {
    const d = new Date(input);
    console.log(`Input: "${input}" -> Full Year: ${d.getFullYear()} (Invalid? ${isNaN(d.getTime())})`);
});
