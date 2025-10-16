# Apollo Scraper → n8n Integration

## 🎯 What This Does

This integration allows you to:
1. **Trigger scraping from n8n** via HTTP requests
2. **Get scraped data in JSON format** for email automation
3. **Send personalized emails** using the scraped Apollo data

## 📋 Setup Instructions

### Step 1: Install API Server Dependencies

```cmd
cd c:\Users\Goku\Desktop\appify\apollo-scraper-extension\api-server
npm install
```

### Step 2: Start the API Server

```cmd
npm start
```

You should see:
```
🚀 Apollo Scraper API Server running!
📡 HTTP API: http://localhost:3000
🔌 WebSocket: ws://localhost:3001
```

**Keep this terminal running!**

### Step 3: Reload Chrome Extension

1. Go to `chrome://extensions`
2. Find "Apollo Scraper"
3. Click the reload icon ↻
4. Open a Chrome tab and check console (F12) - you should see:
   ```
   ✅ Connected to API server
   ```

### Step 4: Test the API

Open another terminal and test:

```cmd
curl -X POST http://localhost:3000/api/health
```

Should return:
```json
{
  "status": "online",
  "extensionConnected": true,
  "connections": 1
}
```

## 🔌 API Endpoints

### 1. Health Check
```
GET http://localhost:3000/api/health
```

### 2. Trigger Scraping
```
POST http://localhost:3000/api/scrape-apollo
Content-Type: application/json

{
  "url": "https://app.apollo.io/your-search-url",
  "waitForLoad": 3000
}
```

**Response:**
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
  ],
  "csv": "name,job_title,company,email,linkedin,org_link\n..."
}
```

## 🤖 n8n Workflow Setup

### Simple Workflow: Scrape → Email

1. **HTTP Request Node** (Trigger scraping)
   - Method: `POST`
   - URL: `http://localhost:3000/api/scrape-apollo`
   - Body:
     ```json
     {
       "url": "https://app.apollo.io/...",
       "waitForLoad": 3000
     }
     ```

2. **Split In Batches Node** (Process each person)
   - Batch Size: `1`
   - Input Data: `{{ $json.data }}`

3. **Send Email Node** (Gmail/SMTP)
   - To: `{{ $json.email }}`
   - Subject: `Hi {{ $json.name }}`
   - Body:
     ```
     Hi {{ $json.name }},
     
     I noticed you work at {{ $json.company }} as {{ $json.job_title }}.
     
     [Your message here]
     ```

### Advanced Workflow: Filter → Personalize → Email

1. **HTTP Request** → Scrape Apollo
2. **Function Node** → Filter & enrich data
   ```javascript
   // Filter out entries without email
   const validContacts = $input.all()[0].json.data.filter(person => {
     return person.email && person.email.includes('@');
   });
   
   // Add personalization
   return validContacts.map(person => ({
     json: {
       ...person,
       greeting: `Hi ${person.name.split(' ')[0]}`,
       company_pitch: `I see you're at ${person.company}`
     }
   }));
   ```
3. **Split In Batches** → Process one by one
4. **HTTP Request** → Verify email (hunter.io)
5. **IF Node** → Check if email is valid
6. **Send Email** → Personalized outreach
7. **Airtable/Sheets** → Log sent emails

## 📊 n8n Workflow JSON

Import this into n8n:

```json
{
  "name": "Apollo Scraper to Email",
  "nodes": [
    {
      "parameters": {
        "url": "http://localhost:3000/api/scrape-apollo",
        "method": "POST",
        "jsonParameters": true,
        "options": {},
        "bodyParametersJson": "{\n  \"url\": \"https://app.apollo.io/your-search\",\n  \"waitForLoad\": 3000\n}"
      },
      "name": "Scrape Apollo",
      "type": "n8n-nodes-base.httpRequest",
      "position": [250, 300]
    },
    {
      "parameters": {
        "batchSize": 1,
        "options": {}
      },
      "name": "Split In Batches",
      "type": "n8n-nodes-base.splitInBatches",
      "position": [450, 300]
    },
    {
      "parameters": {
        "fromEmail": "your-email@gmail.com",
        "toEmail": "={{ $json.email }}",
        "subject": "Hi {{ $json.name }}",
        "text": "Hi {{ $json.name }},\\n\\nI noticed you work at {{ $json.company }}.\\n\\n[Your message]"
      },
      "name": "Send Email",
      "type": "n8n-nodes-base.emailSend",
      "position": [650, 300]
    }
  ],
  "connections": {
    "Scrape Apollo": {
      "main": [[{ "node": "Split In Batches", "type": "main", "index": 0 }]]
    },
    "Split In Batches": {
      "main": [[{ "node": "Send Email", "type": "main", "index": 0 }]]
    }
  }
}
```

## 🔥 Usage Example

### 1. Start the server
```cmd
cd api-server
npm start
```

### 2. Open Apollo in Chrome
Navigate to your search results page

### 3. Trigger from n8n
The workflow will:
- Send HTTP request to scrape
- Extension scrapes current page
- Returns data to n8n
- n8n sends personalized emails

### 4. Alternative: Test with curl

```cmd
curl -X POST http://localhost:3000/api/scrape-apollo ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://app.apollo.io/...\"}"
```

## ⚙️ Configuration Options

### API Server Port
Edit `api-server/server.js`:
```javascript
const PORT = 3000; // Change this
```

### Scraping Timeout
In the API request body:
```json
{
  "url": "...",
  "waitForLoad": 5000  // Wait 5 seconds for page load
}
```

### WebSocket Reconnection
Extension automatically reconnects every 10 seconds if server disconnects.

## 🐛 Troubleshooting

### "No Chrome extension connected"
- Make sure Chrome is open with the extension
- Reload the extension at `chrome://extensions`
- Check browser console for "✅ Connected to API server"

### "Scraping timeout"
- Increase `waitForLoad` in request body
- Make sure Apollo page is loaded
- Check for Apollo login/authentication

### "Extension not responding"
- Reload extension
- Restart API server
- Check if Apollo page is open

## 🎯 Best Practices

1. **Rate Limiting**: Add delays between emails in n8n
2. **Email Verification**: Use hunter.io node before sending
3. **Logging**: Store sent emails in Airtable/Google Sheets
4. **Testing**: Test with small batches first
5. **Personalization**: Use AI (OpenAI node) to generate custom messages

## 📚 Additional Resources

- [n8n Documentation](https://docs.n8n.io)
- [Email Deliverability Guide](https://www.mailgun.com/resources/guides/email-deliverability/)
- [Hunter.io Email Verification](https://hunter.io/email-verifier)
