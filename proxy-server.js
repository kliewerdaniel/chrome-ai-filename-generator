// proxy-server.js
export class ProxyServer {
    constructor() {
        this.server = null;
    }

    async start() {
        // Create a local server
        this.server = await chrome.system.network.createTCPServer({
            address: '127.0.0.1',
            port: 11435,
            backlog: 5
        });

        // Handle incoming connections
        this.server.onAccept.addListener(async (info) => {
            const socket = info.clientSocket;
            
            // Read request
            const data = await this.readSocket(socket);
            const request = this.parseRequest(data);

            // Forward to Ollama
            const response = await fetch('http://localhost:11434' + request.path, {
                method: request.method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: request.body
            });

            // Send response with CORS headers
            const responseBody = await response.text();
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            };

            const responseText = [
                'HTTP/1.1 ' + response.status + ' ' + response.statusText,
                ...Object.entries(corsHeaders).map(([k, v]) => `${k}: ${v}`),
                '',
                responseBody
            ].join('\r\n');

            await this.writeSocket(socket, responseText);
            socket.disconnect();
        });

        // Start listening
        await this.server.listen();
        console.log('Proxy server started on port 11435');
    }

    async stop() {
        if (this.server) {
            await this.server.disconnect();
            this.server = null;
            console.log('Proxy server stopped');
        }
    }

    async readSocket(socket) {
        return new Promise((resolve, reject) => {
            let data = '';
            socket.onData.addListener((info) => {
                data += new TextDecoder().decode(info.data);
                if (data.includes('\r\n\r\n')) {
                    resolve(data);
                }
            });
            socket.onError.addListener(reject);
        });
    }

    async writeSocket(socket, data) {
        return new Promise((resolve, reject) => {
            socket.write(new TextEncoder().encode(data), resolve);
            socket.onError.addListener(reject);
        });
    }

    parseRequest(data) {
        const [headers, body] = data.split('\r\n\r\n');
        const [firstLine, ...headerLines] = headers.split('\r\n');
        const [method, path] = firstLine.split(' ');
        return { method, path, body };
    }
}
