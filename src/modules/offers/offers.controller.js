'use strict';
const svc = require('./offers.service');
const validators = require('./offers.validators');

const list = (req, res, next) => {
  (async () => {
    const { category, status, provider_id, limit = 20, offset = 0 } = req.query;
    const data = await svc.list({ category, status, provider_id, limit: +limit, offset: +offset });
    res.json({ data });
  })().catch(next);
};

const getOne = (req, res, next) => { (async () => res.json(await svc.getById(req.params.id)))().catch(next); };

const create = (req, res, next) => {
  (async () => {
    const data = validators.validateCreate(req.body);
    const out = await svc.create({ ...data, provider_id: req.user.id });
    res.status(201).json(out);
  })().catch(next);
};

const update = (req, res, next) => { (async () => res.json(await svc.update(req.params.id, req.user.id, req.body)))().catch(next); };
const remove = (req, res, next) => { (async () => res.json(await svc.remove(req.params.id, req.user.id)))().catch(next); };

const addPhoto = (req, res, next) => {
  (async () => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(await svc.addPhoto(req.params.id, req.user.id, req.file, baseUrl));
  })().catch(next);
};

const deletePhoto = (req, res, next) => {
  (async () => res.json(await svc.deletePhoto(req.params.id, req.user.id, req.params.photoId)))().catch(next);
};

const boost48h = (req, res, next) => {
  (async () => res.json(await svc.boost48h(req.params.id, req.user.id)))().catch(next);
};

module.exports = { list, getOne, create, update, remove, addPhoto, deletePhoto, boost48h };
