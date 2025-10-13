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
  // try to detect buttons_json and data_attrs_json columns
  const btnIdx = rows.headers.indexOf('buttons_json')
  const dataIdx = rows.headers.indexOf('data_attrs_json')

  // build formatted rows: base columns + flattened columns when requested
  const formatted = []
  const headersOut = ['name','job_title','company','linkedin','email']
  // extra columns we'll try to extract from buttons_json: org (company link text), location, tags
  const extraCols = ['org_link','location','tags']
  if(flattenCheckbox && flattenCheckbox.checked){ headersOut.push(...extraCols) }

  rows.data.forEach(r=>{
    const base = {
      name: r[0]||'',
      job_title: r[1]||'',
      company: r[2]||'',
      linkedin: r[3]||'',
      email: r[4]||''
    }
    const extra = {org_link:'',location:'',tags:''}
    if(btnIdx>=0 && r[btnIdx]){
      try{
        const btns = JSON.parse(r[btnIdx])
        // org link: find first href that points to /organizations/ or text that looks like company
        const org = btns.find(b=>b.href && b.href.includes('/#/organizations/')) || btns.find(b=>b.href && b.href.includes('/#/organizations/'))
        if(org && org.href) extra.org_link = org.href
        // location: find a button with text containing a comma or known place
        const loc = btns.find(b=> b.text && b.text.match(/[A-Za-z]+,\s*[A-Za-z]/))
        if(loc) extra.location = loc.text
        // tags: pick some small textual buttons that look like tags (small words)
        const tags = btns.filter(b=>b.text && b.text.length>0 && b.text.length<30).map(b=>b.text).slice(0,5)
        if(tags.length) extra.tags = tags.join('|')
      }catch(e){ }
    }
    const rowOut = [base.name, base.job_title, base.company, base.linkedin, base.email]
    if(flattenCheckbox && flattenCheckbox.checked) rowOut.push(extra.org_link, extra.location, extra.tags)
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
  // build download CSV according to flatten option
  const rows = parseCsv(lastCsv)
  const btnIdx = rows.headers.indexOf('buttons_json')
  const headersOut = ['name','job_title','company','linkedin','email']
  const extraCols = ['org_link','location','tags']
  if(flattenCheckbox && flattenCheckbox.checked) headersOut.push(...extraCols)

  const lines = [headersOut.join(',')]
  rows.data.forEach(r=>{
    const base = [r[0]||'', r[1]||'', r[2]||'', r[3]||'', r[4]||'']
    let extra = []
    if(flattenCheckbox && flattenCheckbox.checked){
      let org='', loc='', tags=''
      if(btnIdx>=0 && r[btnIdx]){
        try{
          const btns = JSON.parse(r[btnIdx])
          const orgBtn = btns.find(b=>b.href && b.href.includes('/#/organizations/'))
          if(orgBtn) org = orgBtn.href
          const locBtn = btns.find(b=> b.text && b.text.match(/[A-Za-z]+,\s*[A-Za-z]/))
          if(locBtn) loc = locBtn.text
          const tagList = btns.filter(b=>b.text && b.text.length>0 && b.text.length<30).map(b=>b.text).slice(0,5)
          if(tagList.length) tags = tagList.join('|')
        }catch(e){}
      }
      extra = [org,loc,tags]
    }
    const row = base.concat(extra).map(c=> csvEscape(c) ).join(',')
    lines.push(row)
  })

  const outCsv = lines.join('\n')
  const blob = new Blob([outCsv], {type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const fname = (filenameInput && filenameInput.value) ? filenameInput.value.trim() : 'apollo-scrape.csv'
  chrome.downloads.download({url,filename:fname,conflictAction:'overwrite'})
})

function parseCsv(csv){
  const lines = csv.split(/\r?\n/).filter(Boolean)
  if(lines.length===0) return {headers:[],data:[]}
  const headers = splitCsvLine(lines[0])
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
