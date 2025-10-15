# Hidden Data Extraction Methods

This document explains how the Apollo scraper extension extracts "hidden" information from the Apollo.io website.

## Overview

The extension uses **multiple extraction strategies** in priority order to ensure maximum data capture:

1. **DOM-based extraction** (Primary)
2. **Table cloning technique** (Fallback - inspired by apollo-email-scraper)
3. **Network interception** (Fallback)
4. **Click-to-reveal** (Optional enhancement)

## Key Insight from apollo-email-scraper

The most important discovery from analyzing the `apollo-email-scraper` folder is that **Apollo.io renders hidden data directly in the DOM table structure**. When you reveal an email or other "hidden" data in Apollo's UI, it's not fetched via a new API call - it's already present in the HTML table cells, just styled to appear hidden or collapsed.

### The Table Cloning Technique

```javascript
// Clone the entire table
const clonedTable = table.cloneNode(true)

// Remove visual noise (icons, buttons, checkboxes)
const elementsToRemove = clonedTable.querySelectorAll('svg, img, button, input[type="checkbox"]')
elementsToRemove.forEach(el => el.parentNode.removeChild(el))

// Extract text from each cell
const rows = clonedTable.querySelectorAll('tr')
rows.forEach(row => {
    const cells = row.querySelectorAll('td, th')
    cells.forEach(cell => {
        const data = cell.innerText || cell.textContent
        // Process data (emails, names, companies, etc.)
    })
})
```

This approach works because:
- Apollo renders all data in the table DOM
- "Hidden" data is present but CSS-styled or collapsed
- Cloning captures the full rendered state
- Removing SVG/buttons leaves clean text data

## Extraction Methods in Detail

### 1. DOM-Based Extraction (Primary)

The extension first attempts to scrape data directly from the DOM:

**Enhanced Email Extraction:**
```javascript
function extractHiddenEmail(rowEl, linkEl) {
    // Priority 1: Mailto links
    const mailAnchors = rowEl.querySelectorAll('a[href^="mailto:"]')
    
    // Priority 2: Scan ALL text content (catches already-revealed emails)
    const allText = rowEl.innerText || rowEl.textContent
    const emailMatch = allText.match(emailRegex)
    
    // Priority 3: Data attributes (data-email, data-contact)
    
    // Priority 4: Table cell scanning (for TR elements)
    if(rowEl.tagName === 'TR') {
        const cells = rowEl.querySelectorAll('td, th')
        cells.forEach(cell => {
            const cellText = cell.innerText.trim()
            // Skip placeholders like "No email", "N/A"
            if(!/no\s+email|request.*mobile|n\/?a/i.test(cellText)) {
                const match = cellText.match(emailRegex)
                if(match) return match[0]
            }
        })
    }
    
    // Priority 5: ARIA labels, titles, parent text
}
```

**Table Row Cell Extraction:**
When the container is a table row (`TR`), the extension now extracts structured data from cells:

```javascript
if(el.tagName === 'TR') {
    const cells = Array.from(el.querySelectorAll('td, th'))
    
    // First cell → Name
    if(!name && cells.length > 0) {
        const firstCell = cells[0]
        const nameLink = firstCell.querySelector('a')
        name = nameLink ? nameLink.innerText.trim() : firstCell.innerText.trim()
    }
    
    // Second cell → Job Title
    if(!job && cells.length > 1) {
        job = cells[1]?.innerText.trim()
    }
    
    // Third cell → Company
    if(!company && cells.length > 2) {
        company = cells[2]?.innerText.trim()
    }
}
```

### 2. Table Cloning Fallback

If DOM extraction finds no rows, the extension clones the entire table:

**Process:**
1. Find `table` element on page
2. Clone it with `table.cloneNode(true)`
3. Remove visual elements (SVG, images, buttons, checkboxes)
4. Process each row:
   - Extract name (split into First/Last/Full)
   - Format phone numbers (e.g., +1 (555) 123-4567)
   - Sanitize text (remove special chars, normalize whitespace)
   - Skip placeholder text ("No email", "Request Mobile Number", "N/A")
5. Build CSV with BOM marker (`\uFEFF`) for Excel compatibility

