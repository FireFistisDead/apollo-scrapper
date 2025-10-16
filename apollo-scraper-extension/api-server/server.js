const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Store WebSocket connections from Chrome extensions
const extensionConnections = new Map();

// WebSocket server for Chrome extension to connect to
const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', (ws) => {
  console.log('Chrome extension connected via WebSocket');
  
  const connectionId = Date.now().toString();
  extensionConnections.set(connectionId, ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received from extension:', data.type);
      
      // Store the response data for the pending request
      if (data.type === 'scrapeComplete') {
        ws.pendingResponse = data;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Chrome extension disconnected');
    extensionConnections.delete(connectionId);
  });
});

// API endpoint for n8n to trigger scraping
app.post('/api/scrape-apollo', async (req, res) => {
  try {
    const { url, waitForLoad = 3000 } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Get active extension connection
    const connections = Array.from(extensionConnections.values());
    if (connections.length === 0) {
      return res.status(503).json({ 
        error: 'No Chrome extension connected. Please open Chrome with the extension installed.' 
      });
    }
    
    const ws = connections[0]; // Use first available connection
    
    // Send scrape request to extension
    ws.send(JSON.stringify({
      type: 'startScrape',
      url: url,
      waitForLoad: waitForLoad
    }));
    
    console.log(`Sent scrape request for: ${url}`);
    
    // Wait for response from extension (with timeout)
    const timeout = 60000; // 60 seconds
    const startTime = Date.now();
    
    const checkResponse = () => {
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (ws.pendingResponse) {
            clearInterval(interval);
            const response = ws.pendingResponse;
            delete ws.pendingResponse;
            resolve(response);
          } else if (Date.now() - startTime > timeout) {
            clearInterval(interval);
            reject(new Error('Scraping timeout'));
          }
        }, 500);
      });
    };
    
    const result = await checkResponse();
    
    if (result.success) {
      res.json({
        success: true,
        rowCount: result.rowCount,
        data: result.data, // Array of scraped records
        csv: result.csv // CSV string
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to scrape Apollo' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const extensionConnected = extensionConnections.size > 0;
  res.json({
    status: 'online',
    extensionConnected: extensionConnected,
    connections: extensionConnections.size
  });
});

// Endpoint to get scraped data in different formats
app.get('/api/last-scrape', (req, res) => {
  // This could be enhanced to store last scrape result
  res.json({ message: 'Use POST /api/scrape-apollo to trigger scraping' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Apollo Scraper API Server running!`);
  console.log(`📡 HTTP API: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:3001`);
  console.log(`\n📋 Usage from n8n:`);
  console.log(`   POST http://localhost:${PORT}/api/scrape-apollo`);
  console.log(`   Body: { "url": "https://app.apollo.io/..." }\n`);
});
