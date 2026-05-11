const express = require('express');
const router = express.Router();
const db = require('../db');

const ALLOWED_SORT_COLUMNS = new Set([
  'id', 'name', 'player_name', 'set_name', 'card_number', 'condition',
  'purchase_price', 'market_price', 'my_price', 'status', 'type',
  'created_at', 'updated_at', 'year', 'quantity', 'sold_date'
]);

// GET /api/cards/stats  (must be before /:id)
router.get('/stats', (req, res) => {
  try {
    const counts = db.prepare(`
      SELECT type, COUNT(*) as count FROM cards GROUP BY type
    `).all();

    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count FROM cards GROUP BY status
    `).all();

    const totals = db.prepare(`
      SELECT
        COUNT(*) as total_cards,
        COALESCE(SUM(market_price * quantity), 0) as total_market_value,
        COALESCE(SUM(purchase_price * quantity), 0) as total_cost,
        COALESCE(SUM(sold_price), 0) as total_sold_revenue
      FROM cards
    `).get();

    const soldThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM cards
      WHERE status = 'sold'
      AND strftime('%Y-%m', sold_date) = strftime('%Y-%m', 'now')
    `).get();

    res.json({
      by_type: counts,
      by_status: statusCounts,
      totals: {
        ...totals,
        profit_loss: totals.total_sold_revenue - totals.total_cost,
        sold_this_month: soldThisMonth.count
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cards
router.get('/', (req, res) => {
  try {
    const {
      type, status, search, sport, condition,
      sort = 'created_at', order = 'desc',
      page = 1, limit = 50
    } = req.query;

    const sortCol = ALLOWED_SORT_COLUMNS.has(sort) ? sort : 'created_at';
    const sortDir = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let where = [];
    let params = {};

    if (type) { where.push('type = :type'); params.type = type; }
    if (status) { where.push('status = :status'); params.status = status; }
    if (sport) { where.push('sport = :sport'); params.sport = sport; }
    if (condition) { where.push('condition = :condition'); params.condition = condition; }
    if (search) {
      where.push(`(name LIKE :search OR player_name LIKE :search OR set_name LIKE :search OR card_number LIKE :search OR pokemon_name LIKE :search)`);
      params.search = `%${search}%`;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as count FROM cards ${whereClause}`).get(params);

    const cards = db.prepare(`
      SELECT c.*,
        (SELECT file_path FROM card_images WHERE card_id = c.id AND is_primary = 1 LIMIT 1) as primary_image,
        (SELECT filename FROM card_images WHERE card_id = c.id AND is_primary = 1 LIMIT 1) as primary_image_filename
      FROM cards c
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT :limit OFFSET :offset
    `).all({ ...params, limit: parseInt(limit, 10), offset });

    res.json({
      cards,
      pagination: {
        total: total.count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total.count / parseInt(limit, 10))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cards/:id
router.get('/:id', (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const images = db.prepare('SELECT * FROM card_images WHERE card_id = ? ORDER BY is_primary DESC, created_at ASC').all(req.params.id);
    const priceHistory = db.prepare('SELECT * FROM price_history WHERE card_id = ? ORDER BY recorded_at DESC LIMIT 50').all(req.params.id);
    const ebayListings = db.prepare('SELECT * FROM ebay_listings WHERE card_id = ? ORDER BY created_at DESC').all(req.params.id);

    res.json({ ...card, images, price_history: priceHistory, ebay_listings: ebayListings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cards
router.post('/', (req, res) => {
  try {
    const body = req.body;
    const cols = Object.keys(body).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');
    if (!body.type) return res.status(400).json({ error: 'type is required' });
    if (!body.name) return res.status(400).json({ error: 'name is required' });

    const placeholders = cols.map(c => `@${c}`).join(', ');
    const stmt = db.prepare(`INSERT INTO cards (${cols.join(', ')}) VALUES (${placeholders})`);
    const result = stmt.run(body);
    const newCard = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newCard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cards/:id
router.put('/:id', (req, res) => {
  try {
    const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const body = req.body;
    const cols = Object.keys(body).filter(k => k !== 'id' && k !== 'created_at');
    const setClause = cols.map(c => `${c} = @${c}`).join(', ');
    db.prepare(`UPDATE cards SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({ ...body, id: req.params.id });
    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cards/:id
router.delete('/:id', (req, res) => {
  try {
    const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Delete associated images from filesystem
    const images = db.prepare('SELECT filename FROM card_images WHERE card_id = ?').all(req.params.id);
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
    images.forEach(img => {
      const filePath = path.join(uploadsDir, req.params.id.toString(), img.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
    // Try to remove card directory
    const cardDir = path.join(uploadsDir, req.params.id.toString());
    if (fs.existsSync(cardDir)) {
      try { fs.rmdirSync(cardDir); } catch (e) { /* ignore if not empty */ }
    }

    db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
