'use strict';
const badgesService = require('./badges.service');

const listAll = async (req, res, next) => {
    try { res.json(await badgesService.listAll()); } catch (e) { next(e); }
};

const listMine = async (req, res, next) => {
    try { res.json(await badgesService.listForUser(req.user.id)); } catch (e) { next(e); }
};

const listForUser = async (req, res, next) => {
    try { res.json(await badgesService.listForUser(req.params.userId)); } catch (e) { next(e); }
};

module.exports = { listAll, listMine, listForUser };
