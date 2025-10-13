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

  // Attempt to find list rows inside Apollo people listing.
  function scrapeApollo(){
    const rows = []

    const linkSelectors = ['a[href*="/people/"]','a[href*="/person/">]','a[href*="/profiles/"]']
    // gather all profile links; we'll dedupe by person id from the href
    let profileLinks = Array.from(document.querySelectorAll('a[href*="/people/"], a[href*="/person/"], a[href*="/profiles/"]'))
      .filter(l => l && l.offsetParent !== null)

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

    if(containers.length===0){
      const fallback = Array.from(document.querySelectorAll('[data-qa="people-list"] [data-qa="people-list-row"], [data-testid="people-row"], tbody tr, .people-list-item, .ProfileListItem'))
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
        if(!name) return // skip empty rows

        // job title
        let job = ''
        const jobSel = el.querySelector('[data-qa*="job"]') || el.querySelector('.job-title') || el.querySelector('.headline') || el.querySelector('.title') || el.querySelector('[aria-label*="title"]')
        job = jobSel ? (jobSel.innerText||'').trim() : ''

        // company
        let company = ''
        const compSel = el.querySelector('[data-qa*="company"]') || el.querySelector('.company') || el.querySelector('[data-qa*="org"]') || el.querySelector('[aria-label*="company"]')
        company = compSel ? (compSel.innerText||'').trim() : ''

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
        const email = extractHiddenEmail(el, pair.link)

        rows.push({name,job,company,linkedin,buttons,dataAttrs,email,containerEl: el})
      }catch(e){ /* ignore */ }
    })

    return rows
  }

  // Build CSV from rows
  function buildCsv(rows){
    const headers = ['name','job_title','company','linkedin','email','buttons_json','data_attrs_json']
    const lines = [headers.join(',')]
    rows.forEach(r=>{
      const buttonsJson = JSON.stringify(r.buttons||[]) 
      const dataJson = JSON.stringify(r.dataAttrs||{})
      const line = [csvEscape(r.name),csvEscape(r.job),csvEscape(r.company),csvEscape(r.linkedin),csvEscape(r.email||''),csvEscape(buttonsJson),csvEscape(dataJson)].join(',')
      lines.push(line)
    })
    return lines.join('\n')
  }

  // Extract email by searching visible text, attributes, and nearby mailto links — no clicks
  function extractHiddenEmail(rowEl, linkEl){
    try{
      const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
      // 1) mailto anchors inside row
      const mailAnchors = Array.from(rowEl.querySelectorAll('a[href^="mailto:"]'))
      for(const a of mailAnchors){ const m = (a.getAttribute('href')||'').match(/mailto:([^?]+)/i); if(m && m[1]) return decodeURIComponent(m[1]) }

      // 2) any element with data attributes that include email
      const candidates = Array.from(rowEl.querySelectorAll('a, button, span, div'))
      for(const c of candidates){
        try{
          const attrs = Array.from(c.attributes||[])
          for(const at of attrs){
            if(/email|mailto|data-email|data-contact/i.test(at.name) && at.value && emailRegex.test(at.value)) return at.value.match(emailRegex)[0]
            if(/href|data-href|data-url|data-link/i.test(at.name) && at.value && at.value.includes('mailto:')){
              const m = at.value.match(/mailto:([^?]+)/i); if(m && m[1]) return decodeURIComponent(m[1])
            }
          }
          // check aria/title/text for emails
          const aria = (c.getAttribute && c.getAttribute('aria-label'))||''
          if(emailRegex.test(aria)) return aria.match(emailRegex)[0]
          const title = (c.getAttribute && c.getAttribute('title'))||''
          if(emailRegex.test(title)) return title.match(emailRegex)[0]
          const txt = (c.innerText||'')
          if(emailRegex.test(txt)) return txt.match(emailRegex)[0]
        }catch(e){}
      }

      // 3) data attributes on the row itself
      for(const a of Array.from(rowEl.attributes||[])){
        if(/email|mailto|contact/i.test(a.name) && a.value && emailRegex.test(a.value)) return a.value.match(emailRegex)[0]
      }

      // 4) check immediately adjacent sibling elements (sometimes email shown in a sibling cell)
      let parent = linkEl && linkEl.parentElement || rowEl
      for(let i=0;i<3 && parent;i++, parent = parent.parentElement){
        const text = (parent.innerText||'')
        const m = text.match(emailRegex)
        if(m) return m[0]
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
          const rows = scrapeApollo()
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
