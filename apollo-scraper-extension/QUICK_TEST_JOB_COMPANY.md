# 🎯 Quick Test Guide - Job Title & Company Extraction

## Before You Start

**Reload the extension first!**
1. Open `chrome://extensions/`
2. Find "Apollo Scraper Extension"
3. Click 🔄 **Reload** button

---

## Test Steps

### 1️⃣ Open Apollo Page
Go to your Apollo people/contacts search results page

### 2️⃣ Open Browser Console
Press **F12** → Click **"Console"** tab

### 3️⃣ Run the Extension
Click the extension icon → Click **"Scrape Current Page"**

### 4️⃣ Check Console Output

You should see something like this:

```
[Apollo Scraper] Extracted 25 rows
[Apollo Scraper] 📊 Sample extracted data (first 3 rows):
  Row 1: {
    name: "Busara Seesuk",
    job: "Senior Software Engineer",      ← LOOK HERE! ✅
    company: "Tech Company Inc.",          ← AND HERE! ✅
    linkedin: "Yes",
    email: "(empty)"
  }
  Row 2: {
    name: "Sii Recluta",
    job: "Product Manager",                ← JOB TITLE ✅
    company: "StartupXYZ",                 ← COMPANY ✅
    linkedin: "Yes",
    email: "(empty)"
  }
  Row 3: {
    name: "Sahil Rashid",
    job: "Marketing Director",             ← JOB TITLE ✅
    company: "BigCorp Ltd",                ← COMPANY ✅
    linkedin: "Yes",
    email: "(empty)"
  }

[Apollo Scraper] ✅ Found 0 emails automatically (NO CREDITS USED)
[Apollo Scraper] 📋 Found 25 job titles           ← CHECK THIS NUMBER ✅
[Apollo Scraper] 🏢 Found 25 companies            ← CHECK THIS NUMBER ✅
```

### 5️⃣ Preview Data

In the extension popup:
1. Click **"Preview Data"**
2. Look at the table
3. Check columns: **job_title** (column 2) and **company** (column 3)

### 6️⃣ Download CSV

1. Click **"Download CSV"**
2. Open the file in Excel/Google Sheets
3. Verify columns are populated:
   - Column A: `name` ✅
   - Column B: `job_title` ✅ **← NEW!**
   - Column C: `company` ✅ **← NEW!**
   - Column D: `linkedin` ✅
   - Column E: `email` (empty unless clicked)

---

## ✅ Success Criteria

**Good Result:**
```
[Apollo Scraper] 📋 Found 25 job titles
[Apollo Scraper] 🏢 Found 25 companies
```
→ CSV will have job_title and company columns filled! 🎉

**Partial Result:**
```
[Apollo Scraper] 📋 Found 18 job titles
[Apollo Scraper] 🏢 Found 22 companies
```
→ Most data extracted, some might be in different format

**Empty Result:**
```
[Apollo Scraper] 📋 Found 0 job titles
[Apollo Scraper] 🏢 Found 0 companies
```
→ Apollo changed UI structure - share console output for fixing

---

## 🐛 If Data Is Empty

### Check Console Sample
Look at the sample data output:
```
Row 1: {name: "...", job: "(empty)", company: "(empty)", ...}
```

If you see `"(empty)"` for job/company:

1. **Right-click** on a job title in Apollo page → **Inspect**
2. **Copy** the HTML structure
3. Share with developer - we'll add the specific selectors

---

## 📊 Expected CSV Output

```csv
name,job_title,company,linkedin,email,org_link,location,tags
"Busara Seesuk","Senior Software Engineer","Tech Company Inc.","https://linkedin.com/in/...","","https://app.apollo.io/#/organizations/123","San Francisco, CA","Engineering|Tech"
"Sii Recluta","Product Manager","StartupXYZ","https://linkedin.com/in/...","","https://app.apollo.io/#/organizations/456","New York, NY","Product|Startup"
...
```

**Key Columns:**
- ✅ `job_title` - Populated with job titles
- ✅ `company` - Populated with company names
- ❌ `email` - Empty (requires credits or external tools)

---

## 💡 Remember

**What You Get:**
- ✅ Names
- ✅ Job titles **← ENHANCED!**
- ✅ Companies **← ENHANCED!**
- ✅ LinkedIn URLs
- ✅ Locations
- ✅ Organization links

**What Requires Credits:**
- ❌ Emails (locked behind "Access email" buttons)

**Free Email Alternatives:**
- 🔥 hunter.io (60-70% success, free trial)
- 🔥 rocketreach.io (similar success rate)
- 🔥 snov.io (another option)

---

## 🎉 Quick Comparison

### Before This Update:
```csv
name,job_title,company,linkedin,email
"John Doe","","","https://...","" 
```
❌ Empty job titles and companies

### After This Update:
```csv
name,job_title,company,linkedin,email
"John Doe","Senior Engineer","TechCorp","https://...","" 
```
✅ Job titles and companies extracted!

---

## Next Steps

1. ✅ Reload extension
2. ✅ Test on Apollo page
3. ✅ Check console output
4. ✅ Download CSV
5. ✅ Verify data in Excel

**Questions?** Share your console output for debugging! 🚀
