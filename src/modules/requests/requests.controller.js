'use strict';
const svc = require('./requests.service');
const validators = require('./requests.validators');
const { ADMIN_EMAILS } = require('../../config/env');

function isAdminUser(user) {
  if (!user || !user.email || !ADMIN_EMAILS) return false;
  const admins = String(ADMIN_EMAILS).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(String(user.email).toLowerCase());
}

const list = (req, res, next) => {
  (async () => {
    const { category, status, seeker_id, limit = 20, offset = 0 } = req.query;
    let include_hidden = false;
    if (seeker_id && req.user && String(req.user.id) === String(seeker_id)) include_hidden = true;
    if (!include_hidden && req.query.include_hidden === '1' && isAdminUser(req.user)) include_hidden = true;
    const data = await svc.list({ category, status, seeker_id, include_hidden, limit: +limit, offset: +offset });
    res.json({ data });
  })().catch(next);
};

const getOne = (req, res, next) => {
  (async () => {
    const row = await svc.getById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Request not found' });
    if (row.is_hidden && !(isAdminUser(req.user) || (req.user && String(req.user.id) === String(row.seeker_id)))) {
      return res.status(404).json({ error: 'Request not found' });
    }
    return res.json(row);
  })().catch(next);
};

const create = (req, res, next) => {
  (async () => {
    const data = validators.validateCreate(req.body);
    const out = await svc.create({ ...data, seeker_id: req.user.id });
    res.status(201).json(out);
  })().catch(next);
};

const update = (req, res, next) => { (async () => res.json(await svc.update(req.params.id, req.user.id, req.body)))().catch(next); };
const remove = (req, res, next) => { (async () => res.json(await svc.remove(req.params.id, req.user.id)))().catch(next); };
const suggestedProviders = (req, res, next) => { (async () => res.json(await svc.suggestedProviders(req.params.id)))().catch(next); };

const addPhoto = (req, res, next) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(svc.addPhoto(req.params.id, req.user.id, req.file, baseUrl));
  } catch (e) { next(e); }
};

const deletePhoto = (req, res, next) => {
  try { res.json(svc.deletePhoto(req.params.id, req.user.id, req.params.photoId)); } catch (e) { next(e); }
};

const boost48h = (req, res, next) => {
  try { res.json(svc.boost48h(req.params.id, req.user.id)); } catch (e) { next(e); }
};

module.exports = { list, getOne, create, update, remove, suggestedProviders, addPhoto, deletePhoto, boost48h };
