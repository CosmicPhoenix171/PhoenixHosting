# 🔐 Phoenix Hosting Security Guide

This document explains the security architecture and best practices for Phoenix Hosting.

---

## Security Philosophy

Phoenix Hosting follows the principle of **Defense in Depth**:

> Multiple layers of security controls protect the system. If one layer fails, others remain.

---

## Security Layers

### Layer 1: Network Security

**No Inbound Connections**

Your home network is protected because:
- Phoenix Agent makes **outbound** connections only
- No ports are opened on your router
- No port forwarding required
- No VPN tunnels needed
- Firewall blocks all unsolicited inbound traffic

```
┌─────────────────────────────────────────────────────────┐
│                YOUR HOME NETWORK                         │
│                                                          │
│   ┌──────────────┐                     ┌─────────┐      │
│   │Phoenix Agent │ ──── OUTBOUND ────► │ Internet│      │
│   │              │      HTTPS only     │         │      │
│   │ ✗ No inbound │ ◄───── BLOCKED ──── │         │      │
│   └──────────────┘                     └─────────┘      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Encrypted Communication**

All traffic uses:
- TLS 1.3 encryption
- Certificate validation
- No plaintext data ever

### Layer 2: Authentication

**Firebase Authentication**

- Google Sign-In (OAuth 2.0)
- No passwords stored
- JWT tokens with expiration
- Automatic token refresh
- Session management by Google

**What this prevents:**
- Credential theft
- Brute force attacks
- Password reuse vulnerabilities
- Session hijacking (tokens expire)

### Layer 3: Authorization (Firebase Rules)

**Permission Model**

```
servers/
  {serverId}/
    allowedUsers/
      {userId}: true    ← Only these users can see/control
```

**Firebase Security Rules enforce:**

1. **Read Access**: Users can only read servers where they're listed in `allowedUsers`
2. **Command Creation**: Users can only create commands for servers they can access
3. **Status Updates**: Only the Agent (via Admin SDK) can update server status
4. **Data Validation**: Commands must have valid format and required fields

**What this prevents:**
- Unauthorized server access
- Data tampering
- Privilege escalation
- Cross-user data leakage

### Layer 4: Command Validation

**Agent-Side Validation**

Every command is validated before execution:

```python
def validate_command(command):
    # 1. Check action is valid
    if command.action not in ['start', 'stop', 'restart']:
        return False, "Invalid action"
    
    # 2. Check server exists in local config
    if command.server_id not in configured_servers:
        return False, "Unknown server"
    
    # 3. Check command is recent (not replayed)
    if command.requested_at < (now - 5 minutes):
        return False, "Command expired"
    
    # 4. Check not duplicate
    if command.id in processed_commands:
        return False, "Already processed"
    
    return True, "Valid"
```

**What this prevents:**
- Rogue command execution
- Replay attacks
- Command injection
- Processing of stale commands

### Layer 5: Safe Execution

**No Shell Execution**

Phoenix Agent does NOT use:
- `os.system()`
- `subprocess.Popen(shell=True)`
- Any form of shell command interpolation

Instead, it uses:
- Direct process creation
- Explicit executable paths
- Argument arrays (no parsing)

```python
# DANGEROUS - Never done:
os.system(f"start {user_input}")

