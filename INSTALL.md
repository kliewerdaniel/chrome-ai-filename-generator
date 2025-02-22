# Installation Instructions

## 1. Install Prerequisites

1. Install Node.js if not already installed
2. Install Ollama from [ollama.ai](https://ollama.ai)
3. Install the LLaVa model:
   ```bash
   ollama pull llava
   ```

## 2. Start Required Services

1. Start the Ollama server:
   ```bash
   ollama serve
   ```

2. Start the CORS proxy server:
   ```bash
   cd api
   npm install  # Only needed first time
   node proxy.js
   ```

## 3. Install Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the extension directory
4. The extension should connect to Ollama automatically

## 4. Use the Extension

1. Right-click on any image
2. Select "Save with AI-generated filename" or "Generate filename (with preview)"
3. The image will be saved with an AI-generated filename

## Troubleshooting

1. Ensure Ollama is running:
   ```bash
   # Check Ollama status
   ollama list
   
   # If not running, start it
   ollama serve
   ```

2. Check Chrome's extension error console (chrome://extensions)

3. Common issues:
   - "Cannot connect to Ollama": Make sure both Ollama and the proxy server are running
   - "LLaVa model not found": Run `ollama pull llava`
   - "Failed to fetch image": Check if the image URL is accessible
   - "CORS error": Ensure the proxy server is running on port 11435
