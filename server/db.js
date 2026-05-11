const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.env.DB_PATH || './data/shazbotcards.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrations
db.exec(`
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('sports', 'pokemon', 'mtg')),
  name TEXT NOT NULL,
  year INTEGER,
  manufacturer TEXT,
  set_name TEXT,
  card_number TEXT,
  condition TEXT CHECK(condition IN ('PSA 10','PSA 9','PSA 8','PSA 7','PSA 6','PSA 5','PSA 4','PSA 3','PSA 2','PSA 1','BGS 10','BGS 9.5','BGS 9','BGS 8.5','BGS 8','Raw NM/M','Raw NM','Raw EX/NM','Raw EX','Raw VG/EX','Raw VG','Raw GD','Raw FR','Raw PO')),
  quantity INTEGER DEFAULT 1,
  purchase_price REAL,
  purchase_date TEXT,
  notes TEXT,
  status TEXT DEFAULT 'in_stock' CHECK(status IN ('in_stock','listed','sold','off_market')),
  player_name TEXT,
  team TEXT,
  sport TEXT CHECK(sport IN ('baseball','basketball','football','hockey','soccer','golf','tennis','ufc','wrestling','other')),
  parallel TEXT,
  print_run INTEGER,
  serial_number TEXT,
  autograph INTEGER DEFAULT 0,
  relic INTEGER DEFAULT 0,
  rookie_card INTEGER DEFAULT 0,
  pokemon_name TEXT,
  hp INTEGER,
  rarity TEXT,
  first_edition INTEGER DEFAULT 0,
  shadowless INTEGER DEFAULT 0,
  holo INTEGER DEFAULT 0,
  reverse_holo INTEGER DEFAULT 0,
  card_color TEXT,
  mana_cost TEXT,
  card_type TEXT,
  foil INTEGER DEFAULT 0,
  format_legality TEXT,
  market_price REAL,
  market_price_updated TEXT,
  my_price REAL,
  sold_price REAL,
  sold_date TEXT,
  ebay_item_id TEXT,
  ebay_listing_url TEXT,
  sportscardspro_id TEXT,
  tcg_product_id TEXT,
  sportscards_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS card_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  is_primary INTEGER DEFAULT 0,
  side TEXT CHECK(side IN ('front','back','other')) DEFAULT 'front',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  source TEXT,
  price REAL,
  recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ebay_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  ebay_item_id TEXT UNIQUE,
  listing_url TEXT,
  listing_status TEXT CHECK(listing_status IN ('active','sold','ended','draft')),
  list_price REAL,
  sold_price REAL,
  listed_at TEXT,
  sold_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_sport ON cards(sport);
CREATE INDEX IF NOT EXISTS idx_card_images_card_id ON card_images(card_id);
CREATE INDEX IF NOT EXISTS idx_price_history_card_id ON price_history(card_id);
CREATE INDEX IF NOT EXISTS idx_ebay_listings_card_id ON ebay_listings(card_id);
`);

try {
  db.prepare("ALTER TABLE cards ADD COLUMN sportscardspro_id TEXT").run();
} catch (e) {
  if (!String(e?.message || '').includes('duplicate column name: sportscardspro_id')) {
    throw e;
  }
}

console.log('Database initialized at', dbPath);

module.exports = db;
