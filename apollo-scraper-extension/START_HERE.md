# 🚀 START HERE - n8n Integration Setup

## ⚡ Quick Start (5 Minutes)

### 1️⃣ Start the API Server

Open **Command Prompt** and run:

```cmd
cd c:\Users\Goku\Desktop\appify\apollo-scraper-extension\api-server
node server.js
```

You should see:
```
🚀 Apollo Scraper API Server running!
📡 HTTP API: http://localhost:3000
🔌 WebSocket: ws://localhost:3001
```

**✅ Keep this terminal window open!**

---

### 2️⃣ Reload Chrome Extension

1. Open Chrome and go to: `chrome://extensions`
2. Find "Apollo Scraper" extension
3. Click the **reload icon** ↻
4. Open browser console (F12) on any page
5. You should see: `✅ Connected to API server`

---

### 3️⃣ Test the Connection

Open **another Command Prompt** and run:

```cmd
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "online",
  "extensionConnected": true,
  "connections": 1
}
```

---

### 4️⃣ Test Scraping

**Option A: Using curl**

```cmd
curl -X POST http://localhost:3000/api/scrape-apollo ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://app.apollo.io/your-search-page\"}"
```

**Option B: Using n8n**

In n8n, create an **HTTP Request** node:
- **Method**: POST
- **URL**: `http://localhost:3000/api/scrape-apollo`
- **Body**: JSON
  ```json
  {
    "url": "https://app.apollo.io/your-search-page",
    "waitForLoad": 3000
  }
  ```

---

## 📊 What You'll Get Back

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
    }
    // ... more contacts
  ],
  "csv": "name,job_title,company,email,linkedin,org_link\n..."
}
```

---

## 🎯 Simple n8n Workflow

### Workflow: Scrape Apollo → Send Emails

1. **HTTP Request Node**
   - POST `http://localhost:3000/api/scrape-apollo`
   - Body: `{"url": "YOUR_APOLLO_URL"}`

2. **Code Node** (Filter)
   ```javascript
   // Get scraped data
   const contacts = $input.first().json.data;
   
   // Filter valid emails only
   return contacts
     .filter(c => c.email && c.email.includes('@'))
     .map(c => ({ json: c }));
   ```

3. **Split In Batches Node**
   - Batch Size: `1`

4. **Wait Node**
   - 5 seconds (rate limiting)

5. **Gmail/Send Email Node**
   - To: `{{ $json.email }}`
   - Subject: `Hi {{ $json.name.split(' ')[0] }}`
   - Body:
     ```
     Hi {{ $json.name }},
     
     I saw you're {{ $json.job_title }} at {{ $json.company }}.
     
     [Your message here]
     
     Best,
     Your Name
     ```

---

## 📁 Import This n8n Workflow

Copy and paste this into n8n:

```json
{
  "name": "Apollo to Email Campaign",
  "nodes": [
    {
      "parameters": {
        "url": "http://localhost:3000/api/scrape-apollo",
        "method": "POST",
        "jsonParameters": true,
        "bodyParametersJson": "{\n  \"url\": \"https://app.apollo.io/your-search\"\n}"
      },
      "name": "Scrape Apollo",
      "type": "n8n-nodes-base.httpRequest",
      "position": [250, 300],
      "id": "1"
    },
    {
      "parameters": {
        "jsCode": "const contacts = $input.first().json.data || [];\n\nreturn contacts\n  .filter(c => c.email && c.email.includes('@'))\n  .map(c => ({ json: {\n    ...c,\n    firstName: c.name.split(' ')[0],\n    subject: `Quick question about ${c.company}`\n  }}));"
      },
      "name": "Filter & Process",
      "type": "n8n-nodes-base.code",
      "position": [450, 300],
      "id": "2"
    },
    {
      "parameters": {
        "batchSize": 1
      },
      "name": "Split In Batches",
      "type": "n8n-nodes-base.splitInBatches",
      "position": [650, 300],
      "id": "3"
    },
    {
      "parameters": {
        "amount": 5,
        "unit": "seconds"
      },
      "name": "Wait",
      "type": "n8n-nodes-base.wait",
      "position": [850, 300],
      "id": "4"
    },
    {
      "parameters": {
        "fromEmail": "you@company.com",
        "toEmail": "={{ $json.email }}",
        "subject": "={{ $json.subject }}",
        "text": "=Hi {{ $json.firstName }},\n\nI saw you're {{ $json.job_title }} at {{ $json.company }}.\n\n[Your pitch here]\n\nBest,\nYour Name"
      },
      "name": "Send Email",
      "type": "n8n-nodes-base.emailSend",
      "position": [1050, 300],
      "id": "5"
    }
  ],
  "connections": {
    "Scrape Apollo": { "main": [[{ "node": "Filter & Process", "type": "main", "index": 0 }]] },
    "Filter & Process": { "main": [[{ "node": "Split In Batches", "type": "main", "index": 0 }]] },
    "Split In Batches": { "main": [[{ "node": "Wait", "type": "main", "index": 0 }]] },
    "Wait": { "main": [[{ "node": "Send Email", "type": "main", "index": 0 }]] }
  }
}
```

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| ❌ Server won't start | Make sure Node.js is installed: `node --version` |
| ❌ "No extension connected" | Reload extension at `chrome://extensions` |
| ❌ "Cannot connect to localhost:3000" | Check if server is running (Step 1) |
| ❌ "0 rows found" | Open Apollo page in Chrome first, or provide `url` in request |
| ❌ Extension not connecting | Check browser console for errors |

---

## 📚 More Resources

- **Full Setup Guide**: `N8N_INTEGRATION.md`
- **API Documentation**: `api-server/README.md`
- **n8n Examples**: `api-server/n8n-examples.md`
- **Complete Summary**: `SETUP_COMPLETE.md`

---

## 💡 Pro Tips

1. **Test with your own email first** before sending to prospects
2. **Use Hunter.io** to verify emails before sending
3. **Add 5-10 second delays** between emails (rate limiting)
4. **Use OpenAI** to generate personalized messages
5. **Log to Google Sheets** to track sent emails
6. **Include unsubscribe links** for compliance

---

## 🎉 You're All Set!

Now you can:
- ✅ Trigger scraping from n8n with HTTP requests
- ✅ Get contact data without using Apollo credits
- ✅ Send automated personalized emails
- ✅ Build complex workflows (filter, verify, personalize, send, log)
- ✅ Scale your outreach campaigns

**Happy automating!** 🚀

---

## 🆘 Need Help?

1. Check the server terminal for error messages
2. Check Chrome console (F12) for extension errors
3. Test API health: `curl http://localhost:3000/api/health`
4. Review docs in `N8N_INTEGRATION.md`
