"""
Phoenix Agent - Configuration Module

Handles loading and validating configuration from JSON files.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional


def get_config_path() -> Path:
    """Get the default configuration file path."""
    # Check environment variable first
    env_path = os.environ.get('PHOENIX_CONFIG')
    if env_path:
        return Path(env_path)
    
    # Default to config directory relative to agent.py
    base_dir = Path(__file__).parent.parent
    return base_dir / 'config' / 'agent-config.json'


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load configuration from a JSON file.
    
    Args:
        config_path: Path to the configuration file. If None, uses default.
        
    Returns:
        Dictionary containing configuration.
        
    Raises:
        FileNotFoundError: If config file doesn't exist.
        json.JSONDecodeError: If config file is invalid JSON.
        ValueError: If config is missing required fields.
    """
    path = Path(config_path) if config_path else get_config_path()
    
    if not path.exists():
        raise FileNotFoundError(f'Configuration file not found: {path}')
    
    with open(path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    # Validate required fields
    validate_config(config)
    
    # Resolve relative paths
    config = resolve_paths(config, path.parent)
    
    return config


def validate_config(config: Dict[str, Any]) -> None:
    """
    Validate that configuration has all required fields.
    
    Args:
        config: Configuration dictionary.
        
    Raises:
        ValueError: If required fields are missing.
    """
    required_fields = [
        ('firebase', 'Firebase configuration'),
        ('firebase.serviceAccountPath', 'Firebase service account path'),
        ('firebase.databaseURL', 'Firebase database URL'),
    ]
    
    for field, description in required_fields:
        parts = field.split('.')
        value = config
        for part in parts:
            if not isinstance(value, dict) or part not in value:
                raise ValueError(f'Missing required configuration: {description} ({field})')
            value = value[part]
    
    # Validate database URL format
    db_url = config['firebase']['databaseURL']
    if 'YOUR_PROJECT_ID' in db_url:
        raise ValueError(
            'Firebase database URL not configured. '
            'Please update config/agent-config.json with your Firebase project URL.'
        )


def resolve_paths(config: Dict[str, Any], base_dir: Path) -> Dict[str, Any]:
    """
    Resolve relative paths in configuration to absolute paths.
    
    Args:
        config: Configuration dictionary.
        base_dir: Base directory for resolving relative paths.
        
    Returns:
        Configuration with resolved paths.
    """
    # Resolve service account path
    if 'firebase' in config and 'serviceAccountPath' in config['firebase']:
        sa_path = Path(config['firebase']['serviceAccountPath'])
        if not sa_path.is_absolute():
            config['firebase']['serviceAccountPath'] = str(base_dir / sa_path)
    
    return config


def get_server_config(config: Dict[str, Any], server_id: str) -> Optional[Dict[str, Any]]:
    """
    Get configuration for a specific server.
    
    Args:
        config: Main configuration dictionary.
        server_id: The server ID to look up.
        
    Returns:
        Server configuration dict or None if not found.
    """
    servers = config.get('servers', {})
    return servers.get(server_id)


def validate_server_config(server_config: Dict[str, Any]) -> bool:
    """
    Validate that a server configuration has required fields.
    
    Args:
        server_config: Server configuration dictionary.
        
    Returns:
        True if valid, False otherwise.
    """
    required = ['executablePath', 'workingDirectory']
    return all(field in server_config for field in required)
