const express = require('express');
const router = express.Router();
const db = require('../db');
const pricingService = require('../services/pricingService');

// GET /api/pricing/tcg/:productId
router.get('/tcg/:productId', async (req, res) => {
  try {
    const price = await pricingService.getTCGPrice(req.params.productId);
    res.json(price);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pricing/sports/:cardsId
router.get('/sports/:cardsId', async (req, res) => {
  try {
    const price = await pricingService.getSportsCardPrice(req.params.cardsId);
    res.json(price);
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
