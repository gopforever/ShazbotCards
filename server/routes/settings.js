const express = require('express');
const router = express.Router();
const db = require('../db');

const ALLOWED_KEYS = [
  'sportscards_api_key', 'sportscards_api_base',
  'tcgplayer_api_key',
  'ebay_client_id', 'ebay_client_secret', 'ebay_redirect_uri', 'ebay_env',
  'ebay_fulfillment_policy_id', 'ebay_payment_policy_id', 'ebay_return_policy_id',
  'ebay_access_token', 'ebay_refresh_token', 'ebay_token_expiry'
];

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value, updated_at FROM settings').all();
    const result = {};
    settings.forEach(row => {
      // Mask sensitive values
      if (['ebay_access_token', 'ebay_refresh_token', 'ebay_client_secret', 'sportscards_api_key', 'tcgplayer_api_key'].includes(row.key)) {
        result[row.key] = row.value ? '***CONFIGURED***' : '';
      } else {
        result[row.key] = row.value || '';
      }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const updates = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))");

    const updateMany = db.transaction((items) => {
      for (const [key, value] of Object.entries(items)) {
        if (ALLOWED_KEYS.includes(key) && value !== '***CONFIGURED***') {
          stmt.run(key, value);
        }
      }
    });

    updateMany(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/:key
router.get('/:key', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(req.params.key);
    res.json({ key: req.params.key, value: row ? row.value : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
