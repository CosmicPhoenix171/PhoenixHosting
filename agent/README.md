# Hytale Server Manager - Agent

A Node.js agent that runs on your server machine and allows remote control of your Hytale dedicated server via GitHub.

## Architecture

```
┌──────────────────────┐         ┌─────────────────────┐
│   Web Dashboard      │         │    Server Machine   │
│   (GitHub Pages)     │         │                     │
│                      │         │  ┌───────────────┐  │
│  ┌────────────────┐  │         │  │  Agent.js     │  │
│  │ Commands →     │  │ GitHub  │  │               │  │
│  │                │──┼─────────┼──│  Polls for    │  │
│  │ ← Status       │  │   API   │  │  commands     │  │
│  └────────────────┘  │         │  │               │  │
│                      │         │  └───────┬───────┘  │
└──────────────────────┘         │          │          │
                                 │          ▼          │
                                 │  ┌───────────────┐  │
                                 │  │ Hytale Server │  │
                                 │  └───────────────┘  │
                                 └─────────────────────┘
```

## Features

- **Start/Stop/Restart** - Full server lifecycle control
- **Backups** - Create and schedule automatic world backups
- **Updates** - Run server update commands remotely
- **Status Monitoring** - Real-time server status and logs
- **Secure** - HMAC-signed commands, no inbound ports required
- **Cross-Platform** - Supports Windows and Linux

## Requirements

- **Node.js** 16.0.0 or higher
- **Git** (for cloning/updating)
- **zip** utility (Linux) or PowerShell (Windows) for backups

## Quick Setup

### 1. Create GitHub Repository

Create a new private repository on GitHub for the server manager. This will act as the message bus between the dashboard and agent.

### 2. Generate GitHub Personal Access Token (PAT)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a new token with the following permissions for your repository:
   - **Contents**: Read and Write
   - **Metadata**: Read
3. Copy the token - you'll need it for both the agent and dashboard

### 3. Generate Command Secret

Generate a strong secret for HMAC signing. This must be shared between the dashboard and agent.

```bash
# Linux/macOS
openssl rand -hex 32

# PowerShell (Windows)
-join ((1..32) | ForEach-Object { '{0:X2}' -f (Get-Random -Maximum 256) })
```

### 4. Install the Agent

#### Windows

```powershell
# Clone the repository
git clone https://github.com/your-username/hytale-server-manager.git
cd hytale-server-manager/agent

# Copy and edit config
copy config.json.example config.json
notepad config.json

# Set environment variables (for current session)
$env:GITHUB_TOKEN = "ghp_your_token_here"
$env:COMMAND_SECRET = "your_secret_here"

# Run the agent
node agent.js
```

#### Linux

```bash
# Clone the repository
git clone https://github.com/your-username/hytale-server-manager.git
cd hytale-server-manager/agent

# Copy and edit config
cp config.linux.json.example config.json
nano config.json

# Set environment variables
export GITHUB_TOKEN="ghp_your_token_here"
export COMMAND_SECRET="your_secret_here"

# Run the agent
node agent.js
```

## Configuration

Edit `config.json` to match your server setup:

```json
{
    "github": {
        "owner": "your-github-username",
        "repo": "hytale-server-manager",
        "branch": "main"
    },
    "server_dir": "C:\\HytaleServer",
    "world_dir": "C:\\HytaleServer\\worlds\\default",
    "backup_dir": "C:\\HytaleServer\\backups",
    "logs_dir": "C:\\HytaleServer\\logs",
    "log_file": "C:\\HytaleServer\\logs\\server.log",
    "start_command": "start-server.bat",
    "stop_command": null,
    "updater_command": "update-server.bat",
    "java_path": "java",
    "poll_interval": 10,
    "max_backups": 10
}
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `github.owner` | Your GitHub username |
| `github.repo` | Repository name for the manager |
| `github.branch` | Branch to use (usually `main`) |
| `server_dir` | Path to the Hytale server directory |
| `world_dir` | Path to the world data for backups |
| `backup_dir` | Where to store backup files |
| `logs_dir` | Agent log directory |
| `log_file` | Server log file to monitor |
| `start_command` | Command/script to start the server |
| `stop_command` | Command to gracefully stop (optional) |
| `updater_command` | Command to update server files (optional) |
| `java_path` | Path to Java executable |
| `poll_interval` | Seconds between GitHub polls (default: 10) |
| `max_backups` | Number of backups to keep |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub PAT with repo access |
| `COMMAND_SECRET` | Yes | Shared secret for HMAC signing |
| `CONFIG_PATH` | No | Path to config.json (default: ./config.json) |
| `LOG_LEVEL` | No | DEBUG, INFO, WARN, or ERROR |

## Running as a Service

### Windows (NSSM)

1. Download [NSSM](https://nssm.cc/)
2. Install the service:

```powershell
# Install service
nssm install HytaleAgent "C:\Program Files\nodejs\node.exe" "C:\path\to\agent\agent.js"

