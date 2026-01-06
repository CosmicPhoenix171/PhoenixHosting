# 🔥 Phoenix Hosting

**A secure, multi-user, multi-game hosting platform for remote server management.**

Phoenix Hosting enables you to control game servers running on a private Windows machine through a secure web interface, without exposing your home network to the internet.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Security](#security)
- [License](#license)

---

## 🎯 Overview

Phoenix Hosting solves the challenge of remotely managing game servers on a home PC:

- **No port forwarding required** - Your PC stays invisible to the internet
- **Secure authentication** - Google sign-in via Firebase
- **Permission-based access** - Users only see servers they're allowed to control
- **Real-time updates** - Server status syncs instantly across all clients
- **Reliable agent** - Auto-recovery from crashes, disconnects, and failures

### Key Features

| Feature | Description |
|---------|-------------|
| 🔐 Google Auth | Secure sign-in with Google accounts |
| 👥 Multi-User | Multiple users with individual permissions |
| 🎮 Multi-Game | Support for various game server types |
| ⚡ Real-Time | Instant status updates via Firebase |
| 🛡️ Secure | No direct access to host machine |
| 🔄 Resilient | Auto-recovery and error handling |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                    │
└─────────────────────────────────────────────────────────────────────────┘
                    │                              │
                    │ HTTPS                        │ HTTPS
                    ▼                              ▼
    ┌───────────────────────────┐    ┌───────────────────────────┐
    │      Phoenix Panel        │    │     Firebase Cloud        │
    │    (GitHub Pages)         │◄──►│  • Authentication         │
    │                           │    │  • Realtime Database      │
    │  • User Interface         │    │  • Security Rules         │
    │  • Google Sign-In         │    │  • Command Queue          │
    │  • Server Dashboard       │    │  • Server Status          │
    │  • Action Buttons         │    │  • User Permissions       │
    └───────────────────────────┘    └───────────────────────────┘
                                                   │
                                                   │ Secure WebSocket
                                                   │ (Outbound Only)
                                                   ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                     YOUR PRIVATE NETWORK                             │
    │  ┌───────────────────────────────────────────────────────────────┐  │
    │  │                    Windows 11 Host                             │  │
    │  │                                                                │  │
    │  │   ┌─────────────────────────────────────────────────────┐     │  │
    │  │   │              Phoenix Agent                           │     │  │
    │  │   │  • Listens to Firebase command queue                 │     │  │
    │  │   │  • Validates and executes commands                   │     │  │
    │  │   │  • Updates server status                             │     │  │
    │  │   │  • Manages game server processes                     │     │  │
    │  │   └─────────────────────────────────────────────────────┘     │  │
    │  │                          │                                     │  │
    │  │            ┌─────────────┼─────────────┐                       │  │
    │  │            ▼             ▼             ▼                       │  │
    │  │   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │  │
    │  │   │ Minecraft   │ │ Valheim     │ │ Terraria    │              │  │
    │  │   │ Server      │ │ Server      │ │ Server      │              │  │
    │  │   └─────────────┘ └─────────────┘ └─────────────┘              │  │
    │  └───────────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Components

### 1. Phoenix Panel (Web UI)
- **Location:** `phoenix-panel/`
- **Hosted on:** GitHub Pages
- **Purpose:** User-facing dashboard for server management
- **Technologies:** HTML, CSS, JavaScript, Firebase SDK

### 2. Phoenix Agent (Windows Service)
- **Location:** `phoenix-agent/`
- **Runs on:** Your Windows 11 host machine
- **Purpose:** Executes commands and manages server processes
- **Technologies:** Python 3.10+, Firebase Admin SDK

### 3. Phoenix Cloud (Firebase)
- **Location:** `firebase/`
- **Purpose:** Authentication, database, security rules
- **Services:** Firebase Auth, Realtime Database

---

## 🚀 Quick Start

### Prerequisites

- Windows 11 host machine
- Python 3.10+ installed
- Firebase account (free tier works)
- GitHub account (for hosting Panel)

### Installation Overview

1. **Set up Firebase** → See [docs/SETUP.md](docs/SETUP.md)
2. **Deploy Phoenix Panel** → Push `phoenix-panel/` to GitHub Pages
3. **Install Phoenix Agent** → Run on your Windows host
4. **Configure Servers** → Add servers via Firebase console
5. **Invite Users** → Set permissions in Firebase

Detailed instructions: [docs/SETUP.md](docs/SETUP.md)

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and data flow |
| [SETUP.md](docs/SETUP.md) | Installation and configuration |
| [SECURITY.md](docs/SECURITY.md) | Security model and best practices |
| [TESTING.md](docs/TESTING.md) | How to verify the system works |
| [MAINTENANCE.md](docs/MAINTENANCE.md) | Ongoing operation and troubleshooting |

---

## 🔐 Security

Phoenix Hosting is designed with security as a core principle:

- **No inbound connections** - Agent initiates all connections outbound
- **Firebase security rules** - Enforce permissions at the database level
- **Command validation** - Agent validates every command before execution
- **Audit logging** - All actions are logged with timestamps
- **User isolation** - Users can only see/control their permitted servers

See [docs/SECURITY.md](docs/SECURITY.md) for detailed security information.

---

## 🗺️ Roadmap

### Phase 1 (MVP) ✅
- [x] User authentication
- [x] Server status display
- [x] Start/Stop/Restart commands
- [x] Real-time updates
- [x] Permission system

### Phase 2 (Planned)
- [ ] Create servers from web UI
- [ ] Role-based permissions (Admin/Mod/User)
- [ ] Console output streaming
- [ ] Scheduled tasks

### Phase 3 (Future)
- [ ] Multi-agent support
- [ ] Resource monitoring
- [ ] Backup management
- [ ] Mobile app

---

## 🤝 Contributing

This is a personal project, but suggestions are welcome!

---

## 📄 License

MIT License - See LICENSE file for details.

---

**Built with 🔥 by Phoenix Hosting**