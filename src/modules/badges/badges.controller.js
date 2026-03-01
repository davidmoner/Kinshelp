'use strict';
const badgesService = require('./badges.service');

const listAll = (req, res, next) => {
    try { res.json(badgesService.listAll()); } catch (e) { next(e); }
};

const listMine = (req, res, next) => {
    try { res.json(badgesService.listForUser(req.user.id)); } catch (e) { next(e); }
};

const listForUser = (req, res, next) => {
    try { res.json(badgesService.listForUser(req.params.userId)); } catch (e) { next(e); }
};

module.exports = { listAll, listMine, listForUser };
