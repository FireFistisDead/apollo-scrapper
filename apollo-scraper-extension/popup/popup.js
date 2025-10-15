const scrapeBtn = document.getElementById('scrapeBtn')
const previewBtn = document.getElementById('previewBtn')
const downloadBtn = document.getElementById('downloadBtn')
const progressBar = document.getElementById('progressBar')
const totalCountEl = document.getElementById('totalCount')
const status = document.getElementById('status')
const preview = document.getElementById('preview')
const filenameInput = document.getElementById('filenameInput')
const flattenCheckbox = document.getElementById('flattenCheckbox')

let lastCsv = ''

function setStatus(s){ status.textContent = s }

// CSV escape helper for values used when building downloads from the popup
function csvEscape(v){
  if(v==null) return ''
  const s = String(v)
  if(s.includes(',') || s.includes('"') || s.includes('\n')){
    return '"' + s.replace(/"/g,'""') + '"'
  }
  return s
}

// Tolerant parser for malformed 'buttons_json' or similar fields.
// Many rows produce fragments like: [{text:",aria:Copy,href:"},{text:ttb bank,aria:",href:https://app.apollo.io/#/organizations/609...},...]
// This helper extracts an array of {text, href, aria} objects from such loose strings.
function parseLooseButtons(raw){
  if(!raw || typeof raw !== 'string') return []
  const out = []
  try{
    // try to extract brace-delimited blocks first
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
      // discard empty blocks
      if(obj.text || obj.href || obj.aria) out.push(obj)
    }
    // If nothing found, try simple href/text captures in order
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
  }catch(e){ /* ignore */ }
  return out
}

