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
                    throw new Error('Proxy server not running. Please start it with: cd api && node cors-proxy.js');
                }

                // Then check if Ollama is accessible directly
                const ollamaCheck = await fetch(`${this.ollamaUrl}/api/version`).catch(() => null);
                if (!ollamaCheck) {
                    throw new Error('Cannot connect to Ollama. Please ensure it is running.');
                }

                this.isRunning = true;
                console.log('Connected to Ollama');
            } catch (error) {
                console.error('Failed to connect:', error);
                throw error;
            }
        }
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
                    'Accept': 'application/json'
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
