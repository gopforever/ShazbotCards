# ShazbotCards 🃏

A **complete, production-ready, single-user card inventory web application** for managing Sports Cards, Pokémon Cards, and Magic: The Gathering cards. Built for personal use to track inventory, manage images, get live pricing, and push listings to eBay.

---

## Features

- 📦 **Full Inventory Management** — Track all Sports, Pokémon, and MTG cards with detailed metadata
- 🖼️ **Image Storage** — Upload and manage multiple images per card (front, back, other)
- 💰 **Live Pricing** — Integration with SportscardsPro API for sports cards, Pokémon, and MTG
- 🏷️ **eBay Integration** — Full OAuth flow + Inventory/Offer/Finding APIs to create and manage listings
- 📊 **Dashboard** — Visual stats, charts (Recharts), and profit/loss tracking
- 🔍 **eBay Sold Comps** — Search recent eBay sold listings for market pricing
- 🌗 **Dark UI** — Modern slate/indigo design built with TailwindCSS

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TailwindCSS v4 |
| Routing | React Router v7 |
| State | TanStack Query (React Query) |
| Charts | Recharts |
| Backend | Node.js + Express |
| Database | SQLite via better-sqlite3 |
| Images | Local filesystem (`/uploads`) |
| Icons | Heroicons |

---

## Project Structure

```
ShazbotCards/
├── server/
│   ├── index.js              # Express entry point (port 3001)
│   ├── db.js                 # SQLite setup & migrations
│   ├── routes/
│   │   ├── cards.js          # Card CRUD + stats
│   │   ├── images.js         # Image upload/serve/delete
│   │   ├── pricing.js        # Pricing API proxy
│   │   ├── ebay.js           # eBay API integration
│   │   ├── dashboard.js      # Dashboard stats
│   │   └── settings.js       # App settings/API keys
│   ├── middleware/
│   │   └── upload.js         # Multer config
│   └── services/
│       ├── ebayService.js    # eBay OAuth + REST API calls
│       ├── pricingService.js # SportscardsPro pricing integration
│       └── imageService.js   # Image management helpers
├── client/                   # Vite React app
│   ├── src/
│   │   ├── App.jsx           # Routes
│   │   ├── api/              # Axios API modules
│   │   ├── components/       # Shared UI components
│   │   └── pages/            # Page components
├── uploads/                  # (git-ignored) image storage
├── data/                     # (git-ignored) SQLite database
└── .env.example
```

---

## Setup

### Prerequisites

- Node.js 20+ (v24 recommended)
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/gopforever/ShazbotCards.git
cd ShazbotCards

# Copy environment file
cp .env.example .env

# Install all dependencies (root + client)
npm run install:all
```

### Configuration

Edit `.env` with your settings:

```env
PORT=3001
DB_PATH=./data/shazbotcards.db

# eBay Developer App (see below)
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_REDIRECT_URI=http://localhost:3001/api/ebay/callback
EBAY_ENV=sandbox  # Change to 'production' for live listings

# SportscardsPro API
SPORTSCARDSPRO_API_KEY=your_sportscardspro_api_key
```

> 💡 API keys can also be set through the **Settings** page in the app, which stores them in the database.

### Running

```bash
# Development (runs both server on :3001 and client on :5173)
npm run dev

# Run server only
npm run server

# Run client only
npm run client
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## API Keys

### eBay Developer API

1. Go to [https://developer.ebay.com](https://developer.ebay.com)
2. Sign in with your eBay account
3. Go to **My Account → Application Access Keys**
4. Create a new app and note the **Client ID** and **Client Secret**
5. Set your **Redirect URI** to `http://localhost:3001/api/ebay/callback`
6. Required OAuth scopes:
   - `https://api.ebay.com/oauth/api_scope/sell.inventory`
   - `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly`
   - `https://api.ebay.com/oauth/api_scope/sell.fulfillment`
   - `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`
   - `https://api.ebay.com/oauth/api_scope/buy.browse`
7. For eBay listings to work, you also need **Policy IDs** from your eBay Seller Hub (fulfillment, payment, return policies)

### SportscardsPro API

- Go to https://www.sportscardspro.com/api-documentation
- Sign up / log in and get your API key
- Used for: Sports card pricing (baseball, basketball, football, hockey, etc.), Pokémon card pricing, MTG card pricing
- Add to `.env` as `SPORTSCARDSPRO_API_KEY=...` OR enter it in the app Settings page

---

## Database

The SQLite database is stored at `./data/shazbotcards.db` (configurable via `DB_PATH` in `.env`).

**Tables:**
- `cards` — all card inventory with full metadata
- `card_images` — image metadata linked to cards
- `price_history` — historical pricing data per card
- `ebay_listings` — eBay listing records
- `settings` — API keys and preferences

**Backup:**
```bash
cp data/shazbotcards.db data/shazbotcards-backup-$(date +%Y%m%d).db
```

---

## Images

Images are stored in the `./uploads/{cardId}/` directory and served statically by Express at `/uploads/...`.

- Supports JPG, PNG, GIF, WebP
- Up to 10 images per card, 10MB each
- Tag each image as Front / Back / Other
- Set a primary image for thumbnail display

---

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/dashboard` | Overview stats, chart, recent activity |
| Inventory | `/inventory` | Full card list with table/grid views + filters |
| Card Detail | `/cards/:id` | Single card with images, pricing, eBay panel |
| Add Card | `/cards/add` | Multi-step form for adding new cards |
| Edit Card | `/cards/:id/edit` | Edit existing card |
| eBay Listings | `/ebay` | Active listings + sold orders |
| Price Lookup | `/pricing` | eBay sold comps search |
| Settings | `/settings` | Configure API keys |

---

## License

Personal use only.
