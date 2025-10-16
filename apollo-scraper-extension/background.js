// Minimal service worker for the extension.
chrome.runtime.onInstalled.addListener(()=>{
  console.log('Apollo Scraper installed')
})

// WebSocket connection to local API server
let ws = null;

function connectToServer() {
  try {
    ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('✅ Connected to API server');
      ws.send(JSON.stringify({ type: 'connected', extensionId: chrome.runtime.id }));
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📥 Server request:', message.type);
        
        if (message.type === 'startScrape') {
          handleScrapeRequest(message);
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.log('API server not available (this is OK if not using n8n integration)');
    };
    
    ws.onclose = () => {
      ws = null;
      // Retry connection after 10 seconds
      setTimeout(connectToServer, 10000);
    };
    
  } catch (error) {
    // Silently fail - server is optional
    setTimeout(connectToServer, 10000);
  }
}

async function handleScrapeRequest(message) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://app.apollo.io/*' });
    
    let targetTab;
    if (tabs.length > 0) {
      targetTab = tabs[0];
    } else if (message.url) {
      targetTab = await chrome.tabs.create({ url: message.url });
      await waitForTabLoad(targetTab.id, message.waitForLoad || 3000);
    } else {
      sendToServer({ type: 'scrapeComplete', success: false, error: 'No Apollo tab open' });
      return;
    }
    
    // Try to inject content script if not already loaded
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        files: ['content_script.js']
      });
      console.log('Content script injected');
    } catch (e) {
      console.log('Content script already loaded or error:', e.message);
    }
    
    // Wait a moment for script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    chrome.tabs.sendMessage(targetTab.id, { action: 'scrapeForAPI' }, (response) => {
      if (chrome.runtime.lastError) {
        sendToServer({ type: 'scrapeComplete', success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendToServer(response || { type: 'scrapeComplete', success: false, error: 'No response' });
    });
    
  } catch (error) {
    sendToServer({ type: 'scrapeComplete', success: false, error: error.message });
  }
}

function waitForTabLoad(tabId, extraWait) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, extraWait);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendToServer(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Connect to API server (optional - won't break extension if server not running)
connectToServer();

// Listen for requests from content scripts to inject a page-level helper.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg && msg.action === 'inject_page_capture'){
    try{
      if(!sender || !sender.tab || !sender.tab.id) return
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        files: ['page_capture_page.js'],
        world: 'MAIN'
      }).then(()=> sendResponse({ok:true})).catch(err=> { sendResponse({error:String(err)}) })
      return true
    }catch(e){ }
  }
})
