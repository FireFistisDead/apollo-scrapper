# Apollo List Scraper (Chrome Extension)

This extension scrapes Apollo people listing rows and LinkedIn links/buttons and exports them to CSV. It includes a popup to scrape the current page, preview the CSV, and download it.

Install
- Open Chrome, go to chrome://extensions
- Enable "Developer mode"
- Click "Load unpacked" and select the folder: `....\apollo-scraper-extension`

Usage
- Open Apollo people list page (e.g. https://app.apollo.io/people)
- Click the extension icon and press "Scrape current page"
- Wait for the status to show rows found
- Click "Preview CSV" to inspect the first 200 rows
- Click "Download CSV" to download as `apollo-scrape.csv`

Notes and limitations
- Apollo's DOM can change frequently. The content script uses several heuristic selectors. If it doesn't find rows, adjust selectors in `content_script.js`.
- The extension scrapes visible DOM nodes only; if Apollo lazy-loads rows as you scroll, scroll down and re-run.
- Buttons and hidden attributes are included as JSON in CSV columns `buttons_json` and `data_attrs_json`.
- The extension tries to capture LinkedIn links present inside each row. If Apollo hides the link behind a popup, this script won't click popups or authenticate.

Security and ethics
- Only scrape pages you have the right to access. Respect Apollo and LinkedIn terms of service.

If you want I can refine selectors to match your exact Apollo layout (attach HTML snippets or screenshots showing the exact row structure).
