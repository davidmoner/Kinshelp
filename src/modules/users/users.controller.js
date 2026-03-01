'use strict';
const svc = require('./users.service');

const getOne = (req, res, next) => {
    try { res.json(svc.getById(req.params.id)); } catch (e) { next(e); }
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
