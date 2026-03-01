'use strict';
const svc = require('./requests.service');
const validators = require('./requests.validators');

const list = (req, res, next) => {
  (async () => {
    const { category, status, seeker_id, limit = 20, offset = 0 } = req.query;
    const data = await svc.list({ category, status, seeker_id, limit: +limit, offset: +offset });
    res.json({ data });
  })().catch(next);
};

const getOne = (req, res, next) => {
  (async () => {
    res.json(await svc.getById(req.params.id));
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
