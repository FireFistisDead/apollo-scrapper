// WebSocket connector for Chrome extension to communicate with local API server
// This runs in the background script context

let ws = null;
let reconnectInterval = null;

function connectToServer() {
  try {
    ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('✅ Connected to API server');
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
      
      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        extensionId: chrome.runtime.id
      }));
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📥 Received from server:', message.type);
        
        if (message.type === 'startScrape') {
          // Forward to content script to perform scraping
          const tabs = await chrome.tabs.query({ 
            url: '*://app.apollo.io/*',
            active: true 
          });
          
          if (tabs.length === 0) {
            // No Apollo tab open, try to open one
            if (message.url) {
              const newTab = await chrome.tabs.create({ url: message.url });
              
              // Wait for tab to load
              await new Promise(resolve => {
                const listener = (tabId, info) => {
                  if (tabId === newTab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                  }
                };
                chrome.tabs.onUpdated.addListener(listener);
              });
              
              // Wait additional time for Apollo to load
              await new Promise(resolve => setTimeout(resolve, message.waitForLoad || 3000));
              
              // Now scrape
              triggerScrape(newTab.id);
            } else {
              sendToServer({
                type: 'scrapeComplete',
                success: false,
                error: 'No Apollo tab open and no URL provided'
              });
            }
          } else {
            // Use existing Apollo tab
            triggerScrape(tabs[0].id);
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('🔌 Disconnected from API server');
      ws = null;
      
      // Try to reconnect every 5 seconds
      if (!reconnectInterval) {
        reconnectInterval = setInterval(connectToServer, 5000);
      }
    };
    
  } catch (error) {
    console.error('Failed to connect to server:', error);
    
    // Retry connection
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connectToServer, 5000);
    }
  }
}

function triggerScrape(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'scrapeApollo' }, (response) => {
    if (chrome.runtime.lastError) {
      sendToServer({
        type: 'scrapeComplete',
        success: false,
        error: chrome.runtime.lastError.message
      });
      return;
    }
    
    if (response && response.success) {
      sendToServer({
        type: 'scrapeComplete',
        success: true,
        rowCount: response.data.length,
        data: response.data,
        csv: response.csv
      });
    } else {
      sendToServer({
        type: 'scrapeComplete',
        success: false,
        error: response?.error || 'Unknown error'
      });
    }
  });
}

function sendToServer(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  } else {
    console.error('Cannot send to server: not connected');
  }
}

// Start connection when extension loads
connectToServer();

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { connectToServer, sendToServer };
}
