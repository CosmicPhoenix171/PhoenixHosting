"""
Phoenix Agent - Firebase REST Client

Simplified Firebase client that uses REST API instead of Admin SDK.
This allows users to connect without needing their own service account.
Uses a pairing code system for authentication.
"""

import json
import logging
import time
import random
import string
import socket
import requests
from typing import Dict, Any, Optional, Callable
from threading import Thread, Event
from pathlib import Path

logger = logging.getLogger('phoenix.firebase')

# Phoenix Hosting Firebase Configuration (shared)
FIREBASE_CONFIG = {
    "apiKey": "AIzaSyCR6FUIy404UPYNSVV8zZ6CpYGUFewcFjk",
    "authDomain": "server-14376.firebaseapp.com",
    "databaseURL": "https://server-14376-default-rtdb.firebaseio.com",
    "projectId": "server-14376"
}


class FirebaseRESTClient:
    """
    Simplified Firebase client using REST API.
    
    No service account needed - uses pairing code authentication.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize the Firebase REST client."""
        self.config = config
        self.agent_config = config.get('agent', {})
        
        self.database_url = FIREBASE_CONFIG['databaseURL']
        self.api_key = FIREBASE_CONFIG['apiKey']
        
        self._connected = False
        self._stop_event = Event()
        self._heartbeat_thread: Optional[Thread] = None
        self._command_thread: Optional[Thread] = None
        self._on_command_callback: Optional[Callable] = None
        
        # Agent identity
        self.agent_id = self._get_or_create_agent_id()
        self.pairing_code = None
        self.user_id = None
        self.auth_token = None
        
        # Load saved pairing if exists
        self._load_pairing()
    
    def _get_or_create_agent_id(self) -> str:
        """Get or create a unique agent ID."""
        config_path = Path('config/agent-identity.json')
        
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    data = json.load(f)
                    return data.get('agent_id', self._generate_agent_id())
            except Exception:
                pass
        
        # Generate new ID
        agent_id = self._generate_agent_id()
        
        # Save it
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, 'w') as f:
            json.dump({'agent_id': agent_id}, f)
        
        return agent_id
    
    def _generate_agent_id(self) -> str:
        """Generate a unique agent ID."""
        hostname = socket.gethostname()[:10].lower().replace(' ', '-')
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"{hostname}-{suffix}"
    
    def _generate_pairing_code(self) -> str:
        """Generate a 6-character pairing code."""
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    def _load_pairing(self):
        """Load saved pairing information."""
        pairing_path = Path('config/pairing.json')
        if pairing_path.exists():
            try:
                with open(pairing_path, 'r') as f:
                    data = json.load(f)
                    self.user_id = data.get('user_id')
                    self.auth_token = data.get('auth_token')
                    logger.info(f'Loaded existing pairing for user: {self.user_id}')
            except Exception as e:
                logger.warning(f'Failed to load pairing: {e}')
    
    def _save_pairing(self):
        """Save pairing information."""
        pairing_path = Path('config/pairing.json')
        pairing_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(pairing_path, 'w') as f:
            json.dump({
                'user_id': self.user_id,
                'auth_token': self.auth_token
            }, f)
    
    def _db_request(self, path: str, method: str = 'GET', data: Any = None) -> Any:
        """Make a request to Firebase Realtime Database REST API."""
        url = f"{self.database_url}/{path}.json"
        
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, headers=headers, json=data, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, headers=headers, json=data, timeout=10)
            elif method == 'POST':
                response = requests.post(url, headers=headers, json=data, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                raise ValueError(f'Unknown method: {method}')
            
            response.raise_for_status()
            return response.json() if response.text else None
            
        except requests.exceptions.RequestException as e:
            logger.error(f'Database request failed: {e}')
            raise
    
    @property
    def is_connected(self) -> bool:
        """Check if connected to Firebase."""
        return self._connected
    
    def connect(self) -> bool:
        """
        Connect to Firebase.
        
        If not paired, generates a pairing code for user to enter in panel.
        If paired, connects and starts listening for commands.
        """
        logger.info('Connecting to Firebase...')
        
        try:
            # Test connection
            self._db_request('ping', 'PUT', {'time': int(time.time())})
            logger.info('✅ Connected to Firebase')
            
            if self.user_id:
                # Already paired - register agent
                self._register_agent()
                self._connected = True
                return True
            else:
                # Need pairing - create pairing request
                self.pairing_code = self._generate_pairing_code()
                self._create_pairing_request()
                self._connected = True
                
                print('\n' + '='*60)
                print('🔗 PAIRING REQUIRED')
                print('='*60)
                print(f'\n   Your pairing code is: {self.pairing_code}')
                print(f'\n   1. Go to the Phoenix Panel')
                print(f'   2. Click "Add Agent"') 
                print(f'   3. Enter this code: {self.pairing_code}')
                print('\n' + '='*60 + '\n')
                
                # Start waiting for pairing
                self._start_pairing_listener()
                return True
                
        except Exception as e:
            logger.error(f'❌ Failed to connect: {e}')
            self._connected = False
            raise
    
    def _create_pairing_request(self):
        """Create a pairing request in the database."""
        hostname = socket.gethostname()
        
        pairing_data = {
            'agent_id': self.agent_id,
            'code': self.pairing_code,
            'hostname': hostname,
            'created_at': int(time.time() * 1000),
            'status': 'pending'
        }
        
        self._db_request(f'pairing_requests/{self.pairing_code}', 'PUT', pairing_data)
        logger.info(f'Created pairing request with code: {self.pairing_code}')
    
    def _start_pairing_listener(self):
        """Start listening for pairing completion."""
        def check_pairing():
            while not self._stop_event.is_set():
                try:
                    data = self._db_request(f'pairing_requests/{self.pairing_code}')
                    
                    if data and data.get('status') == 'paired':
                        self.user_id = data.get('user_id')
                        self.auth_token = data.get('auth_token')
                        self._save_pairing()
                        
                        # Clean up pairing request
                        self._db_request(f'pairing_requests/{self.pairing_code}', 'DELETE')
                        
                        print('\n✅ Successfully paired!')
                        print(f'   Connected to user: {data.get("user_email", self.user_id)}')
                        print('\n')
                        
                        # Register agent with user
                        self._register_agent()
                        return
                        
                except Exception as e:
                    logger.debug(f'Pairing check error: {e}')
                
                time.sleep(2)
        
        thread = Thread(target=check_pairing, daemon=True)
        thread.start()
    
    def _register_agent(self):
        """Register this agent with the user's account."""
        hostname = socket.gethostname()
        
        agent_data = {
            'agent_id': self.agent_id,
            'hostname': hostname,
            'user_id': self.user_id,
            'online': True,
            'last_seen': int(time.time() * 1000),
            'servers': self._get_server_list()
        }
        
        self._db_request(f'agents/{self.agent_id}', 'PUT', agent_data)
        
        # Also register under user's agents list
        self._db_request(f'users/{self.user_id}/agents/{self.agent_id}', 'PUT', {
            'agent_id': self.agent_id,
            'hostname': hostname,
            'added_at': int(time.time() * 1000)
        })
        
        logger.info(f'Registered agent: {self.agent_id}')
    
    def _get_server_list(self) -> Dict[str, Any]:
        """Get list of configured servers."""
        servers = {}
        for server_id, server_config in self.config.get('servers', {}).items():
            servers[server_id] = {
                'name': server_config.get('name', server_id),
                'gameType': server_config.get('gameType', 'unknown'),
                'status': 'stopped'
            }
        return servers
    
    def disconnect(self):
        """Disconnect from Firebase."""
        logger.info('Disconnecting from Firebase...')
        self._stop_event.set()
        
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            self._heartbeat_thread.join(timeout=5)
        
        if self._command_thread and self._command_thread.is_alive():
            self._command_thread.join(timeout=5)
        
        # Update status to offline
        try:
            if self.user_id:
                self._db_request(f'agents/{self.agent_id}/online', 'PUT', False)
        except Exception:
            pass
        
        self._connected = False
        logger.info('Disconnected from Firebase')
    
    def start_command_listener(self, callback: Callable[[Dict[str, Any]], None]):
        """Start listening for commands."""
        self._on_command_callback = callback
        
        def poll_commands():
            last_processed = 0
            
            while not self._stop_event.is_set():
                try:
                    if not self.user_id:
                        time.sleep(2)
                        continue
                    
                    # Get pending commands for this agent
                    commands = self._db_request(f'agents/{self.agent_id}/commands')
                    
                    if commands:
                        for cmd_id, cmd_data in commands.items():
                            if isinstance(cmd_data, dict) and cmd_data.get('status') == 'pending':
                                # Process command
                                cmd_data['id'] = cmd_id
                                if self._on_command_callback:
                                    self._on_command_callback(cmd_data)
                                
                                # Mark as processing
                                self._db_request(
                                    f'agents/{self.agent_id}/commands/{cmd_id}/status',
                                    'PUT',
                                    'processing'
                                )
                    
                except Exception as e:
                    logger.debug(f'Command poll error: {e}')
                
                time.sleep(1)
        
        self._command_thread = Thread(target=poll_commands, daemon=True)
        self._command_thread.start()
        logger.info('Started command listener')
    
    def start_heartbeat(self):
        """Start the heartbeat thread."""
        interval = self.agent_config.get('heartbeatInterval', 30)
        
        def heartbeat_loop():
            while not self._stop_event.is_set():
                try:
                    if self.user_id:
                        self._db_request(f'agents/{self.agent_id}', 'PATCH', {
                            'online': True,
                            'last_seen': int(time.time() * 1000)
                        })
                except Exception as e:
                    logger.debug(f'Heartbeat error: {e}')
                
                self._stop_event.wait(interval)
        
        self._heartbeat_thread = Thread(target=heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        logger.info(f'Started heartbeat (interval: {interval}s)')
    
    def update_server_status(self, server_id: str, status: str, details: Optional[Dict] = None):
        """Update a server's status in Firebase."""
        try:
            update_data = {
                'status': status,
                'updated_at': int(time.time() * 1000)
            }
            if details:
                update_data.update(details)
            
            self._db_request(f'agents/{self.agent_id}/servers/{server_id}', 'PATCH', update_data)
            
        except Exception as e:
            logger.error(f'Failed to update server status: {e}')
    
    def update_command_status(self, command_id: str, status: str, result: Optional[Dict] = None):
        """Update a command's status."""
        try:
            update_data = {
                'status': status,
                'completed_at': int(time.time() * 1000)
            }
            if result:
                update_data['result'] = result
            
            self._db_request(f'agents/{self.agent_id}/commands/{command_id}', 'PATCH', update_data)
            
        except Exception as e:
            logger.error(f'Failed to update command status: {e}')
