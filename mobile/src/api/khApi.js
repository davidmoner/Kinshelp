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

export async function register(body) {
  return apiFetch('/auth/register', { method: 'POST', body });
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

export async function updateMe(token, body) {
  return apiFetch('/auth/me', { method: 'PATCH', token, body });
}

export async function requestVerifyEmail(token) {
  return apiFetch('/auth/request-verify-email', { method: 'POST', token, body: {} });
}

export async function getMyPoints(token) {
  return apiFetch('/points/me', { token });
}

export async function listMatches(token, { limit = 20, offset = 0, status } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (status) qs.set('status', String(status));
  return apiFetch(`/matches?${qs.toString()}`, { token });
}

export async function getMatch(token, matchId) {
  return apiFetch(`/matches/${encodeURIComponent(matchId)}`, { token });
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

export async function setMatchAgreement(token, matchId, body) {
  return apiFetch(`/matches/${encodeURIComponent(matchId)}/agreement`, { method: 'PATCH', token, body });
}

export async function changeMatchStatus(token, matchId, action) {
  return apiFetch(`/matches/${encodeURIComponent(matchId)}/status`, { method: 'PATCH', token, body: { action } });
}

export async function submitMatchRating(token, matchId, body) {
  return apiFetch(`/matches/${encodeURIComponent(matchId)}/ratings`, { method: 'POST', token, body });
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

export async function feed(token, { limit = 40, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  return apiFetch(`/feed?${qs.toString()}`, { token });
}

export async function listRequests(token, { limit = 20, offset = 0, status, seeker_id, category } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (status) qs.set('status', String(status));
  if (seeker_id) qs.set('seeker_id', String(seeker_id));
  if (category) qs.set('category', String(category));
  return apiFetch(`/requests?${qs.toString()}`, { token });
}

export async function getRequest(token, id) {
  return apiFetch(`/requests/${encodeURIComponent(id)}`, { token });
}

export async function createRequest(token, body) {
  return apiFetch('/requests', { method: 'POST', token, body });
}

export async function closeRequest(token, id) {
  return apiFetch(`/requests/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}

export async function boostRequest(token, id) {
  return apiFetch(`/requests/${encodeURIComponent(id)}/boost48h`, { method: 'POST', token, body: {} });
}

export async function listOffers(token, { limit = 20, offset = 0, status, provider_id, category } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (status) qs.set('status', String(status));
  if (provider_id) qs.set('provider_id', String(provider_id));
  if (category) qs.set('category', String(category));
  return apiFetch(`/offers?${qs.toString()}`, { token });
}

export async function getOffer(token, id) {
  return apiFetch(`/offers/${encodeURIComponent(id)}`, { token });
}

export async function createOffer(token, body) {
  return apiFetch('/offers', { method: 'POST', token, body });
}

export async function closeOffer(token, id) {
  return apiFetch(`/offers/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}

export async function boostOffer(token, id) {
  return apiFetch(`/offers/${encodeURIComponent(id)}/boost48h`, { method: 'POST', token, body: {} });
}

export async function createMatchFromRequest(token, requestId, offerId) {
  const body = offerId ? { offer_id: offerId } : {};
  return apiFetch(`/requests/${encodeURIComponent(requestId)}/matches`, { method: 'POST', token, body });
}

export async function createMatchFromOffer(token, offerId) {
  return apiFetch(`/offers/${encodeURIComponent(offerId)}/matches`, { method: 'POST', token, body: {} });
}

export async function listFavorites(token, { limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  return apiFetch(`/favorites?${qs.toString()}`, { token });
}

export async function addFavorite(token, target_type, target_id) {
  return apiFetch('/favorites', { method: 'POST', token, body: { target_type, target_id } });
}

export async function removeFavorite(token, target_type, target_id) {
  const qs = new URLSearchParams();
  qs.set('target_type', String(target_type));
  qs.set('target_id', String(target_id));
  return apiFetch(`/favorites?${qs.toString()}`, { method: 'DELETE', token });
}

export async function listBadgesMine(token) {
  return apiFetch('/badges/mine', { token });
}

export async function listBadgesForUser(token, userId) {
  return apiFetch(`/badges/user/${encodeURIComponent(userId)}`, { token });
}

export async function leaderboard(token, params = {}) {
  const qs = new URLSearchParams();
  Object.keys(params || {}).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) qs.set(k, String(params[k]));
  });
  return apiFetch(`/points/leaderboard?${qs.toString()}`, { token });
}

export async function leaderboardMe(token, params = {}) {
  const qs = new URLSearchParams();
  Object.keys(params || {}).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) qs.set(k, String(params[k]));
  });
  return apiFetch(`/points/leaderboard/me?${qs.toString()}`, { token });
}

export async function premiumPlans(token) {
  return apiFetch('/premium/plans', { token });
}

export async function premiumEligibility(token) {
  return apiFetch('/premium/eligibility', { token });
}

export async function premiumUnlock(token) {
  return apiFetch('/premium/unlock', { method: 'POST', token, body: {} });
}

export async function createReport(token, body) {
  return apiFetch('/reports', { method: 'POST', token, body });
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
