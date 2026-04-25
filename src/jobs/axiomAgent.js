/**
 * ============================================================
 * AXIOM OS — BACKGROUND AUTOMATION AGENT
 * ============================================================
 * Handles proactive background tasks: Reminders & Scraping.
 * Reports health heartbeats to health.js for the status monitor.
 */

const telegramService = require('../services/telegram.service');
const notionService = require('../services/notion.service');
const scraperService = require('../services/scraper.service');
const geminiService = require('../services/gemini.service');
const health = require('../utils/health');

const BACKLOG_DB_ID = process.env.BACKLOG_DB_ID;

/**
 * Main loop for checking scheduled reminders.
 */
async function runAxiomAgent() {
    if (!BACKLOG_DB_ID) return;
    console.log('[AxiomAgent] Checking for due reminders...');
    
    try {
        const nowISO = new Date().toISOString();
        const response = await notionService.queryDatabase(BACKLOG_DB_ID, {
            and: [
                { property: 'Status', status: { equals: 'Not started' } },
                { property: 'RemindAt', date: { on_or_before: nowISO } }
            ]
        }, [{ timestamp: 'created_time', direction: 'ascending' }]);

        const tasks = response.results || [];
        for (const task of tasks) {
            const pageId = task.id;
            const taskName = task.properties.Name?.title?.[0]?.plain_text || 'Unknown Task';
            
            // Mark as 'In progress' so it's not picked up again immediately
            await notionService.updatePageProperties(pageId, { Status: { status: { name: 'In progress' } } });
            
            const chatId = task.properties.ChatID?.rich_text?.[0]?.plain_text;
            if (chatId) {
                await telegramService.sendMessage(chatId, `⏰ <b>Task Reminder:</b> ${taskName}\nIt's time to start! 🚀`, { parse_mode: 'HTML' });
            }
        }
        health.updateHeartbeat('axiomAgent', 'ACTIVE');
    } catch (error) {
        console.error('[AxiomAgent] Error during reminder poll:', error.message);
    }
}

/**
 * Main loop for processing deep-research scrape tasks.
 */
async function runScrapeAgent() {
    if (!BACKLOG_DB_ID) return;
    console.log('[ScrapeAgent] Checking for new pending URLs...');
    
    try {
        const response = await notionService.queryDatabase(BACKLOG_DB_ID, {
            and: [
                { property: 'Scrape Task', checkbox: { equals: true } },
                { property: 'Scraped', checkbox: { does_not_equal: true } }
            ]
        });

        const tasks = response.results || [];
        for (const task of tasks) {
            const pageId = task.id;
            const taskName = task.properties.Name?.title?.[0]?.plain_text || 'Unknown Scraping Task';
            const url = task.properties.URL?.url;
            const chatId = task.properties.ChatID?.rich_text?.[0]?.plain_text;

            if (!url) continue;

            console.log(`[ScrapeAgent] Processing: ${taskName}`);
            
            // Update Notion status to 'In Progress' for visibility
            await notionService.updatePageProperties(pageId, { Status: { status: { name: 'In progress' } } });

            try {
                const { title: articleTitle, content: rawText } = await scraperService.scrapeArticle(url);
                const jsonNotes = await geminiService.summarizeArticle(articleTitle || taskName, rawText);
                await notionService.appendBlocksToPage(pageId, jsonNotes.sections);
                await notionService.updatePageProperties(pageId, { 'Scraped': { checkbox: true }, 'Status': { status: { name: 'Done' } } });

                if (chatId) {
                    await telegramService.sendMessage(chatId, `✅ <b>Axiom Research:</b> Summarized <a href="${url}">${taskName}</a>! Insights saved to Notion.`, { parse_mode: 'HTML' });
                }
            } catch (err) {
                console.error(`[ScrapeAgent] Failed to process "${taskName}":`, err.message);
                if (chatId) await telegramService.sendMessage(chatId, `⚠️ <b>Research Failed:</b> ${taskName}\nError: ${err.message}`, { parse_mode: 'HTML' });
            }
        }
        health.updateHeartbeat('scrapeAgent', 'ACTIVE');
    } catch (error) {
        console.error('[ScrapeAgent] Fatal error during scrape poll:', error.message);
    }
}

/**
 * Automator for the Daily Evening Visual Report (6 PM)
 */
async function runDailyReportAgent() {
    const now = new Date();
    // Hour is 18 (6 PM)
    if (now.getHours() !== 18) return;

    console.log('[DailyAgent] 6 PM detected. Preparing reports...');
    
    try {
        const users = await notionService.getUniqueFinanceUsers();
        const todayStr = now.toISOString().split('T')[0];

        for (const chatId of users) {
            const lastReport = await notionService.getLastDailyReportDate(chatId);
            
            // Only send if not already sent today
            if (lastReport !== todayStr) {
                console.log(`[DailyAgent] Sending report to ${chatId}...`);
                await telegramService.generateAndSendBudgetReport(chatId, true);
                await notionService.setLastDailyReportDate(chatId, todayStr);
            }
        }
    } catch (error) {
        console.error('[DailyAgent] Error during daily report run:', error.message);
    }
}

/**
 * Initializes background agents with recursive timeouts to prevent overlap.
 */
function startAgent(intervalMs = 60000) {
    if (!BACKLOG_DB_ID) {
        return console.warn('[AxiomAgent] WARNING: BACKLOG_DB_ID missing. Automation disabled.');
    }

    console.log(`🕒 Axiom Agents scheduled every ${intervalMs}ms`);

    const reminderLoop = async () => {
        await runAxiomAgent();
        setTimeout(reminderLoop, intervalMs);
    };

    const scrapeLoop = async () => {
        await runScrapeAgent();
        setTimeout(scrapeLoop, intervalMs + 15000);
    };

    const dailyLoop = async () => {
        await runDailyReportAgent();
        setTimeout(dailyLoop, intervalMs * 30); // Check every 30 mins for the 6 PM window
    };

    reminderLoop();
    setTimeout(scrapeLoop, 15000);
    setTimeout(dailyLoop, 30000); // Start daily check after 30s
}

module.exports = { startAgent, runAxiomAgent, runScrapeAgent, runDailyReportAgent };
