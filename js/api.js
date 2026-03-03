/**
 * KingsHelp API client
 * Exposes window.KHApi — works with plain <script> tags (no build step).
 *
 * Config: set window.KINGSHELP_BASE_URL before loading this script,
 * or it defaults to http://localhost:3000/api/v1.
 */
(function () {
    'use strict';

    const BASE_URL = (window.KINGSHELP_BASE_URL || 'http://localhost:3000/api/v1');
    const HEALTH_URL = BASE_URL.replace('/api/v1', '') + '/health';
    const TOKEN_KEY = 'kh_token';

    /* ── Token helpers ──────────────────────────────────────────────────────── */
    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    /* ── In-flight GET deduplication ────────────────────────────────────────── */
    // Prevents identical simultaneous GET requests (e.g. loadMatches called twice on login).
    const _inflight = new Map();

    /* ── Core fetch wrapper ─────────────────────────────────────────────────── */
    async function apiFetch(path, { method = 'GET', body } = {}) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;

        // Dedup: reuse in-flight Promise for identical GET requests
        const dedupeKey = method === 'GET' ? path + '\0' + (token || '') : null;
        if (dedupeKey && _inflight.has(dedupeKey)) {
            return _inflight.get(dedupeKey);
        }

        const promise = fetch(BASE_URL + path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        }).then(async res => {
            let data;
            try { data = await res.json(); } catch { data = {}; }
            if (!res.ok) {
                const err = new Error(data.error || ('HTTP ' + res.status));
                err.status = res.status;
                err.data = data;
                throw err;
            }
            return data;
        }).finally(() => {
            if (dedupeKey) _inflight.delete(dedupeKey);
        });

        if (dedupeKey) _inflight.set(dedupeKey, promise);
        return promise;
    }

    /* ── Named endpoints ────────────────────────────────────────────────────── */

    /** GET /health — no auth required */
    async function healthCheck() {
        const res = await fetch(HEALTH_URL);
        if (!res.ok) throw new Error('API unreachable · HTTP ' + res.status);
        return res.json();
    }

    /** POST /auth/login — stores token on success */
    async function login(email, password) {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: { email, password },
        });
        if (data.token) setToken(data.token);
        return data;
    }

    /* ── Upload helper (multipart/form-data) ───────────────────────────────── */
    async function apiUpload(path, formData) {
        const headers = {};
        const token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const res = await fetch(BASE_URL + path, {
            method: 'POST',
            headers,
            body: formData,
        });

        let data;
        try { data = await res.json(); }
        catch { data = {}; }

        if (!res.ok) {
            const err = new Error(data.error || ('HTTP ' + res.status));
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    /** POST /auth/register — stores token on success */
    async function register(body) {
        const data = await apiFetch('/auth/register', { method: 'POST', body });
        if (data.token) setToken(data.token);
        return data;
    }

    /** POST /auth/request-verify-email — requires token */
    async function requestVerifyEmail() {
        return apiFetch('/auth/request-verify-email', { method: 'POST', body: {} });
    }

    /** GET /points/me — requires token */
    async function getMyPoints() {
        return apiFetch('/points/me');
    }

    /** GET /auth/me — requires token */
    async function getMe() {
        return apiFetch('/auth/me');
    }

    /** PATCH /auth/me — update profile */
    async function updateMe(body) {
        return apiFetch('/auth/me', { method: 'PATCH', body });
    }

    /** GET /users/:id — public (token optional) */
    async function getUser(userId) {
        return apiFetch('/users/' + encodeURIComponent(userId));
    }

    /** Requests */
    async function listRequests(params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/requests' + qs);
    }

    async function createRequest(body) {
        return apiFetch('/requests', { method: 'POST', body });
    }

    async function closeRequest(requestId) {
        return apiFetch('/requests/' + encodeURIComponent(requestId), { method: 'DELETE' });
    }

    async function getSuggestedProviders(requestId) {
        return apiFetch('/requests/' + encodeURIComponent(requestId) + '/suggested-providers');
    }

    /** Offers */
    async function listOffers(params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/offers' + qs);
    }

    async function createOffer(body) {
        return apiFetch('/offers', { method: 'POST', body });
    }

    async function closeOffer(offerId) {
        return apiFetch('/offers/' + encodeURIComponent(offerId), { method: 'DELETE' });
    }

    /** Matches */
    async function getMatch(matchId) {
        return apiFetch('/matches/' + encodeURIComponent(matchId));
    }

    async function listMatchMessages(matchId, params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/matches/' + encodeURIComponent(matchId) + '/messages' + qs);
    }

    async function postMatchMessage(matchId, message) {
        return apiFetch('/matches/' + encodeURIComponent(matchId) + '/messages', {
            method: 'POST',
            body: { message },
        });
    }

    async function setMatchAgreement(matchId, body) {
        return apiFetch('/matches/' + encodeURIComponent(matchId) + '/agreement', {
            method: 'PATCH',
            body,
        });
    }

    /** Premium (Stripe stub) */
    async function listPremiumPlans() {
        return apiFetch('/premium/plans');
    }

    async function createPremiumCheckout(body) {
        return apiFetch('/premium/checkout', { method: 'POST', body });
    }

    async function premiumEligibility() {
        return apiFetch('/premium/eligibility');
    }

    async function premiumUnlock() {
        return apiFetch('/premium/unlock', { method: 'POST', body: {} });
    }

    async function leaderboard(params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/points/leaderboard' + qs);
    }

    async function leaderboardMe(params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/points/leaderboard/me' + qs);
    }

    async function listMyBadges() {
        return apiFetch('/badges/mine');
    }

    async function listBadgesForUser(userId) {
        return apiFetch('/badges/user/' + encodeURIComponent(userId));
    }

    /** Feed */
    async function feed(params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/feed' + qs);
    }

    /** AutoMatch (Premium) */
    async function automatchGetSettings() {
        return apiFetch('/automatch/settings');
    }

    async function automatchUpdateSettings(body) {
        return apiFetch('/automatch/settings', { method: 'PUT', body });
    }

    async function automatchListInvites(params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/automatch/invites' + qs);
    }

    async function automatchAccept(inviteId) {
        return apiFetch('/automatch/invites/' + encodeURIComponent(inviteId) + '/accept', { method: 'POST', body: {} });
    }

    async function automatchDecline(inviteId) {
        return apiFetch('/automatch/invites/' + encodeURIComponent(inviteId) + '/decline', { method: 'POST', body: {} });
    }

    /** Matches */
    async function listMatches(params) {
        const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
        return apiFetch('/matches' + qs);
    }

    async function createMatch(body) {
        return apiFetch('/matches', { method: 'POST', body });
    }

    async function changeMatchStatus(matchId, action) {
        return apiFetch('/matches/' + encodeURIComponent(matchId) + '/status', { method: 'PATCH', body: { action } });
    }

    async function submitMatchRating(matchId, rating, review) {
        return apiFetch('/matches/' + encodeURIComponent(matchId) + '/ratings', { method: 'POST', body: { rating, review } });
    }

    /** Profile photos */
    async function uploadMyProfilePhoto(file) {
        const fd = new FormData();
        fd.append('photo', file);
        return apiUpload('/users/me/photos', fd);
    }

    async function deleteMyProfilePhoto(photoId) {
        return apiFetch('/users/me/photos/' + encodeURIComponent(photoId), { method: 'DELETE' });
    }

    /** Listing photos */
    async function uploadRequestPhoto(requestId, file) {
        const fd = new FormData();
        fd.append('photo', file);
        return apiUpload('/requests/' + encodeURIComponent(requestId) + '/photos', fd);
    }

    async function deleteRequestPhoto(requestId, photoId) {
        return apiFetch('/requests/' + encodeURIComponent(requestId) + '/photos/' + encodeURIComponent(photoId), { method: 'DELETE' });
    }

    async function uploadOfferPhoto(offerId, file) {
        const fd = new FormData();
        fd.append('photo', file);
        return apiUpload('/offers/' + encodeURIComponent(offerId) + '/photos', fd);
    }

    async function deleteOfferPhoto(offerId, photoId) {
        return apiFetch('/offers/' + encodeURIComponent(offerId) + '/photos/' + encodeURIComponent(photoId), { method: 'DELETE' });
    }

    async function boostRequest48h(requestId) {
        return apiFetch('/requests/' + encodeURIComponent(requestId) + '/boost48h', { method: 'POST', body: {} });
    }

    async function boostOffer48h(offerId) {
        return apiFetch('/offers/' + encodeURIComponent(offerId) + '/boost48h', { method: 'POST', body: {} });
    }

    async function createReport(body) {
        return apiFetch('/reports', { method: 'POST', body });
    }

    /* ── Export ─────────────────────────────────────────────────────────────── */
    window.KHApi = {
        setToken,
        getToken,
        clearToken,
        apiFetch,
        healthCheck,
        register,
        login,
        requestVerifyEmail,
        getMyPoints,
        getMe,
        updateMe,
        getUser,
        listRequests,
        createRequest,
        closeRequest,
        getSuggestedProviders,
        listOffers,
        createOffer,
        closeOffer,
        getMatch,
        listMatches,
        createMatch,
        changeMatchStatus,
        listMatchMessages,
        postMatchMessage,
        setMatchAgreement,
        listPremiumPlans,
        createPremiumCheckout,
        premiumEligibility,
        premiumUnlock,
        leaderboard,
        leaderboardMe,
        listMyBadges,
        listBadgesForUser,
        feed,
        automatchGetSettings,
        automatchUpdateSettings,
        automatchListInvites,
        automatchAccept,
        automatchDecline,
        submitMatchRating,
        uploadMyProfilePhoto,
        deleteMyProfilePhoto,
        uploadRequestPhoto,
        deleteRequestPhoto,
        uploadOfferPhoto,
        deleteOfferPhoto,
        boostRequest48h,
        boostOffer48h,
        createReport,
    };

    // Back-compat: tolerate console checks like `khapi`.
    try { window.khapi = window.KHApi; } catch { }
})();
