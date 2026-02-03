================================================================================
                         PHOENIX AGENT - QUICK START
================================================================================

Getting started is easy! Just 3 steps:

--------------------------------------------------------------------------------
STEP 1: DOWNLOAD & EXTRACT
--------------------------------------------------------------------------------

Extract this ZIP file to a folder on your computer.
   Example: C:\PhoenixAgent

Your folder should contain:
   - PhoenixAgent.exe
   - agent-config.example.json
   - README.txt (this file)

--------------------------------------------------------------------------------
STEP 2: CONFIGURE YOUR SERVERS
--------------------------------------------------------------------------------

1. Create a "config" folder

2. Copy "agent-config.example.json" to "config\agent-config.json"

3. Edit config\agent-config.json to add your game servers:

{
    "agent": {
        "heartbeatInterval": 30,
        "logLevel": "INFO"
    },
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

Supported game types:
   - minecraft
   - hytale  
   - valheim
   - terraria
   - palworld
   - custom (any game)

--------------------------------------------------------------------------------
STEP 3: RUN & PAIR
--------------------------------------------------------------------------------

1. Double-click PhoenixAgent.exe

2. You'll see a 6-character pairing code (e.g., "ABC123")

3. Go to: https://cosmicphoenix171.github.io/PhoenixHosting/phoenix-panel/

4. Sign in with Google

5. Click "Add Agent" and enter your pairing code

6. Done! Your servers will appear in the panel.

================================================================================

THAT'S IT! No Firebase setup, no service accounts, no complicated config.

================================================================================
                              CONFIGURATION TIPS
================================================================================

ADDING MORE SERVERS:
Just add more entries to the "servers" section in agent-config.json

RUNNING AS A SERVICE (Optional):
   Open PowerShell as Administrator and run:
   sc.exe create PhoenixAgent binPath= "C:\PhoenixAgent\PhoenixAgent.exe"
   sc.exe config PhoenixAgent start= auto
   sc.exe start PhoenixAgent

RESETTING PAIRING:
   Delete config\pairing.json and restart the agent

LOGS:
   Check the logs folder for troubleshooting

================================================================================
                                 SUPPORT
================================================================================

GitHub: https://github.com/CosmicPhoenix171/PhoenixHosting
Issues: https://github.com/CosmicPhoenix171/PhoenixHosting/issues

================================================================================
