# ShazbotCards Analytics

A **web-based eBay Listing Analyzer Dashboard** for ShazbotCards — a static site that reads eBay traffic report CSV files and generates actionable insights to help optimize card selling on eBay.

## 🌐 Live Demo

Deploy this repo to Netlify and it auto-loads the included demo CSV on first visit.

---

## 🚀 Deploy on Netlify

1. **Fork or push this repo to GitHub**
2. Log in to [Netlify](https://netlify.com) → **Add new site → Import an existing project**
3. Connect to your GitHub repo (`ShazbotCards`)
4. Leave build settings blank (it's a static site — no build step needed)
5. Click **Deploy site**

Netlify auto-deploys on every push to `main`. Your dashboard will be live in ~30 seconds.

---

## 📂 File Structure

```
/
├── index.html              # Main dashboard page
├── css/
│   └── styles.css          # Dark theme dashboard styles
├── js/
│   ├── app.js              # Main application logic & DOM rendering
│   ├── csvParser.js        # eBay CSV parsing utilities
│   ├── analyzer.js         # Data analysis & health scoring engine
│   └── charts.js           # Chart.js chart rendering
├── data/
│   └── sample-traffic-report.csv   # Demo eBay traffic report
├── netlify.toml            # Netlify deployment config
└── README.md               # This file
```

---

## 🗂 How to Use

### Auto-load Demo Data
The dashboard automatically loads `data/sample-traffic-report.csv` on page load — no setup required.

### Upload Your Own eBay CSV Export
1. In your eBay Seller Hub → **Reports → Traffic** → download a **Listings Traffic Report** as CSV
2. On the dashboard, either:
   - **Drag & drop** the CSV onto the upload zone at the top, or
   - Click **"Upload New Report"** to browse for the file
3. The entire dashboard refreshes instantly with your new data

### Supported CSV Format
The tool handles eBay's quirky CSV format automatically:
- Disclaimer header rows (first 4 rows) are skipped
- `="358228910357"` item ID format is parsed correctly
- Percentage strings like `"1,150.0%"` with embedded commas are handled
- `-` values (no data) are treated as null

---

## 📊 Dashboard Sections

### 1. 📊 KPI Cards
At a glance:
- **Active Listings** — total cards in the report
- **Total Impressions** — how many times listings appeared in search
- **Avg CTR** — click-through rate (page views ÷ impressions)
- **Total Sold** — quantity sold in the report period
- **Zero Page Views** — listings that got impressions but no clicks (dead listings)
- **Avg Health Score** — composite 0–100 score across all listings

### 2. 🚨 Fix These First
Listings sorted by opportunity cost — high impressions with no clicks or no sales:
- 🔴 **Red** — High impressions, 0% CTR: review photos & title keywords
- 🟡 **Yellow** — Getting clicks but no sales: check pricing & description
- 🟢 **Green** — Has sales: maintain current strategy

**Action**: Start with the top red rows. These listings are getting seen but buyers aren't clicking — your title or thumbnail photo needs work.

### 3. 📈 Promoted vs. Organic
Side-by-side stats comparing your promoted listings vs. organic (non-promoted) ones:
- Total impressions, avg CTR, page views for each group
- Bar chart for visual comparison

**Is promoted worth it?** If promoted CTR is meaningfully higher than organic, the spend is driving quality traffic. If CTR is equal, consider reducing promoted budget.

### 4. 🔥 Trending Up / Trending Down
Cards sorted by day-over-day % change in organic impressions:
- **Trending Up** — gaining momentum (positive change)
- **Trending Down** — losing momentum (negative change)

**Action**: For trending-up cards, consider pricing higher. For trending-down cards, refresh the listing or lower price to generate velocity.

### 5. 🏈⚾🏀 Sport Breakdown
Auto-detected sport category (Football / Baseball / Basketball / Other) for each listing:
- Table: listings, impressions, sold, avg impressions per listing by sport
- Doughnut chart: impressions share by sport
- Bar chart: listing count by sport

**Action**: Focus purchasing and listing effort on the sport category with the best impressions and CTR.

### 6. 📋 All Listings Table
Fully searchable and sortable table of every listing:
- Click any **column header** to sort
- Use the **search box** to filter by card name or eBay item ID
- Click any **row** to expand a detailed breakdown panel
- Click the listing title to **open the eBay listing** in a new tab

### 7. 💡 Listing Health Score (0–100)
Composite score per listing based on:
- Impressions (40 pts, log-normalised vs. best listing)
- CTR (30 pts, 2%+ CTR = full marks)
- Top-20 search % (15 pts)
- Day-over-day organic trend (15 pts)

| Score | Badge | Meaning |
|-------|-------|---------|
| 60–100 | 🟢 Green | Healthy — keep doing what you're doing |
| 30–59  | 🟡 Yellow | Needs attention — review title/pricing |
| 0–29   | 🔴 Red | Critical — consider refreshing or relisting |

---

## 🛡 Security
- Pure client-side static site — no data ever leaves your browser
- CSV files are parsed entirely in JavaScript in your local browser session
- `netlify.toml` enforces security headers (CSP, X-Frame-Options, etc.)

---

## 🔧 Tech Stack
- **HTML5 + CSS3 + Vanilla JavaScript** — no frameworks, no build step
- **[Chart.js 4](https://www.chartjs.org/)** — for data visualizations (loaded from CDN)
- **Netlify** — static hosting with CDN and automatic HTTPS