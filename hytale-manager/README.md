# Hytale Server Manager

A remote server management solution for Hytale dedicated servers using GitHub as a message bus.

## Overview

This project provides a web dashboard hosted on GitHub Pages that can control your Hytale server from any computer. Since GitHub Pages is static, a local "agent" runs on your server machine and polls GitHub for commands.

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ /frontend/      │  │ /commands/      │  │ /status/        │  │
│  │ (GitHub Pages)  │  │ pending/done/   │  │ server.json     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼─────────────────────┼─────────────────────┼──────────┘
            │                     │                     │
     ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
     │   Browser   │       │   GitHub    │       │   Browser   │
     │  Dashboard  │──────▶│     API     │◀──────│  (Status)   │
     └─────────────┘       └──────┬──────┘       └─────────────┘
                                  │
                                  │ Polls every 10s
                                  ▼
                           ┌─────────────┐
                           │   Agent     │
                           │  (Node.js)  │
                           └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │   Hytale    │
                           │   Server    │
                           └─────────────┘
```

## Features

### Dashboard (GitHub Pages)
- 🖥️ Server status display (running/stopped, uptime, PID)
- ▶️ Start/Stop/Restart controls
- 💾 Backup now button
- 📅 Schedule automatic backups
- 🔄 Update server files
- 📜 View server logs
- 📊 Command history

### Agent (Server-side)
- 🔄 Polls GitHub for commands (10-second interval)
- 🔐 HMAC signature verification
- 🚀 Process management (start/stop/restart)
- 💾 World backups with zip compression
- ⏰ Scheduled backups (interval or daily)
- 📝 Log tailing
- 🪟 Windows and Linux support

## Quick Start

### 1. Create a Private GitHub Repository

Create a new **private** repository to store commands and status. This acts as the message bus.

### 2. Generate Secrets

**GitHub Personal Access Token (PAT):**
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a new token with **Contents: Read and Write** permission for your repository
3. Save the token securely

**Command Secret (for HMAC signing):**
```bash
# Linux/macOS
openssl rand -hex 32

# PowerShell
-join ((1..32) | ForEach-Object { '{0:X2}' -f (Get-Random -Maximum 256) })
```

### 3. Deploy the Dashboard

1. Copy the `frontend/` folder contents to your repository root (or a `/docs` folder)
2. Enable GitHub Pages:
   - Go to repository Settings → Pages
   - Set source to your branch and folder
3. Access your dashboard at `https://your-username.github.io/your-repo/`

### 4. Set Up the Agent

#### Windows

```powershell
# Clone and configure
git clone https://github.com/your-username/your-repo.git
cd your-repo/agent
copy config.json.example config.json
notepad config.json  # Edit configuration

# Set environment variables
$env:GITHUB_TOKEN = "ghp_your_token"
$env:COMMAND_SECRET = "your_secret"

# Run
node agent.js
```

#### Linux

```bash
# Clone and configure
git clone https://github.com/your-username/your-repo.git
cd your-repo/agent
cp config.linux.json.example config.json
nano config.json  # Edit configuration

# Set environment variables
export GITHUB_TOKEN="ghp_your_token"
export COMMAND_SECRET="your_secret"

# Run
node agent.js
```

### 5. Install as a Service (Optional)

#### Windows
```powershell
# Run as Administrator
.\scripts\install-service.ps1
```

#### Linux
```bash
sudo ./scripts/install-service.sh
```

## Configuration

### Agent Config (`config.json`)

```json
{
    "github": {
        "owner": "your-username",
        "repo": "your-repo",
        "branch": "main"
    },
    "server_dir": "/path/to/hytale-server",
    "world_dir": "/path/to/hytale-server/worlds/default",
    "backup_dir": "/path/to/backups",
    "logs_dir": "/path/to/logs",
    "log_file": "/path/to/server.log",
    "start_command": "./start-server.sh",
    "stop_command": null,
    "updater_command": "./update-server.sh",
    "poll_interval": 10,
    "max_backups": 10
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub PAT with repo access |
| `COMMAND_SECRET` | Yes | Shared secret for HMAC signing |
| `LOG_LEVEL` | No | DEBUG, INFO, WARN, ERROR |

## Security

### How It Works

1. **No inbound ports** - The agent polls GitHub, no server ports need to be opened
2. **HMAC signatures** - All commands are signed using PBKDF2-derived keys
3. **Command expiry** - Commands older than 5 minutes are rejected
4. **Private repository** - Commands and status are not publicly visible
5. **Client-side secrets** - Tokens are never stored in the repository

### Best Practices

- ✅ Use a **private repository**
- ✅ Use **fine-grained PATs** with minimal permissions
- ✅ **Rotate secrets** periodically
- ✅ **Never commit** tokens or secrets
- ✅ Use **environment files** (`.env`) on the server

## Project Structure

```
├── frontend/
│   ├── index.html      # Dashboard HTML
│   ├── style.css       # Dashboard styles
│   └── app.js          # Dashboard JavaScript
│
├── agent/
│   ├── agent.js        # Main agent code
│   ├── package.json    # Node.js dependencies
│   ├── config.json.example
│   ├── config.linux.json.example
│   ├── README.md       # Agent documentation
│   └── scripts/
│       ├── install-service.ps1    # Windows service installer
│       ├── uninstall-service.ps1  # Windows service remover
│       ├── start-agent.ps1        # Windows manual start
│       ├── install-service.sh     # Linux service installer
│       ├── start-agent.sh         # Linux manual start
│       └── hytale-agent.service   # systemd unit file
│
├── commands/           # Created by agent
│   ├── pending/        # Commands waiting to be processed
│   └── done/           # Completed commands
│
└── status/             # Created by agent
    ├── server.json     # Current server status
    ├── last_run.json   # Last command result
    ├── history.jsonl   # Command history
    └── log_tail.txt    # Recent server logs
```

## Commands

| Action | Description |
|--------|-------------|
| `start` | Start the Hytale server |
| `stop` | Stop the server gracefully |
| `restart` | Stop then start the server |
| `backup_now` | Create an immediate backup |
| `set_backup_schedule` | Configure automatic backups |
| `update` | Run the server updater |
| `status` | Refresh server status |

## Troubleshooting

### Dashboard Issues

**"Not Connected"**
- Check repository owner/name settings
- Verify GitHub token has correct permissions
- Ensure the repository is accessible

**Commands not executing**
- Check that agent is running on server
- Verify command secret matches between dashboard and agent
- Check agent logs for signature errors

### Agent Issues

**"Failed to load config"**
- Ensure `config.json` exists and is valid JSON
- Check file permissions

**"GitHub API error 401"**
- GitHub token is invalid or expired
- Token doesn't have repository access

**Server not starting**
- Verify `start_command` is correct
- Check `server_dir` path exists
- Ensure proper permissions

**Backups failing**
- Verify `world_dir` and `backup_dir` paths
- Check disk space
- Ensure zip utility is available (Linux)

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
