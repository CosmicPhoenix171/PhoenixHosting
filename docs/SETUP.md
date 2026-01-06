# 🚀 Phoenix Hosting Setup Guide

This guide walks you through setting up Phoenix Hosting from scratch.

---

## Prerequisites

Before starting, ensure you have:

- [ ] Windows 11 machine (host for game servers)
- [ ] Python 3.10+ installed ([Download](https://www.python.org/downloads/))
- [ ] Google account
- [ ] GitHub account
- [ ] Git installed ([Download](https://git-scm.com/))

---

## Step 1: Create Firebase Project

### 1.1 Create Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"**
3. Name it: `phoenix-hosting` (or your preference)
4. Disable Google Analytics (not needed)
5. Click **"Create project"**

### 1.2 Enable Authentication

1. In Firebase Console, go to **Build → Authentication**
2. Click **"Get started"**
3. Go to **Sign-in method** tab
4. Click **Google** provider
5. Enable it
6. Set project support email
7. Click **Save**

### 1.3 Create Realtime Database

1. Go to **Build → Realtime Database**
2. Click **"Create Database"**
3. Choose location closest to you
4. Start in **"locked mode"** (we'll add rules)
5. Click **"Enable"**

### 1.4 Get Web Config

1. Go to **Project Settings** (gear icon)
2. Scroll to **"Your apps"**
3. Click **Web** icon (`</>`)
4. Register app name: `phoenix-panel`
5. **Don't** enable hosting
6. Copy the config object:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "phoenix-hosting.firebaseapp.com",
  databaseURL: "https://phoenix-hosting-default-rtdb.firebaseio.com",
  projectId: "phoenix-hosting",
  storageBucket: "phoenix-hosting.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

**Save this! You'll need it for Phoenix Panel.**

### 1.5 Create Service Account (for Agent)

1. Go to **Project Settings → Service accounts**
2. Click **"Generate new private key"**
3. Save the JSON file securely
4. **NEVER commit this file to Git!**

---

## Step 2: Configure Database Rules

### 2.1 Deploy Security Rules

1. Go to **Realtime Database → Rules**
2. Replace with content from `firebase/database.rules.json`
3. Click **Publish**

The rules ensure:
- Only authenticated users can read/write
- Users only see servers they're allowed to access
- Only agent can update server status
- Commands are validated before acceptance

---

## Step 3: Deploy Phoenix Panel

### 3.1 Configure Firebase Settings

1. Open `phoenix-panel/js/firebase-config.js`
2. Replace the placeholder config with your values from Step 1.4

### 3.2 Deploy to GitHub Pages

**Option A: Same Repository**

1. Push `phoenix-panel/` contents to `main` branch
2. Go to **Repository Settings → Pages**
3. Set Source: **Deploy from branch**
4. Select **main** and `/phoenix-panel` folder
5. Save

**Option B: Separate Repository**

1. Create new repo: `phoenix-panel`
2. Copy contents of `phoenix-panel/` to new repo
3. Push to GitHub
4. Enable GitHub Pages from Settings

### 3.3 Configure Firebase Auth Domain

1. Go to Firebase Console → **Authentication → Settings**
2. Add your GitHub Pages domain to **Authorized domains**:
   - `yourusername.github.io`

### 3.4 Verify Panel Works

1. Visit your GitHub Pages URL
2. Click **Sign in with Google**
3. You should see "No servers available" (expected)

---

## Step 4: Install Phoenix Agent

### 4.1 Copy Files

1. Copy the `phoenix-agent/` folder to your Windows host
2. Recommended location: `C:\PhoenixAgent\`

### 4.2 Install Dependencies

Open PowerShell as Administrator:

```powershell
cd C:\PhoenixAgent
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4.3 Configure Agent

1. Copy your Firebase service account JSON to:
   `C:\PhoenixAgent\config\service-account.json`

2. Edit `C:\PhoenixAgent\config\agent-config.json`:

```json
{
  "firebase": {
    "serviceAccountPath": "config/service-account.json",
    "databaseURL": "https://phoenix-hosting-default-rtdb.firebaseio.com"
  },
  "agent": {
    "heartbeatInterval": 30,
    "commandTimeout": 300,
    "logLevel": "INFO"
  }
}
```

### 4.4 Test Agent

```powershell
cd C:\PhoenixAgent
python agent.py
```

You should see:
```
[INFO] Phoenix Agent starting...
[INFO] Connected to Firebase
[INFO] Watching for commands...
```

### 4.5 Install as Windows Service

Run the installation script as Administrator:

```powershell
cd C:\PhoenixAgent
.\scripts\install-service.ps1
```

This installs Phoenix Agent as a Windows Service that:
- Starts automatically on boot
- Restarts on failure
- Runs in the background

---

## Step 5: Add Your First Server

### 5.1 Add Server to Database

Go to Firebase Console → **Realtime Database** and add:

```json
{
  "servers": {
    "minecraft-survival": {
      "id": "minecraft-survival",
      "name": "Minecraft Survival",
      "gameType": "minecraft",
      "description": "Main survival server",
      "allowedUsers": {
        "YOUR_FIREBASE_UID": true
      },
      "status": {
        "state": "stopped",
        "lastUpdated": 1704499200000,
        "message": "Server initialized"
      },
      "config": {
        "executablePath": "C:\\GameServers\\Minecraft\\start.bat",
        "workingDirectory": "C:\\GameServers\\Minecraft",
        "arguments": [],
        "stopCommand": "stop",
        "stopTimeout": 30
      }
    }
  }
}
```

### 5.2 Find Your Firebase UID

1. Sign in to Phoenix Panel
2. Open browser DevTools (F12)
3. Go to Console
4. Type: `firebase.auth().currentUser.uid`
5. Copy the UID string

### 5.3 Add Yourself to allowedUsers

In Firebase Console, update the server's `allowedUsers`:

```json
"allowedUsers": {
  "paste-your-uid-here": true
}
```

### 5.4 Verify in Panel

1. Refresh Phoenix Panel
2. You should see your server listed
3. Status should show as "Stopped"

---

## Step 6: Add Additional Users

### 6.1 User Signs In

Have your friend:
1. Visit your Phoenix Panel URL
2. Sign in with Google

### 6.2 Get Their UID

They can find their UID in DevTools Console:
```javascript
firebase.auth().currentUser.uid
```

### 6.3 Grant Access

Add their UID to server's `allowedUsers`:

```json
"allowedUsers": {
  "your-uid": true,
  "friends-uid": true
}
```

---

## Verification Checklist

After setup, verify:

- [ ] Can sign in to Phoenix Panel
- [ ] Can see servers you have access to
- [ ] Phoenix Agent is running (check services)
- [ ] Agent shows "Connected to Firebase"
- [ ] Clicking Start/Stop/Restart sends commands
- [ ] Server status updates in real-time
- [ ] Friends can only see permitted servers

---

## Troubleshooting

### Panel shows "Sign in failed"

- Check Firebase Auth is enabled
- Verify domain is in authorized domains
- Check browser console for errors

### Agent won't connect

- Verify service account JSON path
- Check database URL is correct
- Ensure outbound HTTPS is allowed
- Check Python dependencies installed

### Commands not executing

- Check Agent logs: `C:\PhoenixAgent\logs\`
- Verify server config paths are correct
- Ensure executables exist
- Check file permissions

### Server status not updating

- Agent may be disconnected
- Check Firebase rules allow status writes
- Look for errors in Agent logs

---

## Next Steps

1. Add more servers to your configuration
2. Invite friends and set permissions
3. Set up monitoring and alerts
4. Review [SECURITY.md](SECURITY.md) for hardening tips
5. Check [MAINTENANCE.md](MAINTENANCE.md) for ongoing operations
