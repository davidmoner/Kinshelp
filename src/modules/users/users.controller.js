'use strict';
const svc = require('./users.service');

const getOne = (req, res, next) => {
    (async () => {
        const viewerId = req.user ? req.user.id : null;
        res.json(await svc.getById(req.params.id, viewerId));
    })().catch(next);
};

const updateProfile = (req, res, next) => {
    try { res.json(svc.updateProfile(req.params.id, req.user.id, req.body)); } catch (e) { next(e); }
};

const addMyPhoto = (req, res, next) => {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        res.status(201).json(svc.addMyPhoto(req.user.id, req.file, baseUrl));
    } catch (e) { next(e); }
};

const deleteMyPhoto = (req, res, next) => {
    try {
        res.json(svc.deleteMyPhoto(req.user.id, req.params.photoId));
    } catch (e) { next(e); }
};

module.exports = { getOne, updateProfile, addMyPhoto, deleteMyPhoto };
