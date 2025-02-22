#!/bin/bash

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create nginx configuration
cat > "$SCRIPT_DIR/ollama.conf" << 'EOL'
server {
    listen 11435;
    
    location / {
        proxy_pass http://localhost:11434;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
        
        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Content-Type';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}
EOL

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "nginx not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install nginx
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo apt-get update
        sudo apt-get install -y nginx
    fi
fi

# Create nginx sites directory if it doesn't exist
NGINX_SITES_DIR="$HOME/.config/nginx/sites"
mkdir -p "$NGINX_SITES_DIR"

# Copy configuration
cp "$SCRIPT_DIR/ollama.conf" "$NGINX_SITES_DIR/"

# Create nginx configuration to include our site
cat > "$HOME/.config/nginx/nginx.conf" << EOL
worker_processes 1;
events {
    worker_connections 1024;
}
http {
    include mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    include sites/*.conf;
}
EOL

# Start nginx
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    brew services restart nginx
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    sudo systemctl restart nginx
fi

echo "CORS proxy setup complete! Ollama API is now available at http://localhost:11435"