**Advantages:**
- Captures all rendered data including "hidden" fields
- Works even if DOM structure changes
- Proven approach from apollo-email-scraper
- Handles multi-cell layouts automatically

### 3. Network Interception Fallback

The extension intercepts Apollo's API calls to capture person data:

**Implementation:**
1. Inject a page-level script at `document_start`
2. Monkeypatch `fetch()` and `XMLHttpRequest`
3. Capture responses from URLs matching `/people|contacts|graphql|search/`
4. Parse JSON and extract person objects recursively
5. Normalize extracted data into rows

**Example Captured Data:**
```javascript
{
    "name": "John Doe",
    "email": "john@example.com",
    "title": "Software Engineer",
    "company": "TechCorp",
    "linkedinUrl": "https://linkedin.com/in/johndoe"
}
```

### 4. Click-to-Reveal (Optional)

If the user enables "Click to reveal emails", the extension:
1. Finds buttons with text like "Access email", "Reveal email"
2. Clicks them sequentially with delays (250ms between clicks)
3. Waits for DOM updates (up to 4000ms per click)
4. Re-extracts email from updated DOM
5. Shows progress bar to user

**Why Optional:**
- Slower (requires waiting for each click)
- May trigger rate limits
- Most data is already in DOM via methods 1-3

## Data Normalization

After extraction, all data is normalized:

**Smart Title Case:**
- Preserves acronyms (CEO, VP, CTO)
- Preserves numbers and special chars
- Title-cases regular words

**Noise Filtering:**
- Removes tokens like "Access email", "Copy", "N/A"
- Filters placeholder text
- Removes duplicate whitespace

**Tag Extraction:**
- Parses button arrays for organization links, locations, tags
- Deduplicates tags
- Limits to 6 tags per person
- Filters location-like tags if they match location field

**Phone Formatting:**
- Detects patterns like `+15551234567`
- Formats as `+1 (555) 123-4567`

## File Structure

```
content_script.js
├── injectNetworkCapture()      # Sets up API interception
├── scrapeApollo()              # Main DOM extraction
│   ├── extractHiddenEmail()    # Enhanced email detection
│   └── Table cell extraction   # Direct cell reading for TR elements
├── buildCsvFromTable()         # Table cloning fallback
├── getPersonsFromCapturedNetwork() # Parse intercepted API data
└── buildCsv()                  # Format output with inline parsing

popup/popup.js
├── parseLooseButtons()         # Tolerant JSON parser
├── smartTitleCase()            # Intelligent capitalization
├── normalizeRow()              # Clean and format data
└── Preview/Download handlers   # Detect and use formatted columns
```

## Usage

1. Navigate to an Apollo.io people list
2. Click "Scrape Current Page" button
3. (Optional) Enable "Click to reveal emails" for additional email discovery
4. Click "Preview Data" to see formatted results
5. Click "Download CSV" to save

## Benefits of Multi-Strategy Approach

✅ **Robust:** Works even if Apollo changes their UI  
✅ **Fast:** Prioritizes quick DOM extraction  
✅ **Complete:** Fallbacks ensure maximum data capture  
✅ **Accurate:** Multiple validation layers reduce errors  
✅ **User-friendly:** Automatic formatting and cleanup  

## Comparison: Before vs After

### Before (Original Extension)
- Relied solely on DOM selectors
- Brittle when UI changed
- Missed emails in table cells
- Required manual click-to-reveal for most emails

### After (Enhanced with apollo-email-scraper insights)
- Multiple extraction strategies
- Direct table cell reading
- Automatic email detection from rendered DOM
- Table cloning fallback for changed UI
- Network capture fallback for API-based data
- Click-to-reveal as optional enhancement, not requirement

## Technical Notes

**CSP Compliance:**
- Network capture uses `chrome.scripting.executeScript` with `world: 'MAIN'`
- Avoids inline scripts that violate Content Security Policy
- Loads external script file via `chrome.runtime.getURL`

**Performance:**
- DOM extraction: ~50-200ms
- Table cloning: ~100-300ms  
- Network parsing: ~50-150ms
- Click-to-reveal: ~1-5 seconds per email (250ms delay + wait time)

**Accuracy:**
- Email regex: `/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i`
- Filters common placeholders automatically
- Validates format before including in output
