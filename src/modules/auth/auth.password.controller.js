'use strict';
const svc = require('./auth.password.service');

const forgotPassword = (req, res, next) => {
  (async () => {
    const { email } = req.body || {};
    const out = await svc.forgotPassword({ email });
    res.status(out && out.implemented ? 200 : 501).json(out);
  })().catch(next);
};

const resetPassword = (req, res, next) => {
  (async () => {
    const { token, new_password } = req.body || {};
    const out = await svc.resetPassword({ token, newPassword: new_password });
    res.status(out && out.implemented ? 200 : 501).json(out);
  })().catch(next);
};

const verifyEmail = (req, res, next) => {
  (async () => {
    const { token } = req.body || {};
    const out = await svc.verifyEmail({ token });
    res.status(out && out.implemented ? 200 : 501).json(out);
  })().catch(next);
};

module.exports = { forgotPassword, resetPassword, verifyEmail };
