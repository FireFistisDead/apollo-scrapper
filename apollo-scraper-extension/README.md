# Apollo Scraper Extension

A powerful Chrome extension for extracting contact data from Apollo.io people lists with advanced hidden data detection.

## Features

✨ **Multi-Strategy Data Extraction**
- DOM-based scraping with shadow DOM support
- Table cloning for rendered data capture
- Network API interception fallback
- Optional click-to-reveal for additional emails

📊 **Smart Data Formatting**
- Automatic title-casing (preserves acronyms)
- Phone number formatting
- Tag deduplication and normalization
- Location and organization link extraction

🚀 **Performance & Reliability**
- Fast DOM extraction (~50-200ms)
- Multiple fallback strategies ensure data capture
- Progress tracking for multi-page scrapes
- CSV preview before download

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `apollo-scraper-extension` folder
5. The extension icon should appear in your toolbar

## Usage

### Basic Scraping

1. Navigate to an Apollo.io people list (e.g., `https://app.apollo.io/#/people`)
2. Click the extension icon in your toolbar
3. Click **"Scrape Current Page"** button
4. Wait for scraping to complete
5. Click **"Preview Data"** to see results in a table
6. Click **"Download CSV"** to save the data

### Advanced Options

**Collect All Pages:**
- Enable checkbox to automatically scrape all pages (up to 100 pages)
- Extension will navigate through pagination automatically
- Shows progress: "Scraping pages — page X, total rows: Y"

**Click to Reveal Emails:**
- Enable to click "Access email" buttons for additional email discovery
- Shows progress bar: "Revealing emails — X / Y"
- Note: Slower process, most emails are already captured via DOM extraction

**Custom Filename:**
- Enter desired filename in the input field (default: "apollo_contacts")
- File will be saved as `{filename}.csv`

**Flatten Columns:**
- Enabled by default
- Adds `org_link`, `location`, and `tags` columns to CSV
- Disable to only export basic fields (name, job_title, company, linkedin, email)

## Output Format

### CSV Columns

| Column      | Description                              | Example                                      |
|-------------|------------------------------------------|----------------------------------------------|
| name        | Full name                                | John Doe                                     |
| job_title   | Job title (title-cased)                  | Senior Software Engineer                     |
| company     | Company name (title-cased)               | TechCorp Inc                                 |
| linkedin    | LinkedIn profile URL                     | https://linkedin.com/in/johndoe              |
| email       | Email address                            | john.doe@techcorp.com                        |
| org_link    | Apollo organization link                 | https://app.apollo.io/#/organizations/12345  |
| location    | Location (City, Country)                 | San Francisco, United States                 |
| tags        | Pipe-separated tags (max 6)              | Series B \| 50-200 employees \| B2B SaaS     |

### Sample Output

```csv
name,job_title,company,linkedin,email,org_link,location,tags
John Doe,Senior Software Engineer,TechCorp Inc,https://linkedin.com/in/johndoe,john.doe@techcorp.com,https://app.apollo.io/#/organizations/12345,San Francisco United States,Series B|50-200 employees|B2B SaaS
Jane Smith,VP of Marketing,DataCo,https://linkedin.com/in/janesmith,jane@dataco.io,https://app.apollo.io/#/organizations/67890,New York United States,Series A|Enterprise|Marketing
```

## Hidden Data Extraction

This extension uses **multiple advanced techniques** to extract "hidden" data from Apollo.io:

### 1. DOM-Based Extraction (Primary)
- Scans entire page DOM including shadow DOM
- Extracts data from table cells, attributes, and text nodes
- Detects emails in rendered content (no API calls needed)

### 2. Table Cloning (Fallback)
- Inspired by the proven `apollo-email-scraper` approach
- Clones the entire table and extracts all rendered data
- Removes visual noise (SVG, buttons) to get clean text
- **Key insight:** Apollo renders "hidden" data in the DOM; it's just styled to appear hidden

### 3. Network Interception (Fallback)
- Captures API responses via page-level script injection
- Parses JSON for person objects
- Works even when DOM structure changes

### 4. Click-to-Reveal (Optional)
- Clicks "Access email" buttons to reveal additional emails
- Sequential with progress tracking
- Most data already captured via methods 1-3

