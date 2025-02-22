// service-worker.js
const OLLAMA_ENDPOINT = "http://localhost:11435/api/generate";

// Proxy Manager implementation
class ProxyManager {
    constructor() {
        this.isRunning = false;
        this.proxyUrl = 'http://localhost:11435';
        this.ollamaUrl = 'http://localhost:11434';
    }

    async startProxy() {
        if (!this.isRunning) {
            try {
                // First check if proxy server is running
                const proxyCheck = await fetch(`${this.proxyUrl}/api/version`).catch(() => null);
                
                if (!proxyCheck) {
                    console.log('Attempting to start proxy server...');
                    try {
                        // First try native messaging
                        await this.startViaNativeMessaging();
                    } catch (nativeError) {
                        console.log('Native messaging failed, trying direct start...', nativeError);
                        await this.startDirectProxy();
                    }
                }
                
                this.isRunning = true;
            } catch (error) {
                console.error('Proxy startup failed:', error);
                throw new Error(`Could not establish connection: ${error.message}`);
            }
        }
    }

    async startViaNativeMessaging() {
        const startResponse = await chrome.runtime.sendMessage({ 
            action: 'startProxy' 
        });
        
        if (startResponse.error) {
            throw new Error('Native messaging failed: ' + startResponse.error);
        }

        await this.waitForProxyStart();
    }

