# 🏗️ Phoenix Hosting Architecture

This document describes the complete system architecture of Phoenix Hosting.

---

## Overview

Phoenix Hosting is a three-tier architecture designed for security and reliability:

1. **Presentation Tier** - Phoenix Panel (Web UI)
2. **Data Tier** - Firebase Cloud (Database + Auth)
3. **Execution Tier** - Phoenix Agent (Windows Service)

---

## Component Details

### 1. Phoenix Panel (Presentation Tier)

**Purpose:** Provide a secure, user-friendly interface for server management.

**Technology Stack:**
- Pure HTML/CSS/JavaScript (no build process required)
- Firebase JavaScript SDK v9+
- Hosted on GitHub Pages (free, reliable, HTTPS)

**Responsibilities:**
- Authenticate users via Google Sign-In
- Display servers the user has permission to view
- Show real-time server status
- Accept user commands (Start/Stop/Restart)
- Write command requests to Firebase

**What it does NOT do:**
- Execute commands directly
- Access the host machine
- Store sensitive data locally
- Have admin privileges

### 2. Firebase Cloud (Data Tier)

**Purpose:** Act as the secure "brain" connecting Panel and Agent.

**Services Used:**
- **Firebase Authentication** - Google Sign-In
- **Firebase Realtime Database** - Data storage and sync
- **Firebase Security Rules** - Access control

**Data Structure:**
```
firebase-database/
├── servers/
│   └── {serverId}/
│       ├── id: string
│       ├── name: string
│       ├── gameType: string
│       ├── description: string
│       ├── allowedUsers: { [uid]: true }
│       ├── status: {
│       │   ├── state: "stopped" | "starting" | "running" | "stopping" | "error"
│       │   ├── lastUpdated: timestamp
│       │   ├── message: string
│       │   └── pid: number (optional)
│       }
│       └── config: {
│           ├── executablePath: string
│           ├── workingDirectory: string
│           ├── arguments: string[]
│           ├── stopCommand: string (optional)
│           └── stopTimeout: number
│       }
│
├── commands/
│   └── {commandId}/
│       ├── id: string
│       ├── serverId: string
│       ├── action: "start" | "stop" | "restart"
│       ├── requestedBy: string (uid)
│       ├── requestedByEmail: string
│       ├── requestedAt: timestamp
│       ├── status: "pending" | "processing" | "completed" | "failed"
│       ├── processedAt: timestamp (optional)
│       ├── result: string (optional)
│       └── error: string (optional)
│
├── users/
│   └── {uid}/
│       ├── email: string
│       ├── displayName: string
│       ├── photoURL: string
│       ├── isAdmin: boolean
│       ├── createdAt: timestamp
│       └── lastLogin: timestamp
│
└── agent/
    └── status/
        ├── online: boolean
        ├── lastHeartbeat: timestamp
        ├── version: string
        └── hostname: string
```

### 3. Phoenix Agent (Execution Tier)

**Purpose:** Securely execute commands on the host machine.

**Technology Stack:**
- Python 3.10+
- Firebase Admin SDK
- Windows Service (via NSSM or pywin32)

**Responsibilities:**
- Maintain persistent connection to Firebase
- Watch command queue for pending commands
- Validate command legitimacy
- Execute Start/Stop/Restart operations
- Update server status in real-time
- Log all operations for auditing
- Recover from failures gracefully

**Security Features:**
- Validates server exists in configuration
- Only processes valid actions
- Sandboxed command execution
- No shell injection possible
- Comprehensive error handling

---

## Data Flow

### User Login Flow
```
┌──────────┐    ┌──────────────┐    ┌──────────────┐
│  User    │───►│ Phoenix Panel│───►│   Firebase   │
│ Browser  │    │   (Web UI)   │    │     Auth     │
└──────────┘    └──────────────┘    └──────────────┘
     │                                      │
     │           ◄──────────────────────────┘
     │           JWT Token + User Profile
     ▼
┌──────────────────────────────────────────────────┐
│ Panel fetches servers where user is in allowedUsers│
└──────────────────────────────────────────────────┘
```

