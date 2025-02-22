// service-worker.js
import { proxyManager } from './proxy-manager.js';

const OLLAMA_ENDPOINT = "http://localhost:11435/api/generate";

// Create context menu items
function createContextMenus() {
    // Remove existing items
    chrome.contextMenus.removeAll();

    // Create new items
    const menuItems = [
        {
            id: "aiSaveImage",
            title: "Save with AI-generated filename",
            contexts: ["image"]
        },
        {
            id: "aiSaveImagePreview",
            title: "Generate filename (with preview)",
            contexts: ["image"]
        }
    ];

    menuItems.forEach(item => {
        try {
            chrome.contextMenus.create(item);
        } catch (error) {
            console.error(`Failed to create menu item ${item.id}:`, error);
        }
    });
}

// Initialize extension
async function initialize() {
    try {
        // Try to start proxy
        await proxyManager.startProxy();
    } catch (error) {
        console.error('Failed to initialize proxy:', error);
        showNotification('Proxy Error', error.message);
    }
}

// Create menus and initialize on install
chrome.runtime.onInstalled.addListener(async () => {
    createContextMenus();
    await initialize();
});

// Re-initialize when service worker starts
initialize().catch(error => {
    console.error('Failed to initialize service worker:', error);
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        if (info.menuItemId === "aiSaveImage") {
            // Direct save without preview
            const filename = await generateFilename(info.srcUrl);
            await downloadImage(info.srcUrl, filename);
        } else if (info.menuItemId === "aiSaveImagePreview") {
            // Save URL for popup preview
            chrome.storage.local.set({ imageUrl: info.srcUrl }, () => {
                showNotification('AI Filename Generator', 'Click the extension icon to preview and customize the filename.');
            });
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error', error.message || 'Failed to process image');
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request.action);
    
    if (request.action === 'analyzeImage') {
        generateFilename(request.imageUrl)
            .then(filename => sendResponse({ filename }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    } else if (request.action === 'checkOllama') {
        checkOllamaStatus()
            .then(status => sendResponse(status))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    } else if (request.action === 'startProxy') {
        proxyManager.startProxy()
            .then(() => {
                console.log('Proxy started successfully');
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('Error starting proxy:', error);
                sendResponse({ error: error.message });
            });
        return true;
    } else if (request.action === 'stopProxy') {
        proxyManager.stopProxy()
            .then(() => {
                console.log('Proxy stopped successfully');
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('Error stopping proxy:', error);
                sendResponse({ error: error.message });
            });
        return true;
    } else if (request.action === 'getProxyStatus') {
        const status = proxyManager.isProxyRunning();
        console.log('Current proxy status:', status);
        sendResponse({ isRunning: status });
        return true;
    }
});

// Enable declarativeNetRequest rules
chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: ["ruleset_1"]
});

