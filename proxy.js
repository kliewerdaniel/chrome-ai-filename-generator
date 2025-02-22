#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const port = 11435;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Forward all requests to Ollama
app.all('*', async (req, res) => {
    try {
        const ollamaUrl = 'http://localhost:11434' + req.path;
        
        // Forward the request to Ollama
        const response = await fetch(ollamaUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
        });

        // Get response data
        const data = await response.text();

        // Forward Ollama's response
        res.status(response.status)
           .set('Content-Type', 'application/json')
           .send(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(port, () => {
    console.log(`CORS proxy server running on port ${port}`);
});