📖 **For detailed technical documentation, see [HIDDEN_DATA_EXTRACTION.md](./HIDDEN_DATA_EXTRACTION.md)**

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User clicks "Scrape Current Page"                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Content script injected into Apollo.io page              │
│    - Network capture starts (intercepts API calls)          │
│    - DOM scanning begins                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Extract data using priority order:                       │
│    a) DOM scraping (profile links → containers → cells)     │
│    b) Table cloning fallback (if no rows found)             │
│    c) Network data parsing (if table fails)                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Parse and format data:                                   │
│    - Extract org_link, location, tags from button arrays    │
│    - Apply smart title-casing                               │
│    - Filter noise tokens                                     │
│    - Deduplicate tags                                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Build CSV with formatted columns                         │
│    - Headers: name, job_title, company, linkedin, email,    │
│                org_link, location, tags                      │
│    - CSV escape all values                                   │
│    - Add BOM for Excel compatibility                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Send to popup for preview/download                       │
│    - Preview shows first 200 rows in table                  │
│    - Download creates CSV file with user-specified name     │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
apollo-scraper-extension/
├── manifest.json              # Extension configuration
├── popup/
│   ├── popup.html            # Extension popup UI
│   ├── popup.js              # UI logic, CSV parsing, preview/download
│   └── popup.css             # Styling
├── content_script.js         # Main scraping logic
├── background.js             # Service worker (script injection)
├── page_capture.js           # Network capture loader (document_start)
├── page_capture_page.js      # Page-level network interception code
├── csv_helper.js             # CSV utilities (legacy)
├── README.md                 # This file
├── HIDDEN_DATA_EXTRACTION.md # Technical documentation
└── icons/                    # Extension icons
```

## Troubleshooting

### No data found
- **Check URL:** Ensure you're on an Apollo.io people list page (URL contains `/people`)
- **Scroll down:** Some data loads on scroll; try scrolling before scraping
- **Enable "Collect All Pages":** For multi-page lists
- **Check permissions:** Extension needs access to `*.apollo.io`

### Missing emails
- **Already captured:** Most emails are already extracted from DOM (check preview)
- **Enable "Click to reveal":** For additional email discovery (slower)
- **Check Apollo credits:** Some emails require Apollo credits to reveal

### CSV formatting issues
- **Excel display:** Extension includes BOM marker for proper Excel encoding
- **Special characters:** All text is CSV-escaped (quotes doubled, wrapped in quotes)
- **Open with UTF-8:** Use Excel's "From Text/CSV" import with UTF-8 encoding

### Extension not loading
- **Check Chrome version:** Requires Chrome 88+ (Manifest V3)
- **Developer mode:** Must be enabled in chrome://extensions
- **Reload extension:** Click reload button after code changes

## Technical Details

- **Manifest Version:** 3
- **Permissions:** activeTab, scripting, downloads, storage, host access to *.apollo.io
- **Min Chrome Version:** 88
- **Content Security Policy:** Compliant (no inline scripts)

## Comparison with apollo-email-scraper

| Feature                          | apollo-email-scraper | This Extension          |
|----------------------------------|----------------------|-------------------------|
| Table cloning                    | ✅ Yes               | ✅ Yes                  |
| Multi-page scraping              | ✅ Yes (manual nav)  | ✅ Yes (automatic)      |
| Email extraction                 | ❌ Limited           | ✅ Advanced (4 methods) |
| Shadow DOM support               | ❌ No                | ✅ Yes                  |
| Network API capture              | ❌ No                | ✅ Yes                  |
| Formatted columns (org, tags)    | ❌ No                | ✅ Yes                  |
| Smart title-casing               | ❌ No                | ✅ Yes                  |
| Progress tracking                | ❌ No                | ✅ Yes                  |
| CSV preview                      | ❌ No                | ✅ Yes                  |

## Credits

This extension builds upon the proven table cloning technique from [apollo-email-scraper](../apollo-email-scraper) and extends it with:
- Multi-strategy data extraction
- Advanced email detection
- Smart formatting and normalization
- Network API interception
- Automatic pagination

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions:
1. Check [HIDDEN_DATA_EXTRACTION.md](./HIDDEN_DATA_EXTRACTION.md) for technical details
2. Review troubleshooting section above
3. Check browser console for error messages
4. Open an issue with:
   - Chrome version
   - Apollo.io URL (if shareable)
   - Console errors (F12 → Console tab)
   - Steps to reproduce
