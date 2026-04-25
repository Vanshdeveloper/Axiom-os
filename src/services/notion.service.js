const { Client } = require('@notionhq/client');
const { getISODateInTimezone } = require('../utils/time');

/**
 * ============================================================
 * AXIOM OS — NOTION SERVICE
 * ============================================================
 * Core data persistence layer for Axiom OS. Handles all
 * interactions with the Notion API, including page creation,
 * database queries, and rich-text block management.
 */

// Default Configuration Constants
const DEFAULT_BUDGET_LIMIT = 30000;
const LOOKBACK_DAYS_ANALYTICS = 30;
const CACHE_TTL_MS = 300000; // 5 minutes

class NotionService {
    constructor() {
        if (!process.env.NOTION_API_KEY) {
            console.warn('[NotionService] WARNING: NOTION_API_KEY is not set.');
            this.notion = null;
        } else {
            this.notion = new Client({ auth: process.env.NOTION_API_KEY });
        }
        
        this.DATABASE_ID = process.env.DATABASE_ID;       
        this.BACKLOG_DB_ID = process.env.BACKLOG_DB_ID;   
        this.FINANCE_DB_ID = process.env.FINANCE_DB_ID;   
        this.HABITS_DB_ID = process.env.HABITS_DB_ID;

        // Nitro Cache [State Projection]
        this.habitCache = new Map(); // chatId -> { names: [], lastFetch: Date }
        this.todayStatusCache = new Map(); // chatId -> { logs: Map(name->bool), date: Date }
        this.configCache = new Map(); // key -> value
    }

    async getHealthStatus() {
        const vaultId = String(this.DATABASE_ID || '');
        const backlogId = String(this.BACKLOG_DB_ID || '');
        const financeId = String(this.FINANCE_DB_ID || '');
        const habitsId = String(this.HABITS_DB_ID || '');

        const stats = {
            apiKey: !!this.notion,
            latency: 0,
            databases: {
                vault: vaultId ? `LINKED (..${vaultId.slice(-4)})` : 'MISSING',
                backlog: backlogId ? `LINKED (..${backlogId.slice(-4)})` : 'MISSING',
                finance: financeId ? `LINKED (..${financeId.slice(-4)})` : 'MISSING',
                habits: habitsId ? `LINKED (..${habitsId.slice(-4)})` : 'MISSING'
            },
            ping: 'FAILED'
        };

        if (this.notion && vaultId.length > 5) {
            try {
                const startTime = Date.now();
                // Test connectivity to the primary vault
                await this.notion.databases.retrieve({ database_id: vaultId.trim() });
                stats.latency = Date.now() - startTime;
                stats.ping = 'SUCCESS';
            } catch (err) {
                stats.ping = `ERROR: ${err.message || 'Unreachable'}`;
            }
        }
        return stats;
    }

    async updatePageProperties(pageId, properties) {
        if (!this.notion) throw new Error('Notion API not configured.');
        return await this.notion.pages.update({
            page_id: pageId,
            properties
        });
    }

    createRichTextChunks(text) {
        const chunks = [];
        let str = String(text || ' ');
        while (str.length > 0) {
            chunks.push({ type: 'text', text: { content: str.substring(0, 2000) } });
            str = str.substring(2000);
        }
        return chunks;
    }

