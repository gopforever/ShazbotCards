const path = require('path');
const fs = require('fs');
const db = require('../db');

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');

function getImagesForCard(cardId) {
  return db.prepare('SELECT * FROM card_images WHERE card_id = ? ORDER BY is_primary DESC, created_at ASC').all(cardId);
}

function deleteImage(imageId) {
  const image = db.prepare('SELECT * FROM card_images WHERE id = ?').get(imageId);
  if (!image) throw new Error('Image not found');

  const filePath = path.join(uploadsDir, image.card_id.toString(), image.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM card_images WHERE id = ?').run(imageId);

  if (image.is_primary) {
    const next = db.prepare('SELECT id FROM card_images WHERE card_id = ? ORDER BY created_at ASC LIMIT 1').get(image.card_id);
    if (next) db.prepare('UPDATE card_images SET is_primary = 1 WHERE id = ?').run(next.id);
  }

  return { success: true };
}

function setPrimaryImage(imageId) {
  const image = db.prepare('SELECT * FROM card_images WHERE id = ?').get(imageId);
  if (!image) throw new Error('Image not found');

  db.prepare('UPDATE card_images SET is_primary = 0 WHERE card_id = ?').run(image.card_id);
  db.prepare('UPDATE card_images SET is_primary = 1 WHERE id = ?').run(imageId);

  return { success: true };
}

function deleteCardImages(cardId) {
  const images = db.prepare('SELECT * FROM card_images WHERE card_id = ?').all(cardId);
  images.forEach(img => {
    const filePath = path.join(uploadsDir, cardId.toString(), img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  const cardDir = path.join(uploadsDir, cardId.toString());
  if (fs.existsSync(cardDir)) {
    try { fs.rmdirSync(cardDir); } catch (e) {
      if (e.code !== 'ENOTEMPTY') console.warn('Could not remove card directory:', e.message);
    }
  }

  db.prepare('DELETE FROM card_images WHERE card_id = ?').run(cardId);
}

module.exports = {
  getImagesForCard,
  deleteImage,
  setPrimaryImage,
  deleteCardImages
};
