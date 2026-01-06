# 🔧 Phoenix Hosting Maintenance Guide

This document covers ongoing operation, monitoring, and troubleshooting.

---

## Daily Operations

### Checking System Health

**Quick Health Check (30 seconds)**

1. Open Phoenix Panel → Verify you can sign in
2. Check server statuses display correctly
3. Verify Agent status in Firebase: `agent/status/online: true`

**Full Health Check (5 minutes)**

1. All items from quick check
2. Review Agent logs for errors
3. Check Windows Event Viewer for service issues
4. Verify Firebase usage in console
5. Test a Start/Stop cycle on a test server

### Log Locations

| Log | Location | Purpose |
|-----|----------|---------|
| Agent Main | `C:\PhoenixAgent\logs\agent.log` | General operations |
| Commands | `C:\PhoenixAgent\logs\commands.log` | Command history |
| Errors | `C:\PhoenixAgent\logs\errors.log` | Error details |
| Windows Service | Event Viewer → Application | Service events |

### Log Rotation

Logs are automatically rotated:
- Max size: 10 MB per file
- Retention: 7 days
- Backup count: 5 files

To change settings, edit `config/agent-config.json`:

```json
{
  "logging": {
    "maxSizeMB": 10,
    "backupCount": 5,
    "retentionDays": 7
  }
}
```

---

## Regular Maintenance

### Weekly Tasks

- [ ] Review error logs
- [ ] Check disk space on host
- [ ] Verify all servers are accessible
- [ ] Review Firebase usage

### Monthly Tasks

- [ ] Update Python dependencies
- [ ] Review user access permissions
- [ ] Archive old logs
- [ ] Test disaster recovery
- [ ] Update documentation if needed

### Quarterly Tasks

- [ ] Security audit
- [ ] Performance review
- [ ] Rotate service account key (optional)
- [ ] Review and update Firebase rules
- [ ] Test on clean machine (validate setup docs)

---

## Updating Components

### Updating Phoenix Panel

1. Make changes to `phoenix-panel/` files
2. Commit and push to GitHub
3. GitHub Pages auto-deploys
4. Verify changes in browser (may need hard refresh)

### Updating Phoenix Agent

1. Stop the service:
   ```powershell
   Stop-Service PhoenixAgent
   ```

2. Backup current installation:
   ```powershell
   Copy-Item C:\PhoenixAgent C:\PhoenixAgent.backup -Recurse
   ```

3. Replace agent files (keep config folder)

4. Update dependencies:
   ```powershell
   cd C:\PhoenixAgent
   pip install -U -r requirements.txt
   ```

5. Start the service:
   ```powershell
   Start-Service PhoenixAgent
   ```

6. Verify in logs:
   ```powershell
   Get-Content C:\PhoenixAgent\logs\agent.log -Tail 20
   ```

### Updating Firebase Rules

1. Backup current rules from Firebase Console
2. Update `firebase/database.rules.json`
3. Deploy via Firebase Console or CLI:
   ```bash
   firebase deploy --only database
   ```
4. Test that permissions still work correctly

---

## Monitoring

### Key Metrics to Watch

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| Agent heartbeat | < 60s old | 1-5 min old | > 5 min old |
| Command queue | 0-2 pending | 3-10 pending | > 10 pending |
| Error rate | < 1/day | 1-5/day | > 5/day |
| Firebase reads | < 50k/day | 50k-80k/day | > 80k/day |

### Setting Up Alerts (Optional)

**Firebase Functions Alert:**

```javascript
// functions/index.js
exports.agentOfflineAlert = functions.database
  .ref('/agent/status/lastHeartbeat')
  .onWrite(async (change, context) => {
    const lastBeat = change.after.val();
    const now = Date.now();
    
    if (now - lastBeat > 5 * 60 * 1000) {
      // Agent offline for 5 minutes
      // Send notification (email, Discord, etc.)
    }
  });
```

### Dashboard View

Create a simple status page:

```html
<!-- status.html -->
<div id="system-status">
  <div>Panel: <span id="panel-status">Checking...</span></div>
  <div>Agent: <span id="agent-status">Checking...</span></div>
  <div>Database: <span id="db-status">Checking...</span></div>
</div>
```

---

## Troubleshooting

### Common Issues

#### Panel: "Sign in failed"

**Symptoms:** Google sign-in fails or loops

**Causes & Solutions:**

1. **Domain not authorized**
   - Firebase Console → Auth → Settings → Authorized domains
   - Add your GitHub Pages domain

2. **Browser blocks popups**
   - Allow popups for your site
   - Try incognito mode

3. **Firebase project misconfigured**
   - Verify config values in `firebase-config.js`
   - Check project ID matches

#### Panel: "No servers available"

**Symptoms:** Signed in but no servers shown

**Causes & Solutions:**

1. **User not in allowedUsers**
   - Add your UID to server's allowedUsers
   - Find UID in DevTools: `firebase.auth().currentUser.uid`

2. **Database rules blocking**
   - Check rules in Firebase Console
   - Verify rules match documentation

3. **No servers configured**
   - Add servers to database (see SETUP.md)

#### Agent: Won't connect to Firebase

**Symptoms:** Agent shows connection errors

**Causes & Solutions:**

1. **Service account invalid**
   - Regenerate key in Firebase Console
   - Update path in config

2. **Database URL wrong**
   - Check databaseURL in config
   - Format: `https://PROJECT-ID-default-rtdb.firebaseio.com`

3. **Network blocking outbound**
   - Check firewall allows HTTPS outbound
   - Test: `curl https://firebase.google.com`

4. **SSL certificate issues**
   - Update Python: `pip install --upgrade certifi`

