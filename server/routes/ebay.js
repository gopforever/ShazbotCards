const express = require('express');
const router = express.Router();
const db = require('../db');
const ebayService = require('../services/ebayService');

// GET /api/ebay/auth-url
router.get('/auth-url', (req, res) => {
  try {
    const url = ebayService.getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Authorization code missing' });

    const tokens = await ebayService.exchangeCodeForTokens(code);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ebay_access_token', ?, datetime('now'))`).run(tokens.access_token);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ebay_refresh_token', ?, datetime('now'))`).run(tokens.refresh_token);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ebay_token_expiry', ?, datetime('now'))`).run(tokens.token_expiry);

    res.redirect('http://localhost:5173/settings?ebay=connected');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/status
router.get('/status', (req, res) => {
  try {
    const token = db.prepare("SELECT value FROM settings WHERE key = 'ebay_access_token'").get();
    const expiry = db.prepare("SELECT value FROM settings WHERE key = 'ebay_token_expiry'").get();
    const connected = !!(token && token.value);
    res.json({
      connected,
      expires_at: expiry ? expiry.value : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ebay/list/:cardId
router.post('/list/:cardId', async (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.cardId);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const images = db.prepare('SELECT * FROM card_images WHERE card_id = ? ORDER BY is_primary DESC').all(req.params.cardId);
    const { price, description } = req.body;
    if (!price) return res.status(400).json({ error: 'price is required' });

    const listingPrice = parseFloat(price);
    const sku = `shazbot-${req.params.cardId}-${Date.now()}`;

    const imageUrls = images.map(img => `${process.env.SERVER_URL || 'http://localhost:3001'}${img.file_path}`);

    // Create inventory item
    await ebayService.createInventoryItem(sku, { ...card, description }, imageUrls);

    // Determine category ID
    let categoryId = '183454'; // default sports
    if (card.type === 'pokemon') categoryId = '183050';
    else if (card.type === 'mtg') categoryId = '19107';

    // Create offer
    const offer = await ebayService.createOffer(sku, listingPrice, categoryId, { ...card, description });

    // Publish offer
    const published = await ebayService.publishOffer(offer.offerId);

    // Store listing
    db.prepare(`
      INSERT INTO ebay_listings (card_id, ebay_item_id, listing_url, listing_status, list_price, listed_at)
      VALUES (?, ?, ?, 'active', ?, datetime('now'))
    `).run(req.params.cardId, published.listingId, published.listingUrl, listingPrice);

    // Update card
    db.prepare(`UPDATE cards SET status = 'listed', ebay_item_id = ?, ebay_listing_url = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(published.listingId, published.listingUrl, req.params.cardId);

    res.json({ success: true, listingId: published.listingId, listingUrl: published.listingUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/listings
router.get('/listings', async (req, res) => {
  try {
    const listings = await ebayService.getActiveListings();
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ebay/listings/:itemId
router.delete('/listings/:itemId', async (req, res) => {
  try {
    await ebayService.endListing(req.params.itemId);
    db.prepare("UPDATE ebay_listings SET listing_status = 'ended' WHERE ebay_item_id = ?").run(req.params.itemId);
    db.prepare("UPDATE cards SET status = 'in_stock', ebay_item_id = NULL, ebay_listing_url = NULL, updated_at = datetime('now') WHERE ebay_item_id = ?").run(req.params.itemId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ebay/sold
router.get('/sold', async (req, res) => {
  try {
    const orders = await ebayService.getOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
