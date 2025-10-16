# Apollo Scraper API Server

Local HTTP API server that connects your Chrome extension to n8n for automated email campaigns.

## 🚀 Quick Start

1. **Install dependencies:**
   ```cmd
   npm install
   ```

2. **Start the server:**
   ```cmd
   npm start
   ```

3. **Reload Chrome extension** at `chrome://extensions`

4. **Test the connection:**
   ```cmd
   curl http://localhost:3000/api/health
   ```

## 📡 How It Works

```
n8n → HTTP POST → API Server (localhost:3000)
                      ↓
                  WebSocket (localhost:3001)
                      ↓
              Chrome Extension
                      ↓
                Scrapes Apollo
                      ↓
              Returns Data (JSON/CSV)
                      ↓
                  API Server
                      ↓
                     n8n
                      ↓
              Send Emails 📧
```

## 🔌 API Endpoints

### Health Check
```bash
GET http://localhost:3000/api/health
```

### Trigger Scraping
```bash
POST http://localhost:3000/api/scrape-apollo
Content-Type: application/json

{
  "url": "https://app.apollo.io/your-search",
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

## 📦 Files

- `server.js` - Main API server (Express + WebSocket)
- `package.json` - Dependencies
- `test.bat` - Quick test script
- `QUICK_START.md` - Setup guide
- `n8n-examples.md` - n8n workflow examples

## 🔧 Configuration

### Change Port
Edit `server.js`:
```javascript
const PORT = 3000; // HTTP API port
const WS_PORT = 3001; // WebSocket port
```

### CORS Settings
The server allows all origins by default. To restrict:
```javascript
app.use(cors({
  origin: 'http://your-n8n-instance.com'
}));
```

## 🐛 Troubleshooting

**"No Chrome extension connected"**
- Open Chrome with the extension
- Reload extension at `chrome://extensions`
- Check browser console for "✅ Connected to API server"

**"EADDRINUSE" error**
- Port 3000 or 3001 already in use
- Change ports in `server.js`
- Or kill existing process

**"Cannot GET /api/scrape-apollo"**
- Use POST, not GET
- Include Content-Type header
- Send JSON body with "url" field

## 📚 Documentation

- Full guide: `../N8N_INTEGRATION.md`
- n8n examples: `n8n-examples.md`
- Extension docs: `../README.md`

## 🎯 Use Cases

1. **Automated Outreach**: Scrape Apollo → Send personalized emails
2. **Lead Enrichment**: Get contact data → Verify emails → Add to CRM
3. **Market Research**: Extract company data → Analyze trends
4. **Scheduled Campaigns**: Daily scraping → Weekly email batches

## 🛠️ Development

### Start with auto-reload:
```cmd
npm run dev
```

### Add new endpoints:
```javascript
app.post('/api/your-endpoint', (req, res) => {
  // Your logic here
  res.json({ success: true });
});
```

## 📊 Monitoring

The server logs:
- ✅ Extension connections
- 📥 Incoming requests
- 🔄 Scraping progress
- ❌ Errors

## 🔐 Security Notes

⚠️ This server runs locally and has no authentication. Do not:
- Expose to the internet without authentication
- Use on untrusted networks
- Store sensitive data in responses

For production use, add:
- API keys
- Rate limiting
- HTTPS
- Database for logging

## 📈 Performance

- **Concurrent requests**: 1 at a time (extension limitation)
- **Timeout**: 60 seconds per scrape
- **Max data size**: ~10MB per response
- **Reconnection**: Auto-reconnects every 10 seconds

## License

MIT
