'use strict';
const { Router } = require('express');
const ctrl = require('./offers.controller');
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
      cb(null, `o_${randomUUID()}${ext || '.jpg'}`);
    },
  }),
  limits: { fileSize: 900 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new Error('Formato no permitido. Usa JPG/PNG/WEBP.'));
    cb(null, true);
  },
});

// Public list
router.get('/', optionalAuth, ctrl.list);
router.post('/', authenticate, ctrl.create);
router.get('/:id', optionalAuth, ctrl.getOne);
router.post('/:id/photos', authenticate, upload.single('photo'), ctrl.addPhoto);
router.delete('/:id/photos/:photoId', authenticate, ctrl.deletePhoto);
router.post('/:id/boost48h', authenticate, ctrl.boost48h);
router.put('/:id', authenticate, ctrl.update);
router.delete('/:id', authenticate, ctrl.remove);

module.exports = router;
