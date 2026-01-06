# 🧪 Phoenix Hosting Testing Guide

This document describes how to verify Phoenix Hosting is working correctly.

---

## Testing Phases

1. [Component Testing](#component-testing) - Test each part independently
2. [Integration Testing](#integration-testing) - Test parts working together
3. [End-to-End Testing](#end-to-end-testing) - Test complete workflows
4. [Security Testing](#security-testing) - Verify security controls
5. [Failure Testing](#failure-testing) - Test error handling

---

## Component Testing

### Test Firebase Configuration

**1. Test Authentication**

1. Open Phoenix Panel in browser
2. Click "Sign in with Google"
3. Complete Google sign-in
4. Verify: User info appears in UI

✅ Pass: User successfully authenticated
❌ Fail: Error message or redirect loop

**2. Test Database Connection**

In browser DevTools Console:

```javascript
// Test read
firebase.database().ref('.info/connected').on('value', snap => {
    console.log('Connected:', snap.val());
});

// Should output: Connected: true
```

✅ Pass: Connected shows `true`
❌ Fail: Connected shows `false` or error

**3. Test Security Rules**

Try to read a server you don't have access to:

```javascript
// Should fail
firebase.database().ref('servers/fake-server').once('value')
    .then(snap => console.log('Data:', snap.val()))
    .catch(err => console.log('Blocked:', err.code));
```

✅ Pass: Shows "Blocked: PERMISSION_DENIED"
❌ Fail: Returns data or different error

### Test Phoenix Agent

**1. Test Agent Starts**

```powershell
cd C:\PhoenixAgent
python agent.py
```

Expected output:
```
[2024-01-05 10:00:00] [INFO] Phoenix Agent v1.0.0 starting...
[2024-01-05 10:00:01] [INFO] Loaded configuration
[2024-01-05 10:00:01] [INFO] Connected to Firebase
[2024-01-05 10:00:01] [INFO] Watching for commands...
```

✅ Pass: Agent running, connected
❌ Fail: Error messages, crashes

**2. Test Agent Heartbeat**

Check Firebase Console → Realtime Database → `agent/status`:

```json
{
  "online": true,
  "lastHeartbeat": 1704499200000,
  "hostname": "YOUR-PC-NAME"
}
```

✅ Pass: Heartbeat updates every 30 seconds
❌ Fail: No updates or `online: false`

**3. Test Agent Reconnection**

1. Start agent
2. Disconnect internet for 10 seconds
3. Reconnect internet
4. Watch agent logs

Expected behavior:
```
[WARN] Firebase connection lost
[INFO] Attempting reconnection...
[INFO] Connected to Firebase
```

✅ Pass: Agent automatically reconnects
❌ Fail: Agent crashes or stays disconnected

---

## Integration Testing

### Test: Panel Shows Servers

**Setup:**
1. Add a test server to Firebase database
2. Add your UID to its `allowedUsers`

**Test:**
1. Open Phoenix Panel
2. Sign in
3. Verify server appears in list
4. Verify status is displayed

✅ Pass: Server visible with correct status
❌ Fail: Server missing or wrong status

### Test: Command Sent to Firebase

**Test:**
1. Open Phoenix Panel
2. Click "Start" on a server
3. Open Firebase Console → `commands`
4. Verify new command exists:

```json
{
  "id": "cmd_abc123",
  "serverId": "your-server-id",
  "action": "start",
  "requestedBy": "your-uid",
  "requestedAt": 1704499200000,
  "status": "pending"
}
```

✅ Pass: Command created with correct data
❌ Fail: Command missing or malformed

### Test: Agent Processes Command

**Test:**
1. Send command from Panel (or create manually)
2. Watch Agent logs:

Expected output:
```
[INFO] Received command: cmd_abc123
[INFO] Action: start, Server: test-server
[INFO] Executing start command...
[INFO] Process started with PID: 12345
[INFO] Command completed successfully
```

3. Check Firebase → `commands/{id}`:

```json
{
  "status": "completed",
  "processedAt": 1704499210000,
  "result": "Server started successfully"
}
```

✅ Pass: Command processed, status updated
❌ Fail: Command stuck in pending, or error

### Test: Status Updates Real-Time

**Setup:**
- Open Phoenix Panel in two browsers (or incognito)
- Sign in with same user in both

**Test:**
1. In Browser A: Click "Start" on a server
2. In Browser B: Watch status without refreshing
3. Status should update within 2 seconds

✅ Pass: Both browsers show same status instantly
❌ Fail: Status delayed or requires refresh

---

## End-to-End Testing

### Complete Workflow Test

This tests the entire system end-to-end.

**Prerequisites:**
- Create a simple test script: `C:\TestServer\test.bat`

```batch
@echo off
echo Test server starting...
echo PID: %~dpnx0
pause
```

- Add server to Firebase:

```json
{
  "servers": {
    "test-server": {
      "id": "test-server",
      "name": "Test Server",
      "gameType": "test",
      "description": "For testing only",
      "allowedUsers": {
        "your-uid": true
      },
      "status": {
        "state": "stopped",
        "lastUpdated": 1704499200000
      },
      "config": {
        "executablePath": "C:\\TestServer\\test.bat",
        "workingDirectory": "C:\\TestServer",
        "arguments": [],
        "stopTimeout": 10
      }
    }
  }
}
```

**Test Sequence:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Panel, sign in | See "Test Server" in list |
| 2 | Verify status shows "Stopped" | Status badge is red/grey |
| 3 | Click "Start" | Button shows loading |
| 4 | Wait 5 seconds | Status changes to "Running" |
| 5 | Verify process running | Check Task Manager for test.bat |
| 6 | Click "Stop" | Status changes to "Stopped" |
| 7 | Verify process stopped | test.bat no longer in Task Manager |
| 8 | Click "Restart" | Status: Stopping → Starting → Running |

✅ Pass: All steps complete without errors
❌ Fail: Any step produces unexpected result

### Multi-User Test

**Setup:**
- User A: Admin (your account)
- User B: Friend (their Google account)

**Test:**

| Step | Actor | Action | Expected Result |
|------|-------|--------|-----------------|
| 1 | A | Add Server1 with A's access | A sees Server1 |
| 2 | B | Sign in | B sees empty list |
| 3 | A | Add B to Server1 allowedUsers | - |
| 4 | B | Refresh Panel | B sees Server1 |
| 5 | B | Click Start on Server1 | Server starts |
| 6 | A | Check Panel (no refresh) | A sees Running status |
| 7 | A | Add Server2 with only A's access | - |
| 8 | A | Verify A sees Server1 and Server2 | Both visible |
| 9 | B | Refresh Panel | B only sees Server1 |

✅ Pass: Permission isolation works correctly
❌ Fail: Users see servers they shouldn't

---

## Security Testing

### Test: Unauthorized Server Access

**Test via Browser Console:**

```javascript
// Try to read a server you don't have access to
firebase.database().ref('servers/other-users-server').once('value')
    .then(snap => {
        if (snap.val()) {
            console.error('SECURITY FAIL: Could read unauthorized server');
        } else {
            console.log('Pass: No data returned');
        }
    })
    .catch(err => console.log('Pass: Access denied'));
```

✅ Pass: PERMISSION_DENIED error
❌ Fail: Any data returned

### Test: Command Spoofing

**Test: Try to create command for server you can't access:**

```javascript
firebase.database().ref('commands').push({
    serverId: 'other-users-server',
    action: 'stop',
    requestedBy: firebase.auth().currentUser.uid,
    requestedAt: Date.now(),
    status: 'pending'
}).then(() => {
    console.error('SECURITY FAIL: Could create unauthorized command');
}).catch(err => {
    console.log('Pass: Command rejected');
});
```

✅ Pass: Command rejected
❌ Fail: Command created

### Test: Status Spoofing

**Test: Try to update server status from Panel:**

```javascript
firebase.database().ref('servers/test-server/status').update({
    state: 'running',
    lastUpdated: Date.now()
}).then(() => {
    console.error('SECURITY FAIL: Could update status from Panel');
}).catch(err => {
    console.log('Pass: Status update rejected');
});
```

✅ Pass: Update rejected (only Agent can update)
❌ Fail: Status changed

### Test: Invalid Command Actions

**Test: Try to send invalid action:**

```javascript
firebase.database().ref('commands').push({
    serverId: 'test-server',
    action: 'delete',  // Invalid!
    requestedBy: firebase.auth().currentUser.uid,
    requestedAt: Date.now(),
    status: 'pending'
}).then(() => {
    console.error('SECURITY FAIL: Invalid action accepted');
}).catch(err => {
    console.log('Pass: Invalid action rejected');
});
```

✅ Pass: Validation rejects invalid action
❌ Fail: Command created with invalid action

---

## Failure Testing

### Test: Agent Handles Missing Executable

1. Configure a server with invalid path
2. Send Start command
3. Check Agent logs and command status

Expected:
```
[ERROR] Failed to start server: Executable not found
```

Command status:
```json
{
  "status": "failed",
  "error": "Executable not found: C:\\Invalid\\Path.exe"
}
```

✅ Pass: Graceful failure with clear message
❌ Fail: Agent crashes or no error info

### Test: Agent Handles Process Crash

1. Start a server that exits immediately
2. Watch status updates

Expected sequence:
- Status: "starting"
- Status: "running" (briefly)
- Status: "stopped" or "error"

✅ Pass: Status reflects actual state
❌ Fail: Status stuck on "running"

### Test: Command Spam Protection

1. Rapidly click Start/Stop (10+ times in 5 seconds)
2. Watch Agent logs

Expected:
- Only first command processed
- Or rate limiting kicks in
- No duplicate executions

✅ Pass: System handles spam gracefully
❌ Fail: All commands execute, causing issues

### Test: Agent Recovery After Crash

1. Start Agent
2. Kill Python process (Task Manager)
3. Wait for Windows Service to restart
4. Check Agent reconnects

Expected:
- Service restarts within 30 seconds
- Logs show "Phoenix Agent starting..."
- Commands continue processing

✅ Pass: Automatic recovery
❌ Fail: Manual restart required

---

## Test Checklist

Use this checklist for validation:

### Basic Functionality
- [ ] Can sign in with Google
- [ ] Can see authorized servers
- [ ] Cannot see unauthorized servers
- [ ] Can start a server
- [ ] Can stop a server
- [ ] Can restart a server
- [ ] Status updates in real-time

### Agent Operations
- [ ] Agent starts successfully
- [ ] Agent connects to Firebase
- [ ] Agent processes commands
- [ ] Agent updates status
- [ ] Agent handles failures gracefully
- [ ] Agent reconnects after disconnect

### Security
- [ ] Cannot read unauthorized servers
- [ ] Cannot create unauthorized commands
- [ ] Cannot spoof server status
- [ ] Invalid actions rejected
- [ ] Expired commands ignored

### Reliability
- [ ] Agent survives process crash
- [ ] Agent survives network disconnect
- [ ] No duplicate command execution
- [ ] Clear error messages on failure

---

## Automated Testing (Future)

For Phase 2, consider adding:

```python
# tests/test_agent.py
import pytest
from phoenix_agent import CommandHandler

def test_validate_command_valid():
    cmd = {'action': 'start', 'serverId': 'test'}
    result = CommandHandler.validate(cmd)
    assert result.is_valid == True

def test_validate_command_invalid_action():
    cmd = {'action': 'delete', 'serverId': 'test'}
    result = CommandHandler.validate(cmd)
    assert result.is_valid == False
    assert 'Invalid action' in result.error
```

---

## Troubleshooting Tests

### If Tests Fail

| Issue | Check |
|-------|-------|
| Auth fails | Firebase console → Auth → Enabled? |
| Database denied | Security rules published? |
| Agent won't connect | Service account valid? |
| Commands not processed | Agent running? Watching right path? |
| Status not updating | WebSocket connected? |
