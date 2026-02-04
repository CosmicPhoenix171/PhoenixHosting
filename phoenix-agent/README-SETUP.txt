================================================================================
                         PHOENIX AGENT - QUICK START
================================================================================

Just 2 steps to get started!

--------------------------------------------------------------------------------
STEP 1: RUN THE AGENT
--------------------------------------------------------------------------------

Double-click PhoenixAgent.exe

⚠️  WINDOWS SMARTSCREEN WARNING:
    If you see "Windows protected your PC":
    1. Click "More info"
    2. Click "Run anyway"
    (This is normal for unsigned apps - the agent is safe!)

You'll see a 6-character pairing code like "ABC123"

--------------------------------------------------------------------------------
STEP 2: PAIR WITH THE WEB PANEL
--------------------------------------------------------------------------------

1. Go to: https://cosmicphoenix171.github.io/PhoenixHosting/phoenix-panel/

2. Sign in with Google

3. Click "Add Agent"

4. Enter your pairing code

5. Done! You're connected.

================================================================================
                         ADDING GAME SERVERS
================================================================================

After pairing, add your game servers by creating a config file:

1. Create a folder called "config" (next to PhoenixAgent.exe)

2. Create a file called "agent-config.json" inside it

3. Add your servers like this:

{
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

4. Restart PhoenixAgent.exe

Your servers will now appear in the web panel!

--------------------------------------------------------------------------------
SUPPORTED GAMES
--------------------------------------------------------------------------------

   - minecraft
   - hytale
   - valheim
   - terraria
   - palworld
   - custom (any game server)

================================================================================
                              TIPS
================================================================================

ADDING MORE SERVERS:
   Add more entries to the "servers" section

RUN AT STARTUP (Optional):
   Open PowerShell as Administrator:
   sc.exe create PhoenixAgent binPath= "C:\PhoenixAgent\PhoenixAgent.exe"
   sc.exe config PhoenixAgent start= auto
   sc.exe start PhoenixAgent

RE-PAIR WITH NEW ACCOUNT:
   Delete config\pairing.json and restart

VIEW LOGS:
   Check the "logs" folder if something isn't working

GitHub: https://github.com/CosmicPhoenix171/PhoenixHosting
Issues: https://github.com/CosmicPhoenix171/PhoenixHosting/issues

================================================================================
