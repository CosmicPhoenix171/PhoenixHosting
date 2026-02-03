#!/bin/bash
# Hytale Server Agent - Linux Service Installation Script

set -e

SERVICE_NAME="hytale-agent"
INSTALL_DIR="/opt/hytale-server-manager/agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo " Hytale Server Agent - Service Installer"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)"
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Install with: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "ERROR: Node.js 16+ required (current: $NODE_VERSION)"
    exit 1
fi

echo "Node.js version: $(node --version)"

# Create hytale user if doesn't exist
if ! id "hytale" &>/dev/null; then
    echo "Creating hytale user..."
    useradd -r -m -s /bin/bash hytale
fi

# Create installation directory
echo "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"

# Copy agent files
cp "$AGENT_DIR/agent.js" "$INSTALL_DIR/"
cp "$AGENT_DIR/package.json" "$INSTALL_DIR/"

if [ -f "$AGENT_DIR/config.json" ]; then
    cp "$AGENT_DIR/config.json" "$INSTALL_DIR/"
elif [ -f "$AGENT_DIR/config.linux.json.example" ]; then
    cp "$AGENT_DIR/config.linux.json.example" "$INSTALL_DIR/config.json"
fi

# Create .env file for secrets
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "Creating .env file..."
    
    read -p "Enter GitHub Token: " GITHUB_TOKEN
    read -p "Enter Command Secret: " COMMAND_SECRET
    
    cat > "$INSTALL_DIR/.env" << EOF
GITHUB_TOKEN=$GITHUB_TOKEN
COMMAND_SECRET=$COMMAND_SECRET
EOF
    
    chmod 600 "$INSTALL_DIR/.env"
    chown hytale:hytale "$INSTALL_DIR/.env"
fi

# Set permissions
chown -R hytale:hytale "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR"

# Install systemd service
echo "Installing systemd service..."
cp "$SCRIPT_DIR/hytale-agent.service" "$SERVICE_FILE"

# Update paths in service file
sed -i "s|/opt/hytale-server-manager/agent|$INSTALL_DIR|g" "$SERVICE_FILE"

# Reload systemd
systemctl daemon-reload

echo ""
echo "========================================"
echo " Installation Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Edit config: sudo nano $INSTALL_DIR/config.json"
echo "  2. Edit secrets: sudo nano $INSTALL_DIR/.env"
echo "  3. Start service: sudo systemctl start $SERVICE_NAME"
echo "  4. Enable on boot: sudo systemctl enable $SERVICE_NAME"
echo ""
echo "Useful commands:"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart: sudo systemctl restart $SERVICE_NAME"
echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
echo ""

read -p "Start service now? (y/n) " START_NOW
if [ "$START_NOW" = "y" ]; then
    systemctl start "$SERVICE_NAME"
    sleep 2
    systemctl status "$SERVICE_NAME" --no-pager
fi
