# 🚀 Axiom OS: The Ultimate Setup Guide

Congratulations on acquiring **Axiom OS**! This guide will walk you through the process of setting up your new AI-powered productivity workspace from scratch.

---

## 🛠️ Step 1: Notion Configuration (The Brain)

Axiom OS uses Notion as its primary database. You need to create an "Integration" to allow the OS to read and write data.

### 1.1 Create your Notion Integration
1. Go to [Notion My-Integrations](https://www.notion.so/my-integrations).
2. Click **+ New integration**.
3. Name it `Axiom OS Connector`.
4. Select the workspace you want to use.
5. Under **Capabilities**, ensure "Insert content", "Update content", and "Read content" are all checked.
6. Click **Submit** and copy your **Internal Integration Token**. (You'll need this for your `.env` file).

### 1.2 Setup your Databases
Axiom OS requires four primary databases. The fastest way to set them up is to duplicate our official template:

👉 **[Axiom OS Official Notion Template](https://misty-cathedral-5cf.notion.site/Axiom-OS-31eea23acf28804c9323efa9f8074b9b?source=copy_link)**

Alternatively, you can create them manually with these exact properties:

1. **Vault (Academic Notes & Config)**
   - Name (Title)
   - Date (Date)
   - Type (Select)
   - TIMEZONE (Text) - *System Config*
   - BUDGET_LIMIT (Text) - *System Config*
2. **Backlog (Tasks & Reminders)**
   - Name (Title)
   - Status (Status)
   - RemindAt (Date)
   - ChatID (Rich Text)
   - Scrape Task (Checkbox)
3. **Finance (Expenses)**
   - Name (Title)
   - Amount (Number)
   - Category (Select)
   - Date (Date)
   - Method (Select)
   - ChatID (Rich Text)
4. **Habits (Tracking)**
   - Name (Title)
   - Date (Date)
   - Status (Checkbox)
   - ChatID (Rich Text)

### 1.3 How to find your Database IDs 🔍
You need the unique ID for each of the databases above:

1. Open the database in your browser as a full page.
2. Look at the URL in your address bar:
   `https://www.notion.so/myworkspace/a8aec43384f447ed84390e8e42c2e089?v=...`
3. The **Database ID** is the 32-character string between the last slash (`/`) and the question mark (`?`). 
4. Copy these IDs for your **Vault**, **Backlog**, **Finance**, and **Habits** databases.

### 1.4 Give Access to your Integration
Open each database in Notion, click the `...` menu in the top right -> **Connect to** -> Search for `Axiom OS Connector` and invite it.

---

## 🤖 Step 2: Google Gemini API (The Intelligence)

Axiom OS requires a Gemini API key for its reasoning engine.

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Log in with your Google Account.
3. Click **Create API key**.
4. Copy the key.

---

## 📱 Step 3: Telegram Bot Setup (The Interface)

1. Open Telegram and search for `@BotFather`.
2. Type `/newbot` and follow the instructions to name your bot.
3. Once created, BotFather will give you a **Bot API Token**. Copy it.

---

## ⚙️ Step 4: Environment Configuration

1. In the root directory of Axiom OS, rename `.env.example` to `.env`.
2. Open `.env` and fill in the keys you collected:
   ```env
   # Core Keys
   GEMINI_API_KEY=...
   TELEGRAM_BOT_TOKEN=...
   NOTION_API_KEY=secret_...

   # Database IDs
   DATABASE_ID=... (Vault)
   BACKLOG_DB_ID=... (Backlog)
   FINANCE_DB_ID=... (Finance)
   HABITS_DB_ID=... (Habits)
   ```

---

## 🚀 Step 5: Launching Axiom OS

### Local Run (The Fast Way)
Axiom comes with a built-in setup script that handles all dependencies and browser installations.
```bash
npm run setup
npm start
```

### Cloud Deployment (Render.com)
Axiom OS is a **Render-Ready** project.
1. Push your code to a private GitHub repo.
2. On Render.com, click **New +** -> **Blueprint**.
3. Connect your repository.
4. Render will read the `render.yaml` file and automatically configure everything. Fill in your environment variables when prompted.

---

## ❓ FAQ & Troubleshooting

- **403 Forbidden**: Ensure you have invited your Integration to each Notion Database (Step 1.4).
- **Could not find Chrome**: Run `npx puppeteer browsers install chrome` or use `npm run setup`.
- **Bot not responding**: Double-check your `TELEGRAM_BOT_TOKEN` and ensure the server is running.
- **EADDRINUSE Error (Port 3000)**: A previous instance is still running. In PowerShell: `Stop-Process -Name node -Force`.

---

© 2026 Axiom OS. Built for High-Performance Productivity.
