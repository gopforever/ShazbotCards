const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
const maxSizeMB = parseInt(process.env.MAX_IMAGE_SIZE_MB || '10', 10);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cardId = req.params.cardId || 'temp';
    const dir = path.join(uploadsDir, cardId.toString());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed (jpg, png, gif, webp)'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024, files: 10 }
});

module.exports = upload;
