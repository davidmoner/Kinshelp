import { KH } from '../config';

async function apiFetch(path, body) {
  const url = `${KH.BASE_URL}/api/v1${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function apiFetchOAuthGoogle({ accessToken, idToken }) {
  return apiFetch('/auth/google', { access_token: accessToken || null, id_token: idToken || null });
}

export function apiFetchOAuthFacebook({ accessToken }) {
  return apiFetch('/auth/facebook', { access_token: accessToken || null });
}
