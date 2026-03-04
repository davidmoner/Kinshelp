'use strict';
const httpError = require('../../shared/http-error');

function validateRegister(body) {
    const { display_name, email, password } = body;
    const name = String(display_name || '').trim();
    if (!name) throw httpError(400, 'display_name is required');
    if (name.length < 2) throw httpError(400, 'display_name must be at least 2 characters');
    if (name.length > 60) throw httpError(400, 'display_name too long');

    const mail = String(email || '').trim().toLowerCase();
    if (!mail) throw httpError(400, 'email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw httpError(400, 'email is invalid');

    const pass = String(password || '');
    if (!pass) throw httpError(400, 'password is required');
    if (pass.length < 8) throw httpError(400, 'password must be at least 8 characters');
    if (pass.length > 72) throw httpError(400, 'password is too long');
    if (!/[a-zA-Z]/.test(pass) || !/\d/.test(pass))
        throw httpError(400, 'password must include letters and numbers');

    const bio = body.bio !== undefined ? String(body.bio || '').trim() : undefined;
    const loc = body.location_text !== undefined ? String(body.location_text || '').trim() : undefined;
    if (bio && bio.length > 500) throw httpError(400, 'bio too long');
    if (loc && loc.length > 120) throw httpError(400, 'location_text too long');
    return { display_name: name, email: mail, password: pass, bio, location_text: loc };
}

function validateLogin(body) {
    const email = String((body && body.email) || '').trim().toLowerCase();
    const password = String((body && body.password) || '');
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
        if (v.length > 500) throw httpError(400, 'bio too long');
        out.bio = v ? v : null;
    }
    if (body.location_text !== undefined) {
        const v = String(body.location_text || '').trim();
        if (v.length > 120) throw httpError(400, 'location_text too long');
        out.location_text = v ? v : null;
    }
    if (!Object.keys(out).length) throw httpError(400, 'No fields to update');
    return out;
}

module.exports = { validateRegister, validateLogin, validateUpdateMe };
