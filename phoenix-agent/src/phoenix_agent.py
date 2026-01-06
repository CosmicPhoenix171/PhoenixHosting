"""
Phoenix Agent - Main Agent Class

The main orchestrator class that coordinates all components:
- Firebase communication
- Command processing
- Server management
- Status synchronization
"""

import logging
import time
import signal
from typing import Dict, Any, Optional
from threading import Thread, Event

from .firebase_client import FirebaseClient
from .server_manager import ServerManager
from .command_processor import CommandProcessor
from .logger import get_logger, security_logger

logger = get_logger('agent')


class PhoenixAgent:
    """
    Main Phoenix Agent class.
    
    Orchestrates all agent components and manages the main run loop.
    """
    
    VERSION = '1.0.0'
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Phoenix Agent.
        
        Args:
            config: Configuration dictionary.
        """
        self.config = config
        self._running = False
        self._stop_event = Event()
        
        # Initialize components
        logger.info('Initializing Phoenix Agent components...')
        
        self.firebase = FirebaseClient(config)
        self.server_manager = ServerManager(config)
        self.command_processor = CommandProcessor(
            self.server_manager, 
            self.firebase,
            config
        )
        
        # Status sync interval
        self.status_sync_interval = config.get('agent', {}).get('statusSyncInterval', 60)
        
        logger.info('Phoenix Agent initialized')
    
    def run(self):
        """
        Start the agent and run the main loop.
        
        This method blocks until the agent is stopped.
        """
        logger.info(f'🔥 Phoenix Agent v{self.VERSION} starting...')
        
        try:
            # Connect to Firebase
            self.firebase.connect()
            
            # Start heartbeat
            self.firebase.start_heartbeat()
            
            # Start command listener
            self.firebase.start_command_listener(self._handle_command)
            
            # Start status sync thread
            self._start_status_sync()
            
            # Log successful start
            security_logger.log_connection_event('STARTED', f'Version {self.VERSION}')
            logger.info('✅ Phoenix Agent is running')
            logger.info('Press Ctrl+C to stop')
            
            self._running = True
            
            # Main loop - just wait for stop signal
            while not self._stop_event.is_set():
                self._stop_event.wait(1)
            
        except KeyboardInterrupt:
            logger.info('Keyboard interrupt received')
        except Exception as e:
            logger.exception(f'Fatal error in agent: {e}')
            raise
        finally:
            self.stop()
    
    def stop(self):
        """Stop the agent gracefully."""
        if not self._running:
            return
        
        logger.info('Stopping Phoenix Agent...')
        self._running = False
        self._stop_event.set()
        
        # Disconnect from Firebase
        try:
            self.firebase.disconnect()
        except Exception as e:
            logger.warning(f'Error disconnecting from Firebase: {e}')
        
        # Cleanup server manager
        try:
            self.server_manager.cleanup()
        except Exception as e:
            logger.warning(f'Error cleaning up server manager: {e}')
        
        security_logger.log_connection_event('STOPPED', 'Agent shutdown complete')
        logger.info('Phoenix Agent stopped')
    
    def _handle_command(self, command: Dict[str, Any]):
        """
        Handle a command received from Firebase.
        
        Args:
            command: The command data.
        """
        command_id = command.get('id', 'unknown')
        action = command.get('action', 'unknown')
        server_id = command.get('serverId', 'unknown')
        
        logger.info(f'📥 Processing command: {action} on {server_id} (ID: {command_id})')
        
        try:
            result = self.command_processor.process_command(command)
            
            if result.success:
                logger.info(f'✅ Command {command_id} completed: {result.message}')
            else:
                logger.warning(f'❌ Command {command_id} failed: {result.message}')
                
        except Exception as e:
            logger.exception(f'Error handling command {command_id}: {e}')
    
    def _start_status_sync(self):
        """Start the periodic status synchronization thread."""
        
        def sync_loop():
            while not self._stop_event.is_set():
                try:
                    self._sync_server_status()
                except Exception as e:
                    logger.error(f'Error in status sync: {e}')
                
                self._stop_event.wait(self.status_sync_interval)
        
        sync_thread = Thread(target=sync_loop, daemon=True)
        sync_thread.start()
        logger.debug(f'Status sync started (every {self.status_sync_interval}s)')
    
    def _sync_server_status(self):
        """Synchronize status for all servers."""
        statuses = self.server_manager.sync_all_status()
        
        for server_id, (state, pid, message) in statuses.items():
            try:
                self.firebase.update_server_status(
                    server_id, state.value, message, pid
                )
            except Exception as e:
                logger.warning(f'Failed to sync status for {server_id}: {e}')
        
        # Cleanup old command history
        self.command_processor.cleanup_old_commands()
