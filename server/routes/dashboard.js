const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  try {
    const totals = db.prepare(`
      SELECT
        COUNT(*) as total_cards,
        COALESCE(SUM(CASE WHEN status != 'sold' THEN market_price * quantity ELSE 0 END), 0) as inventory_value,
        COALESCE(SUM(CASE WHEN status != 'sold' THEN purchase_price * quantity ELSE 0 END), 0) as cost_basis,
        COALESCE(SUM(CASE WHEN status = 'sold' THEN sold_price ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'listed' THEN 1 ELSE 0 END), 0) as listed_count,
        COALESCE(SUM(CASE WHEN status = 'sold' THEN purchase_price ELSE 0 END), 0) as sold_cost
      FROM cards
    `).get();

    const soldThisMonth = db.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(AVG(sold_price), 0) as avg_price
      FROM cards
      WHERE status = 'sold'
      AND sold_date >= strftime('%Y-%m-01', 'now')
    `).get();

    res.json({
      total_cards: totals.total_cards,
      inventory_value: totals.inventory_value,
      cost_basis: totals.cost_basis,
      profit_loss: totals.total_revenue - totals.sold_cost,
      listed_count: totals.listed_count,
      sold_this_month: soldThisMonth.count,
      avg_sell_price: soldThisMonth.avg_price
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/recent
router.get('/recent', (req, res) => {
  try {
    const cards = db.prepare(`
      SELECT c.*,
        (SELECT file_path FROM card_images WHERE card_id = c.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM cards c
      ORDER BY c.updated_at DESC
      LIMIT 10
    `).all();
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/chart-data
router.get('/chart-data', (req, res) => {
  try {
    const acquisitions = db.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count
      FROM cards
      WHERE created_at >= date('now', '-12 months')
      GROUP BY month
      ORDER BY month ASC
    `).all();

    const sales = db.prepare(`
      SELECT
        strftime('%Y-%m', sold_date) as month,
        COUNT(*) as count,
        COALESCE(SUM(sold_price), 0) as revenue
      FROM cards
      WHERE status = 'sold'
      AND sold_date >= date('now', '-12 months')
      GROUP BY month
      ORDER BY month ASC
    `).all();

    // Build last 12 months
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const acqMap = Object.fromEntries(acquisitions.map(r => [r.month, r.count]));
    const saleMap = Object.fromEntries(sales.map(r => [r.month, { count: r.count, revenue: r.revenue }]));

    const chartData = months.map(m => ({
      month: m,
      acquired: acqMap[m] || 0,
      sold: (saleMap[m] || {}).count || 0,
      revenue: (saleMap[m] || {}).revenue || 0
    }));

    res.json(chartData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/top-value
router.get('/top-value', (req, res) => {
  try {
    const cards = db.prepare(`
      SELECT c.*,
        (SELECT file_path FROM card_images WHERE card_id = c.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM cards c
      WHERE c.market_price IS NOT NULL AND c.status != 'sold'
      ORDER BY c.market_price DESC
      LIMIT 10
    `).all();
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/recently-sold
router.get('/recently-sold', (req, res) => {
  try {
    const cards = db.prepare(`
      SELECT c.*,
        (SELECT file_path FROM card_images WHERE card_id = c.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM cards c
      WHERE c.status = 'sold'
      ORDER BY c.sold_date DESC
      LIMIT 10
    `).all();
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
