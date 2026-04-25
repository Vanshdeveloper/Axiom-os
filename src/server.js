const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');

// --- Environment Validation (Soft-Failure Mode) ---
const REQUIRED_ENV = [
    'GEMINI_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'NOTION_API_KEY',
    'DATABASE_ID',
    'BACKLOG_DB_ID',
    'FINANCE_DB_ID'
];

const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.warn('⚠️  WARNING: Some environment variables are missing:');
    missing.forEach(key => console.warn(`   - ${key}`));
    console.warn('Axiom OS will start with limited functionality. Features tied to these keys will be disabled.\n');
}

// Import services and routes
const telegramService = require('./services/telegram.service');
const notesRoutes = require('./routes/notes.routes');
const { startAgent } = require('./jobs/axiomAgent');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use(notesRoutes);

// Serve frontend files from root directory where index.html and app.html live
app.use(express.static(path.join(__dirname, '../')));

// Start Telegram Bot
telegramService.start();

// Start Background Agent
startAgent();

// Start Web Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Axiom Backend running on http://localhost:${PORT}`);
});
