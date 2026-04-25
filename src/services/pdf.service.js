const puppeteer = require('puppeteer');

/**
 * ============================================================
 * AXIOM OS — PDF GENERATION SERVICE
 * ============================================================
 * Internal engine for converting structured study notes into 
 * premium, high-fidelity PDFs using Puppeteer. 
 * 
 * Features:
 * - Centered, symmetrical layout.
 * - Symmetrical "Midnight" dark theme.
 * - Dynamic page breaks with margin-top logic for recurring sections.
 */
class PdfService {

    /**
     * Converts an Axiom notes JSON object into a full HTML string with self-contained CSS.
     * @param {Object} jsonData - { title, breadcrumbs, sections }
     * @returns {string} Fully styled HTML document.
     * @private
     */
    _buildHtml(jsonData) {
        const { title, breadcrumbs, sections = [] } = jsonData;

        const breadcrumbHtml = breadcrumbs
            ? breadcrumbs.split('/').map(s => s.trim()).join(' <span class="bc-sep">/</span> ')
            : 'Axiom OS / Notes';

        const sectionsHtml = sections.map(section => {
            if (section.type === 'text') {
                const paragraphs = Array.isArray(section.content)
                    ? section.content.map(p => {
                        const trimmed = p.trimStart();
                        // Detect common bullet markers: •, -, *, or 1.
                        const isBullet = /^[•\-*]\s?/.test(trimmed);
                        let cleanText = p;
                        if (isBullet) {
                            // Strip the original character to ensure only the design diamond shows
                            cleanText = trimmed.replace(/^[•\-*]\s?/, '');
                        }
                        return `<p${isBullet ? ' class="bullet"' : ''}>${cleanText}</p>`;
                    }).join('')
                    : `<p>${section.content}</p>`;
                return `
                <div class="section-block">
                    <div class="section-header">
                        <div class="section-icon"></div>
                        <h2 class="section-title">${section.title || ''}</h2>
                    </div>
                    <div class="section-text">${paragraphs}</div>
                </div>`;
            }

            if (section.type === 'table') {
                const headers = (section.headers || []).map(h => `<th>${h}</th>`).join('');
                const rows = (section.rows || []).map(row =>
                    `<tr>${(row || []).map(cell => `<td>${cell}</td>`).join('')}</tr>`
                ).join('');
                return `
                <div class="section-block">
                    <div class="section-header">
                        <div class="section-icon"></div>
                        <h2 class="section-title">${section.title || ''}</h2>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead><tr>${headers}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
            }

            if (section.type === 'protip') {
                return `
                <div class="section-block">
                    <div class="protip-callout">
                        <div class="protip-label">💡 Pro Tip</div>
                        <p class="protip-text">${section.content || ''}</p>
                    </div>
                </div>`;
            }

            return '';
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title || 'Axiom OS Notes'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #080A12;
    --card: #161B2E;
    --border: rgba(255,255,255,0.06);
    --accent: #A60DF2;
    --text-hi: #FFFFFF;
    --text-mid: rgba(255,255,255,0.75);
    --text-lo: rgba(255,255,255,0.45);
    --purple-title: #C084FC;
    --purple-sec: #D8B4FE;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 210mm; background: var(--bg); }
  body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text-mid); line-height: 1.6; font-size: 13.5px; width: 210mm; min-height: 297mm; overflow-x: hidden; }

  .doc-wrapper { width: 100%; max-width: 740px; margin: 0 auto; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; }
  .header-area { text-align: center; margin-bottom: 60px; width: 100%; }
  .breadcrumbs { font-family: 'Space Grotesk', sans-serif; font-size: 11px; color: var(--text-lo); text-transform: uppercase; letter-spacing: 3px; margin-bottom: 16px; display: inline-flex; align-items: center; gap: 8px; }
  .doc-title { font-family: 'Space Grotesk', sans-serif; font-size: 38px; font-weight: 700; color: var(--text-hi); line-height: 1.2; letter-spacing: -1.5px; margin-bottom: 20px; }
  .doc-title span { background: linear-gradient(90deg, var(--purple-title), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .meta-tag { display: inline-flex; padding: 6px 14px; background: rgba(166,13,242,0.1); border: 1px solid rgba(166,13,242,0.2); border-radius: 100px; font-size: 10.5px; font-weight: 600; color: var(--purple-sec); text-transform: uppercase; letter-spacing: 1.5px; }

  .content-body { width: 100%; }
  .section-block { margin-top: 50px; margin-bottom: 50px; width: 100%; page-break-inside: avoid; }
  .section-block:first-of-type { margin-top: 0; }
  .section-header { margin-bottom: 24px; text-align: center; }
  .section-title { font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 600; color: var(--purple-sec); letter-spacing: -0.5px; border-bottom: 1px solid var(--border); display: inline-block; padding-bottom: 8px; }
  .section-text { color: var(--text-mid); line-height: 1.8; text-align: left; }
  .section-text p { margin-bottom: 18px; }
  .section-text p.bullet { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
  .section-text p.bullet::before { content: "◆"; color: var(--accent); flex-shrink: 0; font-size: 10px; margin-top: 4px; }

  .table-wrapper { background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-top: 12px; width: 100%; }
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th, .data-table td { padding: 16px 20px; text-align: left; border-bottom: 1px solid var(--border); }
  .data-table th { background: rgba(255,255,255,0.03); font-family: 'Space Grotesk', sans-serif; font-size: 11px; font-weight: 700; color: var(--text-lo); text-transform: uppercase; letter-spacing: 1px; }

  .protip-callout { background: linear-gradient(135deg, rgba(166,13,242,0.15), rgba(123, 45, 188, 0.05)); border: 1px solid rgba(166,13,242,0.25); border-radius: 20px; padding: 30px; text-align: center; }
  .protip-label { font-family: 'Space Grotesk', sans-serif; font-size: 11px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
  .protip-text { font-size: 14px; color: var(--text-hi); font-weight: 400; }

  .doc-footer { padding: 60px 0 20px; margin-top: auto; text-align: center; font-size: 10px; color: var(--text-lo); width: 100%; }
  .footer-brand { color: var(--accent); font-weight: 700; letter-spacing: 1px; }

  @page { size: A4; margin: 0; }
  @media print { body { width: 210mm; } .doc-wrapper { width: 100%; padding: 60px 40px; } }
</style>
</head>
<body>
<div class="doc-wrapper">
    <div class="header-area">
      <div class="breadcrumbs">${breadcrumbHtml}</div>
      <h1 class="doc-title">${title || 'Axiom<span> OS</span> Notes'}</h1>
      <div class="meta-tag">Axiom Academic Elite • ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
    </div>
    <div class="content-body">${sectionsHtml}</div>
    <div class="doc-footer">
      <div>This document was autonomously generated by <span class="footer-brand">AXIOM OS</span></div>
      <div style="margin-top: 6px;">Strictly for Personal Academic Use</div>
    </div>
</div>
</body>
</html>`;
    }

    /**
     * Generates a raw PDF Buffer using headless Puppeteer.
     * @param {Object} notesJson - Structured note data.
     * @returns {Promise<Buffer>} The resulting PDF file bytes.
     */
    async generatePdf(notesJson) {
        const html = this._buildHtml(notesJson);
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage', 
                    '--font-render-hinting=none',
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
            // Relax wait condition to 'load' and increase timeout for cloud resource constraints
            await page.setContent(html, { waitUntil: 'load', timeout: 60000 });

            const pdfBuffer = Buffer.from(await page.pdf({
                format: 'A4',
                printBackground: true,
                preferCSSPageSize: true, // Respect CSS @page rules
                displayHeaderFooter: false
            }));

            return pdfBuffer;
        } catch (error) {
            console.error('[PdfService] Error generating PDF:', error.message);
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }
}

module.exports = new PdfService();
