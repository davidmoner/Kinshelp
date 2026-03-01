'use strict';
const httpError = require('../../shared/http-error');

function validateRegister(body) {
    const { display_name, email, password } = body;
    if (!display_name) throw httpError(400, 'display_name is required');
    if (!email) throw httpError(400, 'email is required');
    if (!password) throw httpError(400, 'password is required');
    if (password.length < 8) throw httpError(400, 'password must be at least 8 characters');
    return { display_name, email, password, bio: body.bio, location_text: body.location_text };
}

function validateLogin(body) {
    const { email, password } = body;
    if (!email || !password) throw httpError(400, 'email and password are required');
    return { email, password };
}

function validateUpdateMe(body) {
    const out = {};
    if (body.display_name !== undefined) {
        const v = String(body.display_name || '').trim();
        if (!v) throw httpError(400, 'display_name cannot be empty');
        if (v.length > 80) throw httpError(400, 'display_name too long');
        out.display_name = v;
    }
    if (body.bio !== undefined) {
        const v = String(body.bio || '').trim();
        out.bio = v ? v : null;
    }
    if (body.location_text !== undefined) {
        const v = String(body.location_text || '').trim();
        out.location_text = v ? v : null;
    }
    if (!Object.keys(out).length) throw httpError(400, 'No fields to update');
    return out;
}

module.exports = { validateRegister, validateLogin, validateUpdateMe };
