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
  const logo = emailSvc.buildLink('/img/LOGO_2.png');
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KingsHelp — Verificación de email</title>
  </head>
  <body style="margin:0; padding:0; background:#0b0f19; color:#edf0f8; font-family:Manrope, Arial, sans-serif;">
    <div style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px; width:100%; background:rgba(16,22,34,0.92); border:1px solid rgba(255,255,255,0.12); border-radius:20px; overflow:hidden;">
              <tr>
                <td style="padding:22px 24px 8px; text-align:center;">
                  <img src="${logo}" alt="KingsHelp" width="180" style="display:block; margin:0 auto 8px;" />
                  <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:rgba(201,168,76,0.9);">Bienvenido/a</div>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 24px 18px; text-align:center;">
                  <h1 style="margin:0 0 10px; font-size:24px; letter-spacing:-0.3px;">Verifica tu email</h1>
                  <p style="margin:0; color:rgba(237,240,248,0.78); font-size:15px; line-height:1.6;">
                    Para activar tu cuenta y proteger a tu vecindario, confirma tu email con el botón de abajo.
                    El enlace es válido 24 horas.
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:0 24px 18px;">
                  <a href="${link}" style="display:inline-block; padding:12px 22px; border-radius:999px; background:linear-gradient(135deg,#2a5bce,#7c3aed); color:#fff; text-decoration:none; font-weight:700;">
                    Verificar mi email
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 18px; color:rgba(237,240,248,0.62); font-size:12px; line-height:1.5;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
                  <a href="${link}" style="color:#c9a84c; text-decoration:underline; word-break:break-all;">${link}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 20px;">
                  <div style="border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); padding:12px 14px; font-size:12.5px; color:rgba(237,240,248,0.7);">
                    ¿No fuiste tú? Ignora este mensaje y tu cuenta no se activará.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 22px; font-size:12px; color:rgba(237,240,248,0.5); text-align:center;">
                  KingsHelp · Ayuda real, cerca de ti.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
  const out = await emailSvc.send({
    to: email,
    subject: 'KingsHelp — Verifica tu email',
    text: `Hola,\n\nBienvenido/a a KingsHelp. Para verificar tu email, abre este enlace (válido 24 horas):\n\n${link}\n\nSi no has creado una cuenta en KingsHelp, ignora este mensaje.\n\nEl equipo de KingsHelp`,
    html,
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
