'use strict';
const { EMAIL_PROVIDER, SENDGRID_API_KEY, MAIL_FROM, PUBLIC_BASE_URL } = require('../config/env');

function isConfigured() {
  const provider = String(EMAIL_PROVIDER || '').trim().toLowerCase();
  if (!provider) return false;
  if (!MAIL_FROM) return false;
  if (provider === 'sendgrid') return !!SENDGRID_API_KEY;
  return false;
}

async function send({ to, subject, text }) {
  if (!to) throw new Error('Missing to');
  if (!subject) throw new Error('Missing subject');
  if (!text) throw new Error('Missing text');

  if (!isConfigured()) {
    return { ok: false, implemented: false, message: 'Email provider not configured', preview: { to, subject, text } };
  }

  const provider = String(EMAIL_PROVIDER || '').trim().toLowerCase();
  if (provider === 'sendgrid') {
    // Lazy require to avoid forcing install if unused.
    // eslint-disable-next-line global-require
    const sg = require('@sendgrid/mail');
    sg.setApiKey(SENDGRID_API_KEY);
    // Normalize sender: allow passing either "Name <email@domain>" or plain "email@domain".
    const from = String(MAIL_FROM || '').trim();
    const fromEmail = from.includes('<') && from.includes('>') ? from : `<${from}>`;
    await sg.send({ to, from: fromEmail, subject, text });
    return { ok: true, implemented: true };
  }

  return { ok: false, implemented: false, message: `Unknown EMAIL_PROVIDER: ${EMAIL_PROVIDER}` };
}

function buildLink(path) {
  const base = String(PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const p = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

module.exports = { isConfigured, send, buildLink };