# SAFE - What we do:
subprocess.Popen(
    [config.executable_path] + config.arguments,
    cwd=config.working_directory,
    shell=False  # Explicit
)
```

**What this prevents:**
- Command injection
- Shell escape attacks
- Path traversal
- Arbitrary code execution

### Layer 6: Audit Logging

**Everything is Logged**

```
logs/
├── agent.log           # General operation
├── commands.log        # All command attempts
├── errors.log          # All errors
└── security.log        # Security events
```

**Logged Events:**
- Every command received
- Every command executed
- Every failure with reason
- Every status change
- Agent start/stop
- Connection events

**What this enables:**
- Forensic analysis
- Anomaly detection
- Compliance verification
- Debugging

---

## Threat Model

### What We Protect Against

| Threat | Mitigation |
|--------|------------|
| Unauthorized access | Firebase Auth + Rules |
| Command injection | No shell execution |
| Data tampering | Firebase Rules + Validation |
| Replay attacks | Timestamp validation |
| Network sniffing | TLS encryption |
| Credential theft | OAuth (no passwords) |
| Privilege escalation | Role-based access |
| DDoS | Firebase handles this |
| Agent compromise | Limited process scope |

### What We Don't Protect Against

| Threat | Explanation |
|--------|-------------|
| Malicious admin | Admin has full access by design |
| Compromised Google account | Outside our control |
| Physical access to host | Physical security is separate |
| Firebase service outage | Dependency on cloud service |
| Malicious game server | Servers run with user privileges |

---

## Security Best Practices

### For the Administrator

1. **Protect Service Account Key**
   ```
   ✓ Store in secure location
   ✓ Never commit to Git
   ✓ Restrict file permissions
   ✗ Don't share with anyone
   ✗ Don't put in public folder
   ```

2. **Use Principle of Least Privilege**
   ```
   ✓ Only add users who need access
   ✓ Only give access to needed servers
   ✗ Don't add everyone as admin
   ```

3. **Review Access Regularly**
   ```
   ✓ Audit allowedUsers monthly
   ✓ Remove unused accounts
   ✓ Check command history
   ```

4. **Keep Software Updated**
   ```
   ✓ Update Python regularly
   ✓ Update dependencies: pip install -U -r requirements.txt
   ✓ Keep Windows updated
   ```

5. **Monitor Logs**
   ```
   ✓ Check logs weekly
   ✓ Look for failed commands
   ✓ Look for unknown users
   ```

### For Game Server Configuration

1. **Run Servers with Limited Privileges**
   - Don't run game servers as Administrator
   - Create dedicated service accounts
   - Limit file system access

2. **Isolate Server Directories**
   - Each server in its own folder
   - No shared write access
   - Separate configuration files

3. **Use Proper Stop Commands**
   - Configure graceful shutdown
   - Set appropriate timeouts
   - Handle save-on-exit

---

## Firebase Security Rules Explained

```json
{
  "rules": {
    // Users can only read their own profile
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    
    // Servers: complex rules
    "servers": {
      "$serverId": {
        // Read: must be authenticated AND in allowedUsers
        ".read": "auth != null && 
                  data.child('allowedUsers').child(auth.uid).exists()",
        
        // Status: only agent can write (uses Admin SDK)
        "status": {
          ".write": false  // Admin SDK bypasses rules
        },
        
        // Users cannot modify server config
        ".write": false  // Admin only
      }
    },
    
    // Commands: validated writes
    "commands": {
      "$commandId": {
        // Read: only if you can access the server
        ".read": "auth != null && 
                  root.child('servers').child(data.child('serverId').val())
                  .child('allowedUsers').child(auth.uid).exists()",
        
        // Write: only create new commands, not modify
        ".write": "auth != null && 
                   !data.exists() &&
                   newData.child('requestedBy').val() == auth.uid &&
                   newData.child('status').val() == 'pending'",
        
        // Validation
        ".validate": "newData.hasChildren(['serverId', 'action', 'requestedBy', 'requestedAt', 'status']) &&
                      newData.child('action').val().matches(/^(start|stop|restart)$/)"
      }
    }
  }
}
```

---

## Incident Response

### If You Suspect Unauthorized Access

1. **Immediate Actions**
   - Stop Phoenix Agent: `Stop-Service PhoenixAgent`
   - Change Firebase rules to deny all
   - Revoke all user access

2. **Investigation**
   - Check agent logs for unusual commands
   - Review Firebase console for data changes
   - Check Windows Event Logs
   - Review command history in database

3. **Recovery**
   - Generate new service account key
   - Reset Firebase rules
   - Re-add only verified users
   - Resume Agent

### If Agent is Compromised

1. Stop the agent immediately
2. Revoke the service account key in Firebase Console
3. Generate new service account key
4. Review all commands in database
5. Check for unauthorized process on host
6. Reinstall agent from clean source
7. Resume with new credentials

---

## Compliance Notes

While Phoenix Hosting is designed for personal use, the architecture follows principles aligned with:

- **NIST Cybersecurity Framework** - Defense in depth
- **OWASP Guidelines** - Secure coding practices
- **Zero Trust Principles** - Verify every request

---

## Security Changelog

| Date | Change |
|------|--------|
| 2024-01-05 | Initial security architecture |

---

## Reporting Security Issues

If you discover a security vulnerability:

1. Do not publicly disclose
2. Document the issue
3. Suggest remediation
4. Update security documentation
