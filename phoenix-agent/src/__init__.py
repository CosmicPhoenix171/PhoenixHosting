"""
Phoenix Agent - Source Package

This package contains the core components of the Phoenix Agent:
- PhoenixAgent: Main agent class orchestrating all operations
- FirebaseClient: Handles all Firebase communication
- ServerManager: Manages game server processes
- CommandProcessor: Validates and executes commands
"""

from .phoenix_agent import PhoenixAgent
from .firebase_client import FirebaseClient
from .server_manager import ServerManager
from .command_processor import CommandProcessor

__version__ = '1.0.0'
__all__ = ['PhoenixAgent', 'FirebaseClient', 'ServerManager', 'CommandProcessor']
