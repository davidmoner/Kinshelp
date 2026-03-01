'use strict';
const httpError = require('../../shared/http-error');

// This is a safe stub: endpoints exist for mobile/web flows,
// but require an email provider and token persistence to be enabled.

function isEnabled() {
  // Later: require EMAIL_PROVIDER_API_KEY / SMTP config
  return false;
}

async function forgotPassword({ email }) {
  if (!email) throw httpError(422, 'Email is required');
  if (!isEnabled()) {
    return { implemented: false, message: 'Email provider not configured yet.', email_sent: false };
  }
  return { implemented: true, email_sent: true };
}

async function resetPassword({ token, newPassword }) {
  if (!token) throw httpError(422, 'Token is required');
  if (!newPassword) throw httpError(422, 'new_password is required');
  if (!isEnabled()) {
    return { implemented: false, message: 'Password reset not configured yet.', ok: false };
  }
  return { implemented: true, ok: true };
}

async function verifyEmail({ token }) {
  if (!token) throw httpError(422, 'Token is required');
  if (!isEnabled()) {
    return { implemented: false, message: 'Email verification not configured yet.', ok: false };
  }
  return { implemented: true, ok: true };
}

module.exports = { forgotPassword, resetPassword, verifyEmail };
