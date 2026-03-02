'use strict';
const svc = require('./auth.oauth.service');

const google = (req, res, next) => {
  (async () => {
    const { id_token, access_token } = req.body || {};
    const out = await svc.google({ idToken: id_token, accessToken: access_token });
    res.status(out && out.implemented ? 200 : 501).json(out);
  })().catch(next);
};

const facebook = (req, res, next) => {
  (async () => {
    const { access_token } = req.body || {};
    const out = await svc.facebook({ accessToken: access_token });
    res.status(out && out.implemented ? 200 : 501).json(out);
  })().catch(next);
};

const googleCallback = (req, res, next) => {
  (async () => {
    const { code, state, error } = req.query || {};
    if (error) return res.redirect('/?oauth=google&ok=0&error=' + encodeURIComponent(String(error)));
    if (!code) throw require('../../shared/http-error')(422, 'code is required');
    const out = await svc.googleCallback({ code: String(code), state: state ? String(state) : null });
    // Redirect back to web with token (MVP). Later: set httpOnly cookie.
    res.redirect('/?oauth=google&ok=1&token=' + encodeURIComponent(out.token));
  })().catch(next);
};

const facebookCallback = (req, res, next) => {
  (async () => {
    const { code, state, error } = req.query || {};
    if (error) return res.redirect('/?oauth=facebook&ok=0&error=' + encodeURIComponent(String(error)));
    if (!code) throw require('../../shared/http-error')(422, 'code is required');
    const out = await svc.facebookCallback({ code: String(code), state: state ? String(state) : null });
    res.redirect('/?oauth=facebook&ok=1&token=' + encodeURIComponent(out.token));
  })().catch(next);
};

module.exports = { google, facebook, googleCallback, facebookCallback };
