'use strict';
const svc = require('./requests.service');
const validators = require('./requests.validators');

const list = (req, res, next) => {
  try {
    const { category, status, seeker_id, limit = 20, offset = 0 } = req.query;
    res.json({
      data: svc.list({ category, status, seeker_id, limit: +limit, offset: +offset }),
    });
  } catch (e) {
    next(e);
  }
};
const getOne = (req, res, next) => { try { res.json(svc.getById(req.params.id)); } catch (e) { next(e); } };

const create = (req, res, next) => {
    try {
        const data = validators.validateCreate(req.body);
        res.status(201).json(svc.create({ ...data, seeker_id: req.user.id }));
    } catch (e) { next(e); }
};

const update = (req, res, next) => { try { res.json(svc.update(req.params.id, req.user.id, req.body)); } catch (e) { next(e); } };
const remove = (req, res, next) => { try { res.json(svc.remove(req.params.id, req.user.id)); } catch (e) { next(e); } };
const suggestedProviders = (req, res, next) => { try { res.json(svc.suggestedProviders(req.params.id)); } catch (e) { next(e); } };

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
