const express = require('express');
const router = express.Router();
const db = require('../db');
const pricingService = require('../services/pricingService');

// GET /api/pricing/search?q=mike+trout&game=baseball
// Search SportscardsPro for cards matching a query
router.get('/search', async (req, res) => {
  try {
    const { q, game } = req.query;
    if (!q) return res.status(400).json({ error: 'q query parameter is required' });
    const results = await pricingService.searchCards(q, game || null);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pricing/product/:productId
// Get full pricing for a specific SportscardsPro product ID
router.get('/product/:productId', async (req, res) => {
  try {
    const data = await pricingService.getProductPrice(req.params.productId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pricing/tcg/:productId  (kept for backward compat, now routes to SportscardsPro)
router.get('/tcg/:productId', async (req, res) => {
  try {
    const data = await pricingService.getTCGPrice(req.params.productId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pricing/sports/:productId  (kept for backward compat)
router.get('/sports/:productId', async (req, res) => {
  try {
    const data = await pricingService.getSportsCardPrice(req.params.productId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pricing/ebay-sold/:query
router.get('/ebay-sold/:query', async (req, res) => {
  try {
    const ebayService = require('../services/ebayService');
    const results = await ebayService.findSoldItems(req.params.query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pricing/update/:cardId
router.post('/update/:cardId', async (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.cardId);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const result = await pricingService.updateCardPrice(req.params.cardId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
