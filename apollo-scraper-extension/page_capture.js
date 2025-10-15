(function(){
  // This script runs at document_start as a content script and injects a page
  // script to monkeypatch fetch/XHR early so we can capture network responses.
  try{
    const inject = function(){
      (function(){
        try{
          const shouldCapture = (url) => /people|contacts|graphql|search|profiles|records|v1/i.test(String(url));
          const origFetch = window.fetch;
          if(origFetch){
            window.fetch = function(input, init){
              return origFetch(input, init).then(response => {
                try{
                  const url = (response && response.url) || (typeof input === 'string' ? input : (input && input.url))
                  if(shouldCapture(url)){
                    try{ response.clone().text().then(t=>{ window.postMessage({__apolloNetCapture:true, url: url, body: t}, '*') }).catch(()=>{} ) }catch(e){}
                  }
                }catch(e){}
                return response;
              })
            }
          }

          const origOpen = XMLHttpRequest.prototype.open;
          const origSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url){
            this.__captureUrl = url
            return origOpen.apply(this, arguments)
          }
          XMLHttpRequest.prototype.send = function(body){
            try{
              const url = this.__captureUrl
              if(shouldCapture(url)){
                this.addEventListener('load', function(){
                  try{ window.postMessage({__apolloNetCapture:true, url: url, body: this.responseText}, '*') }catch(e){}
                })
              }
            }catch(e){}
            return origSend.apply(this, arguments)
          }
        }catch(e){}
      })();
    }
    const s = document.createElement('script')
    try{
      s.src = chrome.runtime.getURL('page_capture_page.js')
    }catch(e){
      // if runtime isn't available, fallback to inline (best-effort)
      s.textContent = '(' + inject.toString() + ')();'
    }
    s.async = false
    s.onload = function(){ try{ this.parentNode && this.parentNode.removeChild(this) }catch(e){} }
    (document.head || document.documentElement).appendChild(s)
  }catch(e){ }
})();