    /**
     * HABIT TRACKER: Fetches today's habits and completion status.
     * [NITRO MODE]: Fully utilizes local state projection + Analytics.
     */
    async getTodayHabits(chatId, timezone = 'UTC') {
        if (!this.notion) throw new Error('Notion API not configured.');
        if (!this.HABITS_DB_ID) throw new Error('HABITS_DISABLED: Please set HABITS_DB_ID in .env');

        const today = getISODateInTimezone(new Date(), timezone);
        const now = Date.now();
        
        // 1. Check for valid Nitro Cache (State Projection)
        const cachedStatus = this.todayStatusCache.get(chatId);
        const cachedHabits = this.habitCache.get(chatId);

        if (cachedStatus && cachedStatus.date === today && cachedHabits && (now - cachedHabits.lastFetch < CACHE_TTL_MS)) {
            return cachedHabits.data.map(h => ({
                ...h,
                completed: cachedStatus.logs.get(h.name) || false
            }));
        }

        // 2. Heavy Query (Only if cache miss)
        // [Master List]: Pages where Date is empty
        const habitsResponse = await this.notion.databases.query({
            database_id: this.HABITS_DB_ID.trim(),
            filter: { property: 'Date', date: { is_empty: true } },
            sorts: [{ property: 'Name', direction: 'ascending' }]
        });

        // [Today Logs]: Pages where Date is today
        const logsResponse = await this.notion.databases.query({
            database_id: this.HABITS_DB_ID.trim(),
            filter: { property: 'Date', date: { equals: today } }
        });

        const habitNames = habitsResponse.results.map(h => h.properties.Name.title[0]?.plain_text).filter(Boolean);
        const completedMap = new Map();
        logsResponse.results.forEach(log => {
            const name = log.properties.Name?.title[0]?.plain_text;
            if (name) completedMap.set(name, true);
        });

        // 3. Analytics Engine (14-day Consistency & Streaks)
        const historyDays = 21;
        const historyStart = new Date();
        historyStart.setDate(historyStart.getDate() - historyDays);
        const historyStartStr = getISODateInTimezone(historyStart, timezone);

        const historyResponse = await this.notion.databases.query({
            database_id: this.HABITS_DB_ID.trim(),
            filter: { 
                and: [
                    { property: 'Date', date: { on_or_after: historyStartStr } },
                    { property: 'ChatID', rich_text: { equals: String(chatId) } }
                ]
            }
        });

        // Group history by habit
        const historyMap = new Map();
        historyResponse.results.forEach(log => {
            const name = log.properties.Name?.title[0]?.plain_text;
            const date = log.properties.Date?.date?.start;
            if (name && date) {
                if (!historyMap.has(name)) historyMap.set(name, new Set());
                historyMap.get(name).add(date);
            }
        });

        // 4. Calculate Stats for each habit
        const processedHabits = habitNames.map(name => {
            const logs = historyMap.get(name) || new Set();
            const completedToday = completedMap.get(name) || false;

            // Calculate Streak
            let streak = 0;
            let checkDate = new Date();
            if (!completedToday) checkDate.setDate(checkDate.getDate() - 1); // Start from yesterday if today not done

            for (let i = 0; i < historyDays; i++) {
                const dateStr = getISODateInTimezone(checkDate, timezone);
                if (logs.has(dateStr)) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }

            // Calculate Consistency (14 days)
            let consistencyCount = 0;
            let consisDate = new Date();
            for (let i = 0; i < 14; i++) {
                if (logs.has(getISODateInTimezone(consisDate, timezone))) consistencyCount++;
                consisDate.setDate(consisDate.getDate() - 1);
            }
            const consistency = Math.round((consistencyCount / 14) * 100);

            return {
                name,
                completed: completedToday,
                stats: { streak, consistency }
            };
        });

        // 5. Update Projections
        this.habitCache.set(chatId, { names: habitNames, lastFetch: now, data: processedHabits });
        this.todayStatusCache.set(chatId, { logs: completedMap, date: today });

        return processedHabits;
    }

    async toggleHabit(chatId, habitName, targetStatus, timezone = 'UTC') {
        if (!this.notion || !this.HABITS_DB_ID) throw new Error('Notion API not configured.');
        const today = getISODateInTimezone(new Date(), timezone);

        // 1. Update projection immediately (Optimistic UI)
        const status = this.todayStatusCache.get(chatId) || { logs: new Map(), date: today };
        if (targetStatus) status.logs.set(habitName, true);
        else status.logs.delete(habitName);
        this.todayStatusCache.set(chatId, status);

        // Clear habit cache to force stats recalculation on next dashboard view
        this.habitCache.delete(chatId);

        if (targetStatus) {
            // Create log entry
            await this.notion.pages.create({
                parent: { database_id: this.HABITS_DB_ID.trim() },
                properties: {
                    Name: { title: [{ text: { content: habitName } }] },
                    Date: { date: { start: today } },
                    ChatID: { rich_text: [{ text: { content: String(chatId) } }] }
                }
            });
        } else {
            // Delete log entry
            const existing = await this.notion.databases.query({
                database_id: this.HABITS_DB_ID.trim(),
                filter: {
                    and: [
                        { property: 'Name', title: { equals: habitName } },
                        { property: 'Date', date: { equals: today } }
                    ]
                }
            });
            if (existing.results[0]) {
                try {
                    await this.notion.pages.update({ page_id: existing.results[0].id, archived: true });
                } catch (err) {
                    if (!err.message.includes('archived')) throw err;
                    // Already archived, ignore
                }
            }
        }
    }

