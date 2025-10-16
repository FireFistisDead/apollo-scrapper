@echo off
echo ================================
echo Apollo Scraper API - Quick Test
echo ================================
echo.

echo [1/3] Testing server health...
curl -X GET http://localhost:3000/api/health
echo.
echo.

echo [2/3] Checking extension connection...
timeout /t 2 /nobreak >nul
curl -X GET http://localhost:3000/api/health
echo.
echo.

echo [3/3] Ready to scrape!
echo.
echo To trigger scraping from n8n or command line:
echo.
echo curl -X POST http://localhost:3000/api/scrape-apollo ^
echo   -H "Content-Type: application/json" ^
echo   -d "{\"url\":\"https://app.apollo.io/your-search-url\"}"
echo.
echo ================================
echo Setup Complete! 
echo ================================
pause
