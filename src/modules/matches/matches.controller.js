'use strict';
const svc = require('./matches.service');
const validators = require('./matches.validators');

const list = async (req, res, next) => {
    try {
        const { status, limit = 20, offset = 0 } = req.query;
        const data = await svc.list(req.user.id, { status, limit: +limit, offset: +offset });
        res.json({ data });
    } catch (e) { next(e); }
};

const getOne = async (req, res, next) => {
    try {
        const match = await svc.getById(req.params.id);
        if (match.provider_id !== req.user.id && match.seeker_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden' });
        res.json(match);
    } catch (e) { next(e); }
};

const create = async (req, res, next) => {
    try {
        const data = validators.validateCreate(req.body);
        if (req.user.id !== data.provider_id && req.user.id !== data.seeker_id)
            return res.status(403).json({ error: 'You must be a participant' });
        const created = await svc.create(data);
        res.status(201).json(created);
    } catch (e) { next(e); }
};

const changeStatus = (req, res, next) => {
    (async () => {
        const action = validators.validateAction(req.body.action);
        res.json(await svc.changeStatus(req.params.id, req.user.id, action));
    })().catch(next);
};

const submitRating = async (req, res, next) => {
    try {
        const { rating, review } = validators.validateRating(req.body);
        const out = await svc.submitRating(req.params.id, req.user.id, { rating, review });
        res.json(out);
    } catch (e) { next(e); }
};

const listMessages = async (req, res, next) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const data = await svc.listMessages(req.params.id, req.user.id, { limit: +limit, offset: +offset });
        res.json({ data });
    } catch (e) { next(e); }
};

const postMessage = async (req, res, next) => {
    try {
        const { message } = validators.validateMessage(req.body);
        const out = await svc.postMessage(req.params.id, req.user.id, message);
        res.status(201).json(out);
    } catch (e) { next(e); }
};

const setAgreement = async (req, res, next) => {
    try {
        const agreement = validators.validateAgreement(req.body);
        const out = await svc.setAgreement(req.params.id, req.user.id, agreement);
        res.json(out);
    } catch (e) { next(e); }
};

module.exports = { list, getOne, create, changeStatus, submitRating, listMessages, postMessage, setAgreement };
