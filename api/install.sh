#!/bin/bash

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Make scripts executable
chmod +x "$SCRIPT_DIR/proxy-host.js"
chmod +x "$SCRIPT_DIR/cors-proxy.js"

# Create native messaging host manifest directory if it doesn't exist
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi

mkdir -p "$MANIFEST_DIR"

# Update manifest path to point to the proxy host script
MANIFEST_CONTENT=$(cat "$SCRIPT_DIR/com.ollama.proxy.json" | sed "s|\"path\": \"proxy-host.js\"|\"path\": \"$SCRIPT_DIR/proxy-host.js\"|")

# Write updated manifest to the correct location
echo "$MANIFEST_CONTENT" > "$MANIFEST_DIR/com.ollama.proxy.json"

# Install Node.js dependencies
cd "$SCRIPT_DIR"
npm install express cors node-fetch @modelcontextprotocol/sdk

echo "Native messaging host installed successfully!"
