"""
Phoenix Agent - Logging Module

Configures structured logging with rotation and multiple handlers.
"""

import logging
import logging.handlers
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional


def setup_logging(
    level: str = 'INFO',
    log_dir: Optional[str] = None,
    max_size_mb: int = 10,
    backup_count: int = 5
) -> logging.Logger:
    """
    Configure logging for the Phoenix Agent.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: Directory for log files. If None, uses default.
        max_size_mb: Maximum size of each log file in MB.
        backup_count: Number of backup log files to keep.
        
    Returns:
        Configured logger instance.
    """
    # Determine log directory
    if log_dir is None:
        base_dir = Path(__file__).parent.parent
        log_dir = base_dir / 'logs'
    else:
        log_dir = Path(log_dir)
    
    # Create log directory if it doesn't exist
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Get the root phoenix logger
    logger = logging.getLogger('phoenix')
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    
    # Clear any existing handlers
    logger.handlers.clear()
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    simple_formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%H:%M:%S'
    )
    
    # Console handler (simple format)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(simple_formatter)
    logger.addHandler(console_handler)
    
    # Main log file (rotating)
    main_log_path = log_dir / 'agent.log'
    file_handler = logging.handlers.RotatingFileHandler(
        main_log_path,
        maxBytes=max_size_mb * 1024 * 1024,
        backupCount=backup_count,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(detailed_formatter)
    logger.addHandler(file_handler)
    
    # Error log file (errors only)
    error_log_path = log_dir / 'errors.log'
    error_handler = logging.handlers.RotatingFileHandler(
        error_log_path,
        maxBytes=max_size_mb * 1024 * 1024,
        backupCount=backup_count,
        encoding='utf-8'
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(detailed_formatter)
    logger.addHandler(error_handler)
    
    # Commands log file (command-specific logging)
    commands_log_path = log_dir / 'commands.log'
    commands_handler = logging.handlers.RotatingFileHandler(
        commands_log_path,
        maxBytes=max_size_mb * 1024 * 1024,
        backupCount=backup_count,
        encoding='utf-8'
    )
    commands_handler.setLevel(logging.INFO)
    commands_handler.setFormatter(detailed_formatter)
    commands_handler.addFilter(CommandLogFilter())
    logger.addHandler(commands_handler)
    
    # Log startup info
    logger.info(f'Logging initialized - Level: {level}, Directory: {log_dir}')
    
    return logger


class CommandLogFilter(logging.Filter):
    """Filter that only allows command-related log messages."""
    
    def filter(self, record: logging.LogRecord) -> bool:
        """
        Check if this log record is command-related.
        
        Args:
            record: The log record to check.
            
        Returns:
            True if the record should be logged.
        """
        # Log messages from command processor or containing 'command'
        return (
            'command' in record.name.lower() or 
            'command' in record.getMessage().lower()
        )


def get_logger(name: str) -> logging.Logger:
    """
    Get a child logger with the given name.
    
    Args:
        name: Name for the child logger.
        
    Returns:
        Logger instance.
    """
    return logging.getLogger(f'phoenix.{name}')


class SecurityLogger:
    """Special logger for security-related events."""
    
    def __init__(self):
        """Initialize the security logger."""
        self.logger = get_logger('security')
        
        # Create security log file
        base_dir = Path(__file__).parent.parent
        log_dir = base_dir / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        
        security_log_path = log_dir / 'security.log'
        handler = logging.handlers.RotatingFileHandler(
            security_log_path,
            maxBytes=10 * 1024 * 1024,
            backupCount=10,
            encoding='utf-8'
        )
        handler.setFormatter(logging.Formatter(
            '[%(asctime)s] [SECURITY] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
        self.logger.addHandler(handler)
    
    def log_command_attempt(self, command_id: str, action: str, server_id: str, 
                           user_id: str, success: bool, reason: str = ''):
        """Log a command attempt."""
        status = 'SUCCESS' if success else 'BLOCKED'
        self.logger.warning(
            f'{status} | Command: {command_id} | Action: {action} | '
            f'Server: {server_id} | User: {user_id} | Reason: {reason}'
        )
    
    def log_invalid_command(self, command_id: str, reason: str):
        """Log an invalid command."""
        self.logger.warning(f'INVALID_COMMAND | ID: {command_id} | Reason: {reason}')
    
    def log_connection_event(self, event: str, details: str = ''):
        """Log a connection event."""
        self.logger.info(f'CONNECTION | {event} | {details}')


# Create global security logger instance
security_logger = SecurityLogger()
