// Content script: scrapes Apollo people list and LinkedIn links/buttons.
(function(){
  // Helper: escape CSV cell
  function csvEscape(v){
    if(v==null) return ''
    const s = String(v)
    if(s.includes(',')||s.includes('"')||s.includes('\n')){
      return '"'+s.replace(/"/g,'""')+'"'
    }
    return s
  }

  // ===================== Network interception (page context) =====================
  // Inject a small script into the page to monkeypatch fetch and XHR so we can
  // capture API responses (useful when data is loaded via XHR/GraphQL and not
  // exposed in the DOM). The injected script posts messages to window, which
  // the content script listens for.
  function injectNetworkCapture(){
    try{
      // ask the background service worker to inject the page-level capture
      // script into the page's main world. This avoids inline script and CSP
      // restrictions because the scripting API can execute in the page context.
      try{ chrome.runtime.sendMessage({action:'inject_page_capture'}) }catch(e){ }
    }catch(e){ /* ignore injection errors */ }
  }

  // Store captured network responses (url -> array of text bodies)
  const _capturedNetwork = new Map()
  window.addEventListener('message', (ev)=>{
    try{
      const d = ev.data
      if(d && d.__apolloNetCapture){
        const url = String(d.url||'')
        const body = typeof d.body === 'string' ? d.body : (d.body ? JSON.stringify(d.body) : '')
        if(!_capturedNetwork.has(url)) _capturedNetwork.set(url, [])
        _capturedNetwork.get(url).push(body)
      }
    }catch(e){}
  }, false)

  // Recursively search an object for person-like entries.
  function findPersonObjects(node, out){
    if(!node || typeof node !== 'object') return
    if(Array.isArray(node)){
      for(const el of node) findPersonObjects(el, out)
      return
    }
    // heuristics: object with name/email/id fields
    const keys = Object.keys(node).map(k=>k.toLowerCase())
    const hasName = keys.some(k=>/name|first.?name|last.?name|full.?name/.test(k))
    const hasEmail = keys.some(k=>/email/.test(k))
    const hasId = keys.some(k=>/id|personid|contactid/.test(k))
    if((hasName || hasEmail) && (hasId || hasEmail || hasName)){
      out.push(node)
      return
    }
    // otherwise walk deeper
    for(const k in node) try{ findPersonObjects(node[k], out) }catch(e){}
  }

  // Parse captured responses and extract person rows
  function getPersonsFromCapturedNetwork(){
    const persons = []
    try{
      for(const [url, bodies] of _capturedNetwork.entries()){
        // Enhanced URL filtering - catch more patterns
        if(!/people|contacts|graphql|search|profiles|records|person|email|organization|company|lead|prospect|api\/v[0-9]|mixed_people/i.test(url)) continue
        for(const txt of bodies){
          if(!txt) continue
          let j = null
          try{ j = JSON.parse(txt) }catch(e){
            // try to deserialize GraphQL-like text by extracting JSON substring
            const m = txt.match(/\{[\s\S]*\}/)
            if(m) try{ j = JSON.parse(m[0]) }catch(e){}
          }
          if(!j) continue
          const found = []
          findPersonObjects(j, found)
          for(const p of found){
            // build normalized row
            const name = (p.name || p.fullName || (p.firstName && ((p.firstName||'') + ' ' + (p.lastName||''))) || p.title || '')
            const job = p.title || p.role || p.job || ''
            const company = p.company || p.org || p.organization || ''
            const linkedin = p.linkedin || p.linkedinUrl || ''
            const email = (p.email || p.emailAddress || (p.emails && p.emails[0]) || '')
            persons.push({name: String(name||''), job: String(job||''), company: String(company||''), linkedin: String(linkedin||''), email: String(email||'')})
          }
        }
      }
    }catch(e){}
    return persons
  }

  // Inject capture as soon as possible
  try{ injectNetworkCapture() }catch(e){}
  // ===========================================================================

  // ===================== Advanced Email Extraction (Credit-Free) =====================
  
  // Extract emails from Apollo's internal state/cache (Apollo Client uses this)
  function extractEmailsFromApolloState(){
    const emails = []
    try{
      // Check for Apollo Client state
      if(window.__APOLLO_STATE__){
        console.log('[Apollo Scraper] 🔍 Found __APOLLO_STATE__ - extracting emails...')
        const state = window.__APOLLO_STATE__
        const searchState = (obj, depth = 0) => {
          if(depth > 5 || !obj || typeof obj !== 'object') return
          
          // Look for person/contact objects
          if(obj.email && typeof obj.email === 'string' && /@/.test(obj.email)){
            const email = obj.email.trim()
            if(!/no.?email|access|request|example\.com/i.test(email)){
              emails.push({
                email,
                name: obj.name || obj.firstName || obj.fullName || '',
                source: 'apollo_state',
                raw: obj
              })
            }
          }
          
          // Recursively search nested objects
          Object.values(obj).forEach(val => searchState(val, depth + 1))
        }
        searchState(state)
        console.log('[Apollo Scraper] 🎯 Found', emails.length, 'emails in Apollo state')
      }
      
      // Check for Apollo Client instance
      if(window.__APOLLO_CLIENT__){
        console.log('[Apollo Scraper] 🔍 Found __APOLLO_CLIENT__ - extracting from cache...')
        try{
          const client = window.__APOLLO_CLIENT__
          const cache = client.cache || client.store
          if(cache){
            const cacheData = cache.data || cache.store || cache
            const searchCache = (obj, depth = 0) => {
              if(depth > 5 || !obj || typeof obj !== 'object') return
              if(obj.email && typeof obj.email === 'string' && /@/.test(obj.email)){
                const email = obj.email.trim()
                if(!/no.?email|access|request|example\.com/i.test(email)){
                  emails.push({
                    email,
                    name: obj.name || obj.firstName || '',
                    source: 'apollo_client',
                    raw: obj
                  })
                }
              }
              Object.values(obj).forEach(val => searchCache(val, depth + 1))
            }
            searchCache(cacheData)
            console.log('[Apollo Scraper] 🎯 Found', emails.length, 'emails in Apollo client cache')
          }
        }catch(e){
          console.log('[Apollo Scraper] Error reading Apollo client:', e)
        }
      }
      
      // Search entire window object for person arrays (more aggressive)
      console.log('[Apollo Scraper] 🔍 Scanning window object for person data...')
      const searchWindow = (obj, depth = 0, path = 'window') => {
        if(depth > 4 || !obj || typeof obj !== 'object') return
        
        // Check if this is an array of person objects
        if(Array.isArray(obj) && obj.length > 0 && obj[0] && obj[0].email){
          obj.forEach(person => {
            if(person.email && typeof person.email === 'string' && /@/.test(person.email)){
              const email = person.email.trim()
              if(!/no.?email|access|request|example\.com/i.test(email)){
                emails.push({
                  email,
                  name: person.name || person.firstName || '',
                  source: 'window_object',
                  path,
                  raw: person
                })
              }
            }
          })
        }
        
        // Continue searching nested objects
        try{
          Object.entries(obj).forEach(([key, val]) => {
            if(typeof val === 'object' && val !== null && 
               !key.startsWith('__react') && !key.startsWith('_react')){
              searchWindow(val, depth + 1, path + '.' + key)
            }
          })
        }catch(e){}
      }
      searchWindow(window, 0)
      console.log('[Apollo Scraper] 🎯 Total found in window scan:', emails.length, 'emails')
      
    }catch(e){
      console.log('[Apollo Scraper] Error in Apollo state extraction:', e)
    }
    return emails
  }
  
  // Extract emails from IndexedDB (Apollo caches data here)
  async function extractEmailsFromIndexedDB(){
    const emails = []
    try{
      console.log('[Apollo Scraper] 🔍 Checking IndexedDB for cached emails...')
      const dbs = await indexedDB.databases()
      console.log('[Apollo Scraper] Found databases:', dbs.map(db => db.name))
      
      for(const dbInfo of dbs){
        const dbName = dbInfo.name
        // Look for Apollo-related databases
        if(/apollo|cache|store|persist/i.test(dbName)){
          console.log('[Apollo Scraper] 🔍 Opening database:', dbName)
          try{
            const db = await new Promise((resolve, reject) => {
              const request = indexedDB.open(dbName)
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            
            const storeNames = Array.from(db.objectStoreNames)
            console.log('[Apollo Scraper] Object stores:', storeNames)
            
            for(const storeName of storeNames){
              try{
                const transaction = db.transaction(storeName, 'readonly')
                const store = transaction.objectStore(storeName)
                const allData = await new Promise((resolve, reject) => {
                  const request = store.getAll()
                  request.onsuccess = () => resolve(request.result)
                  request.onerror = () => reject(request.error)
                })
                
                // Search for emails in the data
                const searchData = (obj, depth = 0) => {
                  if(depth > 5 || !obj || typeof obj !== 'object') return
                  if(obj.email && typeof obj.email === 'string' && /@/.test(obj.email)){
                    const email = obj.email.trim()
                    if(!/no.?email|access|request|example\.com/i.test(email)){
                      emails.push({
                        email,
                        name: obj.name || obj.firstName || '',
                        source: 'indexeddb',
                        db: dbName,
                        store: storeName
                      })
                    }
                  }
                  if(Array.isArray(obj)){
                    obj.forEach(item => searchData(item, depth + 1))
                  }else{
                    Object.values(obj).forEach(val => searchData(val, depth + 1))
                  }
                }
                allData.forEach(item => searchData(item))
                
              }catch(e){
                console.log('[Apollo Scraper] Error reading store', storeName, ':', e)
              }
            }
            
            db.close()
          }catch(e){
            console.log('[Apollo Scraper] Error opening database', dbName, ':', e)
          }
        }
      }
      
      console.log('[Apollo Scraper] 🎯 Found', emails.length, 'emails in IndexedDB')
    }catch(e){
      console.log('[Apollo Scraper] Error accessing IndexedDB:', e)
    }
    return emails
  }
  
  // Extract emails from React component props (Apollo uses React)
  function extractEmailFromReactProps(element){
    if(!element) return null
    try{
      // Check for React Fiber instance
      const keys = Object.keys(element)
      for(const key of keys){
        if(key.startsWith('__reactProps') || key.startsWith('__reactInternalInstance')){
          const props = element[key]
          if(props && typeof props === 'object'){
            // Search recursively for email properties
            const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
            const searchForEmail = (obj, depth = 0) => {
              if(depth > 5 || !obj || typeof obj !== 'object') return null
              
              // Check direct email properties
              if(obj.email && typeof obj.email === 'string'){
                const match = obj.email.match(emailRegex)
                if(match && !/no.?email|access|request/i.test(match[0])) return match[0]
              }
              if(obj.emailAddress && typeof obj.emailAddress === 'string'){
                const match = obj.emailAddress.match(emailRegex)
                if(match && !/no.?email|access|request/i.test(match[0])) return match[0]
              }
              
              // Check nested objects
              for(const k in obj){
                if(k === 'email' || k === 'emailAddress' || k === 'contact' || k === 'contactEmail'){
                  const val = obj[k]
                  if(typeof val === 'string'){
                    const match = val.match(emailRegex)
                    if(match && !/no.?email|access|request/i.test(match[0])) return match[0]
                  }
                }
                if(typeof obj[k] === 'object'){
                  const found = searchForEmail(obj[k], depth + 1)
                  if(found) return found
                }
              }
              return null
            }
            
            const found = searchForEmail(props)
            if(found) return found
          }
        }
      }
    }catch(e){}
    return null
  }
  
  // Decode obfuscated emails (base64, URL-encoded, etc.)
  function deobfuscateEmail(str){
    if(!str || typeof str !== 'string') return null
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    
    try{
      // 1. Check if already an email
      const direct = str.match(emailRegex)
      if(direct && !/no.?email|access|request/i.test(direct[0])) return direct[0]
      
      // 2. Try base64 decode
      try{
        const decoded = atob(str.replace(/\s/g, ''))
        const decodedMatch = decoded.match(emailRegex)
        if(decodedMatch && !/no.?email|access|request/i.test(decodedMatch[0])) return decodedMatch[0]
      }catch(e){}
      
      // 3. Try URL decode
      try{
        const urlDecoded = decodeURIComponent(str)
        const urlMatch = urlDecoded.match(emailRegex)
        if(urlMatch && !/no.?email|access|request/i.test(urlMatch[0])) return urlMatch[0]
      }catch(e){}
      
      // 4. Check for obfuscated format: user[at]domain[dot]com
      const obfuscated = str.replace(/\[at\]/gi, '@').replace(/\[dot\]/gi, '.')
      const obfMatch = obfuscated.match(emailRegex)
      if(obfMatch && !/no.?email|access|request/i.test(obfMatch[0])) return obfMatch[0]
      
      // 5. Check for spaces: user @ domain . com
      const spaceless = str.replace(/\s+/g, '')
      const spaceMatch = spaceless.match(emailRegex)
      if(spaceMatch && !/no.?email|access|request/i.test(spaceMatch[0])) return spaceMatch[0]
      
    }catch(e){}
    return null
  }
  
  // Extract emails from browser storage (LocalStorage, SessionStorage)
  function extractEmailsFromStorage(){
    const emails = []
    try{
      const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
      
      // Check localStorage
      for(let i = 0; i < localStorage.length; i++){
        try{
          const key = localStorage.key(i)
          const value = localStorage.getItem(key)
          if(value && typeof value === 'string'){
            const matches = value.match(emailRegex)
            if(matches){
              matches.forEach(m => {
                if(!/no.?email|access|request|example\.com/i.test(m)){
                  emails.push({source: 'localStorage', key, email: m})
                }
              })
            }
          }
        }catch(e){}
      }
      
      // Check sessionStorage
      for(let i = 0; i < sessionStorage.length; i++){
        try{
          const key = sessionStorage.key(i)
          const value = sessionStorage.getItem(key)
          if(value && typeof value === 'string'){
            const matches = value.match(emailRegex)
            if(matches){
              matches.forEach(m => {
                if(!/no.?email|access|request|example\.com/i.test(m)){
                  emails.push({source: 'sessionStorage', key, email: m})
                }
              })
            }
          }
        }catch(e){}
      }
    }catch(e){}
    return emails
  }
  
  // ===========================================================================

  // Attempt to find list rows inside Apollo people listing.
  function scrapeApollo(){
    const rows = []

    const linkSelectors = ['a[href*="/people/"]','a[href*="/person/">]','a[href*="/profiles/"]']
    // gather all profile links; we'll dedupe by person id from the href
    let profileLinks = Array.from(document.querySelectorAll('a[href*="/people/"], a[href*="/person/"], a[href*="/profiles/"]'))
      .filter(l => l && l.offsetParent !== null)
    
    console.log('[Apollo Scraper] 🔍 DEBUG: Found', profileLinks.length, 'profile links')

    // map person id -> best link element
    const idMap = new Map()
    const idFromHref = href => {
      if(!href) return null
      try{
        // handle urls like https://app.apollo.io/#/people/<id>?...
        const m = href.match(/people\/(?:#?\/)?([^\/?#]+)/) || href.match(/people\/([^\/?#]+)/)
        if(m && m[1]) return m[1]
        // fallback: try last path segment
        const u = new URL(href, location.href)
        const parts = u.pathname.split('/').filter(Boolean)
        return parts.length ? parts[parts.length-1] : null
      }catch(e){
        return null
      }
    }

    profileLinks.forEach(link => {
      try{
        const id = idFromHref(link.href)
        if(!id) return
        const existing = idMap.get(id)
        // choose the link with text (name) if possible
        if(!existing) idMap.set(id, link)
        else if((existing.innerText||'').trim().length === 0 && (link.innerText||'').trim().length>0) idMap.set(id, link)
      }catch(e){ }
    })

    // build containers list from idMap; if none found, fallback to visible list rows
    const containers = []
    for(const [id, link] of idMap.entries()){
      let container = null
      try{
        container = link.closest('tr, li, [data-qa="people-list-row"], [data-testid="people-row"], .people-list-item, .ProfileListItem, div[role="row"]')
        if(!container){
          let p = link.parentElement
          for(let i=0;i<6 && p;i++, p=p.parentElement){
            if(p.matches && (p.matches('tr') || p.matches('li') || p.getAttribute && (p.getAttribute('data-qa') || p.getAttribute('data-testid')) || p.getAttribute && p.getAttribute('role')==='row')){ container = p; break }
          }
        }
        if(!container) container = link.parentElement || link
      }catch(e){ container = link }
      containers.push({id, link, container})
    }
    
    console.log('[Apollo Scraper] 🔍 DEBUG: Built', containers.length, 'containers from profile links')

    if(containers.length===0){
      console.log('[Apollo Scraper] 🔍 DEBUG: No containers found, trying fallback selectors...')
      const fallback = Array.from(document.querySelectorAll('[data-qa="people-list"] [data-qa="people-list-row"], [data-testid="people-row"], tbody tr, .people-list-item, .ProfileListItem'))
      console.log('[Apollo Scraper] 🔍 DEBUG: Fallback found', fallback.length, 'elements')
      fallback.forEach(el=>containers.push({id:null, link:null, container:el}))
    }

    const seenContainers = new Set()
    containers.forEach(pair => {
      const el = pair.container
      if(!el || seenContainers.has(el)) return
      seenContainers.add(el)
      try{
        // name: prefer link text, otherwise try common selectors
        let name = ''
        if(pair.link) name = (pair.link.innerText||'').trim()
        if(!name){
          const n = el.querySelector('a[href*="/people/"]') || el.querySelector('.name') || el.querySelector('[data-qa="name"]') || el.querySelector('a')
          name = n ? (n.innerText||'').trim() : ''
        }
        
        // If container is a table row, try extracting from cells directly (apollo-email-scraper approach)
        if(!name && el.tagName === 'TR'){
          const cells = Array.from(el.querySelectorAll('td, th'))
          if(cells.length > 0){
            // First cell often contains name
            const firstCell = cells[0]
            const nameLink = firstCell.querySelector('a')
            name = nameLink ? (nameLink.innerText||'').trim() : (firstCell.innerText||'').trim()
          }
        }
        
        if(!name){
          console.log('[Apollo Scraper] ⚠️ DEBUG: Skipping row - no name found. Container:', el.tagName, el.className)
          return // skip empty rows
        }

        // job title - ENHANCED for Apollo's current UI
        let job = ''
        
        // Try various selectors for job title
        const jobSelectors = [
          '[data-qa*="job"]',
          '[data-qa*="title"]',
          '.job-title',
          '.headline',
          '.title',
          '[aria-label*="title"]',
          '[class*="job"]',
          '[class*="title"]',
          '[class*="headline"]'
        ]
        
        for(const selector of jobSelectors){
          try{
            const jobEl = el.querySelector(selector)
            if(jobEl){
              const text = (jobEl.innerText||jobEl.textContent||'').trim()
              // Make sure it's not the name or email
              if(text && text !== name && !/@/.test(text) && text.length > 2){
                job = text
                break
              }
            }
          }catch(e){}
        }
        
        // If table row and no job found, try extracting from subsequent cells
        if(!job && el.tagName === 'TR'){
          const cells = Array.from(el.querySelectorAll('td, th'))
          if(cells.length > 1){
            // Second cell often contains job title
            const cellText = (cells[1]?.innerText||'').trim()
            if(cellText && cellText !== name && !/@/.test(cellText)){
              job = cellText
            }
          }
        }
        
        // Fallback: Look for any div/span with job-related class or nearby name link
        if(!job && pair.link){
          try{
            let parent = pair.link.parentElement
            for(let i=0; i<3 && parent; i++, parent=parent.parentElement){
              const siblings = Array.from(parent.children||[])
              for(const sib of siblings){
                if(sib === pair.link || sib.contains(pair.link)) continue
                const sibText = (sib.innerText||sib.textContent||'').trim()
                // Check if this looks like a job title (not too long, not email, not name)
                if(sibText && sibText !== name && !/@/.test(sibText) && sibText.length > 3 && sibText.length < 100){
                  // Common job title patterns
                  if(/\b(manager|director|engineer|developer|analyst|coordinator|specialist|lead|head|chief|officer|executive|consultant|designer|architect|admin|associate)\b/i.test(sibText)){
                    job = sibText
                    break
                  }
                }
              }
              if(job) break
            }
          }catch(e){}
        }

        // company - ENHANCED for Apollo's current UI
        let company = ''
        
        // Try various selectors for company
        const companySelectors = [
          '[data-qa*="company"]',
          '[data-qa*="org"]',
          '[data-qa*="organization"]',
          '.company',
          '.organization',
          '[aria-label*="company"]',
          '[aria-label*="organization"]',
          '[class*="company"]',
          '[class*="organization"]',
          'a[href*="/organizations/"]',
          'a[href*="/company/"]'
        ]
        
        for(const selector of companySelectors){
          try{
            const compEl = el.querySelector(selector)
            if(compEl){
              const text = (compEl.innerText||compEl.textContent||'').trim()
              // Make sure it's not the name, job, or email
              if(text && text !== name && text !== job && !/@/.test(text) && text.length > 1){
                company = text
                break
              }
            }
          }catch(e){}
        }
        
        // If table row and no company found, try extracting from third cell
        if(!company && el.tagName === 'TR'){
          const cells = Array.from(el.querySelectorAll('td, th'))
          if(cells.length > 2){
            const cellText = (cells[2]?.innerText||'').trim()
            if(cellText && cellText !== name && cellText !== job && !/@/.test(cellText)){
              company = cellText
            }
          }
        }
        
        // Fallback: Look for organization link in buttons array
        if(!company && buttons){
          for(const btn of buttons){
            if(btn.href && /organizations?\//.test(btn.href)){
              const btnText = (btn.text||'').trim()
              if(btnText && btnText !== name && btnText !== job && btnText.length > 1){
                company = btnText
                break
              }
            }
          }
        }

        // linkedin
        let linkedin = ''
        const li = el.querySelector('a[href*="linkedin.com"]') || el.querySelector('a[aria-label*="LinkedIn"]')
        if(li) linkedin = li.href || ''

        // buttons (exclude profile link)
        const anchors = Array.from(el.querySelectorAll('a, button'))
        const buttons = anchors.filter(a=>a && a!==pair.link).map(b=>({text:(b.innerText||'').trim(), aria:(b.getAttribute && b.getAttribute('aria-label'))||'', href:b.href||''}))

        const dataAttrs = {}
        Array.from(el.attributes||[]).forEach(a=>{ if(a.name && a.name.startsWith('data-')) dataAttrs[a.name]=a.value })
        const nested = el.querySelectorAll('[data-qa],[data-testid],[data-id],[data-person-id]')
        nested.forEach(n=>{ Array.from(n.attributes||[]).forEach(a=>{ if(a.name && a.name.startsWith('data-')) dataAttrs[a.name]=a.value }) })

        // try to extract email using straightforward DOM heuristics (no clicks)
        let email = extractHiddenEmail(el, pair.link)
        
        // Additional aggressive email extraction for Apollo's specific UI (CREDIT-FREE)
        if(!email){
          // Try to find email in any text node within the container
          try{
            const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
            
            // 1. Check all text content in the container
            const allText = el.textContent || el.innerText || ''
            const match = allText.match(emailRegex)
            if(match && !/no.?email|request|access|reveal|example\.com/i.test(match[0])){
              email = match[0]
            }
            
            // 2. Try React props extraction (Apollo uses React)
            if(!email){
              email = extractEmailFromReactProps(el)
            }
            
            // 3. Try deobfuscation on data attributes
            if(!email){
              for(const attr in dataAttrs){
                const decoded = deobfuscateEmail(dataAttrs[attr])
                if(decoded){
                  email = decoded
                  break
                }
              }
            }
            
            // 4. If table row, check each cell individually
            if(!email && el.tagName === 'TR'){
              const cells = Array.from(el.querySelectorAll('td, th'))
              for(const cell of cells){
                const cellText = (cell.textContent || cell.innerText || '').trim()
                const cellMatch = cellText.match(emailRegex)
                if(cellMatch && !/no.?email|request|access|reveal|example\.com/i.test(cellMatch[0])){
                  email = cellMatch[0]
                  break
                }
                
                // Try React props on cell
                if(!email){
                  email = extractEmailFromReactProps(cell)
                  if(email) break
                }
                
                // Try deobfuscation on cell attributes
                if(!email){
                  Array.from(cell.attributes || []).forEach(attr => {
                    if(!email && attr.value){
                      const decoded = deobfuscateEmail(attr.value)
                      if(decoded) email = decoded
                    }
                  })
                  if(email) break
                }
              }
            }
            
            // 3. Check data attributes across ALL elements in container
            if(!email){
              const allElems = Array.from(el.querySelectorAll('*'))
              for(const elem of allElems){
                for(const attr of Array.from(elem.attributes || [])){
                  if(/email|contact|mailto/i.test(attr.name)){
                    const attrMatch = attr.value.match(emailRegex)
                    if(attrMatch && !/no.?email|request|access/i.test(attrMatch[0])){
                      email = attrMatch[0]
                      break
                    }
                  }
                }
                if(email) break
              }
            }
            
            // 4. Check buttons array for email patterns (sometimes email is in button aria or nearby)
            if(!email && buttons && buttons.length > 0){
              for(const btn of buttons){
                // Check button text, aria, and href for email
                const btnStr = (btn.text || '') + ' ' + (btn.aria || '') + ' ' + (btn.href || '')
                const btnMatch = btnStr.match(emailRegex)
                if(btnMatch && !/no.?email|request|access|reveal|example\.com/i.test(btnMatch[0])){
                  email = btnMatch[0]
                  break
                }
              }
            }
          }catch(e){
            console.log('Email extraction error:', e)
          }
        }
        
        // 5. Mark if email needs revealing (has "Access email" button but no email found)
        const hasAccessButton = buttons && buttons.some(b => /access.*email|reveal.*email|show.*email/i.test(b.text || ''))
        const needsReveal = !email && hasAccessButton
        if(needsReveal){
          console.log('[Apollo Scraper] Row needs email reveal:', name)
        }

        rows.push({name,job,company,linkedin,buttons,dataAttrs,email,containerEl: el, needsReveal})
      }catch(e){ /* ignore */ }
    })

    // Debug logging
    console.log('[Apollo Scraper] Extracted', rows.length, 'rows')
    
    // Show sample of extracted data (first 3 rows)
    if(rows.length > 0){
      console.log('[Apollo Scraper] 📊 Sample extracted data (first 3 rows):')
      rows.slice(0, 3).forEach((r, idx) => {
        console.log(`  Row ${idx + 1}:`, {
          name: r.name,
          job: r.job || '(empty)',
          company: r.company || '(empty)',
          linkedin: r.linkedin ? 'Yes' : 'No',
          email: r.email || '(empty)'
        })
      })
    }
    
    // Count statistics
    const emailCount = rows.filter(r => r.email && r.email.trim()).length
    const jobCount = rows.filter(r => r.job && r.job.trim()).length
    const companyCount = rows.filter(r => r.company && r.company.trim()).length
    const needsRevealCount = rows.filter(r => r.needsReveal).length
    
    console.log('[Apollo Scraper] ✅ Found', emailCount, 'emails automatically (NO CREDITS USED)')
    console.log('[Apollo Scraper] 📋 Found', jobCount, 'job titles')
    console.log('[Apollo Scraper] 🏢 Found', companyCount, 'companies')
    
    // DIAGNOSTIC: Show sample "Access email" button HTML for debugging
    if(emailCount === 0 && needsRevealCount > 0 && rows.length > 0){
      const sampleRow = rows.find(r => r.needsReveal)
      if(sampleRow && sampleRow.containerEl){
        console.log('[Apollo Scraper] 🔍 DIAGNOSTIC: Sample "Access email" button HTML:')
        const accessButtons = Array.from(sampleRow.containerEl.querySelectorAll('button, a, [role="button"]'))
          .filter(btn => {
            const text = (btn.innerText || btn.textContent || '').trim()
            return /access.*email|show.*email|reveal.*email/i.test(text)
          })
        
        if(accessButtons.length > 0){
          const btn = accessButtons[0]
          console.log('Button text:', btn.innerText || btn.textContent)
          console.log('Button outerHTML:', btn.outerHTML)
          console.log('Button parent outerHTML:', btn.parentElement?.outerHTML?.substring(0, 800))
          console.log('All button attributes:')
          Array.from(btn.attributes || []).forEach(attr => {
            console.log('  -', attr.name, '=', attr.value)
          })
          
          // Check for React event handlers
          const btnKeys = Object.keys(btn)
          console.log('React/Event handler keys:', btnKeys.filter(k => k.includes('react') || k.includes('event') || k.includes('click')))
          
          // Check for data in container
          console.log('\nContainer data attributes:')
          Array.from(sampleRow.containerEl.attributes || []).forEach(attr => {
            if(attr.name.startsWith('data-')) {
              console.log('  -', attr.name, '=', attr.value.substring(0, 200))
            }
          })
        }
      }
    }
    
    // Log extraction methods used
    const reactEmails = rows.filter(r => r.email && r.emailSource === 'react').length
    const storageEmails = rows.filter(r => r.email && r.emailSource === 'storage').length
    const networkEmails = rows.filter(r => r.email && r.emailSource === 'network').length
    console.log('[Apollo Scraper] Extraction breakdown: DOM:', emailCount - reactEmails - storageEmails - networkEmails, 
      '| React:', reactEmails, '| Storage:', storageEmails, '| Network:', networkEmails)
    
    if(needsRevealCount > 0){
      console.log('[Apollo Scraper] ⚠️', needsRevealCount, 'rows have "Access email" button')
      console.log('[Apollo Scraper] 💡 These require clicking (uses Apollo credits) - Current extraction is credit-free!')
    }
    
    // Check browser storage for cached emails
    const storageEmails2 = extractEmailsFromStorage()
    if(storageEmails2.length > 0){
      console.log('[Apollo Scraper] 📦 Found', storageEmails2.length, 'emails in browser storage (cache)')
      // Try to match storage emails with rows by name
      rows.forEach(row => {
        if(!row.email && row.name){
          const matchedStorage = storageEmails2.find(s => 
            s.email && (
              row.name.toLowerCase().includes(s.email.split('@')[0].toLowerCase()) ||
              s.key.toLowerCase().includes(row.name.toLowerCase())
            )
          )
          if(matchedStorage){
            row.email = matchedStorage.email
            row.emailSource = 'storage'
            console.log('[Apollo Scraper] 📦 Matched storage email for', row.name, ':', matchedStorage.email)
          }
        }
      })
    }
    
    // ========== ADVANCED: Extract from Apollo State/Memory/IndexedDB ==========
    console.log('[Apollo Scraper] 🚀 ADVANCED: Checking Apollo state, memory, and IndexedDB...')
    
    // 1. Extract from Apollo State
    const apolloStateEmails = extractEmailsFromApolloState()
    if(apolloStateEmails.length > 0){
      console.log('[Apollo Scraper] 🎯 Found', apolloStateEmails.length, 'emails in Apollo state/memory')
      let apolloMatchCount = 0
      rows.forEach(row => {
        if(!row.email && row.name){
          const matchedApollo = apolloStateEmails.find(ae => {
            if(!ae.name || !row.name) return false
            const aeName = ae.name.toLowerCase()
            const rowName = row.name.toLowerCase()
            // Match by first name or full name
            const rowFirstName = rowName.split(' ')[0]
            const aeFirstName = aeName.split(' ')[0]
            return rowFirstName && aeFirstName && rowFirstName === aeFirstName
          })
          if(matchedApollo){
            row.email = matchedApollo.email
            row.emailSource = 'apollo_state'
            apolloMatchCount++
            console.log('[Apollo Scraper] 🎯 Matched Apollo state email for', row.name, ':', matchedApollo.email)
          }
        }
      })
      if(apolloMatchCount > 0){
        console.log('[Apollo Scraper] ✅ Enriched', apolloMatchCount, 'emails from Apollo state (NO CREDITS!)')
      }
    }
    
    // 2. Extract from IndexedDB (async)
    extractEmailsFromIndexedDB().then(indexedDBEmails => {
      if(indexedDBEmails.length > 0){
        console.log('[Apollo Scraper] 🎯 Found', indexedDBEmails.length, 'emails in IndexedDB')
        let dbMatchCount = 0
        rows.forEach(row => {
          if(!row.email && row.name){
            const matchedDB = indexedDBEmails.find(dbe => {
              if(!dbe.name || !row.name) return false
              const dbeName = dbe.name.toLowerCase()
              const rowName = row.name.toLowerCase()
              const rowFirstName = rowName.split(' ')[0]
              const dbeFirstName = dbeName.split(' ')[0]
              return rowFirstName && dbeFirstName && rowFirstName === dbeFirstName
            })
            if(matchedDB){
              row.email = matchedDB.email
              row.emailSource = 'indexeddb'
              dbMatchCount++
              console.log('[Apollo Scraper] 🎯 Matched IndexedDB email for', row.name, ':', matchedDB.email)
            }
          }
        })
        if(dbMatchCount > 0){
          console.log('[Apollo Scraper] ✅ Enriched', dbMatchCount, 'emails from IndexedDB (NO CREDITS!)')
        }
      }
    }).catch(e => {
      console.log('[Apollo Scraper] IndexedDB extraction error:', e)
    })
    // ==================================================================
    
    if(rows.length > 0 && emailCount === 0 && needsRevealCount === 0){
      console.log('[Apollo Scraper] ⚠️ No emails found - Apollo may have changed UI or emails are deeply hidden')
      console.log('[Apollo Scraper] Sample row for debugging:', rows[0])
      console.log('[Apollo Scraper] Container HTML sample:', rows[0].containerEl?.outerHTML?.substring(0, 500))
    }

    return rows
  }

  // Helper: Tolerant parser for malformed button JSON arrays
  function parseLooseButtons(raw){
    if(!raw || typeof raw !== 'string') return []
    const out = []
    try{
      const blockRe = /\{([^}]*)\}/g
      let m
      while((m = blockRe.exec(raw))){
        const block = m[1]
        const obj = {text:'', href:'', aria:''}
        const textMatch = block.match(/text\s*:\s*([^,}]+)/)
        const hrefMatch = block.match(/href\s*:\s*([^,}]+)/)
        const ariaMatch = block.match(/aria\s*:\s*([^,}]+)/)
        if(textMatch) obj.text = String(textMatch[1]).trim().replace(/^"|"$/g,'')
        if(hrefMatch) obj.href = String(hrefMatch[1]).trim().replace(/^"|"$/g,'')
        if(ariaMatch) obj.aria = String(ariaMatch[1]).trim().replace(/^"|"$/g,'')
        if(obj.text || obj.href || obj.aria) out.push(obj)
      }
      if(out.length === 0){
        const hrefRe = /href\s*:\s*(https?:\/\/[^,\]\} ]+)/g
        let hm
        const hrefs = []
        while((hm = hrefRe.exec(raw))){ hrefs.push(hm[1]) }
        const textRe = /text\s*:\s*([^,\]\}]+)/g
        let tm
        const texts = []
        while((tm = textRe.exec(raw))){ texts.push(tm[1].trim().replace(/^"|"$/g,'')) }
        const n = Math.max(hrefs.length, texts.length)
        for(let i=0;i<n;i++){ out.push({text: texts[i]||'', href: hrefs[i]||'', aria:''}) }
      }
    }catch(e){}
    return out
  }

  // Helper: Smart title-case preserving acronyms
  function smartTitleCase(s){
    if(!s) return ''
    return s.split(/(\s+)/).map(token=>{
      if(!token.trim()) return token
      if(/\d/.test(token) || /^[A-Z0-9&\/\-]+$/.test(token)) return token
      const lower = token.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    }).join('')
  }

  // Build CSV from rows with formatted columns (org_link, location, tags)
  function buildCsv(rows){
    const headers = ['name','job_title','company','linkedin','email','org_link','location','tags']
    const lines = [headers.join(',')]
    
    rows.forEach(r=>{
      // Extract formatted fields from buttons/dataAttrs
      let org_link = ''
      let location = ''
      let tags = ''

      // Try to parse r.buttons as array
      let btns = []
      try{
        if(Array.isArray(r.buttons)) btns = r.buttons
        else if(typeof r.buttons === 'string'){
          try{ btns = JSON.parse(r.buttons) }catch(e){ btns = parseLooseButtons(r.buttons) }
        }
      }catch(e){}

      if(Array.isArray(btns) && btns.length){
        // Extract org_link: find button with href containing /organizations/
        const orgBtn = btns.find(b=> b.href && (String(b.href).includes('/#/organizations/') || String(b.href).includes('/organizations/')))
        if(orgBtn && orgBtn.href) org_link = orgBtn.href

        // Extract location: find button with text matching 'City, Country' pattern
        const locBtn = btns.find(b=> b.text && /[A-Za-z]+,\s*[A-Za-z]/.test(b.text))
        if(locBtn && locBtn.text) location = locBtn.text

        // Extract tags: collect non-empty text values, filter noise, dedupe, limit to 6
        const noiseTokens = /^(Access\s+email|N\/A|NA|No\s+email|Copy|View\s+in\s+Apollo|Open\s+profile|Email)$/i
        const tagList = btns.filter(b=> b.text && b.text.trim().length>0 && b.text.length<40 && !noiseTokens.test(b.text.trim())).map(b=>b.text.trim())
        const seen = new Set()
        const deduped = []
        for(const t of tagList){
          const key = t.toLowerCase()
          if(!seen.has(key)){
            seen.add(key)
            deduped.push(t)
          }
        }
        // Remove location-like items from tags if they match location
        try{
          const locNorm = location.toLowerCase().replace(/\s+/g,' ').trim()
          const finalTags = deduped.filter(t=> t.toLowerCase().replace(/\s+/g,' ').trim() !== locNorm)
          tags = finalTags.slice(0,6).map(t=> t.length>60? t.slice(0,57)+'...': t).join('|')
        }catch(e){ tags = deduped.slice(0,6).join('|') }
      }

      // Normalize fields
      let job = (r.job||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim()
      job = job.replace(/\b(N\/A|NA|No\s+email|Access\s+email)\b/gi,'').trim()
      job = job.replace(/[\|\*\u00A0]+/g,' ').replace(/^[^\w\d]+|[^\w\d]+$/g,'').trim()
      job = smartTitleCase(job)

      let company = (r.company||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim()
      company = smartTitleCase(company)

      location = (location||'').replace(/[\r\n]+/g,', ').replace(/\s+,\s+/g,', ').replace(/\s+/g,' ').trim()

      const line = [csvEscape(r.name),csvEscape(job),csvEscape(company),csvEscape(r.linkedin),csvEscape(r.email||''),csvEscape(org_link),csvEscape(location),csvEscape(tags)].join(',')
      lines.push(line)
    })
    return lines.join('\n')
  }

  // Extract email by searching visible text, attributes, and nearby mailto links — no clicks
  function extractHiddenEmail(rowEl, linkEl){
    try{
      const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
      
      // 0) FIRST: Check Apollo's specific "Access email" button structure for hidden email data
      // Based on user's HTML: <button data-cta-variant="secondary" ...><span>Access email</span></button>
      try{
        // Find all buttons with "Access email" text
        const accessButtons = Array.from(rowEl.querySelectorAll('button, a, [role="button"]'))
          .filter(btn => {
            const text = (btn.innerText || btn.textContent || '').trim()
            return /access.*email|show.*email|reveal.*email/i.test(text)
          })
        
        for(const btn of accessButtons){
          // Check if email is stored in any data attribute on the button
          const btnAttrs = Array.from(btn.attributes || [])
          for(const attr of btnAttrs){
            const attrVal = attr.value || ''
            // Check for email patterns in ALL attributes
            if(emailRegex.test(attrVal)){
              const match = attrVal.match(emailRegex)
              if(match && !/no.?email|request|access|example\.com/i.test(match[0])){
                console.log('[Apollo Scraper] 🎯 Found email in button attribute:', attr.name, '=', match[0])
                return match[0]
              }
            }
          }
          
          // Check parent elements of the button (sometimes email is stored on container)
          let parent = btn.parentElement
          for(let i = 0; i < 3 && parent; i++){
            const parentAttrs = Array.from(parent.attributes || [])
            for(const attr of parentAttrs){
              const attrVal = attr.value || ''
              if(emailRegex.test(attrVal)){
                const match = attrVal.match(emailRegex)
                if(match && !/no.?email|request|access|example\.com/i.test(match[0])){
                  console.log('[Apollo Scraper] 🎯 Found email in button parent attribute:', attr.name, '=', match[0])
                  return match[0]
                }
              }
            }
            parent = parent.parentElement
          }
          
          // Check sibling elements (email might be in hidden span next to button)
          const siblings = Array.from(btn.parentElement?.children || [])
          for(const sibling of siblings){
            if(sibling === btn) continue
            const siblingText = (sibling.innerText || sibling.textContent || '').trim()
            if(emailRegex.test(siblingText)){
              const match = siblingText.match(emailRegex)
              if(match && !/no.?email|request|access|example\.com/i.test(match[0])){
                console.log('[Apollo Scraper] 🎯 Found email in button sibling:', match[0])
                return match[0]
              }
            }
            // Check sibling attributes
            const sibAttrs = Array.from(sibling.attributes || [])
            for(const attr of sibAttrs){
              const attrVal = attr.value || ''
              if(emailRegex.test(attrVal)){
                const match = attrVal.match(emailRegex)
                if(match && !/no.?email|request|access|example\.com/i.test(match[0])){
                  console.log('[Apollo Scraper] 🎯 Found email in button sibling attribute:', match[0])
                  return match[0]
                }
              }
            }
          }
          
          // Check for onclick/data-onclick handlers that might contain email
          const onclick = btn.getAttribute('onclick') || btn.getAttribute('data-onclick') || ''
          if(emailRegex.test(onclick)){
            const match = onclick.match(emailRegex)
            if(match && !/no.?email|request|access|example\.com/i.test(match[0])){
              console.log('[Apollo Scraper] 🎯 Found email in onclick handler:', match[0])
              return match[0]
            }
          }
        }
      }catch(e){
        console.log('[Apollo Scraper] Error checking Access email button:', e)
      }
      
      // 1) mailto anchors inside row
      const mailAnchors = Array.from(rowEl.querySelectorAll('a[href^="mailto:"]'))
      for(const a of mailAnchors){ 
        const m = (a.getAttribute('href')||'').match(/mailto:([^?]+)/i)
        if(m && m[1]) return decodeURIComponent(m[1])
      }

      // 2) Scan ALL text content in the row (like apollo-email-scraper does)
      // This catches emails that are already rendered/revealed in the DOM
      const allText = rowEl.innerText || rowEl.textContent || ''
      const emailMatch = allText.match(emailRegex)
      if(emailMatch) {
        const email = emailMatch[0]
        // Skip if it's a placeholder or noise
        if(!/no.?email|request|access|reveal|example\.com|test\.com/i.test(email)) {
          return email
        }
      }

      // 3) Check for email in data attributes across all child elements
      const allElements = Array.from(rowEl.querySelectorAll('*'))
      for(const el of allElements){
        try{
          const attrs = Array.from(el.attributes||[])
          for(const at of attrs){
            // Check data-* attributes that might contain email
            if(/email|contact|mailto/i.test(at.name)){
              const val = at.value || ''
              if(emailRegex.test(val)){
                const match = val.match(emailRegex)
                if(match && !/no.?email|request|access/i.test(match[0])) return match[0]
              }
            }
            // Check href attributes for mailto
            if(/href/i.test(at.name) && at.value && at.value.includes('mailto:')){
              const m = at.value.match(/mailto:([^?]+)/i)
              if(m && m[1]) return decodeURIComponent(m[1])
            }
          }
        }catch(e){}
      }

      // 4) any element with data attributes that include email (original logic)
      const candidates = Array.from(rowEl.querySelectorAll('a, button, span, div, td, th'))
      for(const c of candidates){
        try{
          const attrs = Array.from(c.attributes||[])
          for(const at of attrs){
            if(/email|mailto|data-email|data-contact/i.test(at.name) && at.value && emailRegex.test(at.value)) {
              const match = at.value.match(emailRegex)[0]
              if(!/no.?email|request|access/i.test(match)) return match
            }
            if(/href|data-href|data-url|data-link/i.test(at.name) && at.value && at.value.includes('mailto:')){
              const m = at.value.match(/mailto:([^?]+)/i)
              if(m && m[1]) return decodeURIComponent(m[1])
            }
          }
          // check aria/title/text for emails
          const aria = (c.getAttribute && c.getAttribute('aria-label'))||''
          if(emailRegex.test(aria)) {
            const match = aria.match(emailRegex)[0]
            if(!/no.?email|request|access/i.test(match)) return match
          }
          const title = (c.getAttribute && c.getAttribute('title'))||''
          if(emailRegex.test(title)) {
            const match = title.match(emailRegex)[0]
            if(!/no.?email|request|access/i.test(match)) return match
          }
          
          // Check individual element text (more granular than full row text)
          const txt = (c.innerText||'').trim()
          if(emailRegex.test(txt)) {
            const match = txt.match(emailRegex)[0]
            if(!/no.?email|request|access/i.test(match)) return match
          }
        }catch(e){}
      }

      // 5) data attributes on the row itself
      for(const a of Array.from(rowEl.attributes||[])){
        if(/email|mailto|contact/i.test(a.name) && a.value && emailRegex.test(a.value)) {
          const match = a.value.match(emailRegex)[0]
          if(!/no.?email|request|access/i.test(match)) return match
        }
      }
      
      // 6) AGGRESSIVE: Scan the entire row's outerHTML for email patterns
      // This catches emails that might be in HTML attributes, data-, or hidden fields
      try{
        const rowHTML = rowEl.outerHTML || ''
        // Find all email patterns in the HTML source
        const htmlEmailMatches = rowHTML.match(new RegExp(emailRegex.source, 'gi'))
        if(htmlEmailMatches && htmlEmailMatches.length > 0){
          // Filter out noise and return first valid email
          for(const potentialEmail of htmlEmailMatches){
            if(!/no.?email|request|access|reveal|example\.com|test\.com|placeholder|@apollo\.io/i.test(potentialEmail)){
              console.log('[Apollo Scraper] 🎯 Found email in raw HTML:', potentialEmail)
              return potentialEmail
            }
          }
        }
      }catch(e){}
      
      // 7) Check for hidden input fields that might contain email
      try{
        const hiddenInputs = Array.from(rowEl.querySelectorAll('input[type="hidden"], input[style*="display:none"], input[style*="display: none"]'))
        for(const input of hiddenInputs){
          const inputValue = input.value || input.getAttribute('value') || ''
          if(emailRegex.test(inputValue)){
            const match = inputValue.match(emailRegex)
            if(match && !/no.?email|request|access|example\.com/i.test(match[0])){
              console.log('[Apollo Scraper] 🎯 Found email in hidden input:', match[0])
              return match[0]
            }
          }
        }
      }catch(e){}
      
      // 8) Check for email in CSS classes or IDs (sometimes encoded there)
      try{
        const allElems = Array.from(rowEl.querySelectorAll('*'))
        for(const elem of allElems){
          const className = elem.className || ''
          const elemId = elem.id || ''
          const combined = className + ' ' + elemId
          if(emailRegex.test(combined)){
            const match = combined.match(emailRegex)
            if(match && !/no.?email|request|access|example\.com/i.test(match[0])){
              console.log('[Apollo Scraper] 🎯 Found email in class/id:', match[0])
              return match[0]
            }
          }
        }
      }catch(e){}

      // 6) check table cells if row is a table row (td/th elements contain revealed data)
      if(rowEl.tagName === 'TR'){
        const cells = Array.from(rowEl.querySelectorAll('td, th'))
        for(const cell of cells){
          const cellText = (cell.innerText || cell.textContent || '').trim()
          // Skip placeholder texts
          if(/no\s+email|request.*mobile|n\/?a|access.*email|reveal.*email/i.test(cellText)) continue
          const m = cellText.match(emailRegex)
          if(m && !/no.?email|request|access/i.test(m[0])) return m[0]
          
          // Also check cell's child elements
          const cellLinks = Array.from(cell.querySelectorAll('a, span'))
          for(const link of cellLinks){
            const linkText = (link.innerText || link.textContent || '').trim()
            const linkMatch = linkText.match(emailRegex)
            if(linkMatch && !/no.?email|request|access/i.test(linkMatch[0])) return linkMatch[0]
            
            // Check href
            if(link.href && link.href.includes('mailto:')){
              const hm = link.href.match(/mailto:([^?]+)/i)
              if(hm && hm[1]) return decodeURIComponent(hm[1])
            }
          }
        }
      }

      // 7) check immediately adjacent sibling elements (sometimes email shown in a sibling cell)
      let parent = linkEl && linkEl.parentElement || rowEl
      for(let i=0;i<3 && parent;i++, parent = parent.parentElement){
        const text = (parent.innerText||'')
        const m = text.match(emailRegex)
        if(m && !/no.?email|request|access/i.test(m[0])) return m[0]
      }

      // 8) Check for hidden input fields or data elements within the row
      const hiddenInputs = Array.from(rowEl.querySelectorAll('input[type="hidden"], input[style*="display: none"], input[style*="display:none"]'))
      for(const input of hiddenInputs){
        const val = input.value || input.getAttribute('value') || ''
        if(emailRegex.test(val)){
          const match = val.match(emailRegex)[0]
          if(!/no.?email|request|access/i.test(match)) return match
        }
      }

      return ''
    }catch(e){ return '' }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg && msg.action==='scrape'){
      (async function(){
        try{
          if(msg.options && msg.options.collectAll){
            // collect across pagination
            const result = await collectAllPagesAndScrape({clickEmail: !!(msg.options && msg.options.clickEmail)})
            const csv = buildCsv(result.rows)
            sendResponse({csv,count:result.rows.length})
            return
          }
          // simple path: optionally scroll to load virtual rows
          try{ if(msg.options && msg.options.collectAll) await autoScrollList(); else await sleep(200) }catch(e){}
          let rows = scrapeApollo()
          // fallback: if no rows found, try table-based extraction (some UIs render a table)
          if((!rows || rows.length===0)){
            try{
              const table = document.querySelector('table')
              if(table){
                const tableResult = buildCsvFromTable(table)
                if(tableResult && tableResult.csv){ sendResponse({csv:tableResult.csv,count:tableResult.count}); return }
              }
            }catch(e){ /* ignore */ }
            // next fallback: try to use captured network responses to build rows
            try{
              const netPersons = getPersonsFromCapturedNetwork()
              if(netPersons && netPersons.length){
                const csvLines = ['name,job_title,company,linkedin,email']
                netPersons.forEach(p=> csvLines.push([csvEscape(p.name), csvEscape(p.job), csvEscape(p.company), csvEscape(p.linkedin), csvEscape(p.email)].join(',')))
                sendResponse({csv: csvLines.join('\n'), count: netPersons.length})
                return
              }
            }catch(e){ /* ignore */ }
          }
          // if requested, click access-email buttons to reveal emails (sequential to avoid race)
          if(msg.options && msg.options.clickEmail){
            try{ await revealEmailsForRows(rows, {timeout:4000, delayBetween:250, progressHook: emailProgressHook}) }catch(e){ /* ignore individual errors */ }
          }
          const csv = buildCsv(rows)
          sendResponse({csv,count:rows.length})
        }catch(err){ sendResponse({error: String(err)}) }
      })()
      // return true to indicate we'll call sendResponse asynchronously
      return true
    }
  })

  // Table-based CSV builder modeled after the reference extension's logic.
  // Clones the table, strips icons/buttons, sanitizes text, formats phones, and
  // splits the "Name" column into First/Last/Full. Returns CSV (with BOM) and row count.
  function buildCsvFromTable(tableEl){
    try{
      const clonedTable = tableEl.cloneNode(true)
      // remove noisy elements
      const elementsToRemove = clonedTable.querySelectorAll('svg, img, button, input[type="checkbox"]')
      elementsToRemove.forEach(el=>{ try{ el.parentNode && el.parentNode.removeChild(el) }catch(e){} })

      // prepare rows
      const rows = Array.from(clonedTable.querySelectorAll('tr'))
      if(!rows || rows.length===0) return null

      let headerProcessed = false
      let nameIndex = -1
      let quickActionsIndex = -1
      const lines = [ '\uFEFF' ] // BOM-prefixed CSV

      for(const row of rows){
        const cells = Array.from(row.querySelectorAll('th, td'))
        if(!cells || cells.length===0) continue
        const rowData = []

        for(let i=0;i<cells.length;i++){
          // header row handling
          if(row === rows[0]){
            if(!headerProcessed){
              const txt = (cells[i].innerText||'').trim()
              if(txt === 'Name') nameIndex = i
              if(txt === 'Quick Actions') { quickActionsIndex = i; continue }
            } else { continue }
          }

          if(i === quickActionsIndex) continue

          let cellText = (cells[i].innerText||'')
          // special Name column handling
          if(i === nameIndex){
            if(row === rows[0] && !headerProcessed){
              rowData.push('"First Name"','"Last Name"','"Full Name"')
            }else{
              const names = cellText.trim().split(/\s+/)
              const firstName = names[0] || ''
              const lastName = names.slice(1).join(' ') || ''
              const fullName = cellText.trim()
              rowData.push('"'+firstName.replace(/"/g,'""')+'"','"'+lastName.replace(/"/g,'""')+'"','"'+fullName.replace(/"/g,'""')+'"')
            }
            continue
          }

          // normalize certain placeholder texts
          if(cellText === 'No email' || cellText === 'Request Mobile Number' || cellText === 'NA') cellText = ' '

          // phone formatting: match + followed by 11 digits and format roughly as in reference
          try{
            const phoneRegex = /\+(\d{1})(\d{3})(\d{3})(\d{4})/g
            cellText = cellText.replace(phoneRegex, function(_, p1,p2,p3,p4){ return '+'+p1+' ('+p2+') '+p3+'-'+p4 })
          }catch(e){}

          // sanitize: remove non-printable and odd characters, remove U+00C2 artifacts
          cellText = cellText.replace(/[^a-zA-Z0-9\s,.@-]/g, '').replace(/\u00c2/g, '')
          cellText = cellText.replace(/"/g,'""').replace(/#/g,'').trim()
          rowData.push('"'+cellText+'"')
        }

        // skip rows that are header-like
        if(row !== rows[0] && rowData.length === 1 && rowData[0] && rowData[0].includes('Name')){
          continue
        }

        lines.push(rowData.join(','))
        if(row === rows[0]) headerProcessed = true
      }

      const csv = lines.join('\r\n')
      const count = Math.max(0, lines.length - 1 - (headerProcessed ? 0 : 0))
      return {csv, count}
    }catch(e){ return null }
  }

  // progress hook will send runtime messages back to popup
  function emailProgressHook(current, total, info){
    try{ chrome.runtime.sendMessage({action:'scrape_progress', stage:'reveal', current, total, info}) }catch(e){}
  }

  // Collect all pages by auto-scrolling and clicking "next" until no more pages found.
  async function collectAllPagesAndScrape(opts={clickEmail:false}){
    const accumulated = []
    const seenKeys = new Set()
    const maxPages = 80
    let page = 0

    function rowKey(r){
      // prefer person id from link if possible
      try{
        const a = r.containerEl && r.containerEl.querySelector && r.containerEl.querySelector('a[href*="/people/"]')
        if(a && a.href){ const m = a.href.match(/people\/(?:#?\/)?([^\/?#]+)/); if(m && m[1]) return m[1] }
      }catch(e){}
      return (r.name||'') + '|' + (r.company||'')
    }

    for(page=0; page<maxPages; page++){
      // allow lazy render
      await autoScrollList()
      await sleep(300)
      const scraped = scrapeApollo()
      let newCount = 0
      for(const r of scraped){
        const k = rowKey(r)
        if(!seenKeys.has(k)){
          seenKeys.add(k); accumulated.push(r); newCount++
        }
      }
      // send progress update
      try{ chrome.runtime.sendMessage({action:'scrape_progress', stage:'scrape', page: page+1, currentRows: accumulated.length, newRows: newCount}) }catch(e){}

      // attempt to find a "next page" control
      const next = findNextButton()
      if(!next) break
      // click and wait for content change
      try{ next.click() }catch(e){ try{ next.dispatchEvent(new MouseEvent('click',{bubbles:true})); }catch(e){} }
      // wait until URL or DOM changes significantly
      const changed = await waitForNewContent(3000)
      if(!changed){
        // small additional wait and try once more
        await sleep(800)
      }
    }
    
    // ========== CREDIT-FREE EMAIL ENHANCEMENT ==========
    // Try to merge emails from network-captured API responses
    console.log('[Apollo Scraper] 🔍 Checking network-captured API responses for emails...')
    const networkPersons = getPersonsFromCapturedNetwork()
    console.log('[Apollo Scraper] 📡 Found', networkPersons.length, 'person objects in network capture')
    
    if(networkPersons.length > 0){
      let networkMatchCount = 0
      accumulated.forEach(row => {
        if(!row.email || !row.email.trim()){
          // Try to match by name or LinkedIn
          const matchedPerson = networkPersons.find(p => {
            if(p.name && row.name && p.name.toLowerCase().includes(row.name.toLowerCase().split(' ')[0])){
              return true
            }
            if(p.linkedin && row.linkedin && p.linkedin === row.linkedin){
              return true
            }
            if(p.company && row.company && p.company.toLowerCase() === row.company.toLowerCase()){
              const rowFirstName = (row.name || '').split(' ')[0].toLowerCase()
              const pFirstName = (p.name || '').split(' ')[0].toLowerCase()
              if(rowFirstName && pFirstName && rowFirstName === pFirstName){
                return true
              }
            }
            return false
          })
          
          if(matchedPerson && matchedPerson.email && matchedPerson.email.trim()){
            row.email = matchedPerson.email.trim()
            row.emailSource = 'network'
            networkMatchCount++
            console.log('[Apollo Scraper] 📡 Matched network email for', row.name, ':', matchedPerson.email)
          }
        }
      })
      
      if(networkMatchCount > 0){
        console.log('[Apollo Scraper] ✅ Enriched', networkMatchCount, 'emails from network capture (NO CREDITS USED!)')
      }
    }
    // ====================================================

    // optionally reveal emails for accumulated rows
    if(opts.clickEmail){
      await revealEmailsForRows(accumulated, {timeout:4000, delayBetween:250, progressHook: emailProgressHook})
    }

    return {rows: accumulated}
  }

  function findNextButton(){
    // heuristics for next button / pagination
    const candidates = Array.from(document.querySelectorAll('a, button, div[role="button"]'))
    const next = candidates.find(el=>{
      const txt = (el.innerText||'').trim()
      const aria = (el.getAttribute && el.getAttribute('aria-label'))||''
      if(/next|›|»|more/i.test(txt)) return true
      if(/next/i.test(aria)) return true
      if((el.getAttribute && el.getAttribute('rel')==='next')) return true
      return false
    })
    return next || null
  }

  function waitForNewContent(timeout){
    return new Promise(resolve=>{
      const start = Date.now()
      const initial = document.body.innerText.length
      const iv = setInterval(()=>{
        if(Date.now()-start > timeout){ clearInterval(iv); return resolve(false) }
        try{ if(Math.abs(document.body.innerText.length - initial) > 50) { clearInterval(iv); return resolve(true) } }catch(e){}
      }, 250)
    })
  }

  // Click-based email reveal: find access-email buttons in a row, click, and wait for revealed email
  async function revealEmailForRow(containerEl, opts={timeout:4000, progressHook:null}){
    if(!containerEl) return ''
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    // candidate button selectors / texts
    const btnCandidates = Array.from(containerEl.querySelectorAll('button, a'))
      .filter(b=>b && (/(access|view|reveal|show).{0,10}email/i.test((b.innerText||'') + ' ' + ((b.getAttribute && b.getAttribute('aria-label'))||'')) || (b.getAttribute && /data-email|data-contact|data-person/i.test(b.getAttribute('data-action')||''))))

    // also include buttons with specific icons/aria that may trigger email
    if(btnCandidates.length===0){
      const allBtns = Array.from(containerEl.querySelectorAll('button, a'))
      for(const b of allBtns){
        const aria = (b.getAttribute && b.getAttribute('aria-label'))||''
        if(/email/i.test(aria) || /(access|view|reveal|show).{0,10}email/i.test((b.innerText||''))){ btnCandidates.push(b) }
      }
    }

    // helper: extract all emails from a root element (text + inputs)
    function extractEmailsFromRoot(root){
      const emailRegexGlobal = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig
      const set = new Set()
      try{
        const text = (root && root.innerText) ? root.innerText : (document.body && document.body.innerText) || ''
        let m;
        while((m = emailRegexGlobal.exec(text))){ set.add(m[0]) }
      }catch(e){}
      try{
        const inputs = Array.from((root||document).querySelectorAll ? (root.querySelectorAll('input, textarea')) : [])
        for(const inp of inputs){ const v = inp.value || inp.getAttribute && inp.getAttribute('value') || ''; if(v){ const mt = v.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); if(mt) set.add(mt[0]) } }
      }catch(e){}
      return set
    }

    // helper: observe DOM mutations and also check input/tooltip values for revealed emails
    function observeForEmail(timeout, preExisting){
      const start = Date.now()
      return new Promise(resolve=>{
        let resolved = false
        const checkNow = ()=>{
          try{
            // 1) search inside container
            const txt = (containerEl.innerText||'')
            let m = txt.match(emailRegex)
            if(m){ resolved=true; cleanup(); return resolve(m[0]) }
            // 2) search dialogs/popovers
            const pop = document.querySelector('[role="dialog"], .popover, .modal, [data-popover]')
            if(pop){ const mt = (pop.innerText||'').match(emailRegex); if(mt){ if(!preExisting || !preExisting.has(mt[0])){ resolved=true; cleanup(); return resolve(mt[0]) } }
            }
            // 3) search input fields and value attributes (some popovers render input with email value)
            const inputs = Array.from(document.querySelectorAll('input, textarea'))
            for(const inp of inputs){ const v = inp.value || inp.getAttribute('value') || ''; if(v && emailRegex.test(v)){ const found = (v.match(emailRegex)||[])[0]; if(!preExisting || !preExisting.has(found)){ resolved=true; cleanup(); return resolve(found) } } }
            // 4) recently added elements anywhere in document (but prefer new ones not in preExisting)
            const candidates = Array.from(document.querySelectorAll('a, span, div, p'))
            for(const el of candidates){ const t = (el.innerText||''); const mm = t.match(emailRegex); if(mm){ const f = mm[0]; if(!preExisting || !preExisting.has(f)) { resolved=true; cleanup(); return resolve(f) } } }
          }catch(e){}
          if(Date.now() - start > timeout){ resolved=true; cleanup(); return resolve('') }
        }

        const obs = new MutationObserver(()=>{ checkNow() })
        obs.observe(document.body, {childList:true, subtree:true, attributes:true, characterData:true})

        const iv = setInterval(()=>{ if(!resolved) checkNow() }, 300)
        function cleanup(){ try{ obs.disconnect() }catch(e){} try{ clearInterval(iv) }catch(e){} }
        // initial check
        checkNow()
      })
    }

    for(const b of btnCandidates){
      try{
        // before clicking snapshot existing emails on the page
        const pre = extractEmailsFromRoot(document)
        // click the button to reveal (some buttons are anchors)
        try{ b.click() }catch(e){ try{ b.dispatchEvent(new MouseEvent('click',{bubbles:true})) }catch(e){} }
        // notify progress
        if(opts && typeof opts.progressHook === 'function'){
          try{ opts.progressHook(0,0,'clicked') }catch(e){}
        }
        // wait for email to appear via observer; require new email (not in pre)
        const found = await observeForEmail(opts.timeout||4000, pre)
        if(found) return found
      }catch(e){ /* ignore */ }
    }

    // final fallback: run the non-click extractor inside the container
    try{ const nc = extractHiddenEmail(containerEl, containerEl); if(nc) return nc }catch(e){}
    return ''
  }

  // Sequentially reveal emails for an array of rows
  async function revealEmailsForRows(rows, opts={timeout:4000, delayBetween:200, progressHook:null}){
    if(!rows || !rows.length) return
    const total = rows.length
    let idx = 0
    for(const r of rows){
      idx++
      try{
        if(r.email && r.email.length){
          if(opts && typeof opts.progressHook === 'function') try{ opts.progressHook(idx, total, 'already') }catch(e){}
          continue
        }
        if(opts && typeof opts.progressHook === 'function') try{ opts.progressHook(idx, total, 'start') }catch(e){}
        const found = await revealEmailForRow(r.containerEl, {timeout:opts.timeout, progressHook: opts.progressHook})
        if(found) r.email = found
        if(opts && typeof opts.progressHook === 'function') try{ opts.progressHook(idx, total, found?('found:'+found):'notfound') }catch(e){}
      }catch(e){ /* ignore per-row */ }
      // small delay to be polite
      await sleep(opts.delayBetween||200)
    }
  }

  // Try to find a scrollable list container and auto-scroll until no new rows load
  function findScrollableContainer(){
    // common Apollo container candidates
    const candidates = Array.from(document.querySelectorAll('[data-qa="people-list"], [data-testid="people-list"], .people-list, .people-list-container, tbody'))
    for(const c of candidates){
      if(c && c.scrollHeight && c.scrollHeight > c.clientHeight) return c
    }
    // fallback: largest scrollable element
    const all = Array.from(document.querySelectorAll('div, section'))
    let best = null
    for(const el of all){
      if(el.scrollHeight && el.scrollHeight > el.clientHeight){
        if(!best || el.scrollHeight > best.scrollHeight) best = el
      }
    }
    return best || document.scrollingElement || document.documentElement
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }

  async function autoScrollList(){
    const container = findScrollableContainer()
    if(!container) return
    const maxIter = 60
    let lastHeight = -1
    let sameCount = 0
    for(let i=0;i<maxIter;i++){
      try{
        container.scrollTo({top: container.scrollHeight, behavior:'auto'})
      }catch(e){ container.scrollTop = container.scrollHeight }
      await sleep(500)
      const h = container.scrollHeight
      if(h === lastHeight){ sameCount++ } else { sameCount = 0; lastHeight = h }
      // stop if stable for 3 iterations
      if(sameCount >= 3) break
    }
    // small extra wait to allow lazy content to render
    await sleep(300)
  }

  // Also expose a global scrape function for debugging
  window.__apolloScrape = function(){ const r=scrapeApollo(); return {rows:r,csv:buildCsv(r)} }

})();
