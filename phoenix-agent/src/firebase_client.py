"""
Phoenix Agent - Firebase Client Module

Handles all communication with Firebase including:
- Authentication using service account
- Real-time command listening
- Status updates
- Heartbeat management
"""

import logging
import time
import socket
from typing import Dict, Any, Optional, Callable
from threading import Thread, Event
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, db
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger('phoenix.firebase')


class FirebaseClient:
    """
    Client for Firebase Realtime Database communication.
    
    Handles:
    - Secure authentication via service account
    - Real-time listeners for commands
    - Server status updates
    - Agent heartbeat
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Firebase client.
        
        Args:
            config: Configuration dictionary containing Firebase settings.
        """
        self.config = config
        self.firebase_config = config.get('firebase', {})
        self.agent_config = config.get('agent', {})
        
        self._app: Optional[firebase_admin.App] = None
        self._connected = False
        self._command_listener = None
        self._heartbeat_thread: Optional[Thread] = None
        self._stop_event = Event()
        
        # Callbacks
        self._on_command_callback: Optional[Callable] = None
        
    @property
    def is_connected(self) -> bool:
        """Check if connected to Firebase."""
        return self._connected
    
    def connect(self) -> bool:
        """
        Connect to Firebase using service account credentials.
        
        Returns:
            True if connection successful.
            
        Raises:
            FileNotFoundError: If service account file not found.
            ValueError: If credentials are invalid.
        """
        logger.info('Connecting to Firebase...')
        
        # Get service account path
        sa_path = self.firebase_config.get('serviceAccountPath')
        if not sa_path:
            raise ValueError('Service account path not configured')
        
        sa_path = Path(sa_path)
        if not sa_path.exists():
            raise FileNotFoundError(
                f'Service account file not found: {sa_path}\n'
                'Please download your service account key from Firebase Console.'
            )
        
        # Get database URL
        db_url = self.firebase_config.get('databaseURL')
        if not db_url:
            raise ValueError('Database URL not configured')
        
        try:
            # Initialize Firebase Admin SDK
            cred = credentials.Certificate(str(sa_path))
            self._app = firebase_admin.initialize_app(cred, {
                'databaseURL': db_url
            })
            
            # Test connection by reading a value
            test_ref = db.reference('agent/status')
            test_ref.get()  # This will fail if connection issues
            
            self._connected = True
            logger.info('✅ Connected to Firebase successfully')
            
            # Update initial status
            self._update_agent_status(online=True)
            
            return True
            
        except Exception as e:
            logger.error(f'❌ Failed to connect to Firebase: {e}')
            self._connected = False
            raise
    
    def disconnect(self):
        """Disconnect from Firebase and cleanup resources."""
        logger.info('Disconnecting from Firebase...')
        
        # Stop heartbeat
        self._stop_event.set()
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            self._heartbeat_thread.join(timeout=5)
        
        # Remove command listener
        if self._command_listener:
            self._command_listener.close()
            self._command_listener = None
        
        # Update status to offline
        try:
            self._update_agent_status(online=False)
        except Exception:
            pass  # Best effort
        
        # Delete Firebase app
        if self._app:
            try:
                firebase_admin.delete_app(self._app)
            except Exception:
                pass
            self._app = None
        
        self._connected = False
        logger.info('Disconnected from Firebase')
    
    def start_command_listener(self, callback: Callable[[Dict[str, Any]], None]):
        """
        Start listening for new commands.
        
        Args:
            callback: Function to call when a new command is received.
        """
        self._on_command_callback = callback
        
        def handle_commands(event):
            """Handle command events from Firebase."""
            if event.event_type == 'put' and event.data:
                # Handle both single command and multiple commands
                data = event.data
                
                if isinstance(data, dict):
                    # Check if this is a single command or multiple
                    if 'action' in data:
                        # Single command
                        self._process_command(event.path.strip('/'), data)
                    else:
                        # Multiple commands
                        for cmd_id, cmd_data in data.items():
                            if isinstance(cmd_data, dict) and cmd_data.get('status') == 'pending':
                                self._process_command(cmd_id, cmd_data)
        
        # Start listening to commands path
        commands_ref = db.reference('commands')
        self._command_listener = commands_ref.listen(handle_commands)
        
        logger.info('👂 Listening for commands...')
    
    def _process_command(self, command_id: str, command_data: Dict[str, Any]):
        """
        Process a command from Firebase.
        
        Args:
            command_id: The command ID.
            command_data: The command data.
        """
        # Only process pending commands
        if command_data.get('status') != 'pending':
            return
        
        # Add ID to command data
        command_data['id'] = command_id
        
        logger.info(f'📥 Received command: {command_id}')
        
        # Call the callback
        if self._on_command_callback:
            try:
                self._on_command_callback(command_data)
            except Exception as e:
                logger.error(f'Error processing command {command_id}: {e}')
    
    def start_heartbeat(self):
        """Start the heartbeat thread to keep agent status updated."""
        interval = self.agent_config.get('heartbeatInterval', 30)
        
        def heartbeat_loop():
            while not self._stop_event.is_set():
                try:
                    self._update_agent_status(online=True)
                except Exception as e:
                    logger.warning(f'Heartbeat failed: {e}')
                
                # Wait for interval or stop event
                self._stop_event.wait(interval)
        
        self._heartbeat_thread = Thread(target=heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        logger.info(f'💓 Heartbeat started (every {interval}s)')
    
    def _update_agent_status(self, online: bool):
        """
        Update agent status in Firebase.
        
        Args:
            online: Whether the agent is online.
        """
        status_ref = db.reference('agent/status')
        status_ref.set({
            'online': online,
            'lastHeartbeat': int(time.time() * 1000),  # JS timestamp
            'version': '1.0.0',
            'hostname': socket.gethostname()
        })
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(Exception)
    )
    def update_command_status(
        self, 
        command_id: str, 
        status: str, 
        result: Optional[str] = None,
        error: Optional[str] = None
    ):
        """
        Update the status of a command.
        
        Args:
            command_id: The command ID.
            status: New status (processing/completed/failed).
            result: Success result message.
            error: Error message if failed.
        """
        command_ref = db.reference(f'commands/{command_id}')
        
        update_data = {
            'status': status,
            'processedAt': int(time.time() * 1000)
        }
        
        if result:
            update_data['result'] = result
        if error:
            update_data['error'] = error
        
        command_ref.update(update_data)
        logger.debug(f'Updated command {command_id} status to {status}')
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(Exception)
    )
    def update_server_status(
        self, 
        server_id: str, 
        state: str, 
        message: str = '',
        pid: Optional[int] = None
    ):
        """
        Update a server's status in Firebase.
        
        Args:
            server_id: The server ID.
            state: Server state (stopped/starting/running/stopping/error).
            message: Status message.
            pid: Process ID if running.
        """
        status_ref = db.reference(f'servers/{server_id}/status')
        
        status_data = {
            'state': state,
            'lastUpdated': int(time.time() * 1000),
            'message': message
        }
        
        if pid is not None:
            status_data['pid'] = pid
        
        status_ref.set(status_data)
        logger.info(f'📊 Server {server_id} status: {state}')
    
    def get_server_config(self, server_id: str) -> Optional[Dict[str, Any]]:
        """
        Get server configuration from Firebase.
        
        Args:
            server_id: The server ID.
            
        Returns:
            Server configuration or None if not found.
        """
        try:
            server_ref = db.reference(f'servers/{server_id}')
            return server_ref.get()
        except Exception as e:
            logger.error(f'Error fetching server config: {e}')
            return None
