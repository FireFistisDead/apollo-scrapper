// Utility helpers for CSV building — kept for future use.
function escapeCsvCell(v){
  if(v==null) return ''
  const s = String(v)
  if(s.includes(',')||s.includes('"')||s.includes('\n')){
    return '"'+s.replace(/"/g,'""')+'"'
  }
  return s
}

function buildCsvFromObjects(arr,keys){
  const headers = keys
  const lines = [headers.join(',')]
  arr.forEach(obj=>{
    const row = keys.map(k=>escapeCsvCell(obj[k]))
    lines.push(row.join(','))
  })
  return lines.join('\n')
}

/* exported buildCsvFromObjects */