// Generate filename using Ollama
async function generateFilename(imageUrl) {
    try {
        // Get base64 image data
        let imageData;
        try {
            imageData = await fetchImageAsBase64(imageUrl);
        } catch (error) {
            throw new Error(`Failed to fetch image: ${error.message}. Please make sure the image URL is accessible.`);
        }

        // Prepare prompt
        const prompt = `Analyze this image and generate a descriptive filename that captures the main subject and context. 
        Requirements:
        1. Be specific but concise (3-5 words max)
        2. Include main subject and any relevant context (location, action, color)
        3. Use underscores between words
        4. No file extension
        5. Only lowercase letters, numbers, and underscores
        
        Examples:
        - red_rose_garden
        - mountain_sunset_colorado
        - black_cat_sleeping
        - vintage_car_show
        
        Generate filename:`;

        // Send to Ollama with improved error handling
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llava:latest',
                prompt: prompt,
                images: [imageData],
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9
                }
            })
        };

        const response = await (proxyManager.isProxyRunning()
            ? proxyManager.proxyFetch(OLLAMA_ENDPOINT, requestOptions)
            : fetch(OLLAMA_ENDPOINT, requestOptions));

        if (!response.ok) {
            // Enhanced error logging
            console.error('Ollama response:', response);
            console.error('Response headers:', response.headers);
            const errorText = await response.text();
            console.error('Error text:', errorText);
            
            let errorMessage;
            if (response.status === 404) {
                errorMessage = 'LLaVa model not found. Please run: ollama pull llava:latest';
            } else if (response.status === 500) {
                errorMessage = `Ollama server error: ${errorText}. Please check if Ollama is running correctly.`;
            } else if (response.status === 403) {
                errorMessage = 'Access forbidden. Please check Ollama permissions and CORS settings.';
            } else {
                errorMessage = `Failed to generate filename (Status ${response.status}): ${errorText || 'Unknown error'}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (!data.response) {
            throw new Error('Invalid response from Ollama');
        }

        return sanitizeFilename(data.response);
    } catch (error) {
        console.error('Detailed error:', error);
        throw new Error('Failed to connect to Ollama: ' + error.message);
    }
}

// Check Ollama status with improved error handling
async function checkOllamaStatus() {
    try {
        // Check if Ollama is running
        const healthCheck = await (proxyManager.isProxyRunning()
            ? proxyManager.proxyFetch('http://localhost:11434/api/version')
            : fetch('http://localhost:11434/api/version'));
        
        if (!healthCheck.ok) {
            return { 
                status: 'error', 
                message: 'Cannot connect to Ollama. Please ensure it is running.' 
            };
        }

        // Check if LLaVa model is available
        const modelCheckOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llava:latest',
                prompt: 'test',
                stream: false
            })
        };

        const modelCheck = await (proxyManager.isProxyRunning()
            ? proxyManager.proxyFetch(OLLAMA_ENDPOINT, modelCheckOptions)
            : fetch(OLLAMA_ENDPOINT, modelCheckOptions));

        if (modelCheck.ok) {
            return { status: 'ok', message: 'Ollama is running and LLaVa model is available' };
        }

        if (modelCheck.status === 404) {
            return { status: 'error', message: 'LLaVa model not found. Please run: ollama pull llava:latest' };
        }
        
        const errorData = await modelCheck.text();
        return { 
            status: 'error', 
            message: `Ollama error: ${errorData || modelCheck.statusText}. Please ensure the llava model is installed.` 
        };
    } catch (error) {
        return { 
            status: 'error', 
            message: 'Cannot connect to Ollama. Please ensure it is running and accessible.' 
        };
    }
}

// Helper function to fetch image and convert to base64
async function fetchImageAsBase64(imageUrl) {
    try {
        // First try direct fetch
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = () => reject(new Error('Failed to convert image to base64'));
            reader.readAsDataURL(blob);
        });
        
        return base64Data;
    } catch (directFetchError) {
        console.log('Direct fetch failed, trying content script method...');
        
        try {
            // Create a tab to fetch the image
            const tab = await chrome.tabs.create({ 
                url: imageUrl, 
                active: false
            });

            // Wait for tab to fully load
            await new Promise((resolve) => {
                chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                    if (tabId === tab.id && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                });
            });

            // Send message to content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'fetchImage',
                url: imageUrl
            });

            // Close the tab
            await chrome.tabs.remove(tab.id);

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to fetch image');
            }

            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch image: ${error.message}`);
        }
    }
}

// Helper function to sanitize filename
function sanitizeFilename(response) {
    const filename = response
        .trim()
        .toLowerCase()
        .replace(/["']/g, '')
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

    return filename || "descriptive_image";
}

// Helper function to download image
async function downloadImage(url, filename) {
    try {
        await chrome.downloads.download({
            url: url,
            filename: filename + '.jpg',
            conflictAction: 'uniquify'
        });
    } catch (error) {
        throw new Error('Failed to download image: ' + error.message);
    }
}

// Helper function to show notification
function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: message
    });
}
