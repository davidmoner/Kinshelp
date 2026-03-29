import * as SecureStore from 'expo-secure-store';
import { KH } from '../config';

const TOKEN_KEY = 'kingshelp_token';

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token) {
  if (!token) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const url = `${KH.BASE_URL}/api/v1${path}`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function login(email, password) {
  return apiFetch('/auth/login', { method: 'POST', body: { email, password } });
}

export async function forgotPassword(email) {
  return apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(token, newPassword) {
  return apiFetch('/auth/reset-password', { method: 'POST', body: { token, new_password: newPassword } });
}

export async function me(token) {
  return apiFetch('/auth/me', { token });
}

export async function listMatches(token, { limit = 20, offset = 0, status } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (status) qs.set('status', String(status));
  return apiFetch(`/matches?${qs.toString()}`, { token });
}

export async function listMessages(token, matchId, { limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  return apiFetch(`/matches/${encodeURIComponent(matchId)}/messages?${qs.toString()}`, { token });
}

export async function postMessage(token, matchId, message) {
  return apiFetch(`/matches/${encodeURIComponent(matchId)}/messages`, {
    method: 'POST',
    token,
    body: { message },
  });
}

export async function listNotifications(token, { limit = 40, offset = 0, unread = false } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (unread) qs.set('unread', 'true');
  return apiFetch(`/notifications?${qs.toString()}`, { token });
}

export async function markNotificationRead(token, id) {
  return apiFetch(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', token });
}

export async function automatchGetSettings(token) {
  return apiFetch('/automatch/settings', { token });
}

export async function automatchUpdateSettings(token, body) {
  return apiFetch('/automatch/settings', { method: 'PUT', token, body });
}

export async function automatchListInvites(token, { limit = 20, offset = 0, status } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (status) qs.set('status', String(status));
  return apiFetch(`/automatch/invites?${qs.toString()}`, { token });
}

export async function automatchAccept(token, inviteId) {
  return apiFetch(`/automatch/invites/${encodeURIComponent(inviteId)}/accept`, { method: 'POST', token, body: {} });
}

export async function automatchDecline(token, inviteId) {
  return apiFetch(`/automatch/invites/${encodeURIComponent(inviteId)}/decline`, { method: 'POST', token, body: {} });
}
