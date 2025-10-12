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

        rows.push({name,job,company,linkedin,buttons,dataAttrs})
      }catch(e){ /* ignore */ }
    })

    return rows
  }

  // Build CSV from rows
  function buildCsv(rows){
    const headers = ['name','job_title','company','linkedin','buttons_json','data_attrs_json']
    const lines = [headers.join(',')]
    rows.forEach(r=>{
      const buttonsJson = JSON.stringify(r.buttons||[]) 
      const dataJson = JSON.stringify(r.dataAttrs||{})
      const line = [csvEscape(r.name),csvEscape(r.job),csvEscape(r.company),csvEscape(r.linkedin),csvEscape(buttonsJson),csvEscape(dataJson)].join(',')
      lines.push(line)
    })
    return lines.join('\n')
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg && msg.action==='scrape'){
      const rows = scrapeApollo()
      const csv = buildCsv(rows)
      sendResponse({csv,count:rows.length})
    }
  })

  // Also expose a global scrape function for debugging
  window.__apolloScrape = function(){ const r=scrapeApollo(); return {rows:r,csv:buildCsv(r)} }

})();