#### Agent: Commands not executing

**Symptoms:** Commands stay in "pending" state

**Causes & Solutions:**

1. **Agent not running**
   ```powershell
   Get-Service PhoenixAgent
   # If stopped:
   Start-Service PhoenixAgent
   ```

2. **Agent watching wrong path**
   - Check database URL in config
   - Verify `commands` path exists

3. **Command validation failing**
   - Check agent logs for validation errors
   - Ensure server ID matches config

4. **Process execution failing**
   - Verify executable path exists
   - Check file permissions
   - Try running executable manually

#### Server: Status stuck on "Starting"

**Symptoms:** Server shows starting but never running

**Causes & Solutions:**

1. **Process exits immediately**
   - Check the game server logs
   - Run executable manually to see errors

2. **Agent lost connection during start**
   - Check agent logs for disconnect
   - Status will update on reconnect

3. **Process detection issue**
   - Verify process name in Task Manager
   - Check if correct PID stored

#### Server: Won't stop gracefully

**Symptoms:** Stop takes forever or fails

**Causes & Solutions:**

1. **Stop command not configured**
   - Set `stopCommand` in server config
   - Some games need specific shutdown commands

2. **Process ignoring termination**
   - Increase `stopTimeout` in config
   - Agent will force-kill after timeout

3. **Wrong process targeted**
   - Check PID in status matches actual process
   - Look for child processes

### Emergency Procedures

#### Emergency: Stop All Servers

```powershell
# Stop agent (prevents new commands)
Stop-Service PhoenixAgent

# Kill all game servers
Get-Process | Where-Object {$_.Path -like "C:\GameServers\*"} | Stop-Process -Force
```

#### Emergency: Revoke All Access

1. Firebase Console → Realtime Database → Rules
2. Replace with:
   ```json
   {
     "rules": {
       ".read": false,
       ".write": false
     }
   }
   ```
3. Click Publish

#### Emergency: Reset Agent

```powershell
# Stop service
Stop-Service PhoenixAgent

# Clear any stuck state
Remove-Item C:\PhoenixAgent\data\*.lock -Force

# Start fresh
Start-Service PhoenixAgent
```

---

## Backup & Recovery

### What to Backup

| Item | Location | Frequency |
|------|----------|-----------|
| Agent config | `C:\PhoenixAgent\config\` | Weekly |
| Service account key | Secure storage | On change |
| Firebase rules | `firebase/database.rules.json` | On change |
| Server configs | Firebase Database | Weekly |
| Panel source | Git repository | Auto |

### Backup Script

```powershell
# backup-phoenix.ps1
$backupDir = "C:\Backups\Phoenix\$(Get-Date -Format 'yyyy-MM-dd')"
New-Item -ItemType Directory -Path $backupDir -Force

# Backup agent config
Copy-Item "C:\PhoenixAgent\config\*" "$backupDir\agent-config\" -Recurse

# Backup logs (optional)
Copy-Item "C:\PhoenixAgent\logs\*" "$backupDir\logs\" -Recurse

Write-Host "Backup complete: $backupDir"
```

### Recovery Procedure

1. **Restore Agent:**
   ```powershell
   Stop-Service PhoenixAgent
   Copy-Item "C:\Backups\Phoenix\DATE\agent-config\*" "C:\PhoenixAgent\config\" -Force
   Start-Service PhoenixAgent
   ```

2. **Restore Firebase Rules:**
   - Go to Firebase Console → Database → Rules
   - Paste rules from backup
   - Publish

3. **Restore Server Configs:**
   - Go to Firebase Console → Database → Data
   - Import backup JSON

---

## Performance Tuning

### Reducing Firebase Usage

Firebase free tier limits:
- 100 simultaneous connections
- 1 GB storage
- 10 GB/month download

**Optimization Tips:**

1. **Reduce listener scope**
   - Listen to specific paths, not root
   - Unsubscribe when not needed

2. **Batch status updates**
   - Agent batches minor updates
   - Major state changes update immediately

3. **Clean old commands**
   ```javascript
   // Run periodically to clean old commands
   const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
   const oldCommands = await db.ref('commands')
     .orderByChild('requestedAt')
     .endAt(cutoff)
     .once('value');
   
   oldCommands.forEach(cmd => cmd.ref.remove());
   ```

### Agent Performance

**CPU Usage High:**
- Increase heartbeat interval
- Reduce logging verbosity
- Check for memory leaks

**Memory Usage High:**
- Restart agent weekly
- Check for accumulating data structures
- Review process monitoring code

---

## Support Resources

### Getting Help

1. Check this documentation
2. Review logs for error messages
3. Search Firebase documentation
4. Check GitHub issues

### Useful Commands

```powershell
# Check agent service status
Get-Service PhoenixAgent | Select-Object Name, Status, StartType

# View recent agent logs
Get-Content C:\PhoenixAgent\logs\agent.log -Tail 50

# Check agent process
Get-Process python | Where-Object {$_.Path -like "*PhoenixAgent*"}

# Test Firebase connectivity
Invoke-WebRequest https://firebase.google.com -UseBasicParsing

# List running game servers
Get-Process | Where-Object {$_.Path -like "C:\GameServers\*"}
```

### Log Analysis

```powershell
# Find all errors in last 24 hours
Get-Content C:\PhoenixAgent\logs\agent.log | 
    Select-String "\[ERROR\]" |
    Where-Object {$_.Line -match (Get-Date -Format "yyyy-MM-dd")}

# Count commands by status
Get-Content C:\PhoenixAgent\logs\commands.log |
    Select-String "status:" |
    Group-Object {$_ -replace ".*status: (\w+).*", '$1'} |
    Format-Table Name, Count
```