    async saveNotesToVault(title, sections) {
        if (!this.notion || !this.DATABASE_ID) throw new Error('Notion API not configured.');

        const blocks = [];
        sections.forEach(section => {
            if (section.title) {
                blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: section.title } }] } });
            }
            if (section.content) {
                const text = Array.isArray(section.content) ? section.content.join('\n') : section.content;
                blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: this.createRichTextChunks(text) } });
            }
        });

        return await this.notion.pages.create({
            parent: { database_id: this.DATABASE_ID.trim() },
            properties: {
                Name: { title: [{ text: { content: title } }] },
                Date: { date: { start: new Date().toISOString() } },
                Type: { select: { name: 'Study Note 📓' } }
            },
            children: blocks.slice(0, 100) // Notion limit
        });
    }

    async appendBlocksToPage(pageId, sections) {
        const blocks = [];
        sections.forEach(section => {
            if (section.title) {
                blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: section.title } }] } });
            }
            if (section.content) {
                const text = Array.isArray(section.content) ? section.content.join('\n') : section.content;
                blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: this.createRichTextChunks(text) } });
            }
        });
        return await this.notion.blocks.children.append({ block_id: pageId, children: blocks.slice(0, 100) });
    }

    async addExpense({ item, amount, category, method }) {
        if (!this.notion || !this.FINANCE_DB_ID) throw new Error('FINANCE_DISABLED');
        return await this.notion.pages.create({
            parent: { database_id: this.FINANCE_DB_ID.trim() },
            properties: {
                Name: { title: [{ text: { content: item } }] },
                Amount: { number: parseFloat(amount) },
                Category: { select: { name: category } },
                Method: { select: { name: method } },
                Date: { date: { start: new Date().toISOString() } }
            }
        });
    }

    async getDetailedFinanceAnalytics(chatId) {
        if (!this.notion || !this.FINANCE_DB_ID) throw new Error('FINANCE_DISABLED');
        
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        
        const response = await this.notion.databases.query({
            database_id: this.FINANCE_DB_ID.trim(),
            filter: { property: 'Date', date: { on_or_after: startOfMonth } }
        });

        const expenses = response.results.map(page => ({
            amount: page.properties.Amount.number || 0,
            category: page.properties.Category.select?.name || 'Misc',
            item: page.properties.Name.title[0]?.plain_text || 'Unnamed'
        }));

        const total = expenses.reduce((sum, e) => sum + e.amount, 0);
        const categoryDistribution = {};
        let largestExpense = { amount: 0, item: 'None' };

        expenses.forEach(e => {
            categoryDistribution[e.category] = (categoryDistribution[e.category] || 0) + e.amount;
            if (e.amount > largestExpense.amount) largestExpense = e;
        });

        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dailyAverage = total / dayOfMonth;
        const forecast = dailyAverage * daysInMonth;

        return { total, categoryDistribution, largestExpense, dailyAverage, forecast, count: expenses.length };
    }

    async getBudgetLimit() {
        // Future: Fetch per-user budget from Notion Config
        return DEFAULT_BUDGET_LIMIT;
    }

    async getAllExpenses() {
        if (!this.notion || !this.FINANCE_DB_ID) throw new Error('FINANCE_DISABLED');
        const response = await this.notion.databases.query({
            database_id: this.FINANCE_DB_ID.trim(),
            sorts: [{ property: 'Date', direction: 'descending' }]
        });
        return response.results.map(page => ({
            date: page.properties.Date.date?.start || 'N/A',
            item: page.properties.Name.title[0]?.plain_text || 'Unnamed',
            amount: page.properties.Amount.number || 0,
            category: page.properties.Category.select?.name || 'Misc',
            method: page.properties.Method.select?.name || 'Cash'
        }));
    }

    async getRecentExpenses() {
        if (!this.notion || !this.FINANCE_DB_ID) throw new Error('FINANCE_DISABLED');
        const response = await this.notion.databases.query({
            database_id: this.FINANCE_DB_ID.trim(),
            sorts: [{ property: 'Date', direction: 'descending' }],
            page_size: 10
        });
        return response.results.map(page => ({
            id: page.id,
            item: page.properties.Name.title[0]?.plain_text || 'Unnamed',
            amount: page.properties.Amount.number || 0
        }));
    }

    async deleteExpense(pageId) {
        if (!this.notion) return;
        return await this.notion.pages.update({ page_id: pageId, archived: true });
    }

    async queryDatabase(databaseId, filter, sorts = []) {
        if (!this.notion) throw new Error('Notion API not configured.');
        
        let allResults = [];
        let hasMore = true;
        let cursor = undefined;

        // Implementation of auto-pagination for large background pools
        while (hasMore) {
            const response = await this.notion.databases.query({
                database_id: databaseId.trim(),
                filter,
                sorts,
                start_cursor: cursor
            });
            allResults.push(...response.results);
            hasMore = response.has_more;
            cursor = response.next_cursor;
            
            // Safety break for extremely large databases
            if (allResults.length > 500) break; 
        }

        return { results: allResults };
    }

    async createSimpleTask(taskName, chatId, remindAt = null) {
        if (!this.notion || !this.BACKLOG_DB_ID) throw new Error('BACKLOG_DISABLED');
        const properties = {
            Name: { title: [{ text: { content: taskName } }] },
            ChatID: { rich_text: [{ text: { content: String(chatId) } }] },
            Status: { status: { name: 'Not started' } }
        };
        if (remindAt) properties.RemindAt = { date: { start: remindAt } };

        return await this.notion.pages.create({
            parent: { database_id: this.BACKLOG_DB_ID.trim() },
            properties
        });
    }

    async getPendingTasks(chatId) {
        if (!this.notion || !this.BACKLOG_DB_ID) return [];
        const response = await this.notion.databases.query({
            database_id: this.BACKLOG_DB_ID.trim(),
            filter: {
                and: [
                    { property: 'Status', status: { does_not_equal: 'Done' } },
                    { property: 'ChatID', rich_text: { equals: String(chatId) } }
                ]
            },
            sorts: [{ property: 'RemindAt', direction: 'ascending' }]
        });
        return response.results.map(page => ({
            id: page.id,
            name: page.properties.Name.title[0]?.plain_text || 'Task'
        }));
    }

    async markTasksAsDone(chatId, indices) {
        if (!this.notion) throw new Error('Notion API not configured.');
        const tasks = await this.getPendingTasks(chatId);
        const toComplete = indices.map(i => tasks[i - 1]).filter(Boolean);
        
        const results = [];
        for (const task of toComplete) {
            try {
                results.push(await this.notion.pages.update({
                    page_id: task.id,
                    properties: { Status: { status: { name: 'Done' } } }
                }));
            } catch (err) {
                if (!err.message.includes('archived')) throw err;
                // Task was archived elsewhere, ignore
            }
        }
        return results;
    }

    async addHabit(chatId, habitName) {
        if (!this.notion || !this.HABITS_DB_ID) throw new Error('HABITS_DISABLED');
        
        console.log(`[NotionService] Registering new habit: "${habitName}" for ${chatId}`);
        await this.notion.pages.create({
            parent: { database_id: this.HABITS_DB_ID.trim() },
            properties: {
                Name: { title: [{ text: { content: habitName } }] },
                ChatID: { rich_text: [{ text: { content: String(chatId) } }] }
            }
        });

        // Clear cache so the new habit shows up instantly
        this.habitCache.delete(chatId);
        this.todayStatusCache.delete(chatId);
    }

    async getHabitPersistence(chatId, days = 14) {
        if (!this.notion || !this.HABITS_DB_ID) return [];
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - days);
        const startStr = startDate.toISOString().split('T')[0];

        // 1. Fetch the overall habit list
        const habitsRes = await this.notion.databases.query({
            database_id: this.HABITS_DB_ID.trim(),
            sorts: [{ property: 'Name', direction: 'ascending' }]
        });

        const habitNames = habitsRes.results.map(h => h.properties.Name.title[0]?.plain_text).filter(Boolean);

        // 2. Fetch the log entries for the last X days
        const logsRes = await this.notion.databases.query({
            database_id: this.HABITS_DB_ID.trim(),
            filter: { 
                and: [
                    { property: 'Date', date: { on_or_after: startStr } },
                    { property: 'ChatID', rich_text: { equals: String(chatId) } }
                ]
            }
        });

        const logCounts = {};
        logsRes.results.forEach(log => {
            const name = log.properties.Name?.title[0]?.plain_text;
            if (name) logCounts[name] = (logCounts[name] || 0) + 1;
        });

        return habitNames.map(name => ({
            name,
            count: logCounts[name] || 0,
            score: Math.round(((logCounts[name] || 0) / days) * 100)
        }));
    }

    async getHabitHistoryTimeline(chatId, days = 21) {
        if (!this.notion || !this.HABITS_DB_ID) return {};
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const logsRes = await this.notion.databases.query({
            database_id: this.HABITS_DB_ID.trim(),
            filter: { 
                and: [
                    { property: 'Date', date: { on_or_after: startDate.toISOString().split('T')[0] } },
                    { property: 'ChatID', rich_text: { equals: String(chatId) } }
                ]
            }
        });

        const timeline = {};
        logsRes.results.forEach(log => {
            const name = log.properties.Name?.title[0]?.plain_text;
            const date = log.properties.Date?.date?.start;
            if (name && date) {
                if (!timeline[name]) timeline[name] = [];
                timeline[name].push(date);
            }
        });
        return timeline;
    }

    async removeHabit(chatId, habitName) {
        if (!this.notion || !this.HABITS_DB_ID) return;
        
        // 1. Remove the master habit record
        const master = await this.notion.databases.query({
            database_id: this.HABITS_DB_ID.trim(),
            filter: { property: 'Name', title: { equals: habitName } }
        });
        if (master.results[0]) await this.notion.pages.update({ page_id: master.results[0].id, archived: true });

        // 2. Clear Nitro Projections
        this.habitCache.delete(chatId);
        this.todayStatusCache.delete(chatId);
    }

    /**
     * SYSTEM CONFIG: Persists global settings in the Notion Vault.
     */
    async saveSystemConfig(key, value) {
        if (!this.notion || !this.DATABASE_ID) return;
        this.configCache.set(key, value);

        try {
            // 1. Find the config page
            const response = await this.notion.databases.query({
                database_id: this.DATABASE_ID.trim(),
                filter: { property: 'Name', title: { equals: '⚡ SYSTEM_CONFIG' } }
            });

            const configPage = response.results[0];
            const props = {
                [key]: { rich_text: [{ text: { content: String(value) } }] }
            };

            if (configPage) {
                // Update existing
                await this.notion.pages.update({ page_id: configPage.id, properties: props });
            } else {
                // Create new
                await this.notion.pages.create({
                    parent: { database_id: this.DATABASE_ID.trim() },
                    properties: {
                        Name: { title: [{ text: { content: '⚡ SYSTEM_CONFIG' } }] },
                        ...props
                    }
                });
            }
        } catch (err) {
            if (err.message.includes('not a property that exists')) {
                console.error(`[NotionService] ❌ CRITICAL: Property "${key}" is missing in your Notion database!`);
                console.error(`👉 ACTION REQUIRED: Add a "Text" or "Rich Text" property named "${key}" to your Axiom Master database.`);
            } else {
                console.error(`[NotionService] Config save failed (${key}):`, err.message);
            }
        }
    }

    async getSystemConfig(key) {
        if (!this.notion || !this.DATABASE_ID) return null;
        if (this.configCache.has(key)) return this.configCache.get(key);

        try {
            const response = await this.notion.databases.query({
                database_id: this.DATABASE_ID.trim(),
                filter: { property: 'Name', title: { equals: '⚡ SYSTEM_CONFIG' } }
            });

            const configPage = response.results[0];
            if (configPage && configPage.properties[key]) {
                const value = configPage.properties[key].rich_text[0]?.plain_text;
                if (value) {
                    this.configCache.set(key, value);
                    return value;
                }
            }
        } catch (err) {
            console.error(`[NotionService] Config fetch failed (${key}):`, err.message);
        }
        return null;
    }

    /**
     * Persists the user's monthly budget limit to the Notion Vault.
     */
    async setBudgetLimit(chatId, amount) {
        return await this.saveSystemConfig('BUDGET_LIMIT', amount);
    }

    /**
     * Retrieves the user's monthly budget target.
     * @returns {number} The budget limit or default (30,000).
     */
    async getBudgetLimit(chatId) {
        const val = await this.getSystemConfig('BUDGET_LIMIT');
        return val ? parseFloat(val) : 30000; // Default to 30k
    }

    /**
     * Analyzes the Finance Database to identify all unique users.
     * Used by the Daily Agent for automated reporting.
     */
    async getUniqueFinanceUsers() {
        if (!this.notion || !this.FINANCE_DB_ID) return [];
        try {
            const response = await this.notion.databases.query({
                database_id: this.FINANCE_DB_ID.trim(),
                page_size: 100
            });
            const users = new Set();
            response.results.forEach(page => {
                const chatId = page.properties.ChatID?.rich_text[0]?.plain_text;
                if (chatId) users.add(chatId);
            });
            return Array.from(users);
        } catch (err) {
            console.error('[NotionService] Failed to fetch unique users:', err.message);
            return [];
        }
    }

    /**
     * System Config: Get the timestamp of the last sent daily report.
     */
    async getLastDailyReportDate(chatId) {
        return await this.getSystemConfig(`LAST_REPORT_DATE`);
    }

    /**
     * System Config: Save the timestamp of the last sent daily report.
     */
    async setLastDailyReportDate(chatId, date) {
        return await this.saveSystemConfig(`LAST_REPORT_DATE`, date);
    }
}

// Axiom OS — Open Source Edition
module.exports = new NotionService();
