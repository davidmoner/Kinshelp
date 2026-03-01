'use strict';
const { Router } = require('express');
const ctrl = require('./users.controller');
const { authenticate, optionalAuth } = require('../../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.resolve(__dirname, '../../../uploads')),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '').toLowerCase();
      cb(null, `u_${randomUUID()}${ext || '.jpg'}`);
    },
  }),
  limits: { fileSize: 900 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new Error('Formato no permitido. Usa JPG/PNG/WEBP.'));
    cb(null, true);
  },
});

// Authenticated "me" helpers
router.post('/me/photos', authenticate, upload.single('photo'), ctrl.addMyPhoto);
router.delete('/me/photos/:photoId', authenticate, ctrl.deleteMyPhoto);

// Public profile (limited); if token exists, can include extra fields.
router.get('/:id', optionalAuth, ctrl.getOne);
router.put('/:id', authenticate, ctrl.updateProfile);

module.exports = router;
