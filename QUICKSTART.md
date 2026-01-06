# Phoenix Hosting - Quick Start Guide

Welcome to Phoenix Hosting! This guide will get you up and running quickly.

## 🚀 5-Minute Setup

### Step 1: Create Firebase Project (2 minutes)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Create a project**
3. Name it `phoenix-hosting` (or your preference)
4. Disable Google Analytics (not needed)
5. Click **Create project**

### Step 2: Enable Authentication (30 seconds)

1. In your project, go to **Build → Authentication**
2. Click **Get started**
3. Click **Google** under Sign-in providers
4. Enable it and save

### Step 3: Create Database (30 seconds)

1. Go to **Build → Realtime Database**
2. Click **Create Database**
3. Choose your region
4. Start in **Locked mode**
5. Click **Enable**

### Step 4: Get Your Config (1 minute)

1. Go to **Project Settings** (gear icon)
2. Scroll to **Your apps**
3. Click the **Web** icon (`</>`)
4. Name it `phoenix-panel`
5. Copy the config object

### Step 5: Configure Phoenix Panel (30 seconds)

1. Open `phoenix-panel/js/firebase-config.js`
2. Replace the placeholder values with your Firebase config

### Step 6: Deploy Security Rules (30 seconds)

1. Go to **Realtime Database → Rules**
2. Copy contents of `firebase/database.rules.json`
3. Paste and click **Publish**

### Step 7: Add Initial Data (1 minute)

In the Database console, import or manually add:
- Your first server under `/servers`
- Your Firebase UID to that server's `allowedUsers`

### Step 8: Deploy Panel (1 minute)

Push `phoenix-panel/` to GitHub and enable GitHub Pages.

### Step 9: Setup Agent (1 minute)

1. Download service account key from Firebase
2. Save as `phoenix-agent/config/service-account.json`
3. Update `phoenix-agent/config/agent-config.json` with your database URL
4. Run: `cd phoenix-agent && pip install -r requirements.txt`
5. Test: `python agent.py`

## ✅ You're Done!

Visit your GitHub Pages URL, sign in, and start managing your servers!

---

## 📁 Project Structure

```
PhoenixHosting/
├── phoenix-panel/          # Web UI (deploy to GitHub Pages)
│   ├── index.html
│   ├── css/
│   └── js/
├── phoenix-agent/          # Windows Agent (run on your PC)
│   ├── agent.py
│   ├── config/
│   ├── src/
│   └── scripts/
├── firebase/               # Firebase configuration
│   ├── database.rules.json
│   └── sample-data.json
└── docs/                   # Documentation
    ├── SETUP.md
    ├── ARCHITECTURE.md
    ├── SECURITY.md
    ├── TESTING.md
    └── MAINTENANCE.md
```

## 🔑 Key Files to Configure

| File | What to do |
|------|------------|
| `phoenix-panel/js/firebase-config.js` | Add your Firebase web config |
| `phoenix-agent/config/service-account.json` | Add your Firebase service account key |
| `phoenix-agent/config/agent-config.json` | Set your database URL and server configs |
| `firebase/database.rules.json` | Deploy to Firebase (security rules) |

## 📚 Full Documentation

- [Complete Setup Guide](docs/SETUP.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Security Guide](docs/SECURITY.md)
- [Testing Guide](docs/TESTING.md)
- [Maintenance Guide](docs/MAINTENANCE.md)

## 🆘 Need Help?

1. Check the [Testing Guide](docs/TESTING.md) for troubleshooting
2. Review agent logs in `phoenix-agent/logs/`
3. Check browser console for Panel errors
4. Verify Firebase rules are published

---

**Built with 🔥 by Phoenix Hosting**
