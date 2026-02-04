"""
Phoenix Agent - Server Manager Module

Handles all game server process management including:
- Starting server processes
- Stopping servers gracefully
- Monitoring process status
- Managing process lifecycle
"""

import logging
import subprocess
import time
import os
import signal
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
from threading import Lock
from dataclasses import dataclass
from enum import Enum

import psutil

logger = logging.getLogger('phoenix.server')


class ServerState(Enum):
    """Possible server states."""
    STOPPED = 'stopped'
    STARTING = 'starting'
    RUNNING = 'running'
    STOPPING = 'stopping'
    ERROR = 'error'


@dataclass
class ServerProcess:
    """Represents a running server process."""
    server_id: str
    process: subprocess.Popen
    pid: int
    started_at: float
    config: Dict[str, Any]


class ServerManager:
    """
    Manages game server processes.
    
    Handles:
    - Starting server executables
    - Stopping servers gracefully
    - Tracking running processes
    - Monitoring process health
    """
    
    def __init__(self, local_config: Dict[str, Any]):
        """
        Initialize the server manager.
        
        Args:
            local_config: Local server configurations from agent-config.json.
        """
        self.local_config = local_config.get('servers', {})
        self.remote_config: Dict[str, Any] = {}  # Configs from Firebase
        self.running_servers: Dict[str, ServerProcess] = {}
        self._lock = Lock()
        
        logger.info(f'Server Manager initialized with {len(self.local_config)} local server configs')
    
    def update_remote_configs(self, configs: Dict[str, Any]):
        """
        Update server configurations from Firebase.
        
        Args:
            configs: Server configurations from Firebase.
        """
        if configs and isinstance(configs, dict):
            new_servers = set(configs.keys()) - set(self.remote_config.keys())
            self.remote_config = configs
            
            if new_servers:
                logger.info(f'Loaded {len(new_servers)} new server config(s) from cloud: {", ".join(new_servers)}')
            
            logger.debug(f'Remote configs updated: {len(self.remote_config)} servers')
    
    def get_all_server_ids(self) -> list:
        """Get all known server IDs (local + remote)."""
        return list(set(self.local_config.keys()) | set(self.remote_config.keys()))
    
    def get_server_config(self, server_id: str) -> Optional[Dict[str, Any]]:
        """
        Get configuration for a server (checks remote first, then local).
        
        Args:
            server_id: The server ID.
            
        Returns:
            Server configuration or None if not found.
        """
        # Remote config takes priority (user-added via web panel)
        if server_id in self.remote_config:
            return self.remote_config[server_id]
        return self.local_config.get(server_id)
    
    def setup_server(self, server_id: str, config: Optional[Dict[str, Any]] = None) -> Tuple[bool, str]:
        """
        Set up a game server by creating directory and start script.
        
        Args:
            server_id: The server ID.
            config: Server configuration.
            
        Returns:
            Tuple of (success, message).
        """
        server_config = config or self.get_server_config(server_id)
        if not server_config:
            return False, f'No configuration found for server: {server_id}'
        
        try:
            # Get paths from config
            executable_path = Path(server_config.get('executablePath', ''))
            working_dir = Path(server_config.get('workingDirectory', executable_path.parent if executable_path else ''))
            game_type = server_config.get('gameType', 'minecraft').lower()
            server_name = server_config.get('name', server_id)
            
            if not working_dir:
                return False, 'No working directory specified in configuration'
            
            # Create working directory if it doesn't exist
            working_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f'Created server directory: {working_dir}')
            
            # Generate start script based on game type
            script_content = self._generate_start_script(game_type, server_config)
            
            # Determine script filename
            if os.name == 'nt':
                script_name = 'start-server.bat'
            else:
                script_name = 'start-server.sh'
            
            script_path = working_dir / script_name
            
            # Write the script
            with open(script_path, 'w', newline='\n' if os.name != 'nt' else '\r\n') as f:
                f.write(script_content)
            
            # Make executable on Linux/Mac
            if os.name != 'nt':
                script_path.chmod(0o755)
            
            logger.info(f'Created start script: {script_path}')
            
            # Update the config with the actual executable path
            if server_id in self.remote_config:
                self.remote_config[server_id]['executablePath'] = str(script_path)
            
            return True, f'Server setup complete. Directory: {working_dir}, Script: {script_name}'
            
        except PermissionError as e:
            return False, f'Permission denied creating server files: {e}'
        except Exception as e:
            logger.exception(f'Error setting up server {server_id}')
            return False, f'Failed to set up server: {str(e)}'
    
    def _generate_start_script(self, game_type: str, config: Dict[str, Any]) -> str:
        """
        Generate a start script for the given game type.
        
        Args:
            game_type: Type of game server (minecraft, hytale, terraria, etc.)
            config: Server configuration.
            
        Returns:
            Script content as string.
        """
        is_windows = os.name == 'nt'
        arguments = config.get('arguments', [])
        args_str = ' '.join(arguments) if arguments else ''
        
        if game_type == 'minecraft':
            # Minecraft Java server
            java_args = args_str or '-Xmx2G -Xms1G'
            if is_windows:
                return f'''@echo off
title Minecraft Server
echo Starting Minecraft Server...
java {java_args} -jar server.jar nogui
pause
'''
            else:
                return f'''#!/bin/bash
echo "Starting Minecraft Server..."
java {java_args} -jar server.jar nogui
'''
        
        elif game_type == 'hytale':
            # Hytale dedicated server
            if is_windows:
                return '''@echo off
title Hytale Server
echo Starting Hytale Dedicated Server...
if exist "HytaleServer.exe" (
    HytaleServer.exe
) else (
    echo ERROR: HytaleServer.exe not found!
    echo Please download the Hytale dedicated server files.
    pause
)
'''
            else:
                return '''#!/bin/bash
echo "Starting Hytale Dedicated Server..."
if [ -f "./HytaleServer" ]; then
    ./HytaleServer
else
    echo "ERROR: HytaleServer not found!"
    echo "Please download the Hytale dedicated server files."
fi
'''
        
        elif game_type == 'terraria':
            # Terraria server
            if is_windows:
                return '''@echo off
title Terraria Server
echo Starting Terraria Server...
if exist "TerrariaServer.exe" (
    TerrariaServer.exe -config serverconfig.txt
) else (
    echo ERROR: TerrariaServer.exe not found!
    pause
)
'''
            else:
                return '''#!/bin/bash
echo "Starting Terraria Server..."
if [ -f "./TerrariaServer" ]; then
    ./TerrariaServer -config serverconfig.txt
else
    echo "ERROR: TerrariaServer not found!"
fi
'''
        
        elif game_type == 'valheim':
            # Valheim dedicated server
            if is_windows:
                return '''@echo off
title Valheim Server
echo Starting Valheim Dedicated Server...
set SteamAppId=892970
valheim_server.exe -nographics -batchmode -name "My Server" -port 2456 -world "Dedicated" -password "secret"
'''
            else:
                return '''#!/bin/bash
echo "Starting Valheim Dedicated Server..."
export SteamAppId=892970
./valheim_server.x86_64 -nographics -batchmode -name "My Server" -port 2456 -world "Dedicated" -password "secret"
'''
        
        else:
            # Generic server
            if is_windows:
                return f'''@echo off
title {config.get('name', 'Game Server')}
echo Starting server...
echo NOTE: Edit this script to launch your specific game server.
echo Working directory: %CD%
pause
'''
            else:
                return f'''#!/bin/bash
echo "Starting server..."
echo "NOTE: Edit this script to launch your specific game server."
echo "Working directory: $(pwd)"
'''
    
    def start_server(self, server_id: str, config: Optional[Dict[str, Any]] = None) -> Tuple[bool, str, Optional[int]]:
        """
        Start a game server.
        
        Args:
            server_id: The server ID.
            config: Server configuration (uses local config if not provided).
            
        Returns:
            Tuple of (success, message, pid).
        """
        with self._lock:
            # Check if already running
            if server_id in self.running_servers:
                proc = self.running_servers[server_id]
                if self._is_process_running(proc.pid):
                    return False, f'Server is already running (PID: {proc.pid})', proc.pid
                else:
                    # Clean up stale entry
                    del self.running_servers[server_id]
            
            # Get configuration
            server_config = config or self.get_server_config(server_id)
            if not server_config:
                return False, f'No configuration found for server: {server_id}', None
            
            # Validate configuration
            valid, error = self._validate_config(server_config)
            if not valid:
                return False, error, None
            
            try:
                # Get paths
                executable = Path(server_config['executablePath'])
                working_dir = Path(server_config.get('workingDirectory', executable.parent))
                arguments = server_config.get('arguments', [])
                
                # Verify executable exists
                if not executable.exists():
                    return False, f'Executable not found: {executable}', None
                
                # Verify working directory exists
                if not working_dir.exists():
                    return False, f'Working directory not found: {working_dir}', None
                
                logger.info(f'Starting server {server_id}: {executable}')
                
                # Build command
                cmd = [str(executable)] + arguments
                
                # Start process
                # Use CREATE_NEW_CONSOLE on Windows for game servers
                creation_flags = 0
                if os.name == 'nt':
                    creation_flags = subprocess.CREATE_NEW_CONSOLE
                
                process = subprocess.Popen(
                    cmd,
                    cwd=str(working_dir),
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    creationflags=creation_flags,
                    shell=False  # SECURITY: Never use shell=True
                )
                
                # Wait briefly to check if process started successfully
                time.sleep(1)
                
                if process.poll() is not None:
                    # Process exited immediately
                    stdout, stderr = process.communicate(timeout=5)
                    error_msg = stderr.decode('utf-8', errors='replace') if stderr else 'Unknown error'
                    return False, f'Server exited immediately: {error_msg}', None
                
                # Store process info
                self.running_servers[server_id] = ServerProcess(
                    server_id=server_id,
                    process=process,
                    pid=process.pid,
                    started_at=time.time(),
                    config=server_config
                )
                
                logger.info(f'✅ Server {server_id} started with PID {process.pid}')
                return True, f'Server started successfully', process.pid
                
            except FileNotFoundError as e:
                return False, f'Executable not found: {e}', None
            except PermissionError as e:
                return False, f'Permission denied: {e}', None
            except Exception as e:
                logger.exception(f'Error starting server {server_id}')
                return False, f'Failed to start server: {str(e)}', None
    
    def stop_server(self, server_id: str, config: Optional[Dict[str, Any]] = None) -> Tuple[bool, str]:
        """
        Stop a game server gracefully.
        
        Args:
            server_id: The server ID.
            config: Server configuration (uses stored config if not provided).
            
        Returns:
            Tuple of (success, message).
        """
        with self._lock:
            # Get running server
            server_proc = self.running_servers.get(server_id)
            
            if not server_proc:
                # Check if process is running by name
                config = config or self.get_server_config(server_id)
                if config and 'processName' in config:
                    killed = self._kill_by_name(config['processName'])
                    if killed:
                        return True, 'Server stopped (found by process name)'
                return False, 'Server is not running', 
            
            try:
                # Get stop configuration
                stop_timeout = server_proc.config.get('stopTimeout', 30)
                stop_command = server_proc.config.get('stopCommand')
                
                logger.info(f'Stopping server {server_id} (PID: {server_proc.pid})')
                
                # Try graceful shutdown first
                if stop_command and server_proc.process.stdin:
                    try:
                        # Send stop command to stdin
                        server_proc.process.stdin.write(f'{stop_command}\n'.encode())
                        server_proc.process.stdin.flush()
                        logger.debug(f'Sent stop command: {stop_command}')
                    except Exception as e:
                        logger.warning(f'Could not send stop command: {e}')
                
                # Wait for graceful shutdown
                try:
                    server_proc.process.wait(timeout=stop_timeout)
                    del self.running_servers[server_id]
                    logger.info(f'✅ Server {server_id} stopped gracefully')
                    return True, 'Server stopped gracefully'
                except subprocess.TimeoutExpired:
                    pass  # Will force kill
                
                # Force kill if still running
                logger.warning(f'Server {server_id} did not stop gracefully, force killing...')
                self._force_kill(server_proc.pid)
                
                # Clean up
                del self.running_servers[server_id]
                
                logger.info(f'✅ Server {server_id} force stopped')
                return True, 'Server force stopped after timeout'
                
            except Exception as e:
                logger.exception(f'Error stopping server {server_id}')
                return False, f'Failed to stop server: {str(e)}'
    
    def restart_server(self, server_id: str, config: Optional[Dict[str, Any]] = None) -> Tuple[bool, str, Optional[int]]:
        """
        Restart a game server.
        
        Args:
            server_id: The server ID.
            config: Server configuration.
            
        Returns:
            Tuple of (success, message, new_pid).
        """
        logger.info(f'Restarting server {server_id}')
        
        # Stop the server
        stop_success, stop_msg = self.stop_server(server_id, config)
        if not stop_success and 'not running' not in stop_msg.lower():
            return False, f'Failed to stop server for restart: {stop_msg}', None
        
        # Brief pause before restart
        time.sleep(2)
        
        # Start the server
        start_success, start_msg, pid = self.start_server(server_id, config)
        
        if start_success:
            return True, 'Server restarted successfully', pid
        else:
            return False, f'Failed to restart: {start_msg}', None
    
    def get_server_status(self, server_id: str) -> Tuple[ServerState, Optional[int], str]:
        """
        Get the current status of a server.
        
        Args:
            server_id: The server ID.
            
        Returns:
            Tuple of (state, pid, message).
        """
        server_proc = self.running_servers.get(server_id)
        
        if not server_proc:
            # Check by process name
            config = self.get_server_config(server_id)
            if config and 'processName' in config:
                pid = self._find_by_name(config['processName'])
                if pid:
                    return ServerState.RUNNING, pid, 'Running (found by process name)'
            return ServerState.STOPPED, None, 'Server is not running'
        
        # Check if process is still running
        if self._is_process_running(server_proc.pid):
            uptime = int(time.time() - server_proc.started_at)
            return ServerState.RUNNING, server_proc.pid, f'Running for {uptime}s'
        else:
            # Process died unexpectedly
            del self.running_servers[server_id]
            return ServerState.ERROR, None, 'Server process terminated unexpectedly'
    
    def sync_all_status(self) -> Dict[str, Tuple[ServerState, Optional[int], str]]:
        """
        Sync status for all known servers.
        
        Returns:
            Dictionary of server_id -> (state, pid, message).
        """
        results = {}
        
        # Check all running servers
        dead_servers = []
        for server_id, server_proc in self.running_servers.items():
            if not self._is_process_running(server_proc.pid):
                dead_servers.append(server_id)
                results[server_id] = (ServerState.ERROR, None, 'Process terminated')
            else:
                uptime = int(time.time() - server_proc.started_at)
                results[server_id] = (ServerState.RUNNING, server_proc.pid, f'Running for {uptime}s')
        
        # Clean up dead servers
        for server_id in dead_servers:
            del self.running_servers[server_id]
        
        return results
    
    def _validate_config(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        """Validate server configuration."""
        if not config.get('executablePath'):
            return False, 'Missing executablePath in configuration'
        return True, ''
    
    def _is_process_running(self, pid: int) -> bool:
        """Check if a process with given PID is running."""
        try:
            process = psutil.Process(pid)
            return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
        except psutil.NoSuchProcess:
            return False
        except Exception:
            return False
    
    def _force_kill(self, pid: int):
        """Force kill a process and its children."""
        try:
            parent = psutil.Process(pid)
            children = parent.children(recursive=True)
            
            # Kill children first
            for child in children:
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            
            # Kill parent
            parent.kill()
            parent.wait(timeout=5)
            
        except psutil.NoSuchProcess:
            pass
        except Exception as e:
            logger.warning(f'Error force killing PID {pid}: {e}')
    
    def _kill_by_name(self, process_name: str) -> bool:
        """Kill processes by name."""
        killed = False
        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'] == process_name:
                    proc.kill()
                    killed = True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return killed
    
    def _find_by_name(self, process_name: str) -> Optional[int]:
        """Find a process by name."""
        for proc in psutil.process_iter(['name', 'pid']):
            try:
                if proc.info['name'] == process_name:
                    return proc.info['pid']
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return None
    
    def cleanup(self):
        """Clean up all managed servers on shutdown."""
        logger.info('Cleaning up server manager...')
        # Note: We don't stop servers on agent shutdown
        # They should continue running independently
        self.running_servers.clear()
