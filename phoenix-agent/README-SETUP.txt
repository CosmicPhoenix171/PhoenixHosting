================================================================================
                         PHOENIX AGENT - SETUP GUIDE
================================================================================

Thank you for downloading Phoenix Agent! Follow these steps to get started.

--------------------------------------------------------------------------------
STEP 1: GET YOUR SERVICE ACCOUNT KEY
--------------------------------------------------------------------------------

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project (or create one)
3. Click the gear icon ⚙️ → Project Settings
4. Go to "Service Accounts" tab
5. Click "Generate new private key"
6. Save the downloaded JSON file as "service-account.json"

--------------------------------------------------------------------------------
STEP 2: CONFIGURE THE AGENT
--------------------------------------------------------------------------------

1. Create a folder for your agent (e.g., C:\PhoenixAgent)
2. Copy PhoenixAgent.exe to that folder
3. Create a "config" subfolder
4. Place your service-account.json in the config folder
5. Create agent-config.json in the config folder with this template:

{
  "agent_id": "my-server",
  "firebase": {
    "database_url": "https://YOUR-PROJECT.firebaseio.com",
    "service_account_path": "config/service-account.json"
  },
  "servers": {
    "minecraft": {
      "name": "Minecraft Server",
      "type": "minecraft",
      "path": "C:/Servers/Minecraft",
      "executable": "server.jar",
      "start_command": "java -Xmx4G -jar server.jar nogui",
      "stop_command": "stop"
    }
  },
  "check_interval": 5,
  "heartbeat_interval": 30
}

--------------------------------------------------------------------------------
STEP 3: FOLDER STRUCTURE
--------------------------------------------------------------------------------

Your folder should look like this:

C:\PhoenixAgent\
├── PhoenixAgent.exe
└── config\
    ├── agent-config.json
    └── service-account.json

--------------------------------------------------------------------------------
STEP 4: RUN THE AGENT
--------------------------------------------------------------------------------

Option A - Run directly:
   Double-click PhoenixAgent.exe

Option B - Run from command line:
   cd C:\PhoenixAgent
   PhoenixAgent.exe

Option C - Install as Windows Service (requires admin):
   Open PowerShell as Administrator and run:
   sc.exe create PhoenixAgent binPath= "C:\PhoenixAgent\PhoenixAgent.exe"
   sc.exe start PhoenixAgent

--------------------------------------------------------------------------------
STEP 5: ACCESS THE PANEL
--------------------------------------------------------------------------------

1. Go to: https://cosmicphoenix171.github.io/PhoenixHosting/phoenix-panel/
2. Sign in with Google
3. Your server should appear once the agent connects!

--------------------------------------------------------------------------------
CONFIGURATION OPTIONS
--------------------------------------------------------------------------------

agent_id          - Unique identifier for this agent
database_url      - Your Firebase Realtime Database URL
check_interval    - How often to check for commands (seconds)
heartbeat_interval - How often to send status updates (seconds)

Server Types:
- minecraft       - Minecraft Java Edition
- hytale          - Hytale Dedicated Server
- custom          - Any custom game server

--------------------------------------------------------------------------------
TROUBLESHOOTING
--------------------------------------------------------------------------------

"Agent not connecting"
   → Check your database_url matches your Firebase project
   → Verify service-account.json is valid

"Permission denied"
   → Run as Administrator for service installation
   → Check Firebase database rules allow authenticated access

"Server won't start"
   → Verify the server path exists
   → Check the start_command is correct
   → Ensure required dependencies (Java, etc.) are installed

--------------------------------------------------------------------------------
SUPPORT
--------------------------------------------------------------------------------

GitHub: https://github.com/CosmicPhoenix171/PhoenixHosting
Issues: https://github.com/CosmicPhoenix171/PhoenixHosting/issues

================================================================================
