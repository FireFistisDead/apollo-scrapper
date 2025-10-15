// Minimal service worker for the extension.
chrome.runtime.onInstalled.addListener(()=>{
  console.log('Apollo Scraper installed')
})

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
