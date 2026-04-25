const puppeteer = require('puppeteer');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

/**
 * ============================================================
 * AXIOM OS — SCRAPER SERVICE
 * ============================================================
 * Responsible for extracting high-value readable content from 
 * any web URL. Uses Puppeteer for dynamic rendering and 
 * Mozilla's Readability for noise-free text extraction.
 */
class ScraperService {
    /**
     * Navigates to a URL, waits for network idle, and extracts pure article text.
     * @param {string} url - The target bookmark or search result URL.
     * @returns {Promise<Object>} { title, content }
     */
    async scrapeArticle(url) {
        let browser;
        try {
            browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            });
            const page = await browser.newPage();
            
            // Wait for content to load or timeout after 30s
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            const html = await page.content();
            const doc = new JSDOM(html, { url });
            
            // Use Readability to find the "Main Article" body
            const reader = new Readability(doc.window.document);
            const article = reader.parse();
            
            await browser.close();

            if (!article || !article.textContent) {
                throw new Error('Could not extract main content from the page.');
            }

            return {
                title: article.title || 'Scraped Content',
                content: article.textContent.trim().substring(0, 10000) // Truncated for AI efficiency
            };
        } catch (error) {
            console.error('[ScraperService] Error:', error.message);
            if (browser) await browser.close();
            throw error;
        }
    }
}

module.exports = new ScraperService();
