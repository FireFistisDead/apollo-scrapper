const scrapeBtn = document.getElementById('scrapeBtn')
const previewBtn = document.getElementById('previewBtn')
const downloadBtn = document.getElementById('downloadBtn')
const status = document.getElementById('status')
const preview = document.getElementById('preview')

let lastCsv = ''

function setStatus(s){ status.textContent = s }

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
    // ask content script to run
    const res = await chrome.tabs.sendMessage(tab.id, {action:'scrape'})
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

previewBtn.addEventListener('click', ()=>{
  if(!lastCsv) return
  preview.innerHTML = ''
  const rows = parseCsv(lastCsv)
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  rows.headers.forEach(h=>{const th=document.createElement('th');th.textContent=h;headerRow.appendChild(th)})
  thead.appendChild(headerRow)
  table.appendChild(thead)
  const tbody = document.createElement('tbody')
  rows.data.slice(0,200).forEach(r=>{
    const tr = document.createElement('tr')
    r.forEach(c=>{const td=document.createElement('td');td.textContent=c;tr.appendChild(td)})
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  preview.appendChild(table)
  setStatus('Previewing first ' + Math.min(200, rows.data.length) + ' rows')
})

downloadBtn.addEventListener('click', ()=>{
  if(!lastCsv) return
  const blob = new Blob([lastCsv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({url,filename:'apollo-scrape.csv',conflictAction:'overwrite'})
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
