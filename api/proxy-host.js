#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let proxyProcess = null;

// Function to read messages from Chrome
function readMessage() {
    return new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);
        
        process.stdin.on('readable', () => {
            let chunk;
            while (null !== (chunk = process.stdin.read())) {
                buffer = Buffer.concat([buffer, chunk]);
                
                // Need at least 4 bytes for the message length
                if (buffer.length < 4) continue;
                
                const messageLength = buffer.readUInt32LE(0);
                const totalLength = messageLength + 4;
                
                // Wait for the complete message
                if (buffer.length < totalLength) continue;
                
                const messageBuffer = buffer.slice(4, totalLength);
                buffer = buffer.slice(totalLength); // Keep any remaining data
                
                try {
                    const message = JSON.parse(messageBuffer.toString());
                    resolve(message);
                } catch (error) {
                    reject(new Error('Invalid message format'));
                }
            }
        });
        
        process.stdin.on('end', () => {
            resolve(null);
        });
        
        process.stdin.on('error', (error) => {
            reject(error);
        });
    });
}

// Function to write messages to Chrome
function sendMessage(message) {
    try {
        const json = JSON.stringify(message);
        const buffer = Buffer.from(json);
        
        const header = Buffer.alloc(4);
        header.writeUInt32LE(buffer.length, 0);
        
        process.stdout.write(header);
        process.stdout.write(buffer);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Handle messages from Chrome
async function handleMessage(message) {
    try {
        if (message.command === 'start' || message.command === 'execute') {
            if (proxyProcess) {
                sendMessage({ error: 'Proxy server is already running' });
                return;
            }

            const scriptPath = resolve(__dirname, message.script || 'cors-proxy.js');
            proxyProcess = spawn('node', [scriptPath], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            proxyProcess.stdout.on('data', (data) => {
                console.log(`Proxy stdout: ${data}`);
                sendMessage({ log: data.toString() });
            });

            proxyProcess.stderr.on('data', (data) => {
                console.error(`Proxy stderr: ${data}`);
                sendMessage({ error: data.toString() });
            });

            proxyProcess.on('close', (code) => {
                console.log(`Proxy process exited with code ${code}`);
                proxyProcess = null;
                if (code !== 0) {
                    sendMessage({ error: `Proxy process exited with code ${code}` });
                }
            });

            // Add error handler
            proxyProcess.on('error', (error) => {
                console.error('Failed to start proxy process:', error);
                sendMessage({ error: `Failed to start proxy: ${error.message}` });
                proxyProcess = null;
            });

            // Wait briefly to catch immediate startup errors
            await new Promise(resolve => setTimeout(resolve, 500));

            if (proxyProcess) {
                sendMessage({ success: true });
            }
        } else if (message.command === 'stop') {
            if (proxyProcess) {
                proxyProcess.kill();
                proxyProcess = null;
                sendMessage({ success: true });
            } else {
                sendMessage({ error: 'Proxy server is not running' });
            }
        }
    } catch (error) {
        sendMessage({ error: error.message });
    }
}

// Main loop
async function main() {
    try {
        // Handle command line test flag
        if (process.argv.includes('--test')) {
            console.log('Testing native messaging host...');
            sendMessage({ success: true, message: 'Native messaging host is working' });
            process.exit(0);
        }

        // Process messages in a loop
        while (true) {
            try {
                const message = await readMessage();
                if (!message) break; // End of input
                
                console.log('Received message:', message);
                await handleMessage(message);
            } catch (error) {
                console.error('Error processing message:', error);
                sendMessage({ error: error.message });
            }
        }
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        // Cleanup
        if (proxyProcess) {
            proxyProcess.kill();
        }
    }
}

main();