### Command Execution Flow
```
Step 1: User clicks "Start" button
┌──────────┐    ┌──────────────┐    ┌──────────────┐
│  User    │───►│ Phoenix Panel│───►│   Firebase   │
└──────────┘    └──────────────┘    │   Database   │
                 "Create command     └──────────────┘
                  with status:              │
                  pending"                  │
                                           ▼
Step 2: Agent detects new command    ┌──────────────┐
┌──────────────┐◄────────────────────│   Firebase   │
│ Phoenix Agent│  Real-time listener │   Database   │
└──────────────┘                     └──────────────┘
       │
       │ Validate → Execute → Update
       ▼
Step 3: Agent updates status
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Phoenix Agent│───►│   Firebase   │───►│ Phoenix Panel│
└──────────────┘    │   Database   │    │  (real-time) │
                    └──────────────┘    └──────────────┘
                     "status: running"   User sees update!
```

### Status Update Flow
```
Every 30 seconds + on state change:

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Phoenix Agent│───►│   Firebase   │───►│ All Clients  │
│  (heartbeat) │    │   Database   │    │  (real-time) │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## Security Architecture

### Defense in Depth

1. **Authentication Layer**
   - Firebase Authentication (Google provider)
   - JWT tokens with expiration
   - No anonymous access

2. **Authorization Layer**
   - Firebase Security Rules
   - Per-server permission lists
   - User can only see allowed servers

3. **Validation Layer**
   - Agent validates every command
   - Only known actions accepted
   - Server must exist in config

4. **Execution Layer**
   - No shell commands
   - Direct process management
   - Sandboxed execution

5. **Audit Layer**
   - All commands logged
   - Timestamps on everything
   - Error messages preserved

### Network Security

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR NETWORK                             │
│                                                              │
│  ┌────────────────┐                                         │
│  │ Phoenix Agent  │                                         │
│  │                │  ────────► OUTBOUND ONLY ────────►      │
│  │ NO INBOUND     │           (HTTPS/WSS)           │      │
│  │ PORTS OPENED   │                                 │      │
│  └────────────────┘                                 ▼      │
│                                              ┌──────────┐   │
│                                              │ Firebase │   │
│                                              │  Cloud   │   │
│                                              └──────────┘   │
└─────────────────────────────────────────────────────────────┘

Key Points:
- Firewall allows NO inbound connections
- Agent initiates all connections
- WebSocket maintained for real-time updates
- All traffic is encrypted (TLS 1.3)
```

---

## Failure Handling

### Agent Failures

| Scenario | Handling |
|----------|----------|
| Internet drops | Auto-reconnect with exponential backoff |
| Firebase offline | Queue operations, retry when online |
| Command fails | Mark as failed, log error, continue |
| Process crashes | Update status to "error", log details |
| Agent crashes | Windows Service auto-restarts |
| Windows reboots | Service starts automatically |

### Database Integrity

- Commands use atomic transactions
- Status updates are timestamped
- Old pending commands are expired
- Duplicate commands are ignored

---

## Scalability Considerations

### Current Design (Phase 1)
- Single agent, single host
- Multiple users supported
- Multiple servers supported
- Handles ~100 servers easily

### Future Design (Phase 2+)
- Multiple agents on different hosts
- Agent registration system
- Server-to-agent mapping
- Load distribution

---

## Technology Choices

### Why Firebase?
- Free tier sufficient for personal use
- Built-in authentication
- Real-time database perfect for status updates
- Security rules enforce permissions
- No server to maintain

### Why Python for Agent?
- Excellent Windows support
- Firebase Admin SDK available
- Easy process management
- Can run as Windows Service
- Readable and maintainable

### Why GitHub Pages for Panel?
- Free hosting
- Automatic HTTPS
- No server to maintain
- Easy deployment (git push)
- Reliable CDN

---

## Future Extensibility

The architecture supports future additions:

1. **Console Streaming** - Add `/console/{serverId}` path
2. **File Management** - Add `/files/{serverId}` path
3. **Backups** - Add `/backups/{serverId}` path
4. **Scheduled Tasks** - Add `/schedules/` path
5. **Multiple Agents** - Add `/agents/` path with registration

Each addition follows the same pattern:
- Panel writes requests to Firebase
- Agent watches for requests
- Agent executes and updates status
- Panel displays results in real-time
