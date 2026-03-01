'use strict';
const svc = require('./auth.password.service');

const forgotPassword = (req, res, next) => {
  (async () => {
    const { email } = req.body || {};
    const out = await svc.forgotPassword({ email });
    res.status(out && out.email_sent ? 200 : 200).json(out);
  })().catch(next);
};

const resetPassword = (req, res, next) => {
  (async () => {
    const { token, new_password } = req.body || {};
    const out = await svc.resetPassword({ token, newPassword: new_password });
    res.status(200).json(out);
  })().catch(next);
};

const verifyEmail = (req, res, next) => {
  (async () => {
    const { token } = req.body || {};
    const out = await svc.verifyEmail({ token });
    res.status(200).json(out);
  })().catch(next);
};

const requestVerifyEmail = (req, res, next) => {
  (async () => {
    const u = req.user;
    const out = await svc.requestVerifyEmail({ userId: u && u.id, email: u && u.email, isVerified: !!(u && u.is_verified) });
    res.status(200).json(out);
  })().catch(next);
};

const verifyEmailGet = (req, res, next) => {
  (async () => {
    const token = (req.query && req.query.token) || null;
    try {
      await svc.verifyEmail({ token });
      return res.redirect(302, '/verify-email/success.html');
    } catch (e) {
      const msg = String((e && e.message) || '').toLowerCase();
      if (msg.includes('invalid') || msg.includes('expired') || msg.includes('token')) {
        return res.redirect(302, '/verify-email/invalid.html');
      }
      return res.redirect(302, '/verify-email/error.html');
    }
  })().catch(next);
};

module.exports = { forgotPassword, resetPassword, requestVerifyEmail, verifyEmail, verifyEmailGet };
