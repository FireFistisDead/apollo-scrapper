(function(){
  try{
    // Enhanced URL capture - catch MORE Apollo API patterns
    const shouldCapture = (url) => {
      const urlStr = String(url).toLowerCase();
      return /people|contacts|graphql|search|profiles|records|person|email|organization|company|lead|prospect|api\/v[0-9]|mixed_people/i.test(urlStr);
    };
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

    // XHR interception
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
  }catch(e){/* ignore */}
})();