# Set environment variables
nssm set HytaleAgent AppEnvironmentExtra GITHUB_TOKEN=ghp_xxx COMMAND_SECRET=xxx

# Start service
nssm start HytaleAgent
```

Or use the provided script:

```powershell
.\scripts\install-service.ps1
```

### Linux (systemd)

Create `/etc/systemd/system/hytale-agent.service`:

```ini
[Unit]
Description=Hytale Server Manager Agent
After=network.target

[Service]
Type=simple
User=hytale
WorkingDirectory=/opt/hytale-server-manager/agent
Environment=GITHUB_TOKEN=ghp_your_token_here
Environment=COMMAND_SECRET=your_secret_here
ExecStart=/usr/bin/node agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hytale-agent
sudo systemctl start hytale-agent

# Check status
sudo systemctl status hytale-agent

# View logs
sudo journalctl -u hytale-agent -f
```

## Commands

The agent responds to commands placed in `commands/pending/` as JSON files:

| Action | Description | Parameters |
|--------|-------------|------------|
| `start` | Start the server | None |
| `stop` | Stop the server | None |
| `restart` | Restart the server | None |
| `backup_now` | Create immediate backup | None |
| `set_backup_schedule` | Configure auto-backup | `enabled`, `type`, `interval_minutes` or `time` |
| `update` | Run server updater | None |
| `status` | Get server status | None |

### Command Format

```json
{
    "id": "uuid-v4",
    "created_at": "2026-02-03T12:00:00.000Z",
    "action": "start",
    "params": {},
    "nonce": "random-hex-string",
    "signature": "hmac-sha256-signature"
}
```

## Status Files

The agent writes status information to the `status/` directory:

- `status/server.json` - Current server state
- `status/last_run.json` - Result of the last command
- `status/history.jsonl` - Command history (one JSON per line)
- `status/log_tail.txt` - Last 200 lines of server logs

## Security

### HMAC Signing

All commands must be signed with HMAC-SHA256 using the shared secret. The signature is verified using:

1. PBKDF2 key derivation (100,000 iterations, SHA-256)
2. HMAC-SHA256 of the command JSON (without signature field)
3. Constant-time comparison

### Best Practices

1. **Use a private repository** - Commands may contain sensitive timing information
2. **Rotate secrets periodically** - Update both agent and dashboard secrets
3. **Use fine-grained PATs** - Limit token permissions to only what's needed
4. **Monitor access** - Check repository access logs periodically
5. **Don't commit secrets** - Use environment variables only

## Troubleshooting

### Agent not starting

1. Check Node.js version: `node --version` (must be >= 16)
2. Verify config.json is valid JSON
3. Check environment variables are set
4. Run with debug logging: `LOG_LEVEL=DEBUG node agent.js`

### Commands not executing

1. Check GitHub token permissions
2. Verify repository owner/name in config
3. Check command signature is correct
4. Verify command is not expired (5 minute max age)

### Server not starting

1. Verify `start_command` is correct
2. Check `server_dir` path exists
3. Ensure Java is installed if required
4. Check server logs for errors

### Backups failing

1. Ensure `world_dir` exists
2. Check `backup_dir` is writable
3. Verify zip utility is available (Linux)
4. Check disk space

## Development

```bash
# Run with debug logging
LOG_LEVEL=DEBUG node agent.js

# Watch for changes (requires nodemon)
npx nodemon agent.js
```

## License

MIT License - See LICENSE file for details.
