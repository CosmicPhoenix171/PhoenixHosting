# Firebase Configuration

This directory contains Firebase configuration files for Phoenix Hosting.

## Files

### database.rules.json

Firebase Realtime Database security rules that enforce:

1. **Authentication Required** - All access requires a signed-in user
2. **Server Access Control** - Users can only see servers listed in their `allowedUsers`
3. **Command Validation** - Commands must have valid structure and target authorized servers
4. **Status Protection** - Only the Agent (via Admin SDK) can update server status
5. **Data Integrity** - All writes are validated for required fields

### firebase.json

Firebase project configuration file used by the Firebase CLI.

## Deploying Rules

### Option 1: Firebase Console (Recommended for beginners)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to **Realtime Database → Rules**
4. Copy the contents of `database.rules.json`
5. Paste into the rules editor
6. Click **Publish**

### Option 2: Firebase CLI

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize project (if not done):
   ```bash
   firebase init database
   ```

4. Deploy rules:
   ```bash
   firebase deploy --only database
   ```

## Understanding the Rules

### Server Access

```json
"servers": {
  "$serverId": {
    ".read": "auth != null && data.child('allowedUsers').child(auth.uid).val() == true"
  }
}
```

This rule means:
- User must be authenticated (`auth != null`)
- User's UID must exist in the server's `allowedUsers` map with value `true`

### Command Creation

```json
"commands": {
  "$commandId": {
    ".write": "auth != null && !data.exists() && newData.exists()",
    ".validate": "..."
  }
}
```

This rule means:
- User must be authenticated
- Can only create new commands (not modify existing)
- Command must pass validation (correct structure, valid action, authorized server)

### Status Updates

Server status can only be updated by the Agent using the Firebase Admin SDK, which bypasses security rules. Regular users cannot modify status even if they have read access to the server.

## Testing Rules

Use the Firebase Console's Rules Playground to test:

1. Go to **Realtime Database → Rules**
2. Click **Rules Playground**
3. Simulate reads/writes with different auth states

### Test Cases

**✅ Should Allow:**
- Authenticated user reading server they have access to
- Authenticated user creating command for their server
- Authenticated user reading their own user profile

**❌ Should Deny:**
- Unauthenticated access to anything
- User reading server not in their allowedUsers
- User creating command for unauthorized server
- User modifying server status
- User modifying server configuration
- User creating invalid command (wrong action, missing fields)

## Initial Data Structure

When setting up a new project, create this initial structure:

```json
{
  "servers": {
    "example-server-id": {
      "id": "example-server-id",
      "name": "My Game Server",
      "gameType": "minecraft",
      "description": "Example server",
      "allowedUsers": {
        "USER_UID_HERE": true
      },
      "status": {
        "state": "stopped",
        "lastUpdated": 0,
        "message": "Server initialized"
      },
      "config": {
        "executablePath": "C:\\GameServers\\start.bat",
        "workingDirectory": "C:\\GameServers",
        "arguments": [],
        "stopCommand": "stop",
        "stopTimeout": 30
      }
    }
  },
  "agent": {
    "status": {
      "online": false,
      "lastHeartbeat": 0,
      "version": "1.0.0",
      "hostname": ""
    }
  }
}
```

## Security Considerations

1. **Never share your service account key** - It has full database access
2. **Regularly audit allowedUsers** - Remove access when no longer needed
3. **Monitor command logs** - Watch for unusual activity
4. **Keep rules strict** - Don't add exceptions without careful consideration