// Normalize and clean extracted fields into final outputs
function normalizeRow(fields){
  // fields: {name, job_title, company, linkedin, email, org_link, location, tags}
  const out = Object.assign({}, fields)
  // clean job_title: remove repeated whitespace, stray newlines, trailing punctuation
  try{
    out.job_title = (out.job_title||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim()
    // remove placeholder tokens like 'N/A', 'No email', 'Access email' etc
    out.job_title = out.job_title.replace(/\b(N\/A|NA|No\s+email|Access\s+email)\b/gi,'').trim()
    // remove trailing punctuation
    out.job_title = out.job_title.replace(/[\|\*\u00A0]+/g,' ').replace(/^[^\w\d]+|[^\w\d]+$/g,'').trim()
    // apply smart title case for readability, but preserve existing all-caps/acronyms
    out.job_title = smartTitleCase(out.job_title)
  }catch(e){}

  // clean company
  try{ out.company = (out.company||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim() }catch(e){}
  try{ out.company = smartTitleCase(out.company) }catch(e){}

  // normalize org_link: ensure http(s) format or empty
  try{ if(out.org_link && out.org_link.trim().length){ out.org_link = out.org_link.trim() } else out.org_link = '' }catch(e){ out.org_link = '' }

  // normalize location: keep 'City, Country' or single token; remove duplicates
  try{ out.location = (out.location||'').replace(/[\r\n]+/g,', ').replace(/\s+,\s+/g,', ').replace(/\s+/g,' ').trim() }catch(e){}

  // normalize tags: split on | or comma/semicolon/newline, dedupe, limit to 6
  try{
    let tags = out.tags || ''
    if(Array.isArray(tags)) tags = tags.join('|')
    tags = String(tags||'')
    // sometimes tags contain the fallback duplicate like 'N/A\n0|City, Country' — remove the numeric patterns
    tags = tags.replace(/\b0\|[^|]*$/,'')
    let parts = tags.split(/[|,;\n]/).map(s=>s.trim()).filter(Boolean)
    // remove common noise
    const noiseRe = /^(Access email|Access Mobile|N\/A|No email|Copy|Manage sequences|More-button|lists-button|linkedin link|N3O|0)$/i
    parts = parts.filter(p => !noiseRe.test(p))
    // dedupe preserving order
    const seen = new Set()
    const outParts = []
    for(const p of parts){ const key = p.toLowerCase(); if(!seen.has(key)){ seen.add(key); outParts.push(p) } }
    // remove location-like items from tags if they match the location field
    try{
      const locNorm = (out.location||'').toLowerCase().replace(/\s+/g,' ').trim()
      const finalParts = outParts.filter(pp=> pp.toLowerCase().replace(/\s+/g,' ').trim() !== locNorm)
      out.tags = finalParts.slice(0,6).map(t=> t.length>60? t.slice(0,57)+'...': t).join('|')
    }catch(e){ out.tags = outParts.slice(0,6).join('|') }
  }catch(e){ out.tags = out.tags || '' }

  return out
}

// Smart title-case: preserve all-caps words (acronyms), keep numbers and punctuation
function smartTitleCase(s){
  if(!s) return ''
  return s.split(/(\s+)/).map(token=>{
    if(!token.trim()) return token
    // preserve tokens that contain digits or are all uppercase or contain / or &
    if(/\d/.test(token) || /^[A-Z0-9&\/\-]+$/.test(token)) return token
    // lowercase then uppercase first letter
    const lower = token.toLowerCase()
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }).join('')
}

// initial UI state
setStatus('Ready')
preview.innerHTML = '<div style="color:#999;font-size:12px">Preview will appear here after scraping.</div>'
previewBtn.disabled = true
downloadBtn.disabled = true

scrapeBtn.addEventListener('click', async ()=>{
  setStatus('Injecting scraper...')
  preview.innerHTML = ''
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true})
  try{
    await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: ['content_script.js']
    })
    // ask content script to run; send options
  const collectAll = document.getElementById('collectAllChk') && document.getElementById('collectAllChk').checked
  const clickEmail = document.getElementById('clickEmailChk') && document.getElementById('clickEmailChk').checked
  const res = await chrome.tabs.sendMessage(tab.id, {action:'scrape', options:{collectAll, clickEmail}})
    if(!res || !res.csv){
      setStatus('No data found on this page')
      preview.innerHTML = '<div style="color:#999;font-size:12px">No rows found. Try scrolling to load more rows and run again.</div>'
      previewBtn.disabled = true
      downloadBtn.disabled = true
      return
    }
    lastCsv = res.csv
    setStatus('Scrape complete — ' + res.count + ' rows')
    if(res.count>0){
      previewBtn.disabled = false
      downloadBtn.disabled = false
    }else{
      previewBtn.disabled = true
      downloadBtn.disabled = true
      preview.innerHTML = '<div style="color:#999;font-size:12px">No rows found. Try scrolling to load more rows and run again.</div>'
    }
  }catch(err){
    setStatus('Error: ' + (err.message||err))
    console.error(err)
  }
})

// listen for progress messages from content script
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  try{
    if(msg && msg.action==='scrape_progress'){
      if(msg.stage==='scrape'){
        setStatus('Scraping pages — page ' + (msg.page||'?') + ', total rows: ' + (msg.currentRows||0) + (msg.newRows?(' (+'+msg.newRows+')') : ''))
        if(totalCountEl) totalCountEl.textContent = String(msg.currentRows||0)
      }else if(msg.stage==='reveal'){
        setStatus('Revealing emails — ' + (msg.current||0) + ' / ' + (msg.total||'?') + (msg.info?(' — '+msg.info):''))
        if(progressBar && msg.total){
          try{ progressBar.max = msg.total; progressBar.value = msg.current }catch(e){}
        }
      }
    }
  }catch(e){ }
})

