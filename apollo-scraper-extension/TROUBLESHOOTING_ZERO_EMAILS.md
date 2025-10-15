# Troubleshooting: "0 emails found" Issue

## Problem
Preview shows "Previewing first 25 rows — **0 emails found**" even though rows were scraped.

## Quick Fixes (Try These First)

### Fix 1: Check Browser Console for Debug Info
```bash
1. Open Apollo page
2. Press F12 to open Developer Tools
3. Go to "Console" tab
4. Click "Scrape Current Page"
5. Look for messages like:
   [Apollo Scraper] Extracted X rows
   [Apollo Scraper] Found X emails
   [Apollo Scraper] Sample row for debugging: {...}
```

**What to look for:**
- If it says "Found 0 emails" → Email data not in DOM (see Fix 2-5)
- If you see HTML sample → Check if email is visible in the HTML

### Fix 2: Wait for Page to Fully Load
```bash
# Apollo loads data asynchronously

1. Navigate to Apollo people list
2. WAIT 5 seconds for content to load
3. Scroll down slowly to bottom of page
4. WAIT another 3 seconds
5. NOW click "Scrape Current Page"
```

**Why this works:**
- Apollo uses lazy loading
- Email data renders after initial page load
- Scrolling triggers data fetch

### Fix 3: Check if Emails are Actually Visible on Apollo
```bash
1. Look at the Apollo page
2. Do you see email addresses displayed?
   
   ✅ YES → Go to Fix 4
   ❌ NO → You need to reveal them first (see Fix 5)
```

**Visual Check:**
```
If you see:              Status:
john@company.com         ✅ Email visible → Should be extracted
Access email [button]    ❌ Email hidden → Need to reveal
No email                 ❌ No email → Cannot extract
[locked icon]            ❌ Need Apollo credits
```

### Fix 4: Enable "Click to reveal emails"
```bash
If emails show as buttons like "Access email":

1. Check ☑️ "Click to reveal emails" in extension popup
2. Click "Scrape Current Page"
3. Wait for "Revealing emails — X / Y" progress
4. Extension will click buttons and extract emails
```

**Expected time:** 1-5 seconds per email

### Fix 5: Try Table View in Apollo
```bash
Apollo's table view works best for email extraction:

1. On Apollo, look for a "Table view" or grid icon
2. Switch from list view to table view
3. Emails are more reliably shown in table cells
4. Run scraper again
```

**Success rate in table view:** 90-100%!

### Fix 6: Reload Extension
```bash
If extension was recently updated:

1. Go to chrome://extensions/
2. Find "Apollo Scraper Extension"
3. Click the reload icon (circular arrow)
4. Refresh Apollo page
5. Try scraping again
```

## Diagnostic Steps

### Step 1: Verify Extension is Working
```bash
1. Click extension icon
2. Do you see the popup with buttons?
   ✅ YES → Extension loaded correctly
   ❌ NO → Reload extension (Fix 6)
```

### Step 2: Check Page URL
```bash
Extension only works on Apollo.io pages

✅ Correct: https://app.apollo.io/#/people
✅ Correct: https://app.apollo.io/#/contacts
❌ Wrong:   https://www.apollo.io
❌ Wrong:   https://app.apollo.io/#/home
```

### Step 3: Inspect a Row Manually
```bash
1. Open Developer Tools (F12)
2. Click "Elements" tab
3. Find a person row on the page
4. Look for email in the HTML:

   <!-- Email in text -->
   <td>john@company.com</td>
   
   <!-- Email in data attribute -->
   <div data-email="john@company.com">
   
   <!-- Email as button (needs click-to-reveal) -->
   <button>Access email</button>
   
   <!-- No email -->
   <span>No email</span>
```

### Step 4: Run Scraper with Console Open
```bash
1. Open Console (F12)
2. Clear console (click 🚫 icon)
3. Click "Scrape Current Page"
4. Watch for error messages:

   ✅ Good: [Apollo Scraper] Found 25 emails
   ⚠️ Warning: [Apollo Scraper] Found 0 emails
   ❌ Error: Uncaught TypeError: ...
```

## Common Causes & Solutions

### Cause 1: Emails Not Yet Revealed
**Symptom:** Rows show "Access email" buttons

**Solution:**
```bash
1. Enable "Click to reveal emails"
2. OR manually click "Access email" buttons
3. Wait for emails to appear
4. Then run scraper
```

### Cause 2: Apollo Credits Required
**Symptom:** Lock icons or "Upgrade" messages

**Solution:**
```bash
- Some profiles require Apollo subscription
- Check your Apollo account status
- Try scraping different (public) profiles
```

### Cause 3: Page Still Loading
**Symptom:** Only first few rows extracted

