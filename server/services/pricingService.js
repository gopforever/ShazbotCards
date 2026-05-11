const db = require('../db');

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

async function getTCGPrice(productId) {
  const apiKey = getSetting('tcgplayer_api_key') || process.env.TCGPLAYER_API_KEY || '';
  const baseUrl = getSetting('sportscards_api_base') || process.env.SPORTSCARDS_API_BASE || 'https://api.sportscards.com/v1';

  if (!apiKey) throw new Error('TCGPlayer API key not configured');
  if (!productId) throw new Error('productId is required');

  const response = await fetch(`${baseUrl}/prices/tcg?productId=${encodeURIComponent(productId)}&apiKey=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`TCGPlayer pricing API failed: ${response.statusText}`);

  return response.json();
}

async function getSportsCardPrice(sportsCardsId) {
  const apiKey = getSetting('sportscards_api_key') || process.env.SPORTSCARDS_API_KEY || '';
  const baseUrl = getSetting('sportscards_api_base') || process.env.SPORTSCARDS_API_BASE || 'https://api.sportscards.com/v1';

  if (!apiKey) throw new Error('sportscards.com API key not configured');
  if (!sportsCardsId) throw new Error('sportsCardsId is required');

  const response = await fetch(`${baseUrl}/prices/sports?id=${encodeURIComponent(sportsCardsId)}&apiKey=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`sportscards.com pricing API failed: ${response.statusText}`);

  return response.json();
}

async function updateCardPrice(cardId) {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('Card not found');

  let priceData = null;
  let source = '';

  try {
    if ((card.type === 'pokemon' || card.type === 'mtg') && card.tcg_product_id) {
      priceData = await getTCGPrice(card.tcg_product_id);
      source = 'tcgplayer';
    } else if (card.type === 'sports' && card.sportscards_id) {
      priceData = await getSportsCardPrice(card.sportscards_id);
      source = 'sportscards';
    } else {
      throw new Error('No pricing identifier available for this card');
    }
  } catch (err) {
    throw err;
  }

  const price = priceData?.market_price || priceData?.price || priceData?.marketPrice || null;
  if (!price) throw new Error('Could not extract price from API response');

  // Update card
  db.prepare("UPDATE cards SET market_price = ?, market_price_updated = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(price, cardId);

  // Record price history
  db.prepare("INSERT INTO price_history (card_id, source, price) VALUES (?, ?, ?)").run(cardId, source, price);

  return { price, source, updated_at: new Date().toISOString() };
}

module.exports = {
  getTCGPrice,
  getSportsCardPrice,
  updateCardPrice
};
