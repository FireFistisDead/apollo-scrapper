# Quick Start - API Server

## 1. Install Dependencies

```cmd
cd c:\Users\Goku\Desktop\appify\apollo-scraper-extension\api-server
npm install
```

## 2. Start Server

```cmd
npm start
```

## 3. Reload Extension

1. Go to `chrome://extensions`
2. Click reload ↻ on Apollo Scraper
3. Check console - should see "✅ Connected to API server"

## 4. Test

```cmd
curl http://localhost:3000/api/health
```

## 5. Use in n8n

HTTP Request Node:
- POST `http://localhost:3000/api/scrape-apollo`
- Body: `{"url": "https://app.apollo.io/..."}`

Done! 🎉
