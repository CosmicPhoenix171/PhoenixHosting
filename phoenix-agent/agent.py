"""
Phoenix Agent - Main Entry Point

The Phoenix Agent is a Windows service that securely bridges Firebase Cloud
with local game server processes. It listens for commands from the cloud
and executes Start/Stop/Restart operations on game servers.

Usage:
    python agent.py              # Run in foreground (for testing)
    python agent.py --install    # Install as Windows service
    python agent.py --uninstall  # Remove Windows service
"""

import sys
import signal
import argparse
import logging
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from phoenix_agent import PhoenixAgent
from config import load_config, get_config_path
from logger import setup_logging


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Phoenix Agent - Game Server Management Service',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python agent.py                    Run agent in foreground
    python agent.py --config path.json Use custom config file
    python agent.py --debug            Enable debug logging
        """
    )
    
    parser.add_argument(
        '--config', '-c',
        type=str,
        default=None,
        help='Path to configuration file (default: config/agent-config.json)'
    )
    
    parser.add_argument(
        '--debug', '-d',
        action='store_true',
        help='Enable debug logging'
    )
    
    parser.add_argument(
        '--version', '-v',
        action='version',
        version='Phoenix Agent v1.0.0'
    )
    
    return parser.parse_args()


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    logging.info(f'Received signal {signum}, shutting down...')
    raise SystemExit(0)


def main():
    """Main entry point."""
    # Parse arguments
    args = parse_args()
    
    # Determine config path
    config_path = args.config or get_config_path()
    
    # Load configuration
    try:
        config = load_config(config_path)
    except Exception as e:
        print(f'❌ Failed to load configuration: {e}')
        print(f'   Config path: {config_path}')
        print('   Please check your configuration file.')
        sys.exit(1)
    
    # Setup logging
    log_level = 'DEBUG' if args.debug else config.get('agent', {}).get('logLevel', 'INFO')
    setup_logging(log_level)
    
    logger = logging.getLogger('phoenix')
    logger.info('=' * 60)
    logger.info('Phoenix Agent v1.0.0 starting...')
    logger.info('=' * 60)
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Create and run agent
    try:
        agent = PhoenixAgent(config)
        agent.run()
    except KeyboardInterrupt:
        logger.info('Keyboard interrupt received')
    except Exception as e:
        logger.exception(f'Fatal error: {e}')
        sys.exit(1)
    finally:
        logger.info('Phoenix Agent stopped')


if __name__ == '__main__':
    main()
