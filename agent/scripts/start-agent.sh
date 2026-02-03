#!/bin/bash
# Hytale Server Agent - Quick Start Script (Linux)
# Run this script to start the agent manually for testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo " Hytale Server Agent - Manual Start"
echo "========================================"
echo ""

cd "$AGENT_DIR"

# Check config
if [ ! -f "config.json" ]; then
    echo "ERROR: config.json not found!"
    echo "Copy config.linux.json.example to config.json and edit it first."
    exit 1
fi

# Check for environment variables
if [ -z "$GITHUB_TOKEN" ]; then
    read -p "Enter GitHub Token: " GITHUB_TOKEN
    export GITHUB_TOKEN
fi

if [ -z "$COMMAND_SECRET" ]; then
    read -p "Enter Command Secret: " COMMAND_SECRET
    export COMMAND_SECRET
fi

if [ -z "$GITHUB_TOKEN" ] || [ -z "$COMMAND_SECRET" ]; then
    echo "ERROR: Both GitHub Token and Command Secret are required"
    exit 1
fi

# Set log level if not set
export LOG_LEVEL="${LOG_LEVEL:-INFO}"
export CONFIG_PATH="${CONFIG_PATH:-$AGENT_DIR/config.json}"

echo "Starting agent..."
echo "Press Ctrl+C to stop"
echo ""

# Run the agent
node agent.js
