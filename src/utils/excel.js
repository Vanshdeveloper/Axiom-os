const XLSX = require('xlsx');

/**
 * ============================================================
 * AXIOM OS — EXCEL EXPORT UTILITY
 * ============================================================
 * Internal module for converting JSON objects into binary
 * .xlsx buffers for user delivery.
 */

function generateFinanceExcel(data) {
    try {
        // 1. Map data to standard headers and filter out unwanted keys
        const formattedData = data.map(e => ({
            'Date': e.date?.split('T')[0] || 'N/A',
            'Item': e.item || 'Unnamed',
            'Amount': e.amount || 0,
            'Category': e.category || 'Misc',
            'Method': e.method || 'Cash'
        }));

        // 2. Calculate Summary Metrics
        const totalSpent = formattedData.reduce((sum, e) => sum + e.Amount, 0);
        const categories = {};
        formattedData.forEach(e => {
            categories[e.Category] = (categories[e.Category] || 0) + e.Amount;
        });
        const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

        // 3. Create Worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(formattedData, {
            header: ['Date', 'Item', 'Amount', 'Category', 'Method']
        });

        // 4. Add Summary Section (at the bottom)
        const summaryStartRow = formattedData.length + 3;
        XLSX.utils.sheet_add_aoa(worksheet, [
            [], // Spacer
            ['📊 FINANCIAL SUMMARY'],
            ['Total Records', formattedData.length],
            ['Total Spent', `₹${totalSpent.toLocaleString()}`],
            ['Top Category', topCategory],
            ['Generated At', new Date().toLocaleString()]
        ], { origin: `A${summaryStartRow}` });

        // 5. Set basic column widths
        const colWidths = [
            { wch: 12 }, // Date
            { wch: 25 }, // Item
            { wch: 12 }, // Amount
            { wch: 15 }, // Category
            { wch: 12 }  // Method
        ];
        worksheet['!cols'] = colWidths;

        // 6. Finalize
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Axiom Finance');
        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
    } catch (error) {
        console.error('[ExcelUtil] Critical error during sheet generation:', error.message);
        throw error;
    }
}

module.exports = { generateFinanceExcel };
