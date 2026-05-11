const db = require('../db');

const SPORTSCARDSPRO_BASE = 'https://www.sportscardspro.com/api';

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function getApiKey() {
  const key = getSetting('sportscardspro_api_key') || process.env.SPORTSCARDSPRO_API_KEY || '';
  if (!key) throw new Error('SportscardsPro API key not configured. Add it in Settings.');
  return key;
}

/**
 * Search SportscardsPro for cards matching a query
 * @param {string} query - Card name, player, set, etc.
 * @param {string} [game] - Optional: baseball, basketball, football, hockey, pokemon, mtg
 * @returns {Promise<Array>} Array of matching products
 */
async function searchCards(query, game = null) {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ q: query, apiKey });
  if (game) params.set('game', game);

  const url = `${SPORTSCARDSPRO_BASE}/products?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SportscardsPro search failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  // API may return { products: [...] } or just an array
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.results)) return data.results;
  throw new Error('SportscardsPro search response format was unexpected');
}

/**
 * Get full pricing data for a specific product by its SportscardsPro ID
 * @param {string|number} productId
 * @returns {Promise<Object>} Product with pricing details
 */
async function getProductPrice(productId) {
  const apiKey = getApiKey();
  const url = `${SPORTSCARDSPRO_BASE}/product/${encodeURIComponent(productId)}?apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SportscardsPro product lookup failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Get TCGPlayer pricing (Pokémon/MTG) via SportscardsPro
 * SportscardsPro covers TCG games (pokemon, mtg) in addition to sports
 */
async function getTCGPrice(productId) {
  return getProductPrice(productId);
}

/**
 * Get sports card pricing via SportscardsPro
 */
async function getSportsCardPrice(productId) {
  return getProductPrice(productId);
}

/**
 * Extract the best price from a SportscardsPro product response
 * Handles various response shapes
 */
function extractPrice(priceData) {
  return (
    // Common direct fields
    priceData?.market_price ||
    priceData?.marketPrice ||
    priceData?.price ||
    // Nested "prices" shape
    priceData?.prices?.market ||
    priceData?.prices?.mid ||
    // Direct fallback
    priceData?.mid ||
    null
  );
}

/**
 * Fetch the latest price for a card and store it in price_history
 */
async function updateCardPrice(cardId) {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('Card not found');

  const productId = card.sportscardspro_id || card.tcg_product_id || card.sportscards_id;
  if (!productId) throw new Error('No SportscardsPro product ID set for this card. Add it in the card edit form.');

  const priceData = await getProductPrice(productId);
  const price = extractPrice(priceData);
  if (!price) throw new Error('Could not extract price from SportscardsPro response');

  db.prepare(
    "UPDATE cards SET market_price = ?, market_price_updated = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(price, cardId);

  db.prepare(
    "INSERT INTO price_history (card_id, source, price) VALUES (?, ?, ?)"
  ).run(cardId, 'sportscardspro', price);

  return {
    price,
    source: 'sportscardspro',
    raw: priceData,
    updated_at: new Date().toISOString()
  };
}

module.exports = {
  searchCards,
  getProductPrice,
  getTCGPrice,
  getSportsCardPrice,
  updateCardPrice,
  extractPrice
};