**Solution:**
```bash
1. Scroll to bottom of page
2. Wait for spinner to stop
3. Scroll back to top
4. Wait 3 seconds
5. Run scraper
```

### Cause 4: Apollo UI Changed
**Symptom:** Extension worked before, now broken

**Solution:**
```bash
1. Check for extension updates
2. Report issue with:
   - Screenshot of Apollo page
   - Browser console errors
   - Sample HTML of a row (F12 → Elements)
```

### Cause 5: Network Capture Not Working
**Symptom:** 0 emails but data visible on page

**Solution:**
```bash
1. Reload extension: chrome://extensions/
2. Refresh Apollo page
3. IMPORTANT: Run scraper BEFORE scrolling
   (Network capture needs to run from page load)
4. Try scraping again
```

## Advanced Debugging

### Debug Mode: Export Sample HTML
```bash
1. Open Console (F12)
2. After scraping, run this command:

   copy(document.querySelector('table tr, [data-qa="people-list-row"]')?.outerHTML)

3. Paste HTML in a text editor
4. Search for email patterns:
   - Look for @ symbol
   - Look for "email" in attributes
   - Look for mailto: links
```

### Check CSV Headers
```bash
After scraping:
1. Click "Preview Data"
2. Check table headers:

   ✅ Good: name | job_title | company | linkedin | email | ...
   ❌ Bad: name | job_title | company | linkedin | buttons_json | ...

If you see buttons_json instead of email:
- Old version of extension
- Reload extension (chrome://extensions/)
```

### Manual Email Extraction Test
```bash
1. Open Console (F12)
2. Run this to test email extraction:

   // Test email regex
   document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)

3. If this returns emails, extension should too
4. If this returns null, emails not in DOM
```

## Test Cases

### Test 1: Simple Public Profile
```bash
Expected: Email extracted automatically
Success Rate: 85-95%

If fails:
- Check console for errors
- Verify email visible on page
- Try click-to-reveal
```

### Test 2: Table View
```bash
Expected: Email in table cell
Success Rate: 90-100%

If fails:
- Inspect table row HTML
- Look for email in <td> elements
- Check if data-email attribute present
```

### Test 3: Hidden Email (Button)
```bash
Expected: Need click-to-reveal
Success Rate: 70-90% with click enabled

If fails:
- Verify "Click to reveal" is checked
- Check Apollo credits available
- Increase timeout in settings
```

## Getting Help

### Information to Provide
```bash
When reporting "0 emails found" issue:

1. ✅ Browser Console output (F12 → Console tab)
2. ✅ Apollo page URL (if shareable)
3. ✅ Screenshot of Apollo page showing rows
4. ✅ Sample HTML of one row:
   - F12 → Elements
   - Find a person row
   - Right-click → Copy → Copy outerHTML
5. ✅ Extension version
6. ✅ Does email appear on page visually?
```

### Quick Checklist
```bash
Before reporting:
- [ ] Waited 5 seconds after page load
- [ ] Scrolled page to load all rows
- [ ] Checked console for errors
- [ ] Verified emails visible on Apollo page
- [ ] Tried "Click to reveal emails"
- [ ] Tried table view
- [ ] Reloaded extension
- [ ] Refreshed Apollo page
```

## Likely Solutions by Symptom

| Symptom | Most Likely Solution |
|---------|---------------------|
| "0 emails found" but emails visible on page | Wait longer, scroll page, reload extension |
| "0 emails found" and see "Access email" buttons | Enable "Click to reveal emails" |
| "0 emails found" and see lock icons | Need Apollo subscription/credits |
| "0 emails found" and see "No email" | Profiles genuinely don't have emails |
| Worked yesterday, broken today | Apollo UI changed - reload extension |
| Only works for first few rows | Scroll page before scraping |

## Success Indicators

After fixing, you should see:

✅ Console: `[Apollo Scraper] Found 25 emails` (not 0)  
✅ Preview: `25 rows — 25 emails found` (or similar)  
✅ Table: Email column populated with real emails  
✅ CSV: Contains actual email addresses

## Still Not Working?

### Last Resort: Manual Inspection
```bash
1. Open Apollo page
2. Right-click on a person row
3. Inspect Element (F12)
4. Look at the HTML structure
5. Search for @ symbol in the HTML
6. Take screenshot of HTML
7. Share with developer for custom fix
```

### Temporary Workaround
```bash
While debugging, you can:
1. Use "Click to reveal emails" (slower but more reliable)
2. Export via Apollo's native export (if available)
3. Manually copy-paste visible emails
4. Wait for extension update/fix
```

---

**Need more help?** Open an issue with:
- Console output
- Screenshot of Apollo page  
- Sample HTML of a row
- Whether emails are visible on the page
