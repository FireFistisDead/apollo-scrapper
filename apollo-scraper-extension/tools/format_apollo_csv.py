import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IN = ROOT / 'sample_apollo_raw.csv'
OUT = ROOT / 'apollo-scrape-formatted.csv'

def safe_json(s):
    try:
        return json.loads(s)
    except Exception:
        return None

def extract_from_buttons(btns):
    # always return a dict with keys org_link, location, tags
    if not btns:
        return {'org_link':'','location':'','tags':''}
    org = ''
    loc = ''
    tags = []
    try:
        for b in btns:
            href = b.get('href','') if isinstance(b,dict) else ''
            text = b.get('text','') if isinstance(b,dict) else ''
            if href and '/#/organizations/' in href and not org:
                org = href
            if text and ',' in text and len(text)<60 and not loc:
                loc = text
            if text and 0 < len(text) < 30:
                tags.append(text)
    except Exception:
        pass
    return {'org_link':org, 'location':loc, 'tags': '|'.join(tags[:5])}

def main():
    rows = []
    with IN.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            btns = safe_json(r.get('buttons_json','') or '')
            data = safe_json(r.get('data_attrs_json','') or '')
            ext = extract_from_buttons(btns)
            rows.append({
                'name': r.get('name',''),
                'job_title': r.get('job_title',''),
                'company': r.get('company',''),
                'linkedin': r.get('linkedin',''),
                'org_link': ext.get('org_link',''),
                'location': ext.get('location',''),
                'tags': ext.get('tags',''),
                'buttons_json': r.get('buttons_json',''),
                'data_attrs_json': r.get('data_attrs_json','')
            })

    headers = ['name','job_title','company','linkedin','org_link','location','tags','buttons_json','data_attrs_json']
    with OUT.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for rr in rows:
            writer.writerow(rr)

    print('Wrote:', OUT)

if __name__ == '__main__':
    main()
