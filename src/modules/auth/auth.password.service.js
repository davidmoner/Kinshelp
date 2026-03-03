'use strict';
const httpError = require('../../shared/http-error');
const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const tokens = require('./auth.tokens.repo');
const emailSvc = require('../../shared/email.service');

// This is a safe stub: endpoints exist for mobile/web flows,
// but require an email provider and token persistence to be enabled.

function isEnabled() {
  return emailSvc.isConfigured();
}

async function forgotPassword({ email }) {
  if (!email) throw httpError(422, 'Email is required');

  const u = db.isPg
    ? await db.one('SELECT id, email FROM users WHERE email = $1', [email])
    : db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

  // Do not leak whether email exists.
  // Return a neutral response always.
  if (!u) {
    return { implemented: isEnabled(), email_sent: false, message: 'If the email exists, you will receive instructions.' };
  }

  if (!isEnabled()) {
    return { implemented: false, email_sent: false, message: 'Email sending is not configured yet.' };
  }

  const t = await tokens.createToken({ userId: u.id, type: 'reset_password', ttlMinutes: 30 });
  // Serve the actual static reset UI under /web.
  const link = emailSvc.buildLink(`/web/reset-password/index.html?token=${encodeURIComponent(t.token)}`);
  const out = await emailSvc.send({
    to: u.email,
    subject: 'KingsHelp - Reset password',
    text: `Para restablecer tu password, abre este enlace (valido 30 min):\n\n${link}`,
  });

  return { implemented: !!out.implemented, email_sent: !!out.ok };
}

async function resetPassword({ token, newPassword }) {
  if (!token) throw httpError(422, 'Token is required');
  if (!newPassword) throw httpError(422, 'new_password is required');

  const used = await tokens.consumeToken({ type: 'reset_password', token });
  if (!used) throw httpError(422, 'Invalid or expired token');

  const passHash = bcrypt.hashSync(newPassword, 10);
  const now = new Date().toISOString();
  if (db.isPg) {
    await db.exec('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [passHash, now, used.user_id]);
  } else {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passHash, now, used.user_id);
  }
  return { implemented: true, ok: true };
}

async function requestVerifyEmail({ userId, email, isVerified }) {
  if (!userId) throw httpError(422, 'userId is required');
  if (!email) throw httpError(422, 'email is required');

  if (isVerified) return { implemented: isEnabled(), email_sent: false, already_verified: true };

  if (!isEnabled()) return { implemented: false, email_sent: false, message: 'Email sending is not configured yet.' };

  const t = await tokens.createToken({ userId, type: 'verify_email', ttlMinutes: 24 * 60 });
  const link = emailSvc.buildLink(`/api/v1/auth/verify-email?token=${encodeURIComponent(t.token)}`);
  const out = await emailSvc.send({
    to: email,
    subject: 'KingsHelp — Verifica tu email',
    text: `Hola,\n\nPara verificar tu email en KingsHelp, abre este enlace (válido 24 horas):\n\n${link}\n\nSi no has creado una cuenta en KingsHelp, ignora este mensaje.\n\nEl equipo de KingsHelp`,
  });

  return { implemented: !!out.implemented, email_sent: !!out.ok };
}

async function verifyEmail({ token }) {
  if (!token) throw httpError(422, 'Token is required');

  const used = await tokens.consumeToken({ type: 'verify_email', token });
  if (!used) throw httpError(422, 'Invalid or expired token');

  const now = new Date().toISOString();
  try {
    if (db.isPg) await db.exec('UPDATE users SET is_verified = true, updated_at = $1 WHERE id = $2', [now, used.user_id]);
    else db.prepare('UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?').run(now, used.user_id);
  } catch {
    // ignore
  }
  return { implemented: true, ok: true };
}

module.exports = { forgotPassword, resetPassword, requestVerifyEmail, verifyEmail };
