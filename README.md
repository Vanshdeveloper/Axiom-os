# 🚀 Axiom OS: The AI-Powered Autonomous Productivity System

[![Notion](https://img.shields.io/badge/Notion-000000?style=for-the-badge&logo=notion&logoColor=white)](https://www.notion.so)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://telegram.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Axiom OS** is an automated study and productivity ecosystem that bridges the gap between fragmented learning and structured knowledge. It transforms messy thoughts and broad topics into high-quality, structured study notes, tasks, and financial reports instantly.

---

## ✨ Features

- **🤖 Telegram Command Center**: Direct link to your Notion workspace.
- **📝 AI Study Suite**: Deep academic notes and brainstorming using Google Gemini.
- **💰 Finance Tracker**: Voice and text-based expense tracking with visual monthly reports.
- **💪 Habit Tracker**: Stay consistent with real-time streak tracking and analytics.
- **⏰ Autonomous Agent**: Background workers for task reminders and deep web scraping.
- **💻 Web Dashboard**: Instant note generation with PDF export capabilities.

---

## 🛠️ Prerequisites

- **Node.js**: v18.0.0 or higher.
- **Notion Account**: Access to internal integrations.
- **Google AI Studio Key**: For Gemini models.
- **Telegram Bot Token**: Created via @BotFather.

---

## 🚀 Quick Start

### 1. Notion Template (The Quick Way)
Duplicate the official workspace to skip manual setup:
👉 **[Official Axiom OS Workspace Template](https://misty-cathedral-5cf.notion.site/Axiom-OS-31eea23acf28804c9323efa9f8074b9b?source=copy_link)**

### 2. Clone & Install
```bash
git clone https://github.com/vanshdeveloper/axiom.git
cd axiom
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your credentials.
```bash
cp .env.example .env
```
Refer to the `.env.example` for detailed instructions on where to find your API keys and Notion Database IDs.

### 3. Setup Notion Databases
You need 4 databases in your Notion workspace:
1. **Vault**: For academic notes.
2. **Backlog**: For tasks and reminders.
3. **Finance**: For expenses and budgeting.
4. **Habits**: For habit tracking.

*Tip: Ensure your Notion Integration has access to these databases.*

### 4. Run the Engine
```bash
npm start
```

## There's an [SETUP_GUIDE.md](docs/SETUP_GUIDE.md) file in docs folder for more detailed setup guide.

---

## 🛠️ Troubleshooting

### PDF Generation Failures
If you see the error `Could not find Chrome`, it means Puppeteer was unable to locate or install the required browser binary.
1. **Local Fix**: Run `npx puppeteer browsers install chrome` manually in your terminal.
2. **Path Manual Override**: If you have Chrome installed elsewhere, you can set the `PUPPETEER_EXECUTABLE_PATH` variable in your `.env` file to point to its location.

---

## 🏗️ System Architecture

Axiom uses a **Decoupled Nitro Architecture** for high-performance automation.

1. **Intelligence Tier**: Google Gemini 2.5 Flash (v1beta) for structured JSON synthesis.
2. **Data Tier**: Notion SDK integration for persistent structured storage.
3. **Agent Tier**: Background polling workers for reminders and scheduled reports.
4. **Proxy Tier**: Node.js/Express server securing all private API keys.

---

## 🤝 Open Source & Collaboration

Axiom OS is built on the philosophy of **Transparent Productivity**. We welcome contributions from developers, academics, and productivity enthusiasts.

- **Found a Bug?** Open an issue with the [BUG] prefix.
- **Have an Idea?** Start a discussion or submit a Pull Request.
- **Security?** Please refer to our [SECURITY.md](file:///c:/Users/Admin/Desktop/Root/Backend%20Projects/axiom/SECURITY.md) for reporting vulnerabilities.

---

## 🚀 Deployment

### Deploy to Render (Easiest — Blueprint)
Axiom OS is now a **Render-Ready** project. You don't need to manually configure any settings in the dashboard.

1. **GitHub**: Push these changes to your repository.
2. **Render Dashboard**: Click **"New +"** and select **"Blueprint"**.
3. **Connect**: Select your Axiom OS repository.
4. **Approve**: Render will read the `render.yaml` file, automatically set it to **Docker**, and prompt you for your API keys. Click **"Apply"** to launch.

### Manual Setup (Optional)
If you prefer not to use Blueprints, follow the manual Docker instructions below:
```bash
npx puppeteer browsers install chrome
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## ⚖️ License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

Developed with ❤️ for the future of productivity. 🦾💎✨
