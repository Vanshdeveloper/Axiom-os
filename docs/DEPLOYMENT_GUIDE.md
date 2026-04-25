# ☁️ Axiom OS: Zero-Cost Deployment Guide

Follow this guide to host your Axiom OS backend **24/7 for free** using Render.com. No credit card required.

---

## 🏗️ Step 1: Push to a Private GitHub Repository
Render needs to "see" your code to host it.
1. [Duplicate the Axiom OS Template](https://misty-cathedral-5cf.notion.site/Axiom-OS-31eea23acf28804c9323efa9f8074b9b?source=copy_link) to your own Notion workspace.
2. Create a **Private** repository on [GitHub](https://github.com/new).
3. Upload your Axiom OS folder (ensure `node_modules` and `.env` are **NOT** included).
3. Confirm that your `.env.example` and `package.json` are in the root of the repo.

---

## 🚀 Step 2: Connect to Render.com
1. Create a free account at [Render.com](https://render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your **Axiom OS** repository.
4. **Settings**:
   - **Name**: `axiom-os-bot`
   - **Region**: Select the one closest to you.
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

---

## 🔑 Step 3: Configure Environment Variables
This is the most important step. Axiom OS needs your keys to talk to Notion and Telegram.
1. In your Render dashboard, go to the **Environment** tab.
2. Click **Add Environment Variable**.
3. Add every key from your `.env` file here:
   - `NOTION_API_KEY`
   - `DATABASE_ID`
   - `BACKLOG_DB_ID`
   - `TELEGRAM_BOT_DB`
   - `GEMINI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `PORT` = `3000`
4. Click **Save Changes**. Render will automatically restart your bot.

---

## ⚡ Step 4: Keep Axiom OS Awake (The "Stay-Awake" Trick)
Render’s free tier "sleeps" after 15 minutes of inactivity. Since a Telegram bot uses polling, we need to keep it awake.
1. Copy the **Public URL** of your Render service (found at the top of your dashboard, e.g., `https://axiom-os-bot.onrender.com`).
2. Go to [UptimeRobot.com](https://uptimerobot.com) and create a free account.
3. Click **Add New Monitor**:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `Axiom OS StayAwake`
   - **URL/IP**: Paste your Render URL.
   - **Monitor Interval**: `Every 5 minutes`.
4. Click **Create Monitor**. 

**Done!** Your Axiom OS bot will now stay awake 24/7, ready to structure your thoughts whenever inspiration strikes. 🦾💎

---
Built with Axiom OS. 🦾
