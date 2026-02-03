# 🔥 Phoenix Hosting

**Host game servers on your PC. Control them from anywhere.**

Phoenix Hosting lets you manage game servers running on your home computer through a simple web interface - no port forwarding, no complicated setup.

---

## ✨ Features

- **Zero Configuration** - Just download, run, and pair
- **No Port Forwarding** - Your PC stays secure
- **Web Control Panel** - Start/stop servers from any device
- **Multiple Games** - Minecraft, Valheim, Terraria, and more
- **Real-Time Status** - See server state instantly

---

## 🚀 Quick Start (3 Steps)

### Step 1: Download
[**⬇️ Download Phoenix Agent**](https://github.com/CosmicPhoenix171/PhoenixHosting/releases/latest/download/PhoenixAgent-Windows.zip)

### Step 2: Run
Extract and double-click `PhoenixAgent.exe`. You'll see a **6-character pairing code**.

### Step 3: Pair
1. Go to [**Phoenix Panel**](https://cosmicphoenix171.github.io/PhoenixHosting/phoenix-panel/)
2. Sign in with Google
3. Click **"Add Agent"**
4. Enter your pairing code

**That's it!** Your servers will appear in the panel.

---

## 🎮 Adding Game Servers

Edit `config/agent-config.json` to add your servers:

```json
{
    "servers": {
        "my-minecraft": {
            "name": "My Minecraft Server",
            "gameType": "minecraft",
            "executablePath": "C:\\Servers\\Minecraft\\start.bat",
            "workingDirectory": "C:\\Servers\\Minecraft",
            "stopCommand": "stop"
        }
    }
}
```

Restart the agent and your servers appear in the web panel!

---

## 🏗️ How It Works

```
Your Phone/PC                    Cloud                     Your Home PC
     │                            │                             │
     │   1. Click "Start"         │                             │
     └───────────────────────────►│                             │
                                  │   2. Command sent           │
                                  └────────────────────────────►│
                                                                │
                                  │   3. Status update          │
                                  │◄────────────────────────────┘
     │   4. "Running" ✓           │
     │◄───────────────────────────┘
```

- **No ports opened** on your home network
- All communication goes through Firebase (encrypted)
- Your PC only makes outbound connections

---

## 📦 What's Included

| Component | Description |
|-----------|-------------|
| **Phoenix Panel** | Web dashboard (hosted on GitHub Pages) |
| **Phoenix Agent** | Windows app that runs on your server PC |
| **Firebase Backend** | Handles auth and real-time sync |

---

## 🔐 Security

- ✅ Google authentication required
- ✅ No inbound connections to your PC
- ✅ Each user only sees their own servers
- ✅ All commands validated before execution

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](docs/SETUP.md) | Detailed setup guide |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [SECURITY.md](docs/SECURITY.md) | Security details |

---

## 🤝 Links

- **Web Panel:** https://cosmicphoenix171.github.io/PhoenixHosting/phoenix-panel/
- **Downloads:** https://github.com/CosmicPhoenix171/PhoenixHosting/releases

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file.

---

**Built with 🔥 by CosmicPhoenix**