previewBtn.addEventListener('click', ()=>{
  if(!lastCsv) return
  preview.innerHTML = ''
  const rows = parseCsv(lastCsv)
  // map headers to indices (support CSVs produced by different fallbacks)
  const h = rows.headers || []
  const idx = name => Math.max(0, h.indexOf(name))
  const nameIdx = h.indexOf('name') >= 0 ? h.indexOf('name') : 0
  const jobIdx = h.indexOf('job_title') >= 0 ? h.indexOf('job_title') : (h.indexOf('job') >= 0 ? h.indexOf('job') : 1)
  const companyIdx = h.indexOf('company') >= 0 ? h.indexOf('company') : 2
  const linkedinIdx = h.indexOf('linkedin') >= 0 ? h.indexOf('linkedin') : 3
  const emailIdx = h.indexOf('email') >= 0 ? h.indexOf('email') : 4
  const btnIdx = h.indexOf('buttons_json') >= 0 ? h.indexOf('buttons_json') : (h.indexOf('buttons') >= 0 ? h.indexOf('buttons') : -1)
  const dataIdx = h.indexOf('data_attrs_json') >= 0 ? h.indexOf('data_attrs_json') : (h.indexOf('data_attrs') >= 0 ? h.indexOf('data_attrs') : -1)
  
  // Check if CSV already has formatted columns (new format from content script)
  const orgLinkIdx = h.indexOf('org_link')
  const locationIdx = h.indexOf('location')
  const tagsIdx = h.indexOf('tags')
  const hasFormattedColumns = (orgLinkIdx >= 0 || locationIdx >= 0 || tagsIdx >= 0)

  // build formatted rows: base columns + flattened columns when requested
  const formatted = []
  const headersOut = ['name','job_title','company','linkedin','email']
  const extraCols = ['org_link','location','tags']
  if(flattenCheckbox && flattenCheckbox.checked){ headersOut.push(...extraCols) }

  rows.data.forEach(r=>{
    const base = {
      name: (r[nameIdx]||'')
      ,job_title: (r[jobIdx]||'')
      ,company: (r[companyIdx]||'')
      ,linkedin: (r[linkedinIdx]||'')
      ,email: (r[emailIdx]||'')
    }
    let extra = {org_link:'',location:'',tags:''}

    // If CSV already has formatted columns, use them directly
    if(hasFormattedColumns){
      if(orgLinkIdx >= 0) extra.org_link = r[orgLinkIdx] || ''
      if(locationIdx >= 0) extra.location = r[locationIdx] || ''
      if(tagsIdx >= 0) extra.tags = r[tagsIdx] || ''
    }else{
      // Legacy path: extract from JSON columns
      // helper to attempt to extract metadata from a JSON column
      function extractFromJsonColumn(jsonText){
        if(!jsonText) return
        let parsed = null
        try{ parsed = JSON.parse(jsonText) }catch(e){ parsed = null }
        // if parse failed, try tolerant loose parse
        if(parsed === null){
          const loose = parseLooseButtons(jsonText)
          if(loose && loose.length){
            const orgBtn = loose.find(b=> b.href && (String(b.href).includes('/#/organizations/') || String(b.href).includes('/organizations/')) )
            if(orgBtn && orgBtn.href) extra.org_link = extra.org_link || orgBtn.href
            const locBtn = loose.find(b=> b.text && /[A-Za-z]+,\s*[A-Za-z]/.test(b.text))
            if(locBtn) extra.location = extra.location || locBtn.text
            const tagList = loose.filter(b=>b.text && b.text.length>0 && b.text.length<40).map(b=>b.text).slice(0,6)
            if(tagList.length) extra.tags = extra.tags || tagList.join('|')
            return
          }
        }
        try{
          // if it's an array of buttons
          if(Array.isArray(parsed)){
            const btns = parsed
            const orgBtn = btns.find(b=> (b.href && String(b.href).includes('/#/organizations/')) || (b.href && String(b.href).includes('/organizations/')) )
            if(orgBtn && orgBtn.href) extra.org_link = extra.org_link || orgBtn.href
            const locBtn = btns.find(b=> b.text && b.text.match(/[A-Za-z]+,\s*[A-Za-z]/))
            if(locBtn) extra.location = extra.location || locBtn.text
            const tagList = btns.filter(b=>b.text && b.text.length>0 && b.text.length<40).map(b=>b.text).slice(0,6)
            if(tagList.length) extra.tags = extra.tags || tagList.join('|')
          }else if(typeof parsed === 'object' && parsed !== null){
            // try to find organization link or tags in object keys
            const flat = JSON.stringify(parsed)
            const orgMatch = flat.match(/https?:\/\/[^"]*organizations[^"]*/i)
            if(orgMatch) extra.org_link = extra.org_link || orgMatch[0]
            // tags may be present under keys like tags, label, categories
            if(parsed.tags) extra.tags = extra.tags || (Array.isArray(parsed.tags) ? parsed.tags.join('|') : String(parsed.tags))
            if(parsed.location) extra.location = extra.location || String(parsed.location)
          }
        }catch(e){ /* ignore parse errors */ }
      }

      // try buttons_json first, then data_attrs_json, then heuristics
      if(btnIdx >= 0 && r[btnIdx]) extractFromJsonColumn(r[btnIdx])
      if(!extra.org_link && dataIdx >= 0 && r[dataIdx]) extractFromJsonColumn(r[dataIdx])

      // heuristic fallback: if no JSON present, try to detect org_link/location/tags from any extra columns
      if(!extra.org_link || !extra.tags || !extra.location){
        for(let i=0;i<r.length;i++){
          if(i===nameIdx||i===jobIdx||i===companyIdx||i===linkedinIdx||i===emailIdx) continue
          const v = r[i] || ''
          if(!v) continue
          // urls containing organizations
          if(!extra.org_link && /https?:\/\/[^\s]*organizations?/i.test(v)) extra.org_link = v
          // location heuristics: contains comma and letters
          if(!extra.location && /[A-Za-z]+,\s*[A-Za-z]/.test(v)) extra.location = v
          // tags heuristics: small pipe/space separated tokens
          if(!extra.tags){
            const parts = String(v).split(/[|,;\n]/).map(s=>s.trim()).filter(Boolean)
            if(parts.length>0 && parts.length<10){ extra.tags = parts.join('|') }
          }
        }
      }
    }

    const assembled = { name: base.name, job_title: base.job_title, company: base.company, linkedin: base.linkedin, email: base.email, org_link: extra.org_link, location: extra.location, tags: extra.tags }
    const normalized = normalizeRow(assembled)
    const rowOut = [normalized.name, normalized.job_title, normalized.company, normalized.linkedin, normalized.email]
    if(flattenCheckbox && flattenCheckbox.checked) rowOut.push(normalized.org_link, normalized.location, normalized.tags)
    formatted.push(rowOut)
  })

  // render table
  preview.innerHTML = ''
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  headersOut.forEach(h=>{const th=document.createElement('th');th.textContent=h;headerRow.appendChild(th)})
  thead.appendChild(headerRow)
  table.appendChild(thead)
  const tbody = document.createElement('tbody')
  formatted.slice(0,200).forEach(r=>{
    const tr = document.createElement('tr')
    r.forEach(c=>{const td=document.createElement('td');td.textContent=c;tr.appendChild(td)})
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  preview.appendChild(table)
  // count found emails in preview
  const foundEmails = formatted.reduce((acc,r)=> acc + ((r[4] && r[4].trim())?1:0), 0)
  setStatus('Previewing first ' + Math.min(200, formatted.length) + ' rows — ' + foundEmails + ' emails found')
})

downloadBtn.addEventListener('click', ()=>{
  if(!lastCsv) return
  // build download CSV according to flatten option — reuse same extraction+normalization as preview
  const rows = parseCsv(lastCsv)
  const h = rows.headers || []
  const nameIdx = h.indexOf('name') >= 0 ? h.indexOf('name') : 0
  const jobIdx = h.indexOf('job_title') >= 0 ? h.indexOf('job_title') : (h.indexOf('job') >= 0 ? h.indexOf('job') : 1)
  const companyIdx = h.indexOf('company') >= 0 ? h.indexOf('company') : 2
  const linkedinIdx = h.indexOf('linkedin') >= 0 ? h.indexOf('linkedin') : 3
  const emailIdx = h.indexOf('email') >= 0 ? h.indexOf('email') : 4
  const btnIdx = h.indexOf('buttons_json') >= 0 ? h.indexOf('buttons_json') : (h.indexOf('buttons') >= 0 ? h.indexOf('buttons') : -1)
  const dataIdx = h.indexOf('data_attrs_json') >= 0 ? h.indexOf('data_attrs_json') : (h.indexOf('data_attrs') >= 0 ? h.indexOf('data_attrs') : -1)
  
  // Check if CSV already has formatted columns (new format from content script)
  const orgLinkIdx = h.indexOf('org_link')
  const locationIdx = h.indexOf('location')
  const tagsIdx = h.indexOf('tags')
  const hasFormattedColumns = (orgLinkIdx >= 0 || locationIdx >= 0 || tagsIdx >= 0)

  const headersOut = ['name','job_title','company','linkedin','email']
  const extraCols = ['org_link','location','tags']
  if(flattenCheckbox && flattenCheckbox.checked) headersOut.push(...extraCols)

  const lines = [headersOut.join(',')]
  rows.data.forEach(r=>{
    const base = {
      name: (r[nameIdx]||''),
      job_title: (r[jobIdx]||''),
      company: (r[companyIdx]||''),
      linkedin: (r[linkedinIdx]||''),
      email: (r[emailIdx]||'')
    }
    let extra = {org_link:'',location:'',tags:''}

    // If CSV already has formatted columns, use them directly
    if(hasFormattedColumns){
      if(orgLinkIdx >= 0) extra.org_link = r[orgLinkIdx] || ''
      if(locationIdx >= 0) extra.location = r[locationIdx] || ''
      if(tagsIdx >= 0) extra.tags = r[tagsIdx] || ''
    }else{
      // Legacy path: extract from JSON columns
      // helper to attempt to extract metadata from a JSON column
      function extractFromJsonColumn(jsonText){
        if(!jsonText) return
        let parsed = null
        try{ parsed = JSON.parse(jsonText) }catch(e){ parsed = null }
        // if parse failed, try tolerant loose parse
        if(parsed === null){
          const loose = parseLooseButtons(jsonText)
          if(loose && loose.length){
            const orgBtn = loose.find(b=> b.href && (String(b.href).includes('/#/organizations/') || String(b.href).includes('/organizations/')) )
            if(orgBtn && orgBtn.href) extra.org_link = extra.org_link || orgBtn.href
            const locBtn = loose.find(b=> b.text && /[A-Za-z]+,\s*[A-Za-z]/.test(b.text))
            if(locBtn) extra.location = extra.location || locBtn.text
            const tagList = loose.filter(b=>b.text && b.text.length>0 && b.text.length<40).map(b=>b.text).slice(0,6)
            if(tagList.length) extra.tags = extra.tags || tagList.join('|')
            return
          }
        }
        try{
          // if it's an array of buttons
          if(Array.isArray(parsed)){
            const btns = parsed
            const orgBtn = btns.find(b=> (b.href && String(b.href).includes('/#/organizations/')) || (b.href && String(b.href).includes('/organizations/')) )
            if(orgBtn && orgBtn.href) extra.org_link = extra.org_link || orgBtn.href
            const locBtn = btns.find(b=> b.text && b.text.match(/[A-Za-z]+,\s*[A-Za-z]/))
            if(locBtn) extra.location = extra.location || locBtn.text
            const tagList = btns.filter(b=>b.text && b.text.length>0 && b.text.length<40).map(b=>b.text).slice(0,6)
            if(tagList.length) extra.tags = extra.tags || tagList.join('|')
          }else if(typeof parsed === 'object' && parsed !== null){
            // try to find organization link or tags in object keys
            const flat = JSON.stringify(parsed)
            const orgMatch = flat.match(/https?:\/\/[^"]*organizations[^"]*/i)
            if(orgMatch) extra.org_link = extra.org_link || orgMatch[0]
            // tags may be present under keys like tags, label, categories
            if(parsed.tags) extra.tags = extra.tags || (Array.isArray(parsed.tags) ? parsed.tags.join('|') : String(parsed.tags))
            if(parsed.location) extra.location = extra.location || String(parsed.location)
          }
        }catch(e){ /* ignore parse errors */ }
      }

      // try buttons_json first, then data_attrs_json, then heuristics
      if(btnIdx >= 0 && r[btnIdx]) extractFromJsonColumn(r[btnIdx])
      if(!extra.org_link && dataIdx >= 0 && r[dataIdx]) extractFromJsonColumn(r[dataIdx])

      // heuristic fallback: if no JSON present, try to detect org_link/location/tags from any extra columns
      if(!extra.org_link || !extra.tags || !extra.location){
        for(let i=0;i<r.length;i++){
          if(i===nameIdx||i===jobIdx||i===companyIdx||i===linkedinIdx||i===emailIdx) continue
          const v = r[i] || ''
          if(!v) continue
          // urls containing organizations
          if(!extra.org_link && /https?:\/\/[^\s]*organizations?/i.test(v)) extra.org_link = v
          // location heuristics: contains comma and letters
          if(!extra.location && /[A-Za-z]+,\s*[A-Za-z]/.test(v)) extra.location = v
          // tags heuristics: small pipe/space separated tokens
          if(!extra.tags){
            const parts = String(v).split(/[|,;\n]/).map(s=>s.trim()).filter(Boolean)
            if(parts.length>0 && parts.length<10){ extra.tags = parts.join('|') }
          }
        }
      }
    }

    const assembled = { name: base.name, job_title: base.job_title, company: base.company, linkedin: base.linkedin, email: base.email, org_link: extra.org_link, location: extra.location, tags: extra.tags }
    const normalized = normalizeRow(assembled)
    const row = [normalized.name, normalized.job_title, normalized.company, normalized.linkedin, normalized.email].concat((flattenCheckbox && flattenCheckbox.checked) ? [normalized.org_link, normalized.location, normalized.tags] : []).map(c=> csvEscape(c) ).join(',')
    lines.push(row)
  })

  const outCsv = lines.join('\n')
  const blob = new Blob([outCsv], {type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const fname = (filenameInput && filenameInput.value) ? filenameInput.value.trim() : 'apollo-scrape.csv'
  chrome.downloads.download({url,filename:fname,conflictAction:'overwrite'})
})

function parseCsv(csv){
  if(!csv) return {headers:[],data:[]}
  // strip common BOM variants (UTF-8 BOM and mojibake representation)
  try{ csv = csv.replace(/^\uFEFF|^\ufeff|^\xef\xbb\bf|^ï»¿/, '') }catch(e){}

  // Split into logical CSV rows while respecting quoted fields that may contain newlines.
  function splitCsvRows(text){
    const rows = []
    let cur = ''
    let inQ = false
    for(let i=0;i<text.length;i++){
      const ch = text[i]
      if(ch === '"'){
        // handle escaped double-quote
        if(inQ && text[i+1] === '"'){ cur += '"'; i++; continue }
        inQ = !inQ
        cur += '"'
        continue
      }
      if((ch === '\n' || ch === '\r') && !inQ){
        // consume optional LF following CR
        if(ch === '\r' && text[i+1] === '\n') i++
        rows.push(cur)
        cur = ''
        continue
      }
      cur += ch
    }
    if(cur.length>0) rows.push(cur)
    return rows
  }

  const lines = splitCsvRows(csv).filter(l=> (l||'').trim().length>0 )
  if(lines.length===0) return {headers:[],data:[]}
  const headers = splitCsvLine(lines[0])
  // strip BOM from first header token if present (some CSVs contain BOM hidden in first cell)
  try{ if(headers && headers.length && typeof headers[0] === 'string') headers[0] = headers[0].replace(/^\uFEFF|^ï»¿/, '') }catch(e){}
  const data = lines.slice(1).map(l=>splitCsvLine(l))
  return {headers,data}
}

// simple CSV splitter that handles quoted values
function splitCsvLine(line){
  const res=[]
  let cur='';
  let inQ=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i]
    if(ch==='"'){
      if(inQ && line[i+1]==='"'){ cur+='"'; i++; continue }
      inQ=!inQ; continue
    }
    if(ch===',' && !inQ){ res.push(cur); cur=''; continue }
    cur+=ch
  }
  res.push(cur)
  return res
}
