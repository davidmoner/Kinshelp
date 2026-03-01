'use strict';
const httpError = require('../../shared/http-error');

function isGoogleEnabled() {
  return !!process.env.GOOGLE_CLIENT_ID;
}

function isFacebookEnabled() {
  return !!process.env.FACEBOOK_APP_ID;
}

async function google({ idToken, accessToken }) {
  if (!idToken && !accessToken) throw httpError(422, 'id_token or access_token is required');
  if (!isGoogleEnabled()) {
    return { implemented: false, provider: 'google', message: 'Google OAuth not configured yet.' };
  }
  // TODO(real): verify token, upsert user, return KingsHelp JWT
  throw httpError(501, 'Google OAuth configured flag set but not implemented');
}

async function facebook({ accessToken }) {
  if (!accessToken) throw httpError(422, 'access_token is required');
  if (!isFacebookEnabled()) {
    return { implemented: false, provider: 'facebook', message: 'Facebook OAuth not configured yet.' };
  }
  // TODO(real): verify token via Graph API, upsert user, return KingsHelp JWT
  throw httpError(501, 'Facebook OAuth configured flag set but not implemented');
}

module.exports = { google, facebook };
