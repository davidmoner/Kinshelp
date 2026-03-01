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

module.exports = { google, facebook };
