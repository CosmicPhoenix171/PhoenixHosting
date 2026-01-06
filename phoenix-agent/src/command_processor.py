"""
Phoenix Agent - Command Processor Module

Handles command validation and execution including:
- Validating command structure and permissions
- Executing commands on servers
- Managing command lifecycle
- Rate limiting and spam protection
"""

import logging
import time
from typing import Dict, Any, Optional, Tuple, Set
from threading import Lock
from dataclasses import dataclass
from collections import defaultdict

from .server_manager import ServerManager, ServerState
from .firebase_client import FirebaseClient
from .logger import security_logger

logger = logging.getLogger('phoenix.command')


# Valid actions that can be executed
VALID_ACTIONS = {'start', 'stop', 'restart'}

# Maximum age of a command to process (in seconds)
MAX_COMMAND_AGE = 300  # 5 minutes

# Rate limiting: max commands per server per minute
MAX_COMMANDS_PER_MINUTE = 10


@dataclass
class CommandResult:
    """Result of command processing."""
    success: bool
    message: str
    pid: Optional[int] = None


class CommandProcessor:
    """
    Processes commands from Firebase.
    
    Handles:
    - Command validation
    - Rate limiting
    - Command execution
    - Result reporting
    """
    
    def __init__(
        self, 
        server_manager: ServerManager, 
        firebase_client: FirebaseClient,
        config: Dict[str, Any]
    ):
        """
        Initialize the command processor.
        
        Args:
            server_manager: Server manager instance.
            firebase_client: Firebase client instance.
            config: Agent configuration.
        """
        self.server_manager = server_manager
        self.firebase_client = firebase_client
        self.config = config.get('agent', {})
        
        self._lock = Lock()
        self._processed_commands: Set[str] = set()
        self._command_history: Dict[str, list] = defaultdict(list)
        
        # Configuration
        self.command_expiry = self.config.get('commandExpirySeconds', MAX_COMMAND_AGE)
        self.max_commands_per_minute = MAX_COMMANDS_PER_MINUTE
        
        logger.info('Command Processor initialized')
    
    def process_command(self, command: Dict[str, Any]) -> CommandResult:
        """
        Process a command from Firebase.
        
        Args:
            command: The command data from Firebase.
            
        Returns:
            CommandResult indicating success/failure.
        """
        command_id = command.get('id', 'unknown')
        
        with self._lock:
            # Check if already processed
            if command_id in self._processed_commands:
                logger.debug(f'Skipping already processed command: {command_id}')
                return CommandResult(False, 'Command already processed')
            
            # Mark as being processed
            self._processed_commands.add(command_id)
        
        try:
            # Update command status to processing
            self.firebase_client.update_command_status(command_id, 'processing')
            
            # Validate command
            valid, error = self._validate_command(command)
            if not valid:
                logger.warning(f'Command {command_id} validation failed: {error}')
                security_logger.log_invalid_command(command_id, error)
                self.firebase_client.update_command_status(
                    command_id, 'failed', error=error
                )
                return CommandResult(False, error)
            
            # Check rate limiting
            server_id = command['serverId']
            if not self._check_rate_limit(server_id):
                error = 'Rate limit exceeded. Please wait before sending more commands.'
                logger.warning(f'Rate limit exceeded for server {server_id}')
                self.firebase_client.update_command_status(
                    command_id, 'failed', error=error
                )
                return CommandResult(False, error)
            
            # Execute command
            result = self._execute_command(command)
            
            # Update command status
            if result.success:
                self.firebase_client.update_command_status(
                    command_id, 'completed', result=result.message
                )
                security_logger.log_command_attempt(
                    command_id, command['action'], server_id,
                    command.get('requestedBy', 'unknown'), True
                )
            else:
                self.firebase_client.update_command_status(
                    command_id, 'failed', error=result.message
                )
                security_logger.log_command_attempt(
                    command_id, command['action'], server_id,
                    command.get('requestedBy', 'unknown'), False, result.message
                )
            
            # Update server status
            self._update_server_status(server_id, command['action'], result)
            
            return result
            
        except Exception as e:
            logger.exception(f'Error processing command {command_id}')
            self.firebase_client.update_command_status(
                command_id, 'failed', error=str(e)
            )
            return CommandResult(False, f'Internal error: {str(e)}')
    
    def _validate_command(self, command: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Validate a command.
        
        Args:
            command: The command to validate.
            
        Returns:
            Tuple of (is_valid, error_message).
        """
        # Check required fields
        required_fields = ['id', 'serverId', 'action', 'requestedBy', 'requestedAt']
        for field in required_fields:
            if field not in command:
                return False, f'Missing required field: {field}'
        
        # Validate action
        action = command['action']
        if action not in VALID_ACTIONS:
            return False, f'Invalid action: {action}. Must be one of: {", ".join(VALID_ACTIONS)}'
        
        # Validate command age
        requested_at = command.get('requestedAt', 0)
        if isinstance(requested_at, (int, float)):
            # Convert from JS timestamp (milliseconds) to seconds
            age_seconds = (time.time() * 1000 - requested_at) / 1000
            if age_seconds > self.command_expiry:
                return False, f'Command expired (age: {int(age_seconds)}s, max: {self.command_expiry}s)'
        
        # Validate server exists in local config
        server_id = command['serverId']
        server_config = self.server_manager.get_server_config(server_id)
        if not server_config:
            return False, f'Unknown server: {server_id}. Server must be configured in agent-config.json'
        
        return True, ''
    
    def _check_rate_limit(self, server_id: str) -> bool:
        """
        Check if command is within rate limits.
        
        Args:
            server_id: The server ID.
            
        Returns:
            True if within limits.
        """
        now = time.time()
        one_minute_ago = now - 60
        
        # Clean old entries
        self._command_history[server_id] = [
            ts for ts in self._command_history[server_id]
            if ts > one_minute_ago
        ]
        
        # Check limit
        if len(self._command_history[server_id]) >= self.max_commands_per_minute:
            return False
        
        # Record this command
        self._command_history[server_id].append(now)
        return True
    
    def _execute_command(self, command: Dict[str, Any]) -> CommandResult:
        """
        Execute a validated command.
        
        Args:
            command: The validated command.
            
        Returns:
            CommandResult with execution result.
        """
        action = command['action']
        server_id = command['serverId']
        server_config = self.server_manager.get_server_config(server_id)
        
        logger.info(f'Executing {action} on server {server_id}')
        
        if action == 'start':
            success, message, pid = self.server_manager.start_server(server_id, server_config)
            return CommandResult(success, message, pid)
        
        elif action == 'stop':
            success, message = self.server_manager.stop_server(server_id, server_config)
            return CommandResult(success, message)
        
        elif action == 'restart':
            success, message, pid = self.server_manager.restart_server(server_id, server_config)
            return CommandResult(success, message, pid)
        
        else:
            return CommandResult(False, f'Unknown action: {action}')
    
    def _update_server_status(self, server_id: str, action: str, result: CommandResult):
        """
        Update server status in Firebase after command execution.
        
        Args:
            server_id: The server ID.
            action: The action that was executed.
            result: The command result.
        """
        try:
            if result.success:
                if action == 'start' or action == 'restart':
                    self.firebase_client.update_server_status(
                        server_id, 'running', result.message, result.pid
                    )
                elif action == 'stop':
                    self.firebase_client.update_server_status(
                        server_id, 'stopped', result.message
                    )
            else:
                # Get current state
                state, pid, message = self.server_manager.get_server_status(server_id)
                self.firebase_client.update_server_status(
                    server_id, state.value, f'Command failed: {result.message}', pid
                )
        except Exception as e:
            logger.error(f'Failed to update server status: {e}')
    
    def cleanup_old_commands(self):
        """Clean up old processed command IDs to prevent memory growth."""
        # Keep last 1000 command IDs
        max_history = 1000
        if len(self._processed_commands) > max_history:
            # Convert to list, sort would require timestamps which we don't have
            # Just remove random older entries
            excess = len(self._processed_commands) - max_history
            for _ in range(excess):
                self._processed_commands.pop()
