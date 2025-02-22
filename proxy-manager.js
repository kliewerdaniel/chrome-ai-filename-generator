// proxy-manager.js
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
            // Try to start proxy using native messaging
            const response = await new Promise((resolve, reject) => {
                try {
                    const port = chrome.runtime.connectNative('com.ollama.proxy');
                    let timeoutId;
                    
                    port.onMessage.addListener((message) => {
                        console.log('Proxy message:', message);
                        if (message.success) {
                            clearTimeout(timeoutId);
                            resolve(message);
                        } else if (message.error) {
                            clearTimeout(timeoutId);
                            reject(new Error(message.error));
                        }
                    });
                    
                    port.onDisconnect.addListener(() => {
                        const error = chrome.runtime.lastError;
                        if (error) {
                            console.error('Proxy disconnected:', error);
                            reject(new Error(error.message));
                        }
                    });
                    
                    // Set timeout for response
                    timeoutId = setTimeout(() => {
                        port.disconnect();
                        reject(new Error('Proxy connection timed out'));
                    }, 5000);
                    
                    // Send start command
                    port.postMessage({ 
                        command: 'start',
                        script: 'cors-proxy.js'
                    });
                } catch (err) {
                    reject(err);
                }
            });

            // If we got a successful response, wait for the proxy to be available
            if (response.success) {
                await this.waitForProxyStart();
                return true;
            }
            
            throw new Error('Failed to get success response from proxy');
        } catch (error) {
            console.error('Direct proxy start error:', error);
            
            // Try alternative method - execute via native host
            try {
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
            } catch (nativeError) {
                throw new Error(`Direct proxy start failed: ${error.message}. Native messaging also failed: ${nativeError.message}`);
            }
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
            
            // In the proxyFetch function, add a content-length header
            const enhancedOptions = {
                ...options,
                headers: {
                ...options.headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': options.body?.length.toString() // Add this line
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
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText || response.statusText}`);
            }
            
            return response;
        } catch (error) {
            console.error('Proxy fetch error:', {
                url: url,
                error: error.message,
                stack: error.stack
            });

            this.isRunning = false;
            throw new Error('Lost connection to proxy server. Please ensure both proxy and Ollama are running.');
        }
    }
}

export const proxyManager = new ProxyManager();
