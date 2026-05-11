const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const upload = require('../middleware/upload');

// POST /api/images/upload/:cardId
router.post('/upload/:cardId', upload.array('images', 10), (req, res) => {
  try {
    const { cardId } = req.params;
    const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
    const sides = req.body.sides ? (Array.isArray(req.body.sides) ? req.body.sides : [req.body.sides]) : [];
    const primaryIdx = req.body.primary_index !== undefined ? parseInt(req.body.primary_index, 10) : 0;

    // Check if card has existing images
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM card_images WHERE card_id = ?').get(cardId).count;

    const insertStmt = db.prepare(`
      INSERT INTO card_images (card_id, filename, original_name, file_path, file_size, mime_type, is_primary, side)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const inserted = [];
    const insertMany = db.transaction((files) => {
      files.forEach((file, idx) => {
        const relativePath = `/uploads/${cardId}/${file.filename}`;
        const side = sides[idx] || 'front';
        const isPrimary = existingCount === 0 && idx === primaryIdx ? 1 : 0;

        if (isPrimary) {
          // Clear any existing primary
          db.prepare('UPDATE card_images SET is_primary = 0 WHERE card_id = ?').run(cardId);
        }

        const result = insertStmt.run(
          cardId,
          file.filename,
          file.originalname,
          relativePath,
          file.size,
          file.mimetype,
          isPrimary,
          side
        );
        inserted.push(db.prepare('SELECT * FROM card_images WHERE id = ?').get(result.lastInsertRowid));
      });
    });

    insertMany(req.files);
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/images/:cardId
router.get('/:cardId', (req, res) => {
  try {
    const images = db.prepare('SELECT * FROM card_images WHERE card_id = ? ORDER BY is_primary DESC, created_at ASC').all(req.params.cardId);
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/images/:imageId
router.delete('/:imageId', (req, res) => {
  try {
    const image = db.prepare('SELECT * FROM card_images WHERE id = ?').get(req.params.imageId);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
    const filePath = path.join(uploadsDir, image.card_id.toString(), image.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM card_images WHERE id = ?').run(req.params.imageId);

    // If deleted image was primary, make next image primary
    if (image.is_primary) {
      const next = db.prepare('SELECT id FROM card_images WHERE card_id = ? ORDER BY created_at ASC LIMIT 1').get(image.card_id);
      if (next) db.prepare('UPDATE card_images SET is_primary = 1 WHERE id = ?').run(next.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/images/:imageId/primary
router.put('/:imageId/primary', (req, res) => {
  try {
    const image = db.prepare('SELECT * FROM card_images WHERE id = ?').get(req.params.imageId);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    db.prepare('UPDATE card_images SET is_primary = 0 WHERE card_id = ?').run(image.card_id);
    db.prepare('UPDATE card_images SET is_primary = 1 WHERE id = ?').run(req.params.imageId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/images/:imageId/side
router.put('/:imageId/side', (req, res) => {
  try {
    const { side } = req.body;
    if (!['front', 'back', 'other'].includes(side)) {
      return res.status(400).json({ error: 'Invalid side value' });
    }
    const image = db.prepare('SELECT id FROM card_images WHERE id = ?').get(req.params.imageId);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    db.prepare('UPDATE card_images SET side = ? WHERE id = ?').run(side, req.params.imageId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
