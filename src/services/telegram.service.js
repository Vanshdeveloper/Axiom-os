const { Telegraf } = require('telegraf');
const notionService = require('./notion.service');
const geminiService = require('./gemini.service');
const pdfService = require('./pdf.service');
const health = require('../utils/health');
const { parseReminderTime, formatInTimezone, getISODateInTimezone } = require('../utils/time');
const { generateFinanceExcel } = require('../utils/excel');

/**
 * ============================================================
 * AXIOM OS — TELEGRAM SERVICE (Main Controller)
 * ============================================================
 * Acts as the entry point for all user interactions. Routes
 * messages to specialized handlers for finances, research,
 * task management, and academic study suites.
 */
class TelegramService {
    constructor() {
        const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
        if (!token) {
            console.warn('[TelegramService] WARNING: TELEGRAM_BOT_TOKEN is not set.');
            this.bot = null;
        } else {
            this.bot = new Telegraf(token);
            this.noteCache = new Map(); 
            this.pendingFinance = new Map(); 
            this.pendingNotes = new Map(); // 📝 Pending Persona selection
            this.initializeBot();
            // registerBotCommands moved to start() for stability
        }
    }

    async registerBotCommands() {
        if (!this.bot) return;
        try {
            await this.bot.telegram.setMyCommands([
                { command: 'start', description: '🚀 Ignite Axiom OS' },
                { command: 'help', description: '📖 Global Guidance System' },
                { command: 'status', description: '🛰️ Master Technical Dashboard' },
                { command: 'habits', description: '💪 Daily Consistency Board' },
                { command: 'habitstats', description: '📈 Consistency & Days Analysis' },
                { command: 'addhabit', description: '➕ Register a new goal' },
                { command: 'note', description: '📝 Generate Deep AI Notes' },
                { command: 'brainstorm', description: '💡 Creative Catalyst Engine' },
                { command: 'budget', description: '💰 Current Month Spending' },
                { command: 'export', description: '📊 Download finance data (Excel)' },
                { command: 'remove', description: '🗑️ Remove a recent expense' },
                { command: 'add', description: '➕ Quick add a task' },
                { command: 'show', description: '📋 View Task Backlog' },
                { command: 'done', description: '✅ Mark tasks as complete' },
                { command: 'remind', description: '⏰ Set a futuristic task reminder' },
                { command: 'setbudget', description: '⚙️ Set your monthly budget target' },
                { command: 'time', description: '⌚ Debug current clock and timezone' },
                { command: 'tz', description: '📍 Set your local timezone (e.g., /tz Asia/Kolkata)' }
            ]);
            console.log('[TelegramService] Bot commands registered for autocomplete.');
        } catch (err) {
            console.error('[TelegramService] Failed to register commands:', err.description || err.message || 'Unknown Network Error');
            if (!err.message && !err.description) console.error(err);
        }
    }

    async safeEditMessageText(ctx, text, options) {
        try {
            return await ctx.editMessageText(text, options);
        } catch (err) {
            if (err.message.includes('message is not modified')) {
                return; // Gracefully ignore
            }
            throw err;
        }
    }

    async getEffectiveTimezone() {
        const syncedTz = await notionService.getSystemConfig('TIMEZONE');
        return syncedTz || process.env.TIMEZONE || 'Asia/Kolkata';
    }

    getUptimeString() {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const secs = Math.floor(uptime % 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    initializeBot() {
        if (!this.bot) return;

        this.bot.start(async (ctx) => {
            const welcomeText = '👋 *Welcome to Axiom OS* 🚀\n\nI am your *Autonomous Productivity Engine*.\n\n*🔥 Featured Workflows:*\n💰 **Quick Finance**: Type "Coffee 150" or *speak* an expense.\n📝 **AI Study Notes**: Use /note [topic] for deep academic notes.\n💡 **Creative Brainstorm**: Use /brainstorm [topic]\n💪 **Habit Tracker**: Use /habits to stay consistent.\n\n*Quick Commands:*\n/status - Advanced Technical Dashboard\n/budget - View monthly spending\n/help - Comprehensive Guide';
            ctx.reply(welcomeText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 View Tasks', callback_data: 'show' }, { text: '💪 Habits', callback_data: 'habits' }],
                        [{ text: '📊 Status', callback_data: 'status' }, { text: '💰 Budget', callback_data: 'budget' }]
                    ]
                }
            });
        });

