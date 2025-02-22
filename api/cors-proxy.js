#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const port = 11435;

// Update the Express JSON middleware to handle larger payloads
app.use(express.json({ limit: '50mb' })); // Increased from default 100kb

// Add URL-encoded body parser with larger limit
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Origin', 'Accept'],
    credentials: true
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Handle version check
app.get('/api/version', async (req, res) => {
    try {
        const response = await fetch('http://localhost:11434/api/version');
        const data = await response.text();
        res.send(data);
    } catch (error) {
        console.error('Version check error:', error);
        res.status(500).json({ 
            error: true, 
            message: error.message 
        });
    }
});

// Handle all other API requests
app.all('/api/*', async (req, res) => {
    try {
        const ollamaUrl = 'http://localhost:11434' + req.path;
        
        const response = await fetch(ollamaUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: ['POST', 'PUT', 'PATCH'].includes(req.method) 
                ? JSON.stringify(req.body) 
                : undefined
        });

        const data = await response.text();
        
        // Forward response headers
        Object.entries(response.headers.raw()).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        // Add CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        res.status(response.status).send(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ 
            error: true, 
            message: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`CORS proxy server running on port ${port}`);
});

// Handle process signals
process.on('SIGINT', () => {
    console.log('Shutting down proxy server');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down proxy server');
    process.exit(0);
});
