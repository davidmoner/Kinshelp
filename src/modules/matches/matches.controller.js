'use strict';
const svc = require('./matches.service');
const validators = require('./matches.validators');

const list = (req, res, next) => {
    try {
        const { status, limit = 20, offset = 0 } = req.query;
        res.json({ data: svc.list(req.user.id, { status, limit: +limit, offset: +offset }) });
    } catch (e) { next(e); }
};

const getOne = (req, res, next) => {
    try {
        const match = svc.getById(req.params.id);
        if (match.provider_id !== req.user.id && match.seeker_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden' });
        res.json(match);
    } catch (e) { next(e); }
};

const create = (req, res, next) => {
    try {
        const data = validators.validateCreate(req.body);
        if (req.user.id !== data.provider_id && req.user.id !== data.seeker_id)
            return res.status(403).json({ error: 'You must be a participant' });
        res.status(201).json(svc.create(data));
    } catch (e) { next(e); }
};

const changeStatus = (req, res, next) => {
    (async () => {
        const action = validators.validateAction(req.body.action);
        res.json(await svc.changeStatus(req.params.id, req.user.id, action));
    })().catch(next);
};

const submitRating = (req, res, next) => {
    try {
        const { rating, review } = validators.validateRating(req.body);
        res.json(svc.submitRating(req.params.id, req.user.id, { rating, review }));
    } catch (e) { next(e); }
};

const listMessages = (req, res, next) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        res.json({ data: svc.listMessages(req.params.id, req.user.id, { limit: +limit, offset: +offset }) });
    } catch (e) { next(e); }
};

const postMessage = (req, res, next) => {
    try {
        const { message } = validators.validateMessage(req.body);
        res.status(201).json(svc.postMessage(req.params.id, req.user.id, message));
    } catch (e) { next(e); }
};

const setAgreement = (req, res, next) => {
    try {
        const agreement = validators.validateAgreement(req.body);
        res.json(svc.setAgreement(req.params.id, req.user.id, agreement));
    } catch (e) { next(e); }
};

module.exports = { list, getOne, create, changeStatus, submitRating, listMessages, postMessage, setAgreement };
