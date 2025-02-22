#!/bin/bash

set -e # Exit on any error

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
if ! command_exists node; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command_exists npm; then
    echo "Error: npm is not installed. Please install npm first."
    exit 1
fi

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Setting up native messaging host..."

# Make scripts executable
chmod +x "$SCRIPT_DIR/proxy-host.js"
chmod +x "$SCRIPT_DIR/cors-proxy.js"

# Create native messaging host manifest directory if it doesn't exist
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Try both Chrome and Chromium locations on macOS
    CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    CHROMIUM_MANIFEST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    
    # Create both directories
    mkdir -p "$CHROME_MANIFEST_DIR"
    mkdir -p "$CHROMIUM_MANIFEST_DIR"
    
    # Set permissions
    chmod 755 "$CHROME_MANIFEST_DIR"
    chmod 755 "$CHROMIUM_MANIFEST_DIR"
    
    # Use Chrome directory as primary
    MANIFEST_DIR="$CHROME_MANIFEST_DIR"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux paths
    CHROME_MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    CHROMIUM_MANIFEST_DIR="$HOME/.config/chromium/NativeMessagingHosts"
    
    # Create both directories
    mkdir -p "$CHROME_MANIFEST_DIR"
    mkdir -p "$CHROMIUM_MANIFEST_DIR"
    
    # Set permissions
    chmod 755 "$CHROME_MANIFEST_DIR"
    chmod 755 "$CHROMIUM_MANIFEST_DIR"
    
    # Use Chrome directory as primary
    MANIFEST_DIR="$CHROME_MANIFEST_DIR"
else
    echo "Error: Unsupported operating system"
    exit 1
fi

# Function to install manifest
install_manifest() {
    local dir="$1"
    echo "Installing manifest in $dir..."
    
    # Create manifest with absolute paths
    cat > "$dir/com.ollama.proxy.json" << EOL
{
  "name": "com.ollama.proxy",
  "description": "Native messaging host for Ollama CORS proxy",
  "path": "$SCRIPT_DIR/proxy-host.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://*"
  ]
}
EOL
    
    # Set proper permissions
    chmod 644 "$dir/com.ollama.proxy.json"
    
    # Verify manifest content
    if ! grep -q "\"path\": \"$SCRIPT_DIR/proxy-host.js\"" "$dir/com.ollama.proxy.json"; then
        echo "Error: Manifest file in $dir does not contain correct absolute path"
        return 1
    fi
    
    echo "✅ Manifest installed successfully in $dir"
    return 0
}

# Install manifest in all possible locations
echo "Installing manifest in all possible locations..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    install_manifest "$CHROME_MANIFEST_DIR" || exit 1
    install_manifest "$CHROMIUM_MANIFEST_DIR" || exit 1
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    install_manifest "$CHROME_MANIFEST_DIR" || exit 1
    install_manifest "$CHROMIUM_MANIFEST_DIR" || exit 1
fi

echo "Installing Node.js dependencies..."

# Install Node.js dependencies
cd "$SCRIPT_DIR"
if ! npm install express cors node-fetch @modelcontextprotocol/sdk; then
    echo "Error: Failed to install Node.js dependencies"
    exit 1
fi

# Verify installation
echo "Verifying installation..."

# Check if manifest file exists and is readable
if [ ! -r "$MANIFEST_DIR/com.ollama.proxy.json" ]; then
    echo "Error: Manifest file not found or not readable"
    exit 1
fi

# Check if proxy scripts are executable
if [ ! -x "$SCRIPT_DIR/proxy-host.js" ] || [ ! -x "$SCRIPT_DIR/cors-proxy.js" ]; then
    echo "Error: Proxy scripts are not executable"
    exit 1
fi

# Test proxy host script
echo "Testing proxy host script..."

# Function to test proxy host
test_proxy_host() {
    # Create test message
    TEST_INPUT='{"command":"execute","script":"cors-proxy.js"}'
    TEST_LEN=${#TEST_INPUT}

    # Send test message to proxy host
    (
        # Write message length as 32-bit LE integer
        printf "\\x$(printf %x $TEST_LEN)\\x00\\x00\\x00"
        # Write message content
        printf "%s" "$TEST_INPUT"
    ) | node "$SCRIPT_DIR/proxy-host.js" > /dev/null 2>&1 &
    PROXY_PID=$!

    # Wait for proxy to start
    echo "Waiting for proxy to start..."
    for i in {1..5}; do
        if curl -s http://localhost:11435/api/version > /dev/null; then
            echo "✅ Proxy started successfully"
            kill $PROXY_PID 2>/dev/null
            wait $PROXY_PID 2>/dev/null
            return 0
        fi
        sleep 1
    done

    echo "❌ Failed to start proxy"
    kill $PROXY_PID 2>/dev/null
    wait $PROXY_PID 2>/dev/null
    return 1
}

if ! test_proxy_host; then
    echo "Error: Proxy host test failed"
    exit 1
fi

echo "✅ Native messaging host installed successfully!"
echo "Please restart Chrome for the changes to take effect."