        this.bot.action('help', (ctx) => this.handleHelpAction(ctx));
        this.bot.action('habits', (ctx) => this.handleHabitsDashboard(ctx, true));
        this.bot.action('status', (ctx) => this.handleStatusWorkflow(ctx));
        this.bot.action('download_pdf', async (ctx) => this.handlePdfDownload(ctx));
        this.bot.action('show', async (ctx) => this.handleShowTasks(ctx));
        this.bot.action('budget', async (ctx) => this.handleBudgetWorkflow(ctx));
        this.bot.action('export_excel', async (ctx) => this.handleExportWorkflow(ctx));
        this.bot.action('habit_stats', async (ctx) => this.handleHabitStats(ctx));
        this.bot.action('remove_habit', async (ctx) => this.handleHabitRemovalDashboard(ctx, true));

        // Habit Removal Actions
        this.bot.action(/^del_hab:(.+)$/, async (ctx) => {
            const habitName = ctx.match[1];
            try {
                await notionService.removeHabit(ctx.chat.id, habitName);
                await ctx.answerCbQuery(`🗑️ Removed ${habitName}`).catch(() => {});
                await this.handleHabitRemovalDashboard(ctx, true);
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        // Note Persona Selection Callback
        this.bot.action(/^note_persona:(.+)$/, async (ctx) => {
            const persona = ctx.match[1];
            const topic = this.pendingNotes.get(ctx.chat.id);
            if (!topic) return ctx.answerCbQuery('⚠️ Session expired.');

            ctx.answerCbQuery(`Generating as ${persona}...`).catch(() => {});
            await ctx.editMessageText(`🤖 *Forging notes for:* \`${topic}\`\nStyle: *${persona === 'professor' ? 'Professor 👨‍🏫' : 'Student 🎓'}*`, { parse_mode: 'Markdown' });
            
            try {
                const data = await geminiService.generateNotesJson(topic, persona);
                const response = await notionService.saveNotesToVault(data.title, data.sections);
                this.noteCache.set(ctx.chat.id, data);
                this.pendingNotes.delete(ctx.chat.id);
                
                await ctx.reply(`📝 *Notes Ready: ${data.title}*\n🔗 [Open In Notion](${response.url})`, { 
                    reply_markup: { inline_keyboard: [[{ text: '📥 Get PDF', callback_data: 'download_pdf' }]] },
                    parse_mode: 'Markdown' 
                });
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        // Habit Toggle Callback [NITRO MODE: Lighting Fast]
        this.bot.action(/^habit_toggle:(.+):(.+)$/, async (ctx) => {
            const habitName = ctx.match[1];
            const targetStatus = ctx.match[2] === 'true';
            
            // ⚡ Instant feedback & fail-safe answer
            ctx.answerCbQuery().catch(() => {}); 

            try {
                const tz = await this.getEffectiveTimezone();
                // Instant projection & UI refresh
                await notionService.toggleHabit(ctx.chat.id, habitName, targetStatus, tz);
                await this.handleHabitsDashboard(ctx, true); 
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.action(/^fin_cat:(.+)$/, async (ctx) => {
            const category = ctx.match[1];
            const data = this.pendingFinance.get(ctx.chat.id);
            if (!data) return ctx.answerCbQuery('⚠️ Session expired.').catch(() => {});
            
            ctx.answerCbQuery(`Category: ${category}`).catch(() => {});
            
            // Step 2: Store category and ask for Payment Method
            this.pendingFinance.set(ctx.chat.id, { ...data, category });
            
            await ctx.editMessageText(`💰 *Expense:* ₹${data.amount} - "${data.item}"\nCategory: *${category}*\n\n*Step 2: Select Payment Method:*`, { 
                parse_mode: 'Markdown', 
                reply_markup: { 
                    inline_keyboard: [
                        [{ text: '💳 Online', callback_data: 'fin_method:Online' }, { text: '💵 Cash', callback_data: 'fin_method:Cash' }]
                    ] 
                } 
            });
        });

        this.bot.action(/^fin_method:(.+)$/, async (ctx) => {
            const method = ctx.match[1];
            const data = this.pendingFinance.get(ctx.chat.id);
            if (!data) return ctx.answerCbQuery('⚠️ Session expired.').catch(() => {});
            
            ctx.answerCbQuery(`Saving as ${method}...`).catch(() => {});
            
            try {
                await notionService.addExpense({ ...data, method });
                await ctx.editMessageText(`✅ *Expense Tracked!*\nItem: ${data.item}\nAmount: ₹${data.amount}\nCategory: *${data.category}*\nMethod: *${method}*`, { parse_mode: 'Markdown' });
                this.pendingFinance.delete(ctx.chat.id);
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.action(/^del_exp:(.+)$/, async (ctx) => {
            const pageId = ctx.match[1];
            
            // ⚡ Nitro Mode: Immediate internal feedback
            ctx.answerCbQuery('🗑️ Removing...').catch(() => {});
            
            try {
                // Perform deletion and capture the details
                const deletedPage = await notionService.deleteExpense(pageId);
                const item = deletedPage.properties.Name.title[0]?.plain_text || 'Unnamed';
                const amount = deletedPage.properties.Amount?.number || 0;
                
                await this._updateRemovalMenu(ctx, pageId, `🗑️ *Removed:* "${item}" (₹${amount})`);
                
            } catch (err) { 
                console.error(`[TelegramService] Delete failed: ${err.message}`);
                
                // If it's already archived, just treat it as a success for the UI
                if (err.message.includes('archived')) {
                    await this._updateRemovalMenu(ctx, pageId, '🗑️ *Note:* That item was already removed.');
                } else {
                    ctx.answerCbQuery('❌ Failed to remove.').catch(() => {});
                }
            }
        });

        this.bot.command('help', async (ctx) => this.handleHelpAction(ctx));
        this.bot.command('status', async (ctx) => this.handleStatusWorkflow(ctx));
        this.bot.command('habits', async (ctx) => this.handleHabitsDashboard(ctx));
        this.bot.command('remove', async (ctx) => this.handleRemoveExpenseWorkflow(ctx));
        this.bot.command('addhabit', async (ctx) => {
            const habit = ctx.message.text.replace('/addhabit', '').trim();
            if (!habit) return ctx.reply('Usage: /addhabit Meditation');
            console.log(`[TelegramService] /addhabit triggered: "${habit}"`);
            try {
                await notionService.addHabit(ctx.chat.id, habit);
                ctx.reply(`💪 Habit registered: *${habit}*.\nUse /habits to track it!`, { parse_mode: 'Markdown' });
            } catch (err) { this.handleServiceError(ctx, err); }
        });
        
        this.bot.command('note', async (ctx) => {
            const topic = ctx.message.text.replace('/note', '').trim();
            if (!topic) return ctx.reply('Usage: /note Quantum Physics');
            this.handleNotesWorkflow(ctx, topic);
        });

        this.bot.command('brainstorm', async (ctx) => {
            const topic = ctx.message.text.replace('/brainstorm', '').trim();
            if (!topic) return ctx.reply('Usage: /brainstorm Startup Idea');
            this.handleBrainstormWorkflow(ctx, topic);
        });

        this.bot.command('show', async (ctx) => this.handleShowTasks(ctx));
        this.bot.command('budget', async (ctx) => this.handleBudgetWorkflow(ctx));
        this.bot.command('export', async (ctx) => this.handleExportWorkflow(ctx));
        
        this.bot.command('setbudget', async (ctx) => {
            const amount = parseFloat(ctx.message.text.split(' ')[1]);
            if (isNaN(amount) || amount <= 0) return ctx.reply('Usage: /setbudget 50000');
            try {
                await notionService.setBudgetLimit(ctx.chat.id, amount);
                ctx.reply(`✅ *Monthly budget target set to ₹${amount.toLocaleString()}*`, { parse_mode: 'Markdown' });
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.command('testweekly', async (ctx) => {
            try {
                await ctx.reply('🧪 *Simulating Sunday 6 PM Report...*');
                await this.generateAndSendBudgetReport(ctx.chat.id, true);
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.command('habitstats', async (ctx) => this.handleHabitStats(ctx));
        this.bot.command('removehabit', async (ctx) => this.handleHabitRemovalDashboard(ctx));

        this.bot.command('add', async (ctx) => {
            const text = ctx.message.text.replace('/add', '').trim();
            if (!text) return ctx.reply('Usage: /add Task');
            try { await notionService.createSimpleTask(text, ctx.chat.id); ctx.reply(`✅ Added: "${text}"`); } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.command('time', async (ctx) => {
            const now = new Date();
            const tz = await this.getEffectiveTimezone();
            const local = formatInTimezone(now, tz);
            const syncedTz = await notionService.getSystemConfig('TIMEZONE');
            const msg = `⌚ **Clock Diagnostics**\n━━━━━━━━━━━━━━━━━━━━\n🌐 **Server (UTC):** \`${now.toISOString()}\`\n📍 **User (\`${tz}\`):** \`${local}\`\n\n${syncedTz ? '✅ _Timezone is auto-synced with your device._' : '⚠️ _Using system default (Asia/Kolkata). Use /tz to change._'}`;
            ctx.reply(msg, { parse_mode: 'Markdown' });
        });

        this.bot.command('remind', async (ctx) => {
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length < 2) return ctx.reply('Usage: /remind [time] [task]\nExample: /remind 10m Take medicine');

            const timeArg = args[0];
            const taskName = args.slice(1).join(' ');
            
            // 📍 Dynamic Region Detection
            const tz = await this.getEffectiveTimezone();
            const remindAt = parseReminderTime(timeArg, tz);

            if (!remindAt) return ctx.reply('❌ Invalid time format. Use 10m, 1h, or \'at 17:30\'');

            try {
                await notionService.createSimpleTask(taskName, ctx.chat.id, remindAt.toISOString());
                const timeStr = formatInTimezone(remindAt, tz);
                ctx.reply(`⏰ *Reminder Set!*\nTask: ${taskName}\nTime: *${timeStr}*`, { parse_mode: 'Markdown' });
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.command('tz', async (ctx) => {
            const tz = ctx.message.text.split(' ')[1];
            if (!tz) return ctx.reply('Usage: /tz Asia/Kolkata\nCommon ones: Asia/Kolkata, America/New_York, Europe/London');
            try {
                await notionService.saveSystemConfig('TIMEZONE', tz);
                ctx.reply(`✅ *Timezone updated to \`${tz}\`*`, { parse_mode: 'Markdown' });
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.command('done', async (ctx) => {
            const text = ctx.message.text.replace('/done', '').trim();
            const indices = text.match(/\d+/g)?.map(Number);
            if (!indices) return ctx.reply('Usage: /done 1, 2');
            
            try { 
                const completed = await notionService.markTasksAsDone(ctx.chat.id, indices); 
                
                if (completed.length === 1) {
                    const taskName = completed[0].properties.Name.title[0]?.plain_text || 'Task';
                    await ctx.reply(`✅ Checked off: "${taskName}"! 🥳`, { parse_mode: 'Markdown' });
                } else if (completed.length > 1) {
                    const count = completed.length;
                    let list = `✅ *Bulk complete!* Checked off ${count} tasks:\n`;
                    completed.forEach(task => {
                        const name = task.properties.Name.title[0]?.plain_text || 'Unnamed Task';
                        list += `- ${name}\n`;
                    });
                    await ctx.reply(list, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply('⚠️ No tasks were found to mark as done.');
                }
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.on('voice', async (ctx) => {
            if (!geminiService.model) return ctx.reply('⚠️ AI features disabled.');
            const loading = await ctx.reply('🎙️ *Listening...*', { parse_mode: 'Markdown' });
            try {
                const voice = ctx.message.voice;
                const fileLink = await ctx.telegram.getFileLink(voice.file_id);
                const extraction = await geminiService.processVoiceBrainDump(fileLink.href, voice.mime_type);
                
                const { amount, item, transcript } = extraction;
                
                if (!amount) {
                    await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
                    return ctx.reply(`❓ *Couldn't detect an amount.*\n\n_What I heard:_ "${transcript || '...'}"\n\nPlease try again or type the expense manually.`);
                }

                // Step 1: Confirm extraction and ask for category
                this.pendingFinance.set(ctx.chat.id, { item: item || 'Voice Expense', amount, chatId: ctx.chat.id });
                
                await ctx.reply(`💰 *Voice Expense Extracted:* ₹${amount} - "${item || 'Misc'}"\n\n*Step 1: Select Category:*`, { 
                    parse_mode: 'Markdown', 
                    reply_markup: { 
                        inline_keyboard: [
                            [{ text: '🍕 Food', callback_data: 'fin_cat:Food' }, { text: '🚗 Transport', callback_data: 'fin_cat:Transport' }],
                            [{ text: '🛍️ Shopping', callback_data: 'fin_cat:Shopping' }, { text: '🏠 Rent', callback_data: 'fin_cat:Rent' }],
                            [{ text: '💡 Utilities', callback_data: 'fin_cat:Utilities' }, { text: '❔ Misc', callback_data: 'fin_cat:Misc' }]
                        ] 
                    } 
                });
                
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
            } catch (err) { this.handleServiceError(ctx, err); }
        });

        this.bot.on('text', async (ctx) => {
            const text = ctx.message.text;
            
            // 1. Check for expenses first (Priority handling) - Skip if it looks like a command
            const amountMatches = text.match(/[₹$€]?(\d+([.,]\d+)?)/);
            if (amountMatches && text.length < 50 && !text.startsWith('/')) { 
                return this.handleExpenseWorkflow(ctx, text); 
            }
            
            // 2. Handle unrecognized commands
            if (text.startsWith('/')) {
                return ctx.reply('❌ *Unknown Command*\n\nI didn\'t recognize that command. Use **/help** to see available options.', { 
                    parse_mode: 'Markdown' 
                });
            }

            ctx.reply('🤖 I didn\'t recognize that. Use **/help** to see commands.', { 
                parse_mode: 'Markdown' 
            });
        });
    }

    /**
     * Helper to update the removal menu keyboard and text
     */
    async _updateRemovalMenu(ctx, removedPageId, successMsg) {
        const currentKeyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
        const newKeyboard = currentKeyboard.filter(row => {
            const button = row[0];
            return !button.callback_data.includes(removedPageId);
        });

        const finalText = `${successMsg}\n\n📉 *Select more to remove:*`;
        
        if (newKeyboard.length > 0) {
            await ctx.editMessageText(finalText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: newKeyboard }
            });
        } else {
            await ctx.editMessageText(`${successMsg}\n\n✅ *All selected records removed.*`, { parse_mode: 'Markdown' });
        }
    }

    async handleHabitsDashboard(ctx, isEdit = false) {
        try {
            const tz = await this.getEffectiveTimezone();
            const habits = await notionService.getTodayHabits(ctx.chat.id, tz);
            if (habits.length === 0) {
                const msg = '📊 *Habit Tracker*\n\nYou haven\'t registered any habits yet.\nUse `/addhabit Meditation` to start!';
                return isEdit ? ctx.editMessageText(msg, { parse_mode: 'Markdown' }) : ctx.reply(msg, { parse_mode: 'Markdown' });
            }

            const todayStr = getISODateInTimezone(new Date(), tz);
            let text = `💪 *Daily Habit Tracker*\nDate: \`${todayStr}\`\n━━━━━━━━━━━━━━━━━━━━\n`;
            const buttons = [];

            habits.forEach(h => {
                const statusIcon = h.completed ? '✅' : '❌';
                const streak = h.stats?.streak || 0;
                const consistency = h.stats?.consistency || 0;
                
                // Multi-Tier Streak Icons
                let streakIcon = '';
                if (streak >= 7) streakIcon = '🏆';
                else if (streak >= 3) streakIcon = '🔥';
                else if (streak >= 1) streakIcon = '⚡';
                
                text += `${statusIcon} *${h.name}* ${streakIcon}${streak}d (${consistency}%)\n`;
                
                buttons.push([{
                    text: `${h.completed ? '⭕ Undo' : '✅ Mark Done'}: ${h.name}`,
                    callback_data: `habit_toggle:${h.name}:${!h.completed}`
                }]);
            });

            text += '━━━━━━━━━━━━━━━━━━━━\n_Consistency is the key to mastery._';

            buttons.push([{ text: '📈 View Consistency Stats', callback_data: 'habit_stats' }]);
            buttons.push([{ text: '🗑️ Manage/Remove Habits', callback_data: 'remove_habit' }]);

            if (isEdit) {
                try {
                    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
                } catch (err) {
                    if (err.message.includes('message is not modified')) {
                        // Ignore redundant updates
                    } else {
                        throw err;
                    }
                }
            } else {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
            }
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    async handleStatusWorkflow(ctx) {
        const loading = await ctx.reply('🧪 *Gathering high-fidelity diagnostics...*', { parse_mode: 'Markdown' });
        try {
            const syncedTz = await notionService.getSystemConfig('TIMEZONE');
            const tz = syncedTz || process.env.TIMEZONE || 'UTC';
            
            const notionHealth = await notionService.getHealthStatus();
            const geminiHealth = await geminiService.getHealthStatus();
            // Standardizing the esc helper for global use
            const esc = (str) => String(str || '').replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/`/g, '\\`');
            const mem = process.memoryUsage();
            let statusText = '🦾 **Axiom OS - Master Technical Dashboard**\n━━━━━━━━━━━━━━━━━━━━\n';
            statusText += `🖥️ **System Architecture**\n• Uptime: \`${esc(this.getUptimeString())}\`\n• RSS Memory: \`${(mem.rss / 1024 / 1024).toFixed(1)}MB\`\n\n`;
            statusText += `📡 **Performance & AI**\n• Bot: 🟢 \`ONLINE\`\n• Gemini: 🟢 \`${esc(geminiHealth.version)}\`\n• Timezone: \`${esc(tz)}\` ${syncedTz ? '📍' : '⚠️'}\n\n`;
            statusText += `🤖 **Worker Analytics**\n• Reminders: \`${health.workers.axiomAgent.status}\`\n• Scrapers: \`${health.workers.scrapeAgent.status}\`\n\n`;
            statusText += `📒 **Notion Data Matrix**\n• Vault: \`${esc(notionHealth.databases.vault)}\`\n• Finance: \`${esc(notionHealth.databases.finance)}\`\n• Habits: \`${esc(notionHealth.databases.habits)}\`\n\n`;
            statusText += '━━━━━━━━━━━━━━━━━━━━\n📡 *All systems operating with high precision.*';
            await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, statusText, { parse_mode: 'Markdown' });
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    handleHelpAction(ctx) {
        const helpText = '🦾 **Axiom OS - Guidance System**\n\n' +
            '💰 **Finance**\n• *Text:* "Swiggy 350"\n• *Voice:* 🎙️ "Spent five hundred"\n• */budget* - Visual report\n• */remove* - Delete recent entry\n\n' +
            '💪 **Consistency**\n• */habits* - Today\'s board\n• */habitstats* - 📊 Consistency Analysis\n• */addhabit [name]* - New goal\n• */removehabit* - 🗑️ Delete goal\n\n' +
            '📝 **AI Study Suite**\n• */note [topic]* - Deep notes\n• */brainstorm [topic]* - Creative expansion\n\n' +
            '📅 **Tasks**\n' +
            '• */add [task]* - Quick add\n' +
            '• */show* - View backlog\n' +
            '• */done [indices]* - Mark complete\n' +
            '• */remind [time] [task]* - Set reminder';
        ctx.reply(helpText, { parse_mode: 'Markdown' });
    }

    async handleHabitStats(ctx) {
        const loading = await ctx.reply('📊 *Analyzing habit consistency timeline...*', { parse_mode: 'Markdown' });
        try {
            const daysToFetch = 14;
            const stats = await notionService.getHabitPersistence(ctx.chat.id, daysToFetch);

            if (stats.length === 0) {
                await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
                return ctx.reply('📉 *No habits found.* Start tracking to see your Axiom Pulse!', { parse_mode: 'Markdown' });
            }

            let summary = '🧬 **Axiom Habit Analytics (Last 14d)**\n';
            summary += '━━━━━━━━━━━━━━━━━━━━\n';
            
            stats.forEach(s => {
                const completionBadge = s.score >= 80 ? '🏆' : (s.score >= 50 ? '🔥' : '⚡');
                summary += `${completionBadge} **${s.name}**\n   • Consistency: \`${s.score}%\`\n   • Days Tracked: \`${s.count}/${daysToFetch}\`\n\n`;
            });

            summary += '━━━━━━━━━━━━━━━━━━━━\n📡 *Pulse analysis of your consistency patterns.*';

            await ctx.reply(summary, { parse_mode: 'Markdown' });
            await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
        } catch (err) { 
            this.handleServiceError(ctx, err); 
            await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
        }
    }


    async handleHabitRemovalDashboard(ctx, isEdit = false) {
        try {
            const habits = await notionService.getTodayHabits(ctx.chat.id);
            if (habits.length === 0) {
                const emptyMsg = '⚠️ *Zero active habits detected.*';
                return isEdit ? this.safeEditMessageText(ctx, emptyMsg, { parse_mode: 'Markdown' }) : ctx.reply(emptyMsg, { parse_mode: 'Markdown' });
            }

            let msg = '🗑️ **Axiom Habit Management**\n━━━━━━━━━━━━━━━━━━━━\nSelect a habit to remove it permanently:\n';
            const buttons = habits.map(h => ([{ text: `🗑️ Remove: ${h.name}`, callback_data: `del_hab:${h.name}` }]));
            
            if (isEdit) {
                await this.safeEditMessageText(ctx, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
            } else {
                await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
            }
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    handleServiceError(ctx, err) {
        console.error(`[TelegramService] Error: ${err.message}`);
        if (err.message.includes('DISABLED')) { ctx.reply(`⚠️ Feature disabled: ${err.message}`); }
        else if (err.message.includes('503')) { ctx.reply('⚠️ AI overloaded. Try soon.'); }
        else { ctx.reply(`❌ Service Error: \`${err.message}\``, { parse_mode: 'Markdown' }); }
    }

    async handleShowTasks(ctx) {
        try {
            const tasks = await notionService.getPendingTasks(ctx.chat.id);
            if (tasks.length === 0) return ctx.reply('🎉 empty!');
            let text = '📋 *Pending Tasks*\n\n';
            tasks.forEach((t, i) => { text += `${i + 1}. ${t.name}\n`; });
            ctx.reply(text, { parse_mode: 'Markdown' });
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    async handleBudgetWorkflow(ctx) {
        const loading = await ctx.reply('📈 *Generating Professional Financial Report...*', { parse_mode: 'Markdown' });
        try {
            await this.generateAndSendBudgetReport(ctx.chat.id);
            await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
        } catch (err) { 
            this.handleServiceError(ctx, err); 
            await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
        }
    }

    /**
     * Core Visual Report Engine
     * Can be triggered by command or automated agent
     */
    async generateAndSendBudgetReport(chatId, isAutomated = false) {
        const analytics = await notionService.getDetailedFinanceAnalytics(chatId);
        
        if (analytics.total === 0) {
            if (!isAutomated) {
                await this.bot.telegram.sendMessage(chatId, '📉 *No expense records found for this month.*\nStart tracking to see your visual report!', { parse_mode: 'Markdown' });
            }
            return;
        }

        // 1. Fetch Dynamic Budget Limit
        const budgetLimit = await notionService.getBudgetLimit(chatId);

        // 2. Generate Chart Visuals (QuickChart)
        const categories = Object.keys(analytics.categoryDistribution);
        const values = Object.values(analytics.categoryDistribution);
        const chartConfig = {
            type: 'doughnut',
            data: {
                labels: categories,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8e44ad', '#2c3e50'
                    ]
                }]
            },
            options: {
                plugins: {
                    datalabels: { color: '#fff', font: { weight: 'bold' } },
                    doughnutlabel: { labels: [{ text: `₹${analytics.total}`, font: { size: 20 } }, { text: 'Total' }] }
                }
            }
        };

        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=300&bkg=white`;

        // 3. Construct Professional Report
        const percentUsed = Math.min((analytics.total / budgetLimit) * 100, 100);
        const progressBar = '🟩'.repeat(Math.floor(percentUsed / 10)) + '⬜'.repeat(10 - Math.floor(percentUsed / 10));
        
        let report = isAutomated ? '🦾 **Axiom — Daily Status Update**\n' : '🦾 **Axiom Finance — Executive Summary**\n';
        report += '━━━━━━━━━━━━━━━━━━━━\n';
        report += `💰 **Total Spent:** ₹${analytics.total.toFixed(2)}\n`;
        report += `📊 **Forecasted:** ₹${analytics.forecast.toFixed(2)}\n`;
        report += `🏦 **Budget Usage:** (${percentUsed.toFixed(1)}%)\n`;
        report += `\`[${progressBar}]\` (Limit: ₹${budgetLimit.toLocaleString()})\n\n`;
        
        report += `🏷️ **Top Category:** ${Object.entries(analytics.categoryDistribution).sort((a,b) => b[1]-a[1])[0][0]}\n`;
        report += `🛍️ **Largest Hit:** "${analytics.largestExpense.item}" (₹${analytics.largestExpense.amount})\n`;
        report += '━━━━━━━━━━━━━━━━━━━━\n';
        report += isAutomated ? '📉 _This is your daily 6 PM status update._' : '📡 *Report generated with high-fidelity analytics.*';

        await this.bot.telegram.sendPhoto(chatId, chartUrl, {
            caption: report,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '📊 Export Full Data (Excel)', callback_data: 'export_excel' }]]
            }
        });
    }

    async handleExportWorkflow(ctx) {
        const loading = await ctx.reply('🧪 *Preparing ...*');
        try {
            const expenses = await notionService.getAllExpenses(ctx.chat.id);
            if (expenses.length === 0) return ctx.reply('⚠️ No records.');
            const buffer = generateFinanceExcel(expenses);
            const tz = await this.getEffectiveTimezone();
            const dateStr = getISODateInTimezone(new Date(), tz);
            await ctx.replyWithDocument({ source: buffer, filename: `Axiom_Finance_${dateStr}.xlsx` }, { caption: `📊 Total records: ${expenses.length}` });
            ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    async handleExpenseWorkflow(ctx, text) {
        try {
            const amountMatches = text.match(/[₹$€]?(\d+([.,]\d+)?)/);
            if (!amountMatches) return;
            const amount = parseFloat(amountMatches[1].replace(',', '.'));
            let item = text.replace(amountMatches[0], '').trim() || 'Misc Expense';
            this.pendingFinance.set(ctx.chat.id, { item, amount, chatId: ctx.chat.id });
            ctx.reply(`💰 *Expense Detected:* ₹${amount} - "${item}"\n\n*Step 1: Select Category:*`, { 
                parse_mode: 'Markdown', 
                reply_markup: { 
                    inline_keyboard: [
                        [{ text: '🍕 Food', callback_data: 'fin_cat:Food' }, { text: '🚗 Transport', callback_data: 'fin_cat:Transport' }],
                        [{ text: '🛍️ Shopping', callback_data: 'fin_cat:Shopping' }, { text: '🏠 Rent', callback_data: 'fin_cat:Rent' }],
                        [{ text: '💡 Utilities', callback_data: 'fin_cat:Utilities' }, { text: '❔ Misc', callback_data: 'fin_cat:Misc' }]
                    ] 
                } 
            });
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    async handleRemoveExpenseWorkflow(ctx) {
        const loading = await ctx.reply('🧪 *Fetching recent records...*', { parse_mode: 'Markdown' });
        try {
            const expenses = await notionService.getRecentExpenses(ctx.chat.id);
            if (expenses.length === 0) {
                return ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, '📉 No recent expenses found.', { parse_mode: 'Markdown' });
            }
            
            const buttons = expenses.map(e => ([{
                text: `🗑️ ₹${e.amount} - ${e.item}`,
                callback_data: `del_exp:${e.id}`
            }]));

            await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, '📉 *Select an expense to remove:*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
        } catch (err) { 
            ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
            this.handleServiceError(ctx, err); 
        }
    }

    async handleNotesWorkflow(ctx, topic) {
        if (!geminiService.model) return ctx.reply('⚠️ AI disabled.');
        
        // Store topic and ask for persona
        this.pendingNotes.set(ctx.chat.id, topic);
        
        ctx.reply(`📝 *Note Topic:* \`${topic}\`\nSelect instruction style:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '👨‍🏫 Professor', callback_data: 'note_persona:professor' },
                    { text: '🎓 Student', callback_data: 'note_persona:student' }
                ]]
            }
        });
    }

    async handleBrainstormWorkflow(ctx, topic) {
        if (!geminiService.model) return ctx.reply('⚠️ AI disabled.');
        const loading = await ctx.reply('💡 *Igniting creative catalyst...*');
        try {
            const data = await geminiService.generateBrainstormJson(topic);
            const response = await notionService.saveNotesToVault(data.title, data.sections);
            ctx.reply(`💡 *Brainstorm Complete: ${data.topic || topic}*\n🔗 [Execution Roadmap](${response.url})`, { parse_mode: 'Markdown' });
            ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    async handlePdfDownload(ctx) {
        const data = this.noteCache.get(ctx.chat.id);
        if (!data) return ctx.reply('⚠️ No recent note found.');
        try {
            const pdfBuffer = await pdfService.generatePdf(data);
            await ctx.replyWithDocument({ source: pdfBuffer, filename: `Axiom_${data.title}.pdf` });
        } catch (err) { this.handleServiceError(ctx, err); }
    }

    start() {
        if (this.bot) {
            this.bot.launch()
                .then(() => {
                    console.log('🤖 Telegram Bot online!');
                    return this.registerBotCommands();
                })
                .catch(err => {
                    if (!err.message.includes('409')) {
                        console.error('❌ Bot startup failed:', err.description || err.message || 'Connection Reset');
                        if (!err.message) console.error(err);
                    }
                });
        }
    }

    async sendMessage(chatId, message, options = {}) {
        if (!this.bot || !chatId) return;

        // Implementation of automatic message splitting for 4096 char depth
        const MAX_LENGTH = 4000;
        if (message.length > MAX_LENGTH) {
            const parts = message.match(/[\s\S]{1,4000}/g) || [];
            for (const part of parts) {
                await this.bot.telegram.sendMessage(chatId, part, options);
            }
        } else {
            await this.bot.telegram.sendMessage(chatId, message, options);
        }
    }
}

module.exports = new TelegramService();
