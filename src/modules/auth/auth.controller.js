'use strict';
const authService = require('./auth.service');
const validators = require('./auth.validators');

const register = (req, res, next) => {
    (async () => {
        const out = await authService.register(validators.validateRegister(req.body));
        res.status(201).json(out);
    })().catch(next);
};

const login = (req, res, next) => {
    (async () => {
        const out = await authService.login(validators.validateLogin(req.body));
        res.json(out);
    })().catch(next);
};

const me = (req, res, next) => {
    (async () => {
        const out = await authService.me(req.user.id);
        res.json(out);
    })().catch(next);
};

const updateMe = (req, res, next) => {
    (async () => {
        const out = await authService.updateMe(req.user.id, validators.validateUpdateMe(req.body));
        res.json(out);
    })().catch(next);
};

module.exports = { register, login, me, updateMe };