    async startDirectProxy() {
        try {
            // Try alternative method - execute via native host
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendNativeMessage('com.ollama.proxy',
                    { 
                        command: 'execute',
                        script: 'cors-proxy.js'
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (!response || response.error) {
                            reject(new Error(response?.error || 'No response from proxy'));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });

            // If we got a successful response, wait for the proxy to be available
            if (response.success) {
                await this.waitForProxyStart();
                return true;
            }
            
            throw new Error('Failed to get success response from proxy');
        } catch (error) {
            throw new Error(`Direct proxy start failed: ${error.message}`);
        }
    }

    async waitForProxyStart(retries = 10, delay = 500) {
        for (let i = 0; i < retries; i++) {
            try {
                const check = await fetch(`${this.proxyUrl}/api/version`);
                if (check.ok) {
                    console.log('Proxy server is now running');
                    return true;
                }
            } catch (e) {
                console.log(`Waiting for proxy server (attempt ${i + 1}/${retries})...`);
            }
            await new Promise(r => setTimeout(r, delay));
        }
        throw new Error('Proxy server did not start within expected time');
    }

    async stopProxy() {
        if (this.isRunning) {
            this.isRunning = false;
            console.log('Proxy stopped');
        }
    }

    isProxyRunning() {
        return this.isRunning;
    }

    async proxyFetch(url, options = {}) {
        if (!this.isRunning) {
            await this.startProxy().catch(() => {});
        }

        try {
            // Parse and reconstruct the URL
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            const proxyUrl = new URL(path, this.proxyUrl).toString();
            
            console.log('Making request to proxy:', proxyUrl);
            
            const enhancedOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Content-Length': options.body?.length.toString()
                },
                mode: 'cors',
                credentials: 'omit'
            };

            const response = await fetch(proxyUrl, enhancedOptions);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Proxy response error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });

                // Only mark proxy as not running for connection issues
                if (response.status === 502 || response.status === 503 || response.status === 504) {
                    this.isRunning = false;
                }

                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText || response.statusText}`);
            }
            
            return response;
        } catch (error) {
            console.error('Proxy fetch error:', {
                url: url,
                error: error.message,
                stack: error.stack
            });

            // Only mark proxy as not running for connection issues
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                this.isRunning = false;
                throw new Error('Lost connection to proxy server. Please ensure both proxy and Ollama are running.');
            }

            throw error;
        }
    }
}

const proxyManager = new ProxyManager();

// Initialize on startup
initialize().catch(error => {
    console.error('Failed to initialize on startup:', error);
});

// Improved native messaging handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startProxy') {
        chrome.runtime.sendNativeMessage('com.ollama.proxy',
            { 
                command: 'start',
                path: chrome.runtime.getURL('api/cors-proxy.js')
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Native messaging error:', chrome.runtime.lastError);
                    const errorMsg = chrome.runtime.lastError.message;
                    if (errorMsg.includes('native messaging host not found')) {
                        sendResponse({ 
                            error: 'Native messaging host not found. Please ensure you ran install.sh and restarted Chrome.' 
                        });
                    } else {
                        sendResponse({ error: errorMsg });
                    }
                } else if (!response) {
                    sendResponse({ 
                        error: 'No response from native messaging host. Please check if the proxy is installed correctly.' 
                    });
                } else {
                    sendResponse(response);
                }
            }
        );
        return true; // Keep message channel open
    }
    // ... existing handlers
});

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
        // Get and validate base64 image data
        let imageData;
        try {
            imageData = await fetchImageAsBase64(imageUrl);
            
            // Validate base64 data
            if (!imageData || typeof imageData !== 'string') {
                throw new Error('Invalid image data received');
            }
            
            // Check if it's actually base64 encoded
            try {
                atob(imageData);
            } catch (e) {
                throw new Error('Invalid base64 encoding');
            }
            
        } catch (error) {
            throw new Error(`Failed to fetch image: ${error.message}. Please make sure the image URL is accessible and the image format is supported.`);
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
                model: 'llava',
                prompt: prompt,
                images: [imageData],
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    num_ctx: 4096 // Increase context window
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
            try {
                const errorData = JSON.parse(errorText);
                if (response.status === 404) {
                    errorMessage = 'LLaVa model not found. Please run: ollama pull llava';
                } else if (response.status === 500) {
                    if (errorData.error?.includes('unable to make llava embedding from image')) {
                        errorMessage = 'Failed to process image. Please ensure the image is valid and try again.';
                    } else if (errorData.error?.includes('failed to create new sequence')) {
                        errorMessage = 'LLaVa model not loaded properly. Please run: ollama pull llava';
                    } else {
                        errorMessage = `Ollama server error: ${errorData.error}. Please check if Ollama is running correctly.`;
                    }
                } else if (response.status === 403) {
                    errorMessage = 'Access forbidden. Please check Ollama permissions and CORS settings.';
                } else {
                    errorMessage = `Failed to generate filename (Status ${response.status}): ${errorData.error || 'Unknown error'}`;
                }
            } catch (parseError) {
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
        throw error; // Preserve the original error message
    }
}

// Enhanced Ollama status check with comprehensive diagnostics
async function checkOllamaStatus() {
    const checks = {
        direct: false,
        proxy: false,
        model: false
    };
    
    try {
        // First check direct connection
        try {
            const directCheck = await fetch('http://localhost:11434/api/version');
            if (directCheck.ok) {
                checks.direct = true;
            }
        } catch (directError) {
            console.log('Direct connection failed:', directError);
        }

        // Then check proxy connection
        try {
            const proxyCheck = await proxyManager.proxyFetch('http://localhost:11434/api/version');
            if (proxyCheck.ok) {
                checks.proxy = true;
            }
        } catch (proxyError) {
            console.log('Proxy connection failed:', proxyError);
        }

        // If neither connection method works
        if (!checks.direct && !checks.proxy) {
            return {
                status: 'error',
                message: 'Cannot connect to Ollama directly or via proxy. Please ensure Ollama is running: ollama serve'
            };
        }

        // Check LLaVa model availability
        const modelCheckOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llava',
                prompt: 'test',
                stream: false
            })
        };

        try {
            const modelCheck = await (checks.proxy 
                ? proxyManager.proxyFetch(OLLAMA_ENDPOINT, modelCheckOptions)
                : fetch(OLLAMA_ENDPOINT, modelCheckOptions));

            if (modelCheck.ok) {
                checks.model = true;
                return {
                    status: 'ok',
                    message: 'Ollama is running and LLaVa model is available',
                    checks
                };
            }

            if (modelCheck.status === 404) {
                return {
                    status: 'error',
                    message: 'LLaVa model not found. Please run: ollama pull llava',
                    checks
                };
            }

            const errorData = await modelCheck.text();
            return {
                status: 'error',
                message: `Ollama model error: ${errorData || modelCheck.statusText}`,
                checks
            };
        } catch (modelError) {
            return {
                status: 'error',
                message: 'Failed to check LLaVa model. Please verify Ollama installation.',
                checks
            };
        }
    } catch (error) {
        return {
            status: 'error',
            message: `Connection check failed: ${error.message}`,
            checks
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
            reader.onloadend = () => {
                const base64Data = reader.result.split(',')[1];
                // Check if image data is too large (>10MB)
                if (base64Data.length > 10 * 1024 * 1024) {
                    reject(new Error('Image is too large. Please use an image under 10MB.'));
                    return;
                }
                resolve(base64Data);
            };
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
