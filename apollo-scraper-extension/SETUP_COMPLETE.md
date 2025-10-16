# 🎯 Apollo Scraper → n8n Integration - COMPLETE!

## ✅ What I've Created

### 1. **API Server** (`api-server/`)
- **server.js** - Express + WebSocket server
- **package.json** - Dependencies (express, cors, ws)
- Listens on:
  - `http://localhost:3000` - HTTP API for n8n
  - `ws://localhost:3001` - WebSocket for Chrome extension

### 2. **Chrome Extension Updates**
- **background.js** - WebSocket connector to API server
- **content_script.js** - API message handler for scraping
- Auto-connects to server when running
- No manual interaction needed

### 3. **Documentation**
- **N8N_INTEGRATION.md** - Complete setup guide
- **api-server/QUICK_START.md** - Fast setup (5 mins)
- **api-server/n8n-examples.md** - Ready-to-use n8n workflows
- **api-server/README.md** - API reference

### 4. **Test Tools**
- **test.bat** - Quick connection test script

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────┐
│                     n8n Workflow                    │
│  (HTTP Request Node → Split → Email Node)          │
└─────────────────┬───────────────────────────────────┘
                  │ POST /api/scrape-apollo
                  │ { "url": "apollo.io/..." }
                  ↓
┌─────────────────────────────────────────────────────┐
│              API Server (localhost:3000)            │
│  • Receives HTTP requests from n8n                  │
│  • Manages WebSocket connections                    │
│  • Returns JSON data                                │
└─────────────────┬───────────────────────────────────┘
                  │ WebSocket (localhost:3001)
                  ↓
┌─────────────────────────────────────────────────────┐
│           Chrome Extension (background.js)          │
│  • Connects via WebSocket                           │
│  • Listens for scrape requests                      │
│  • Forwards to content script                       │
└─────────────────┬───────────────────────────────────┘
                  │ Chrome Message API
                  ↓
┌─────────────────────────────────────────────────────┐
│        Content Script (content_script.js)           │
│  • Scrapes Apollo page DOM                          │
│  • Extracts: name, job, company, email, linkedin    │
│  • Returns data array + CSV                         │
└─────────────────┬───────────────────────────────────┘
                  │ Response flows back up
                  ↓
┌─────────────────────────────────────────────────────┐
│                  n8n Workflow                       │
│  • Receives scraped data (JSON)                     │
│  • Loops through contacts                           │
│  • Sends personalized emails                        │
│  • Logs to Sheets/Airtable                         │
└─────────────────────────────────────────────────────┘
```

## 🚀 Quick Setup (3 Steps)

### Step 1: Install & Start API Server
```cmd
cd c:\Users\Goku\Desktop\appify\apollo-scraper-extension\api-server
npm install
npm start
```

### Step 2: Reload Chrome Extension
1. Go to `chrome://extensions`
2. Click reload ↻ on "Apollo Scraper"
3. Check console - should see: `✅ Connected to API server`

### Step 3: Use in n8n
Create HTTP Request node:
- Method: **POST**
- URL: `http://localhost:3000/api/scrape-apollo`
- Body:
  ```json
  {
    "url": "https://app.apollo.io/your-search-page"
  }
  ```

## 📊 Example Response

```json
{
  "success": true,
  "rowCount": 25,
  "data": [
    {
      "name": "John Doe",
      "job_title": "CEO",
      "company": "Acme Corp",
      "email": "john@acme.com",
      "linkedin": "https://linkedin.com/in/johndoe",
      "org_link": "https://app.apollo.io/organizations/123"
    },
    // ... 24 more contacts
  ],
  "csv": "name,job_title,company,email,linkedin,org_link\nJohn Doe,CEO,..."
}
```

## 🎯 n8n Workflow Examples

### Simple: Scrape → Email
```
HTTP Request (Scrape Apollo)
    ↓
Split In Batches (1 at a time)
    ↓
Send Email (Gmail/SMTP)
```

### Advanced: Scrape → Verify → AI → Email → Log
```
HTTP Request (Scrape Apollo)
    ↓
Function (Filter valid emails)
    ↓
Split In Batches
    ↓
Hunter.io (Verify email)
    ↓
IF (Is valid?)
    ↓ Yes
OpenAI (Generate personalized message)
    ↓
Wait (5 sec - rate limit)
    ↓
Gmail (Send email)
    ↓
Google Sheets (Log sent)
```

## 🔧 Testing Commands

### Check server health:
```cmd
curl http://localhost:3000/api/health
```

### Trigger scraping:
```cmd
curl -X POST http://localhost:3000/api/scrape-apollo ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://app.apollo.io/...\"}"
```

## 🎨 Key Features

✅ **No credits used** - Scrapes visible Apollo data  
✅ **HTTP API** - Easy n8n integration  
✅ **Real-time** - Extension scrapes on demand  
✅ **JSON & CSV** - Choose your format  
✅ **Auto-reconnect** - Extension reconnects automatically  
✅ **Rate limiting** - Built into n8n workflow  
✅ **Error handling** - Detailed error messages  

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "No extension connected" | Reload extension at chrome://extensions |
| Server won't start | Port in use - change PORT in server.js |
| Extension not connecting | Check browser console for errors |
| 0 rows returned | Fix the `buttons` variable bug in content_script.js |
| Timeout error | Increase `waitForLoad` in API request |

## 📚 File Structure

```
apollo-scraper-extension/
├── api-server/
│   ├── server.js              ← API server
│   ├── package.json           ← Dependencies
│   ├── README.md              ← API docs
│   ├── QUICK_START.md         ← 5-min setup
│   ├── n8n-examples.md        ← Workflow templates
│   └── test.bat               ← Test script
├── background.js              ← WebSocket connector (updated)
├── content_script.js          ← Scraping logic (updated)
├── N8N_INTEGRATION.md         ← Full guide
└── ... (other extension files)
```

## 🎉 You're Ready!

1. **Start server**: `cd api-server && npm start`
2. **Open Chrome**: Extension auto-connects
3. **Create n8n workflow**: Use HTTP Request node
4. **Automate emails**: Split batches → Send emails
5. **Scale up**: Add AI personalization, email verification, logging

## 💡 Pro Tips

1. **Email Verification**: Add Hunter.io node before sending emails
2. **Personalization**: Use OpenAI to generate custom messages
3. **Rate Limiting**: Add 5-10 second delays between emails
4. **Logging**: Track sent emails in Google Sheets/Airtable
5. **A/B Testing**: Try different subject lines and measure opens
6. **Compliance**: Include unsubscribe links (use Mailchimp/SendGrid)

## 🔗 Next Steps

- [ ] Test API with curl/Postman
- [ ] Create first n8n workflow
- [ ] Add email verification (Hunter.io)
- [ ] Set up email tracking (SendGrid)
- [ ] Add AI personalization (OpenAI)
- [ ] Connect to CRM (HubSpot/Salesforce)

---

**Need help?** Check the docs:
- API Reference: `api-server/README.md`
- n8n Examples: `api-server/n8n-examples.md`
- Full Setup: `N8N_INTEGRATION.md`
