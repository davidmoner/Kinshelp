'use strict';
const authService = require('./auth.service');
const validators = require('./auth.validators');

const register = (req, res, next) => {
    try { res.status(201).json(authService.register(validators.validateRegister(req.body))); } catch (e) { next(e); }
};

const login = (req, res, next) => {
    try { res.json(authService.login(validators.validateLogin(req.body))); } catch (e) { next(e); }
};

const me = (req, res, next) => {
    try { res.json(authService.me(req.user.id)); } catch (e) { next(e); }
};

const updateMe = (req, res, next) => {
    try { res.json(authService.updateMe(req.user.id, validators.validateUpdateMe(req.body))); } catch (e) { next(e); }
};

module.exports = { register, login, me, updateMe };
