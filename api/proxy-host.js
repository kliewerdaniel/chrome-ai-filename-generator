#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let proxyProcess = null;

// Function to read messages from Chrome
function readMessage() {
    const header = Buffer.alloc(4);
    return new Promise((resolve, reject) => {
        process.stdin.read(4, (err, bytes) => {
            if (err) {
                reject(err);
                return;
            }
            if (bytes === null) {
                resolve(null);
                return;
            }
            const size = bytes.readUInt32LE(0);
            process.stdin.read(size, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(JSON.parse(data.toString()));
            });
        });
    });
}

// Function to write messages to Chrome
function sendMessage(message) {
    const json = JSON.stringify(message);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(json.length, 0);
    process.stdout.write(header);
    process.stdout.write(json);
}

// Handle messages from Chrome
async function handleMessage(message) {
    try {
        if (message.command === 'start') {
            if (proxyProcess) {
                sendMessage({ error: 'Proxy server is already running' });
                return;
            }

            const scriptPath = resolve(__dirname, message.script);
            proxyProcess = spawn('node', [scriptPath], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            proxyProcess.stdout.on('data', (data) => {
                console.log(`Proxy stdout: ${data}`);
            });

            proxyProcess.stderr.on('data', (data) => {
                console.error(`Proxy stderr: ${data}`);
            });

            proxyProcess.on('close', (code) => {
                console.log(`Proxy process exited with code ${code}`);
                proxyProcess = null;
            });

            sendMessage({ success: true });
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
        process.stdin.on('readable', async () => {
            const message = await readMessage();
            if (message) {
                await handleMessage(message);
            }
        });

        process.stdin.on('end', () => {
            if (proxyProcess) {
                proxyProcess.kill();
            }
            process.exit(0);
        });
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
