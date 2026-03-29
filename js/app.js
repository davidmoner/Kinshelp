/**
 * KingsHelp App — UI logic, animations, interactions.
 * Requires api.js loaded first (window.KHApi available).
 */
(function () {
    'use strict';

    /* MVP state */
    let currentUser = null;
    let lastCreatedRequest = null;
    let lastCreatedOffer = null;
    let ratingMatchId = null;
    let pendingDraft = null;
    let createKind = 'request';
    const creationsFilter = { kind: 'all', status: 'active', q: '' };
    const matchesFilter = { status: 'all', q: '' };

    let chatMatchId = null;
    let chatPollTimer = null;
    let chatComp = 'cash';
    const autoChatOpened = new Set();

    let premiumInterval = 'year';
    const AUTOMATCH_ALLOWLIST = new Set(['contact@kingshelp.es']);

    // Ranking (public modal)
    let rankingScope = 'global'; // global | near
    let rankingRadiusKm = 5;
    let rankingMinLevel = 'all';
    let rankingQuery = '';
    let rankingQueryTimer = null;
    let rankingOrigin = null; // { lat, lng } when permission granted
    let rankingOffset = 0;
    const rankingLimit = 20;
    let rankingLastFocus = null;
    let rankingTrapHandler = null;
    let rankingHasMore = false;
    let rankingLoading = false;

    const RANKING_PREFS_KEY = 'kh_ranking_prefs_v1';
    const RANKING_ORIGIN_SESSION_KEY = 'kh_ranking_origin_v1';

    function loadRankingPrefs() {
        try {
            const raw = localStorage.getItem(RANKING_PREFS_KEY);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (p && (p.scope === 'global' || p.scope === 'near')) rankingScope = p.scope;
            if (Number.isFinite(+p.radius_km)) rankingRadiusKm = Math.max(1, Math.min(10, Math.trunc(+p.radius_km)));
            if (p && typeof p.min_level === 'string') rankingMinLevel = p.min_level;
            if (p && typeof p.q === 'string') rankingQuery = p.q.slice(0, 80);
        } catch { }
    }

    function saveRankingPrefs() {
        try {
            localStorage.setItem(RANKING_PREFS_KEY, JSON.stringify({
                scope: rankingScope,
                radius_km: rankingRadiusKm,
                min_level: rankingMinLevel,
                q: rankingQuery,
            }));
        } catch { }
    }

    function loadRankingOriginFromSession() {
        try {
            const raw = sessionStorage.getItem(RANKING_ORIGIN_SESSION_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || !Number.isFinite(+o.lat) || !Number.isFinite(+o.lng) || !Number.isFinite(+o.ts)) return null;
            // Expire after 30 minutes.
            if (Date.now() - Number(o.ts) > 30 * 60 * 1000) return null;
            return { lat: +o.lat, lng: +o.lng };
        } catch {
            return null;
        }
    }

    function saveRankingOriginToSession(origin) {
        try {
            if (!origin || !Number.isFinite(+origin.lat) || !Number.isFinite(+origin.lng)) return;
            sessionStorage.setItem(RANKING_ORIGIN_SESSION_KEY, JSON.stringify({ lat: +origin.lat, lng: +origin.lng, ts: Date.now() }));
        } catch { }
    }

    let nextState = { kind: 'none' };
    let nextDismissedAt = 0;

    const COMP_HINT = {
        cash: 'Pago en €: el importe se acuerda en el chat y se paga fuera de KingsHelp.',
        barter: 'Trueque: acuerdan un intercambio sin dinero.',
        altruistic: 'Altruistamente: ayuda gratuita, solo reputación.',
    };

    const COMP_LABEL = {
        cash: 'Pago en €',
        coins: 'Pago en €',
        barter: 'Trueque',
        altruistic: 'Altruista',
    };

    // Default suggestion (still negotiated in chat)
    const EUR_SUGGEST = 12;

    const MATCH_ACTION_LABEL = {
        accept: 'Aceptar',
        reject: 'Rechazar',
        done: 'Marcar hecho',
        cancel: 'Cancelar',
    };

    /* ── Utils ────────────────────────────────────────────────────────────────── */
    const $ = id => document.getElementById(id);
    const show = el => el && el.classList.remove('hidden');
    const hide = el => el && el.classList.add('hidden');

    function setLoading(btn, state) {
        const label = btn.querySelector('.btn-label');
        const spinner = btn.querySelector('.spinner');
        const refreshIcon = btn.querySelector('.btn-refresh-ico');
        btn.disabled = state;
        btn.classList.toggle('is-loading', state);
        if (label) label.style.opacity = state ? 0 : 1;
        if (refreshIcon) refreshIcon.style.opacity = state ? 0 : 1;
        if (spinner) state ? show(spinner) : hide(spinner);
    }

    /* ── Inline field validation ────────────────────────────────────────────── */
    function showFieldError(inputId, errId, msg) {
        const inp = $(inputId);
        const err = $(errId);
        if (inp) inp.classList.add('field-error--input');
        if (err) { err.textContent = msg; err.classList.remove('hidden'); }
        if (inp) inp.focus();
    }

    function clearFieldError(inputId, errId) {
        const inp = $(inputId);
        const err = $(errId);
        if (inp) inp.classList.remove('field-error--input');
        if (err) { err.textContent = ''; err.classList.add('hidden'); }
    }

    function onFieldInput(inputId, errId, countId, maxLen) {
        if (errId) clearFieldError(inputId, errId);
        if (countId) {
            const inp = $(inputId);
            const cnt = $(countId);
            if (inp && cnt) {
                const len = inp.value.length;
                cnt.textContent = `${len}\u202f/\u202f${maxLen}`;
                cnt.classList.toggle('field-counter--warn', len >= maxLen * 0.9);
                cnt.classList.toggle('field-counter--limit', len >= maxLen);
            }
        }
    }

    /* ── Create step indicator ───────────────────────────────────────────────── */
    function setCreateStep(n) {
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById(`cstep-${i}`);
            if (!el) continue;
            el.classList.toggle('create-step--active', i === n);
            el.classList.toggle('create-step--done', i < n);
        }
    }

    /* ── Pre-publish photo staging ───────────────────────────────────────────── */
    const prePhotos = { req: [], off: [] };

    function pickPrePhoto(prefix) {
        const inp = document.getElementById(`${prefix}-pre-photo-input`);
        if (inp) inp.click();
    }

    function addPrePhoto(prefix, event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        const arr = prePhotos[prefix];
        const toAdd = files.slice(0, 6 - arr.length);
        toAdd.forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                arr.push({ dataUrl: ev.target.result, file });
                renderPrePhotos(prefix);
            };
            reader.readAsDataURL(file);
        });
        event.target.value = '';
    }

    function removePrePhoto(prefix, idx) {
        prePhotos[prefix].splice(idx, 1);
        renderPrePhotos(prefix);
    }

    function renderPrePhotos(prefix) {
        const grid = document.getElementById(`${prefix}-pre-photos-grid`);
        if (!grid) return;
        const addBtn = grid.querySelector('.create-photo-add');
        grid.innerHTML = '';
        prePhotos[prefix].forEach((p, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'pre-photo-thumb';
            wrap.innerHTML = `<img src="${p.dataUrl}" alt="Foto ${i + 1}" loading="lazy" /><button class="pre-photo-remove" type="button" aria-label="Eliminar foto" onclick="KHApp.removePrePhoto('${prefix}',${i})">✕</button>`;
            grid.appendChild(wrap);
        });
        if (addBtn && prePhotos[prefix].length < 6) grid.appendChild(addBtn);
    }

    async function uploadStagedPhotos(prefix, listingId) {
        const arr = [...prePhotos[prefix]];
        if (!arr.length) return 0;
        const uploadFn = prefix === 'req'
            ? (id, f) => KHApi.uploadRequestPhoto(id, f)
            : (id, f) => KHApi.uploadOfferPhoto(id, f);
        const results = await Promise.allSettled(arr.map(p => uploadFn(listingId, p.file)));
        prePhotos[prefix] = [];
        renderPrePhotos(prefix);
        const ok = results.filter(r => r.status === 'fulfilled').length;
        return ok;
    }

    /* ── Toast ────────────────────────────────────────────────────────────────── */

    function toast(msg, type = 'info') {
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span>
                    <span class="toast-text">${msg}</span>`;
        $('toast-container').appendChild(el);
        setTimeout(() => {
            el.classList.add('removing');
            setTimeout(() => el.remove(), 280);
        }, 3500);
    }

    /* ── Animated Counter ─────────────────────────────────────────────────────── */
    function animateCounter(el, target, duration = 1400) {
        const startTime = performance.now();
        const start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
        const update = now => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.floor(start + eased * (target - start));
            el.textContent = current.toLocaleString('es-ES');
            if (progress < 1) requestAnimationFrame(update);
            else el.textContent = target.toLocaleString('es-ES');
        };
        requestAnimationFrame(update);
    }

    /* ── Coin Particles ───────────────────────────────────────────────────────── */
    function spawnCoins(stageEl, count = 8) {
        for (let i = 0; i < count; i++) {
            const coin = document.createElement('span');
            coin.className = 'coin-particle';
            coin.textContent = '⚡';
            const tx = (Math.random() - 0.5) * 60;
            coin.style.setProperty('--tx', tx + 'px');
            coin.style.left = (30 + Math.random() * 60) + '%';
            coin.style.top = '0px';
            coin.style.animationDelay = (i * 80) + 'ms';
            stageEl.appendChild(coin);
            setTimeout(() => coin.remove(), 1400 + i * 80);
        }
    }

    /* ── Scroll Reveal ────────────────────────────────────────────────────────── */
    function initReveal() {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
        }, { threshold: 0.12 });
        document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    }

    /* ── KPI counters on scroll ───────────────────────────────────────────────── */
    function initKpiCounters() {
        const items = Array.from(document.querySelectorAll('.kpi-value[data-kpi]'));
        if (!items.length) return;

        loadKpiStats().finally(() => {
            const kpiObs = new IntersectionObserver(entries => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        const target = parseInt(e.target.dataset.target);
                        animateCounter(e.target, target);
                        kpiObs.unobserve(e.target);
                    }
                });
            }, { threshold: 0.5 });
            items.forEach(el => kpiObs.observe(el));
        });
    }

    function formatResponseTime(minutes) {
        const mins = Number(minutes || 0);
        if (!Number.isFinite(mins) || mins <= 0) return '—';
        if (mins < 60) return `${Math.round(mins)} min`;
        const hours = mins / 60;
        if (hours < 24) return `${hours.toFixed(1).replace('.', ',')} h`;
        const days = hours / 24;
        return `${days.toFixed(1).replace('.', ',')} d`;
    }

    function formatRating(avg) {
        const val = Number(avg || 0);
        if (!Number.isFinite(val) || val <= 0) return '—';
        return `${val.toFixed(1).replace('.', ',')} / 5`;
    }

    async function loadKpiStats() {
        const note = $('kpi-note');
        try {
            const out = await KHApi.getStats();
            const data = (out && (out.data || out.stats)) || {};
            const map = {
                matches_done: 'kpi-matches',
                badges_awarded: 'kpi-badges',
                reputation_gained: 'kpi-rep',
                users_total: 'kpi-users',
            };
            Object.keys(map).forEach(key => {
                const el = $(map[key]);
                if (!el) return;
                const val = Number(data[key] || 0);
                if (!Number.isFinite(val)) return;
                el.dataset.target = String(val);
                el.textContent = val.toLocaleString('es-ES');
            });

            const demoServices = $('demo-metric-services');
            const demoRating = $('demo-metric-rating');
            const demoResponse = $('demo-metric-response');
            if (demoServices) demoServices.textContent = Number(data.matches_done || 0).toLocaleString('es-ES');
            if (demoRating) demoRating.textContent = formatRating(data.rating_avg);
            if (demoResponse) demoResponse.textContent = formatResponseTime(data.avg_response_minutes);

            const repScore = $('rep-score-val');
            const repMini = $('rep-progress-mini');
            const repFill = $('rep-bar-fill');
            const repActMatches = $('rep-act-matches');
            const repActBadges = $('rep-act-badges');
            const repSummaryUsers = $('rep-summary-users');
            const repSummaryRep = $('rep-summary-rep');
            const usersTotal = Number(data.users_total || 0);
            const repTotal = Number(data.reputation_gained || 0);
            const avgRep = usersTotal > 0 ? Math.round(repTotal / usersTotal) : 0;
            const threshold = Number(data.premium_lite_threshold || 0);
            if (repScore) repScore.textContent = avgRep ? avgRep.toLocaleString('es-ES') : '0';
            if (repMini && threshold > 0) {
                repMini.textContent = `${avgRep.toLocaleString('es-ES')} / ${threshold.toLocaleString('es-ES')} rep`;
            }
            if (repFill && threshold > 0) {
                const pct = Math.max(0, Math.min(100, (avgRep / threshold) * 100));
                repFill.style.width = `${pct.toFixed(1)}%`;
            }
            if (repActMatches) repActMatches.textContent = Number(data.matches_done || 0).toLocaleString('es-ES');
            if (repActBadges) repActBadges.textContent = Number(data.badges_awarded || 0).toLocaleString('es-ES');
            if (repSummaryUsers) repSummaryUsers.textContent = usersTotal.toLocaleString('es-ES');
            if (repSummaryRep) repSummaryRep.textContent = repTotal.toLocaleString('es-ES');

            if (note) {
                const when = out && out.ts ? new Date(out.ts) : new Date();
                note.textContent = `Métricas en vivo · actualizado ${when.toLocaleDateString('es-ES')}`;
            }
        } catch {
            if (note) note.textContent = 'Métricas estimadas (sin conexión a datos en vivo)';
        }
    }

    /* ── Page Navigation ──────────────────────────────────────────────────────── */
    const PAGE_STORAGE_KEY = 'kh_last_page';

    function normalizePageKey(pageId) {
        const v = String(pageId || '').toLowerCase();
        if (v === 'page-dashboard' || v === 'dashboard') return 'dashboard';
        if (v === 'page-landing' || v === 'landing') return 'landing';
        return 'landing';
    }

    function saveLastPage(pageId) {
        try { localStorage.setItem(PAGE_STORAGE_KEY, normalizePageKey(pageId)); } catch { }
    }

    function getSavedPage() {
        try { return normalizePageKey(localStorage.getItem(PAGE_STORAGE_KEY)); } catch { return 'landing'; }
    }

    function relocateThemeToggle(pageId) {
        const btn = document.getElementById('kh-theme-toggle');
        if (!btn) return;
        const slotLanding = document.getElementById('kh-theme-slot-landing');
        const slotDash = document.getElementById('kh-theme-slot-dash');
        const target = (pageId === 'page-dashboard') ? slotDash : slotLanding;
        if (!target) return;
        if (btn.parentElement === target) return;
        try { target.appendChild(btn); } catch { }
    }

    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => hide(p));
        show($(pageId));
        window.scrollTo(0, 0);

        saveLastPage(pageId);

        relocateThemeToggle(pageId);
        syncFloatingCreateVisibility();

        if (pageId === 'page-dashboard') {
            startNotifPolling();
        } else {
            stopNotifPolling();
            closeNotifPanel();
        }

        if (pageId === 'page-landing') {
            onLandingShown();
        }
    }

    /* ── Cookie consent ──────────────────────────────────────────────────────── */
    const COOKIE_CONSENT_KEY = 'kh_cookie_consent';
    const COOKIE_CONSENT_VERSION = 1;

    function defaultCookieConsent() {
        return {
            v: COOKIE_CONSENT_VERSION,
            necessary: true,
            preferences: false,
            analytics: false,
            marketing: false,
            ts: new Date().toISOString(),
        };
    }

    function normalizeCookieConsent(consent) {
        const base = defaultCookieConsent();
        const out = { ...base, ...(consent || {}) };
        out.v = COOKIE_CONSENT_VERSION;
        out.necessary = true;
        return out;
    }

    function readCookieConsent() {
        try {
            const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.v !== COOKIE_CONSENT_VERSION) return null;
            return normalizeCookieConsent(parsed);
        } catch {
            return null;
        }
    }

    function writeCookieConsent(consent) {
        const out = normalizeCookieConsent(consent);
        try { localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(out)); } catch { }
        applyCookieConsent(out);
        syncCookieToggles(out);
    }

    function applyCookieConsent(consent) {
        const root = document.documentElement;
        if (!root || !consent) return;
        root.setAttribute('data-cookie-preferences', consent.preferences ? '1' : '0');
        root.setAttribute('data-cookie-analytics', consent.analytics ? '1' : '0');
        root.setAttribute('data-cookie-marketing', consent.marketing ? '1' : '0');
    }

    function syncCookieToggles(consent) {
        const c = consent || defaultCookieConsent();
        const pref = document.getElementById('cookie-pref-preferences');
        const analytics = document.getElementById('cookie-pref-analytics');
        const marketing = document.getElementById('cookie-pref-marketing');
        if (pref) pref.checked = !!c.preferences;
        if (analytics) analytics.checked = !!c.analytics;
        if (marketing) marketing.checked = !!c.marketing;
    }

    function showCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.classList.remove('hidden');
    }

    function hideCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.classList.add('hidden');
    }

    function openCookieSettings() {
        const panel = document.getElementById('cookie-settings');
        if (!panel) return;
        const consent = readCookieConsent() || defaultCookieConsent();
        syncCookieToggles(consent);
        panel.classList.remove('hidden');
        hideCookieBanner();
    }

    function closeCookieSettings() {
        const panel = document.getElementById('cookie-settings');
        if (panel) panel.classList.add('hidden');
        if (!readCookieConsent()) showCookieBanner();
    }

    function acceptCookiesAll() {
        writeCookieConsent({ preferences: true, analytics: true, marketing: true });
        hideCookieBanner();
        closeCookieSettings();
    }

    function rejectCookiesAll() {
        writeCookieConsent({ preferences: false, analytics: false, marketing: false });
        hideCookieBanner();
        closeCookieSettings();
    }

    function saveCookiePreferences() {
        const pref = document.getElementById('cookie-pref-preferences');
        const analytics = document.getElementById('cookie-pref-analytics');
        const marketing = document.getElementById('cookie-pref-marketing');
        writeCookieConsent({
            preferences: !!(pref && pref.checked),
            analytics: !!(analytics && analytics.checked),
            marketing: !!(marketing && marketing.checked),
        });
        hideCookieBanner();
        closeCookieSettings();
    }

    function initCookieConsent() {
        const consent = readCookieConsent();
        if (!consent) {
            syncCookieToggles(defaultCookieConsent());
            showCookieBanner();
            return;
        }
        applyCookieConsent(consent);
        syncCookieToggles(consent);
    }

    async function onLandingShown() {
        // Keep session state visible on landing.
        const hasToken = !!KHApi.getToken();
        if (hasToken && !currentUser) {
            // Show buttons immediately to avoid flicker.
            setLandingSessionUI({ id: 'tmp' });
            try {
                await ensureCurrentUser();
                setLandingSessionUI(currentUser);
            } catch {
                KHApi.clearToken();
                currentUser = null;
                setLandingSessionUI(null);
            }
            return;
        }
        setLandingSessionUI(currentUser);
    }

    function setLandingSessionUI(user) {
        const auth = document.getElementById('nav-auth-btn');
        const panel = document.getElementById('nav-panel-btn');
        const rank = document.getElementById('nav-ranking-btn');
        const navMenu = document.querySelector('.nav-menu');
        const navSearch = document.querySelector('.nav-search');
        const navLinks = document.getElementById('nav-links');
        const menu = document.getElementById('nav-menu-pop');
        const authOnly = menu ? menu.querySelectorAll('.auth-only') : [];
        const guestOnly = menu ? menu.querySelectorAll('.guest-only') : [];
        const logged = !!(user && user.id);
        const landing = document.getElementById('page-landing');
        const onLanding = !!(landing && !landing.classList.contains('hidden'));
        if (auth) auth.classList.toggle('hidden', logged);
        if (panel) panel.classList.toggle('hidden', !logged);
        if (rank) rank.classList.toggle('hidden', !logged);
        if (navMenu) navMenu.classList.toggle('hidden', !logged);
        syncFloatingCreateVisibility();
        if (authOnly && authOnly.length) authOnly.forEach(el => el.classList.toggle('hidden', !logged));
        if (guestOnly && guestOnly.length) guestOnly.forEach(el => el.classList.toggle('hidden', logged));
        if (navSearch) navSearch.classList.toggle('hidden', onLanding || !logged);
        if (navLinks) navLinks.classList.toggle('hidden', !onLanding);
        updateNavAccount(logged ? user : null);
        if (!logged) {
            favoritesLoaded = false;
            favoritesMap = new Map();
            favoritesList = [];
            renderFavorites();
        }
    }

    function updateNavAccount(user) {
        const nameEl = document.getElementById('nav-account-name');
        const tierEl = document.getElementById('nav-account-tier');
        const avatarEl = document.getElementById('nav-account-avatar');
        if (!nameEl && !tierEl && !avatarEl) return;
        const rawName = user && user.display_name ? String(user.display_name).trim() : '';
        const parts = rawName ? rawName.split(/\s+/).filter(Boolean) : [];
        const displayName = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : (rawName || 'Cuenta');
        if (nameEl) nameEl.textContent = displayName || 'Cuenta';
        if (tierEl) {
            const tierText = user ? navTierLabel(user.premium_tier) : '—';
            tierEl.textContent = tierText;
            tierEl.classList.remove('nav-account-tier--silver');
            if (user && user.premium_tier && user.premium_tier !== 'free') {
                tierEl.classList.add('nav-account-tier--silver');
            }
        }
        normalizeNavTriggerLabel();
        if (avatarEl) avatarEl.textContent = initials(rawName || displayName || '—');
    }

    function syncFloatingCreateVisibility() {
        const floating = document.getElementById('floating-create');
        const floatingVirtue = document.getElementById('floating-virtud');
        const landing = document.getElementById('page-landing');
        const onLanding = landing && !landing.classList.contains('hidden');
        const logged = !!(currentUser && currentUser.id);
        if (floating) floating.classList.toggle('hidden', !logged || onLanding);
        if (floatingVirtue) floatingVirtue.classList.toggle('hidden', !logged || onLanding);
    }

    /* ── Guided tutorial (web) ───────────────────────────────────────────────── */
    const TUTORIAL_COMPLETED_KEY = 'kh_web_tutorial_completed_v1';
    const TUTORIAL_OPTOUT_KEY = 'kh_web_tutorial_optout_v1';
    const tutorialState = { active: false, step: 0, dismissed: false };
    let tutorialRaf = null;
    let tutorialListenersBound = false;

    function getTutorialEls() {
        return {
            overlay: $('kh-tutorial'),
            card: $('kh-tutorial-card'),
            highlight: $('kh-tutorial-highlight'),
            step: $('kh-tutorial-step'),
            title: $('kh-tutorial-title'),
            text: $('kh-tutorial-text'),
            next: $('kh-tutorial-next'),
            optoutWrap: $('kh-tutorial-optout'),
            optoutCheck: $('kh-tutorial-optout-check'),
        };
    }

    function isTutorialSuppressed() {
        try {
            return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === '1'
                && localStorage.getItem(TUTORIAL_OPTOUT_KEY) === '1';
        } catch {
            return false;
        }
    }

    function shouldStartTutorial() {
        if (tutorialState.active || tutorialState.dismissed) return false;
        if (isTutorialSuppressed()) return false;
        if (!KHApi.getToken()) return false;
        const dash = document.getElementById('page-dashboard');
        if (!dash || dash.classList.contains('hidden')) return false;
        return true;
    }

    function getCreateTutorialTarget() {
        const fab = document.getElementById('fab-create');
        if (fab && !fab.classList.contains('hidden')) return fab;
        const btn = document.querySelector('#page-dashboard .dash-header .btn-create');
        if (btn && !btn.classList.contains('hidden')) return btn;
        return null;
    }

    function getPublishTutorialTarget() {
        const offWrap = document.getElementById('off-form-wrap');
        const useOffer = createKind === 'offer' && offWrap && !offWrap.classList.contains('hidden');
        const btn = useOffer ? document.getElementById('btn-off-create') : document.getElementById('btn-req-create');
        return btn || null;
    }

    const tutorialSteps = [
        {
            id: 'create',
            title: 'Crea tu primer match',
            text: 'Pulsa Crear para publicar una solicitud o una oferta.',
            ensure: () => {
                const dash = document.getElementById('page-dashboard');
                if (dash && dash.classList.contains('hidden')) showPage('page-dashboard');
            },
            target: getCreateTutorialTarget,
        },
        {
            id: 'type',
            title: 'Elige el tipo',
            text: 'Selecciona si necesitas ayuda o si ofreces ayuda.',
            ensure: () => setDashView('crear', { noScroll: true }),
            target: () => document.querySelector('.create-switch'),
        },
        {
            id: 'publish',
            title: 'Publica tu match',
            text: 'Completa los detalles y publica para empezar a recibir respuestas.',
            ensure: () => setDashView('crear', { noScroll: true }),
            target: getPublishTutorialTarget,
        },
    ];

    function maybeStartTutorialAfterLogin() {
        if (!shouldStartTutorial()) return;
        startTutorial();
    }

    function startTutorial() {
        const { overlay, card } = getTutorialEls();
        if (!overlay || !card) return;
        tutorialState.active = true;
        tutorialState.step = 1;
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        card.classList.remove('hidden');
        bindTutorialListeners();
        updateTutorialStep();
    }

    function hideTutorial() {
        const { overlay, card } = getTutorialEls();
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (card) card.classList.add('hidden');
    }

    function updateTutorialStep() {
        const stepIdx = tutorialState.step - 1;
        const step = tutorialSteps[stepIdx];
        const { step: stepEl, title, text, next, optoutWrap, optoutCheck } = getTutorialEls();
        if (!step) return;
        if (stepEl) stepEl.textContent = `Paso ${tutorialState.step} de ${tutorialSteps.length}`;
        if (title) title.textContent = step.title;
        if (text) text.textContent = step.text;

        const isLast = tutorialState.step === tutorialSteps.length;
        if (next) next.textContent = isLast ? 'Listo' : 'Siguiente';
        if (optoutWrap) optoutWrap.classList.toggle('hidden', !isLast);
        if (!isLast && optoutCheck) optoutCheck.checked = false;

        if (step.ensure) step.ensure();
        requestTutorialPosition();
    }

    function requestTutorialPosition() {
        if (tutorialRaf) return;
        tutorialRaf = requestAnimationFrame(() => {
            tutorialRaf = null;
            positionTutorial();
        });
    }

    function positionTutorial() {
        if (!tutorialState.active) return;
        const { card, highlight } = getTutorialEls();
        const stepIdx = tutorialState.step - 1;
        const step = tutorialSteps[stepIdx];
        if (!card || !highlight || !step) return;

        const target = step.target ? step.target() : null;
        if (!target) {
            highlight.style.opacity = '0';
            card.style.top = '20px';
            card.style.left = '50%';
            card.style.transform = 'translateX(-50%)';
            return;
        }

        const rect = target.getBoundingClientRect();
        const pad = 6;
        highlight.style.opacity = '1';
        highlight.style.top = `${Math.max(0, rect.top - pad)}px`;
        highlight.style.left = `${Math.max(0, rect.left - pad)}px`;
        highlight.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
        highlight.style.height = `${Math.max(0, rect.height + pad * 2)}px`;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cardWidth = card.offsetWidth;
        const cardHeight = card.offsetHeight;
        let top = rect.bottom + 12;
        if (top + cardHeight > vh - 12) top = rect.top - cardHeight - 12;
        if (top < 12) top = 12;
        let left = rect.left + rect.width / 2 - cardWidth / 2;
        left = Math.max(12, Math.min(vw - cardWidth - 12, left));
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
        card.style.transform = 'translateX(0)';
    }

    function advanceTutorialStep(nextStep) {
        const step = Math.max(1, Math.min(tutorialSteps.length, nextStep));
        tutorialState.step = step;
        updateTutorialStep();
    }

    function tutorialNext() {
        if (!tutorialState.active) return;
        if (tutorialState.step >= tutorialSteps.length) {
            completeTutorial();
            return;
        }
        advanceTutorialStep(tutorialState.step + 1);
    }

    function tutorialSkip() {
        if (!tutorialState.active) return;
        tutorialState.active = false;
        tutorialState.dismissed = true;
        hideTutorial();
    }

    function completeTutorial() {
        const { optoutCheck } = getTutorialEls();
        try {
            localStorage.setItem(TUTORIAL_COMPLETED_KEY, '1');
            if (optoutCheck && optoutCheck.checked) {
                localStorage.setItem(TUTORIAL_OPTOUT_KEY, '1');
            }
        } catch { }
        tutorialState.active = false;
        tutorialState.dismissed = true;
        hideTutorial();
    }

    function bindTutorialListeners() {
        if (tutorialListenersBound) return;
        tutorialListenersBound = true;
        window.addEventListener('resize', requestTutorialPosition);
        window.addEventListener('scroll', requestTutorialPosition, { passive: true });
    }

    function scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function initScrollTopButton() {
        const btn = $('scroll-top');
        if (!btn) return;
        let threshold = 320;
        let raf = null;

        const computeThreshold = () => {
            const anchor = document.getElementById('demo-section') || document.querySelector('#page-landing section');
            if (anchor) threshold = Math.max(120, anchor.offsetTop - 80);
        };

        const update = () => {
            const landing = document.getElementById('page-landing');
            const onLanding = !!(landing && !landing.classList.contains('hidden'));
            if (!onLanding) {
                btn.classList.remove('is-visible');
                return;
            }
            const show = window.scrollY >= threshold;
            btn.classList.toggle('is-visible', show);
        };

        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = null;
                update();
            });
        };

        computeThreshold();
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', () => {
            computeThreshold();
            update();
        });
    }

    function initNavAutoHide() {
        const nav = document.querySelector('.nav');
        if (!nav) return;
        let lastY = window.scrollY || 0;
        let ticking = false;
        const threshold = 10;

        const onScroll = () => {
            const currentY = window.scrollY || 0;
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                const diff = currentY - lastY;
                if (Math.abs(diff) > threshold) {
                    if (diff > 0 && currentY > 72) {
                        nav.classList.add('nav--hidden');
                    } else {
                        nav.classList.remove('nav--hidden');
                    }
                    lastY = currentY;
                }
                if (currentY <= 20) nav.classList.remove('nav--hidden');
                ticking = false;
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
    }

    function initAutoMatchStatusStrip() {
        const radiusInput = $('am-radius');
        const invitesInput = $('am-max-invites');
        const providerToggle = $('am-provider-enabled');
        const seekerToggle = $('am-seeker-enabled');

        if (radiusInput) radiusInput.addEventListener('input', updateAutoMatchStatusStrip);
        if (invitesInput) invitesInput.addEventListener('input', updateAutoMatchStatusStrip);
        if (providerToggle) providerToggle.addEventListener('change', updateAutoMatchStatusStrip);
        if (seekerToggle) seekerToggle.addEventListener('change', updateAutoMatchStatusStrip);

        setAutoMatchMode(autoMatchMode, { silent: true });

        updateAutoMatchStatusStrip();
        updateAutoMatchLocalActivity();
    }

    async function goCreateFromFab() {
        if (!KHApi.getToken()) {
            openLogin();
            return;
        }
        const u = await ensureCurrentUser();
        if (!u || !u.id) {
            openLogin();
            return;
        }
        const dash = document.getElementById('page-dashboard');
        if (!dash || dash.classList.contains('hidden')) {
            showPage('page-dashboard');
        }
        setDashView('crear');
        if (tutorialState.active && tutorialState.step === 1) {
            setTimeout(() => advanceTutorialStep(2), 60);
        } else if (tutorialState.active) {
            requestTutorialPosition();
        }
    }

    /* ── Dashboard account menu ───────────────────────────────────────────── */
    function toggleDashMenu(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
        const pop = document.getElementById('dash-menu-pop');
        const btn = document.getElementById('dash-menu-btn');
        if (!pop || !btn) return;
        const burger = document.getElementById('dash-burger');
        const open = pop.classList.contains('hidden');
        if (open) {
            pop.classList.remove('hidden');
            btn.setAttribute('aria-expanded', 'true');
            if (burger) burger.setAttribute('aria-expanded', 'true');
        } else {
            pop.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
            if (burger) burger.setAttribute('aria-expanded', 'false');
        }
    }

    function closeDashMenu() {
        const pop = document.getElementById('dash-menu-pop');
        const btn = document.getElementById('dash-menu-btn');
        const burger = document.getElementById('dash-burger');
        if (pop) pop.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (burger) burger.setAttribute('aria-expanded', 'false');
    }

    function toggleLandingMenu(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
        const pop = document.getElementById('nav-menu-pop');
        const btn = document.getElementById('nav-burger');
        if (!pop || !btn) return;
        const open = pop.classList.contains('hidden');
        if (open) {
            pop.classList.remove('hidden');
            btn.setAttribute('aria-expanded', 'true');
        } else {
            pop.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
        }
    }

    function closeLandingMenu() {
        const pop = document.getElementById('nav-menu-pop');
        const btn = document.getElementById('nav-burger');
        if (pop) pop.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    async function goDashboardFromLanding(view) {
        closeLandingMenu();
        await goDashboard();
        const dash = document.getElementById('page-dashboard');
        if (!dash || dash.classList.contains('hidden')) return;
        setDashView(view, { noScroll: true });
    }

    function goAutoMatchFromMenu() {
        closeDashMenu();
        hubGoAutoMatch();
    }

    function gotoDashFromMenu(view) {
        closeDashMenu();
        setDashView(view);
    }

    /* ── Dashboard views (tabs) ─────────────────────────────────────────────── */
    function normalizeDashView(view) {
        const v = String(view || '').toLowerCase();
        if (v === 'automatch' || v === 'explorar' || v === 'crear' || v === 'creaciones' || v === 'matches' || v === 'perfil' || v === 'premium' || v === 'ranking') return v;
        return 'explorar';
    }

    function getSavedDashView() {
        try {
            return normalizeDashView(localStorage.getItem('kh_dash_view'));
        } catch {
            return 'crear';
        }
    }

    const dashAutoLoadAt = { automatch: 0, explorar: 0, crear: 0, creaciones: 0, matches: 0, perfil: 0, premium: 0, ranking: 0 };

    let automatchPollTimer = null;
    let automatchCountdownTimer = null;
    let automatchLiveFeedTimer = null;
    let feedDebounce = null;
    let premiumNudgeTimer = null;
    let badgeNudgeTimer = null;

    /* ── Notifications ───────────────────────────────────────────────────────── */
    let notifPollTimer = null;
    let notifPanelOpen = false;

    const NOTIF_KIND_ICON = {
        match_created: '🤝',
        match_accepted: '✅',
        match_done: '🏅',
        match_rejected: '❌',
        match_message: '💬',
        automatch_invite: '⚡',
        automatch_offer_invite: '⚡',
    };
    const NOTIF_KIND_LABEL = {
        match_created: 'Nuevo match',
        match_accepted: 'Match aceptado',
        match_done: 'Match completado',
        match_rejected: 'Match rechazado',
        match_message: 'Mensaje nuevo',
        automatch_invite: 'Invitación AutoMatch',
        automatch_offer_invite: 'Invitación AutoMatch',
    };

    async function loadNotifications({ silent = false } = {}) {
        if (!KHApi.getToken()) return;
        try {
            const data = await KHApi.getNotifications({ limit: 30, offset: 0 });
            const items = (data && data.data) || [];
            renderNotifications(items);
        } catch (err) {
            if (!silent) console.warn('[notif] load error', err);
        }
    }

    function renderNotifications(items) {
        const list = document.getElementById('notif-list');
        const badge = document.getElementById('notif-badge');
        const markAllBtn = document.getElementById('btn-notif-mark-all');
        if (!list) return;

        const unread = items.filter(n => !n.read_at).length;
        if (badge) {
            badge.textContent = unread > 9 ? '9+' : String(unread);
            badge.classList.toggle('hidden', unread === 0);
        }
        if (markAllBtn) markAllBtn.disabled = unread === 0;

        if (!items.length) {
            list.innerHTML = '<div class="notif-empty">Sin notificaciones nuevas</div>';
            return;
        }

        list.innerHTML = '';
        items.forEach(n => {
            const isUnread = !n.read_at;
            const icon = NOTIF_KIND_ICON[n.kind] || '🔔';
            const kindLabel = NOTIF_KIND_LABEL[n.kind] || n.kind;
            const when = fmtShortDate(n.created_at);
            const el = document.createElement('div');
            el.className = 'notif-item' + (isUnread ? ' notif-item--unread' : '');
            el.dataset.notifId = n.id;
            el.innerHTML = `
                <span class="notif-item-icon" aria-hidden="true">${icon}</span>
                <div class="notif-item-body">
                    <div class="notif-item-title">${escapeHtml(n.title || kindLabel)}</div>
                    ${n.body ? `<div class="notif-item-body-text">${escapeHtml(String(n.body))}</div>` : ''}
                    ${when ? `<div class="notif-item-when">${escapeHtml(when)}</div>` : ''}
                </div>
                ${isUnread ? `<button class="notif-item-read" type="button" aria-label="Marcar como leída" data-notif-id="${n.id}">✓</button>` : ''}
            `;
            el.addEventListener('click', () => handleNotificationClick(n));
            if (isUnread) {
                el.querySelector('.notif-item-read') && el.querySelector('.notif-item-read').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        await KHApi.markNotifRead(n.id);
                        await loadNotifications({ silent: true });
                    } catch { }
                });
            }
            list.appendChild(el);
        });
    }

    async function handleNotificationClick(notif) {
        if (!notif) return;
        const payload = (notif && notif.payload) ? notif.payload : {};
        const matchId = payload.match_id || payload.matchId || null;
        try {
            if (!notif.read_at) {
                await KHApi.markNotifRead(notif.id);
                await loadNotifications({ silent: true });
            }
        } catch { }

        closeNotifPanel();

        if (notif.kind === 'automatch_invite' || notif.kind === 'automatch_offer_invite') {
            setDashView('automatch');
            return;
        }

        if (String(notif.kind || '').startsWith('match')) {
            setDashView('matches');
            if (notif.kind === 'match_message' && matchId) {
                openChat(matchId);
            }
        }
    }

    function toggleNotifPanel(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
        const panel = document.getElementById('notif-panel');
        const btn = document.getElementById('notif-bell-btn');
        if (!panel) return;
        notifPanelOpen = !notifPanelOpen;
        panel.classList.toggle('hidden', !notifPanelOpen);
        if (btn) btn.setAttribute('aria-expanded', String(notifPanelOpen));
        if (notifPanelOpen) loadNotifications();
    }

    function closeNotifPanel() {
        const panel = document.getElementById('notif-panel');
        const btn = document.getElementById('notif-bell-btn');
        if (panel) panel.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        notifPanelOpen = false;
    }

    async function markAllNotifsReadUI() {
        const btn = document.getElementById('btn-notif-mark-all');
        if (btn) btn.disabled = true;
        try {
            await KHApi.markAllNotifsRead();
            await loadNotifications({ silent: true });
        } catch (err) {
            toast(err.message || 'No se pudo actualizar', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function startNotifPolling() {
        stopNotifPolling();
        if (!KHApi.getToken()) return;
        loadNotifications();
        notifPollTimer = setInterval(() => loadNotifications({ silent: true }), 30000);
    }

    function stopNotifPolling() {
        if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
    }

    function setDashView(view, opts = {}) {
        const v = normalizeDashView(view);
        const root = document.querySelector('main.dashboard');
        if (root) root.dataset.view = v;

        document.querySelectorAll('.dash-tab[data-view]').forEach(btn => {
            const active = btn.getAttribute('data-view') === v;
            btn.classList.toggle('dash-tab--active', active);
            btn.setAttribute('aria-selected', String(active));
        });

        try { localStorage.setItem('kh_dash_view', v); } catch { }

        if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });

        if (tutorialState.active) {
            setTimeout(requestTutorialPosition, 80);
        }

        if (badgeNudgeTimer) { clearTimeout(badgeNudgeTimer); badgeNudgeTimer = null; }
        if (v === 'premium' || v === 'automatch') scheduleBadgeNudge(v);

        if (opts.noAutoLoad) return;

        // Start/stop view-specific polling
        if (automatchPollTimer) { clearInterval(automatchPollTimer); automatchPollTimer = null; }
        if (automatchCountdownTimer) { clearInterval(automatchCountdownTimer); automatchCountdownTimer = null; }
        if (automatchLiveFeedTimer) { clearInterval(automatchLiveFeedTimer); automatchLiveFeedTimer = null; }

        // Lazy refresh on section entry (avoid spamming requests)
        const now = Date.now();
        if (now - (dashAutoLoadAt[v] || 0) < 5000) return;
        dashAutoLoadAt[v] = now;

        if (v === 'explorar') loadFeed();
        if (v === 'ranking') loadRankingPage({ reset: true });
        if (v === 'automatch') {
            loadAutoMatch();
            automatchPollTimer = setInterval(() => {
                const root = document.querySelector('main.dashboard');
                if (!root || root.dataset.view !== 'automatch') return;
                loadAutoMatch({ silent: true });
            }, 20000);
            automatchCountdownTimer = setInterval(() => {
                const root = document.querySelector('main.dashboard');
                if (!root || root.dataset.view !== 'automatch') return;
                tickInviteCountdowns();
            }, 2000);
            automatchLiveFeedTimer = setInterval(() => {
                updateAutoMatchLiveFeed();
            }, 30000);
        }
        if (v === 'creaciones') loadCreations();
        if (v === 'matches') loadMatches();
        if (v === 'perfil') { loadProfile(); }
        if (v === 'premium') { loadPremiumProgress(); loadLeaderboard(); loadBadgesMine(); }
    }

    function goLanding(event) {
        if (event && event.preventDefault) event.preventDefault();
        showPage('page-landing');
    }

    function isPremiumActive(user) {
        if (!user) return false;
        if (!user.premium_tier || user.premium_tier === 'free') return false;
        if (!user.premium_until) return true;
        try { return new Date(user.premium_until).getTime() > Date.now(); }
        catch { return false; }
    }

    function enterDashboardDefault(user) {
        setDashView('explorar', { noScroll: true });
        if (!isPremiumActive(user)) schedulePremiumNudge();
    }

    async function goDashboard(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (!KHApi.getToken()) {
            postLoginAction = null;
            openLogin();
            return;
        }
        const u = await ensureCurrentUser();
        if (!u || !u.id) {
            try { KHApi.clearToken(); } catch { }
            currentUser = null;
            setLandingSessionUI(null);
            openLogin();
            return;
        }
        showPage('page-dashboard');
        enterDashboardDefault(currentUser);
        loadFeed();
        loadMatches();
        loadCreations();
        loadPremiumProgress();
        loadBadgesMine();
        loadLeaderboard();
    }

    function schedulePremiumNudge() {
        if (premiumNudgeTimer) { clearTimeout(premiumNudgeTimer); premiumNudgeTimer = null; }
        // show at most once per 24h
        try {
            const last = Number(localStorage.getItem('kh_premium_nudge_ts') || 0);
            if (Date.now() - last < 24 * 3600 * 1000) return;
        } catch { }

        premiumNudgeTimer = setTimeout(async () => {
            const root = document.querySelector('main.dashboard');
            if (!root) return;
            if (document.getElementById('modal-premium') && !document.getElementById('modal-premium').classList.contains('hidden')) return;
            if (document.getElementById('modal-login') && !document.getElementById('modal-login').classList.contains('hidden')) return;
            if (document.getElementById('modal-upgrade') && !document.getElementById('modal-upgrade').classList.contains('hidden')) return;

            // If user navigated elsewhere, don't interrupt
            if (root.dataset.view !== 'explorar') return;

            try {
                const e = await KHApi.premiumEligibility();
                if (e && !e.premium_active) openUpgradeModal(e);
                try { localStorage.setItem('kh_premium_nudge_ts', String(Date.now())); } catch { }
            } catch {
                // ignore
            }
        }, 5000);
    }

    function scheduleBadgeNudge(view) {
        if (badgeNudgeTimer) { clearTimeout(badgeNudgeTimer); badgeNudgeTimer = null; }
        if (!KHApi.getToken()) return;
        if (isPremiumActive(currentUser)) return;
        try {
            const last = Number(localStorage.getItem('kh_badge_nudge_ts') || 0);
            if (Date.now() - last < 7 * 24 * 3600 * 1000) return;
        } catch { }

        badgeNudgeTimer = setTimeout(() => {
            const root = document.querySelector('main.dashboard');
            if (!root) return;
            if (root.dataset.view !== view) return;
            if (document.getElementById('modal-badge-nudge') && !document.getElementById('modal-badge-nudge').classList.contains('hidden')) return;
            if (document.getElementById('modal-login') && !document.getElementById('modal-login').classList.contains('hidden')) return;
            if (document.getElementById('modal-premium') && !document.getElementById('modal-premium').classList.contains('hidden')) return;
            if (document.getElementById('modal-upgrade') && !document.getElementById('modal-upgrade').classList.contains('hidden')) return;
            openBadgeNudge();
            try { localStorage.setItem('kh_badge_nudge_ts', String(Date.now())); } catch { }
        }, 15000);
    }

    function openBadgeNudge() {
        const m = document.getElementById('modal-badge-nudge');
        if (!m) return;
        m.classList.remove('hidden');
        setTimeout(() => {
            const btn = m.querySelector('button');
            if (btn) btn.focus();
        }, 80);
    }

    function closeBadgeNudge(event) {
        const m = document.getElementById('modal-badge-nudge');
        if (!m) return;
        if (event && event.target !== m) return;
        m.classList.add('hidden');
    }

    function scrollToDashCard(id) {
        if (!id) return;
        const el = document.getElementById(id);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function goCollectionsFromNudge() {
        closeBadgeNudge();
        setDashView('premium', { noScroll: true });
        setTimeout(() => scrollToDashCard('card-collections'), 120);
    }

    function goBadgesFromNudge() {
        closeBadgeNudge();
        setDashView('perfil', { noScroll: true });
        setTimeout(() => scrollToDashCard('card-badges'), 120);
    }

    function openUpgradeModal(e) {
        const m = document.getElementById('modal-upgrade');
        if (!m) return;
        const rep = Number(e.reputation || 0);
        const th = Number(e.threshold || 1000);
        const partners = Number(e.partners_done_distinct || 0);
        const partnersReq = Number(e.partners_required || 0);
        const pct = Math.max(0, Math.min(100, Math.round((rep / Math.max(1, th)) * 100)));

        if ($('upgrade-rep')) $('upgrade-rep').textContent = String(rep);
        if ($('upgrade-th')) $('upgrade-th').textContent = String(th);
        if ($('upgrade-fill')) $('upgrade-fill').style.width = pct + '%';

        const leftRep = Math.max(0, th - rep);
        const leftPartners = Math.max(0, partnersReq - partners);
        const foot = $('upgrade-foot');
        if (foot) {
            foot.textContent = leftRep === 0
                ? 'Listo para desbloquear AutoMatch Premium.'
                : `Te faltan ${leftRep} rep para desbloquear AutoMatch Premium.`;
        }

        m.classList.remove('hidden');
        setTimeout(() => {
            const btn = m.querySelector('button');
            if (btn) btn.focus();
        }, 80);
    }

    function closeUpgradeModal(event) {
        const m = document.getElementById('modal-upgrade');
        if (!m) return;
        if (event && event.target !== m) return;
        m.classList.add('hidden');
    }

    function openPremiumFromNudge() {
        closeUpgradeModal();
        if (window.KHFx && window.KHFx.openPremiumModal) window.KHFx.openPremiumModal();
    }

    function goPremiumTab() {
        closeUpgradeModal();
        setDashView('premium');
    }

    async function ensureCurrentUser() {
        if (currentUser) return currentUser;
        if (!KHApi.getToken()) return null;
        try {
            const user = await KHApi.getMe();
            loadUserInfo(user);
            return user;
        } catch {
            return null;
        }
    }

    function selectCreateKind(kind) {
        createKind = kind === 'offer' ? 'offer' : 'request';
        const btns = document.querySelectorAll('.create-choice[data-kind]');
        btns.forEach(b => b.classList.toggle('create-choice--active', b.getAttribute('data-kind') === createKind));

        if (createKind === 'request') {
            hide($('off-form-wrap'));
            hide($('off-created'));
            // If a request is already created, keep the form hidden
            if ($('req-created') && !$('req-created').classList.contains('hidden')) {
                hide($('req-form-wrap'));
            } else {
                show($('req-form-wrap'));
            }
        } else {
            hide($('req-form-wrap'));
            hide($('req-created'));
            hide($('req-suggestions'));
            // If an offer is already published, keep the form hidden
            if ($('off-created') && !$('off-created').classList.contains('hidden')) {
                hide($('off-form-wrap'));
            } else {
                show($('off-form-wrap'));
            }
        }

        if (tutorialState.active && tutorialState.step === 2) {
            setTimeout(() => advanceTutorialStep(3), 60);
        } else if (tutorialState.active) {
            requestTutorialPosition();
        }
    }

    function selectComp(prefix, comp) {
        const c = (comp === 'barter' || comp === 'altruistic') ? comp : 'cash';
        const hid = document.getElementById(prefix + '-comp');
        if (hid) hid.value = c;

        const root = hid ? hid.parentElement : null;
        const btns = root ? root.querySelectorAll('.comp-choice[data-comp]') : [];
        btns.forEach(b => b.classList.toggle('comp-choice--active', b.getAttribute('data-comp') === c));

        const hint = document.getElementById(prefix + '-comp-hint');
        if (hint) hint.textContent = COMP_HINT[c] || '';
    }

    /* ── Match chat + agreement ─────────────────────────────────────────────── */
    async function openChat(matchId) {
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }
        await ensureCurrentUser();
        chatMatchId = matchId;
        $('chat-match').textContent = String(matchId || '—');
        show($('modal-chat'));

        await refreshChat();
        startChatPolling();
        setTimeout(() => {
            const t = $('chat-text');
            if (t) t.focus();
        }, 80);
    }

    function closeChat(event) {
        if (event && event.target !== $('modal-chat')) return;
        hide($('modal-chat'));
        chatMatchId = null;
        stopChatPolling();
    }

    function stopChatPolling() {
        if (chatPollTimer) {
            clearInterval(chatPollTimer);
            chatPollTimer = null;
        }
    }

    function startChatPolling() {
        stopChatPolling();
        chatPollTimer = setInterval(() => {
            if (!chatMatchId) return;
            refreshChat({ silent: true });
        }, 5000);
    }

    function chatSelectComp(comp) {
        chatComp = (comp === 'barter' || comp === 'altruistic') ? comp : 'cash';
        document.querySelectorAll('#modal-chat .comp-choice[data-comp]').forEach(b => {
            b.classList.toggle('comp-choice--active', b.getAttribute('data-comp') === chatComp);
        });
        if (chatComp === 'cash') {
            show($('chat-coins'));
            hide($('chat-barter'));
        } else if (chatComp === 'barter') {
            hide($('chat-coins'));
            show($('chat-barter'));
        } else {
            hide($('chat-coins'));
            hide($('chat-barter'));
        }
        $('chat-comp').textContent = COMP_LABEL[chatComp] || chatComp;
    }

    function chatPickCoins(n) {
        const inp = $('chat-coins-custom');
        if (inp) inp.value = String(n);
    }

    async function chatConfirmAgreement() {
        if (!chatMatchId) return;
        const btn = $('btn-chat-agree');
        setLoading(btn, true);
        try {
            const body = { compensation_type: chatComp };
            if (chatComp === 'cash') {
                const v = Number(($('chat-coins-custom') && $('chat-coins-custom').value) || 0);
                if (!v || v < 1) {
                    toast('Elige un importe en €', 'error');
                    return;
                }
                body.points_agreed = v;
            }
            if (chatComp === 'barter') {
                const terms = ($('chat-barter-terms') && $('chat-barter-terms').value || '').trim();
                if (!terms) {
                    toast('Escribe los términos del trueque', 'error');
                    return;
                }
                body.barter_terms = terms;
            }

            await KHApi.setMatchAgreement(chatMatchId, body);
            toast('Acuerdo guardado ✓', 'success');
            await refreshChat();
            await loadMatches();
        } catch (err) {
            toast(err.message || 'No se pudo guardar el acuerdo', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    async function chatSend(event) {
        event.preventDefault();
        if (!chatMatchId) return;
        const txt = ($('chat-text') && $('chat-text').value || '').trim();
        if (!txt) return;
        const btn = $('btn-chat-send');
        setLoading(btn, true);
        try {
            await KHApi.postMatchMessage(chatMatchId, txt);
            $('chat-text').value = '';
            await refreshChat();
        } catch (err) {
            toast(err.message || 'No se pudo enviar el mensaje', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    async function refreshChat(opts = {}) {
        if (!chatMatchId) return;
        try {
            const match = await KHApi.getMatch(chatMatchId);
            chatComp = match.compensation_type || 'cash';
            $('chat-status').textContent = match.status || '—';
            $('chat-comp').textContent = COMP_LABEL[chatComp] || chatComp;
            chatSelectComp(chatComp);

            // Pre-fill
            if (chatComp === 'cash') {
                const inp = $('chat-coins-custom');
                if (inp && (+match.points_agreed || 0) > 0) inp.value = String(match.points_agreed);
                if (inp && !inp.value) inp.value = String(EUR_SUGGEST);
            }
            if (chatComp === 'barter') {
                const t = $('chat-barter-terms');
                if (t && match.barter_terms) t.value = match.barter_terms;
            }

            const data = await KHApi.listMatchMessages(chatMatchId, { limit: 80, offset: 0 });
            const rows = (data && data.data) || [];
            const wrap = $('chat-messages');
            if (!wrap) return;
            wrap.innerHTML = '';
            rows.forEach(m => {
                const el = document.createElement('div');
                const mine = m.user_id === (currentUser && currentUser.id);
                const isSystem = m.kind === 'system';
                const when = fmtShortDate(m.created_at);
                el.className = 'chat-msg' + (isSystem ? ' system' : (mine ? ' me' : ''));
                el.innerHTML = `
                  <div class="chat-bubble">${escapeHtml(m.message)}</div>
                  <div class="chat-meta">${isSystem ? 'KingsHelp' : escapeHtml(m.user_name || '')}${when ? ' · ' + escapeHtml(when) : ''}</div>
                `;
                wrap.appendChild(el);
            });
            wrap.scrollTop = wrap.scrollHeight;
        } catch (err) {
            if (!opts.silent) toast(err.message || 'No se pudo cargar el chat', 'error');
        }
    }

    function resetCreateForm(kind) {
        pendingDraft = null;
        if (kind === 'offer') {
            const f = $('offer-form');
            if (f) f.reset();
            hide($('off-created'));
            hide($('off-preview'));
            show($('off-form-wrap'));
            selectCreateKind('offer');
            selectComp('off', 'cash');
            const t = $('off-title');
            if (t) t.focus();
            return;
        }

        const f = $('request-form');
        if (f) f.reset();
        hide($('req-created'));
        hide($('req-preview'));
        hide($('req-suggestions'));
        show($('req-form-wrap'));
        selectCreateKind('request');
        selectComp('req', 'cash');
        const t = $('req-title');
        if (t) t.focus();
    }

    function scrollToCreations() {
        setDashView('creaciones');
        const c = $('card-mvp-creations');
        if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function setCreationsFilter(key, value) {
        if (key === 'kind') {
            creationsFilter.kind = (value === 'request' || value === 'offer') ? value : 'all';
        }
        if (key === 'status') {
            creationsFilter.status = value === 'closed' ? 'closed' : 'active';
        }
        if (key === 'q') {
            creationsFilter.q = String(value || '').trim();
        }

        // Update UI (tabs)
        document.querySelectorAll('.creations-tab[data-kind]').forEach(b => {
            const isActive = b.getAttribute('data-kind') === creationsFilter.kind;
            b.classList.toggle('creations-tab--active', isActive);
            b.setAttribute('aria-selected', String(isActive));
        });
        document.querySelectorAll('.creations-tab[data-status]').forEach(b => {
            const isActive = b.getAttribute('data-status') === creationsFilter.status;
            b.classList.toggle('creations-tab--active', isActive);
            b.setAttribute('aria-selected', String(isActive));
        });

        // Refresh list
        loadCreations();
    }

    function setMatchesFilter(key, value) {
        if (key === 'status') {
            matchesFilter.status = value || 'all';
        }
        if (key === 'q') {
            matchesFilter.q = String(value || '').trim();
        }

        document.querySelectorAll('.creations-tab[data-mstatus]').forEach(b => {
            const isActive = b.getAttribute('data-mstatus') === matchesFilter.status;
            b.classList.toggle('creations-tab--active', isActive);
            b.setAttribute('aria-selected', String(isActive));
        });

        loadMatches();
    }

    /* ── Login Modal ──────────────────────────────────────────────────────────── */
    async function openLogin() {
        // If a token exists, validate it before skipping the modal.
        if (KHApi.getToken()) {
            try {
                const u = await ensureCurrentUser();
                if (u && u.id) {
                    goDashboard();
                    return;
                }
            } catch {
                // ignore
            }
            // Stale/invalid token
            try { KHApi.clearToken(); } catch { }
            currentUser = null;
            setLandingSessionUI(null);
        }

        show($('modal-login'));
        showAuthChooser();
        setTimeout(() => {
            const btn = document.querySelector('#auth-chooser .auth-provider');
            if (btn) btn.focus();
        }, 80);
    }

    function showAuthChooser() {
        show($('auth-chooser'));
        hide($('auth-email'));
    }

    function showEmailAuth(tab) {
        closeLandingMenu();
        show($('modal-login'));
        hide($('auth-chooser'));
        show($('auth-email'));

        const t = (tab === 'register') ? 'register' : 'login';
        const loginTab = document.querySelector('.auth-tab[data-tab="login"]');
        const regTab = document.querySelector('.auth-tab[data-tab="register"]');
        if (loginTab && regTab) {
            loginTab.classList.toggle('auth-tab--active', t === 'login');
            loginTab.setAttribute('aria-selected', String(t === 'login'));
            regTab.classList.toggle('auth-tab--active', t === 'register');
            regTab.setAttribute('aria-selected', String(t === 'register'));
        }

        const heroLogin = $('auth-hero-login');
        const heroRegister = $('auth-hero-register');
        const heroReset = $('auth-hero-reset');
        if (heroLogin) heroLogin.classList.toggle('hidden', t !== 'login');
        if (heroRegister) heroRegister.classList.toggle('hidden', t !== 'register');
        if (heroReset) heroReset.classList.toggle('hidden', true);

        const switchLogin = $('auth-switch-login');
        const switchRegister = $('auth-switch-register');
        const switchReset = $('auth-switch-reset');
        if (switchLogin) switchLogin.classList.toggle('hidden', t !== 'login');
        if (switchRegister) switchRegister.classList.toggle('hidden', t !== 'register');
        if (switchReset) switchReset.classList.toggle('hidden', true);

        hide($('reset-form'));

        if (t === 'login') {
            show($('login-form'));
            hide($('register-form'));
            setTimeout(() => $('login-email') && $('login-email').focus(), 80);
        } else {
            hide($('login-form'));
            show($('register-form'));
            setTimeout(() => $('reg-name') && $('reg-name').focus(), 80);
        }
    }

    function showPasswordReset() {
        closeLandingMenu();
        show($('modal-login'));
        hide($('auth-chooser'));
        show($('auth-email'));

        hide($('login-form'));
        hide($('register-form'));
        show($('reset-form'));

        const heroLogin = $('auth-hero-login');
        const heroRegister = $('auth-hero-register');
        const heroReset = $('auth-hero-reset');
        if (heroLogin) heroLogin.classList.toggle('hidden', true);
        if (heroRegister) heroRegister.classList.toggle('hidden', true);
        if (heroReset) heroReset.classList.toggle('hidden', false);

        const switchLogin = $('auth-switch-login');
        const switchRegister = $('auth-switch-register');
        const switchReset = $('auth-switch-reset');
        if (switchLogin) switchLogin.classList.toggle('hidden', true);
        if (switchRegister) switchRegister.classList.toggle('hidden', true);
        if (switchReset) switchReset.classList.toggle('hidden', false);

        const loginEmail = $('login-email');
        const resetEmail = $('reset-email');
        if (loginEmail && resetEmail && !resetEmail.value) resetEmail.value = loginEmail.value || '';
        setTimeout(() => $('reset-email') && $('reset-email').focus(), 80);
    }

    function authProvider(provider) {
        if (provider === 'google') {
            if (!window.GOOGLE_CLIENT_ID) {
                toast('Google no está disponible todavía. Usa email.', 'info');
                showEmailAuth('register');
                return;
            }
            beginOAuth('google');
            return;
        }
        if (provider === 'facebook') {
            if (!window.FACEBOOK_APP_ID) {
                toast('Facebook no está disponible todavía. Usa email.', 'info');
                showEmailAuth('register');
                return;
            }
            beginOAuth('facebook');
            return;
        }
        showEmailAuth('login');
    }

    function beginOAuth(provider) {
        const base = window.PUBLIC_BASE_URL || window.location.origin;
        const state = `${provider}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        try { sessionStorage.setItem('kh_oauth_state', state); } catch { }

        if (provider === 'google') {
            const redirectUri = `${base}/api/v1/auth/oauth/google/callback`;
            const qs = new URLSearchParams({
                client_id: window.GOOGLE_CLIENT_ID,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: 'openid email profile',
                prompt: 'select_account',
                state,
            });
            window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`;
            return;
        }

        if (provider === 'facebook') {
            const redirectUri = `${base}/api/v1/auth/oauth/facebook/callback`;
            const qs = new URLSearchParams({
                client_id: window.FACEBOOK_APP_ID,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: 'email,public_profile',
                state,
            });
            window.location.href = `https://www.facebook.com/v18.0/dialog/oauth?${qs.toString()}`;
        }
    }

    function initOAuthButtons() {
        const providers = [
            { id: 'google', enabled: !!window.GOOGLE_CLIENT_ID, label: 'Google' },
            { id: 'facebook', enabled: !!window.FACEBOOK_APP_ID, label: 'Facebook' },
        ];

        providers.forEach(p => {
            const btn = document.querySelector(`button[data-action="authProvider"][data-args="${p.id}"]`);
            if (!btn) return;
            if (!p.enabled) {
                btn.disabled = true;
                btn.title = `${p.label} no disponible todavía`;
            } else {
                btn.disabled = false;
                btn.title = '';
            }
        });
    }

    function handleOAuthRedirect() {
        const params = new URLSearchParams(window.location.search);
        const provider = params.get('oauth');
        if (!provider) return false;
        const ok = params.get('ok');
        if (ok === '1') {
            const token = params.get('token');
            if (token) {
                KHApi.setToken(token);
                toast(`Sesión iniciada con ${provider} ✓`, 'success');
            } else {
                toast('OAuth incompleto. Usa email.', 'error');
            }
        } else {
            const err = params.get('error');
            toast(err ? `OAuth error: ${err}` : 'No se pudo iniciar sesión', 'error');
        }
        const clean = window.location.pathname + (window.location.hash || '');
        try { window.history.replaceState({}, document.title, clean); } catch { }
        return true;
    }

    /* ── Rating Modal (MVP) ──────────────────────────────────────────────────── */
    function openRating(matchId) {
        ratingMatchId = matchId;
        $('rating-match').textContent = String(matchId || '—');
        $('rating-review').value = '';
        $('rating-value').value = '5';
        show($('modal-rating'));
        setTimeout(() => $('rating-value').focus(), 80);
    }

    function closeRating(event) {
        if (event && event.target !== $('modal-rating')) return;
        hide($('modal-rating'));
        ratingMatchId = null;
    }

    async function submitRating(event) {
        event.preventDefault();
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }
        if (!ratingMatchId) {
            toast('No hay match seleccionado', 'error');
            return;
        }

        const btn = $('btn-rating');
        setLoading(btn, true);
        try {
            const rating = Number($('rating-value').value);
            const review = $('rating-review').value.trim();
            await KHApi.submitMatchRating(ratingMatchId, rating, review || undefined);
            toast('Valoración enviada ✓', 'success');
            closeRating();
            await loadMatches();
        } catch (err) {
            toast(err.message || 'No se pudo enviar la valoración', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    let postLoginAction = null; // e.g. 'first_match'
    let pendingSearchQuery = null;
    const INVITE_SESSION_KEY = 'kh_invite_id';

    function rememberInviteId(inviteId) {
        if (!inviteId) return;
        try { sessionStorage.setItem(INVITE_SESSION_KEY, String(inviteId)); } catch { }
    }

    function consumeInviteId() {
        try {
            const id = sessionStorage.getItem(INVITE_SESSION_KEY);
            sessionStorage.removeItem(INVITE_SESSION_KEY);
            return id;
        } catch {
            return null;
        }
    }

    function handleInviteRedirect() {
        const params = new URLSearchParams(window.location.search);
        const inviteId = params.get('invite');
        if (!inviteId) return false;
        rememberInviteId(inviteId);
        postLoginAction = 'automatch_invite';
        const clean = window.location.pathname + (window.location.hash || '');
        try { window.history.replaceState({}, document.title, clean); } catch { }
        if (!KHApi.getToken()) openLogin();
        return true;
    }

    async function openAutomatchFromInvite() {
        if (!KHApi.getToken()) {
            postLoginAction = 'automatch_invite';
            openLogin();
            return;
        }
        consumeInviteId();
        try { await ensureCurrentUser(); } catch { }
        showPage('page-dashboard');
        setDashView('automatch', { noScroll: true });
        loadAutoMatch({ silent: true });
    }

    function openFirstMatchFlow() {
        showPage('page-dashboard');
        setDashView('crear', { noAutoLoad: true, noScroll: true });
        // Focus the MVP request card
        setTimeout(() => {
            const card = $('card-mvp-request');
            if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const title = $('req-title');
            if (title) title.focus();
        }, 60);
    }

    async function startFirstMatch() {
        if (KHApi.getToken()) {
            // Best effort: hydrate user so roles/actions render correctly
            await ensureCurrentUser();
            openFirstMatchFlow();
            // Best effort refresh
            loadMatches();
            loadCreations();
            return;
        }
        postLoginAction = 'first_match';
        openLogin();
    }

    function closeLogin(event) {
        if (event && event.target !== $('modal-login')) return;
        hide($('modal-login'));
        showAuthChooser();
    }

    function closeLoginDirect() {
        hide($('modal-login'));
        showAuthChooser();
    }

    /* ── App download modal ─────────────────────────────────────────────────── */
    const APP_DOWNLOAD_PROMPT_KEY = 'kh_app_download_prompt_v1';

    function openAppDownloadModal() {
        show($('modal-app-download'));
        setTimeout(() => {
            const btn = document.querySelector('#modal-app-download .btn');
            if (btn) btn.focus();
        }, 80);
    }

    function closeAppDownloadModal(event) {
        if (event && event.target !== $('modal-app-download')) return;
        hide($('modal-app-download'));
    }

    function shouldPromptAppDownload() {
        try {
            if (localStorage.getItem(APP_DOWNLOAD_PROMPT_KEY) === '1') return false;
        } catch { }
        const landing = document.getElementById('page-landing');
        if (!landing || landing.classList.contains('hidden')) return false;
        return true;
    }

    function maybePromptAppDownload() {
        if (!shouldPromptAppDownload()) return;
        try { localStorage.setItem(APP_DOWNLOAD_PROMPT_KEY, '1'); } catch { }
        openAppDownloadModal();
    }

    async function submitLogin(event) {
        event.preventDefault();
        const btn = $('btn-login');
        const email = $('login-email').value.trim();
        const pass = $('login-pass').value;

        if (!email || !pass) {
            toast('Escribe tu email y contraseña', 'error');
            return;
        }

        setLoading(btn, true);
        try {
            const { user, token } = await KHApi.login(email, pass);
            toast(`Bienvenido, ${user.display_name} 👑`, 'success');
            closeLoginDirect();
            loadUserInfo(user);

            // If the backend tracks email verification, prompt users early.
            if (user && (user.is_verified === false || user.is_verified === 0)) {
                toast('Aún falta verificar tu email. Revisa tu correo o vuelve a enviarlo desde tu perfil.', 'warn');
            }

            showPage('page-dashboard');
            enterDashboardDefault(user);
            loadMatches();
            loadCreations();
            loadFeed();
            loadPremiumProgress();
            loadBadgesMine();
            loadLeaderboard();

            if (postLoginAction === 'nav_search' && pendingSearchQuery) {
                const q = pendingSearchQuery;
                pendingSearchQuery = null;
                postLoginAction = null;
                setDashView('explorar');
                applyFeedSearch(q, { scroll: true });
                maybeStartTutorialAfterLogin();
                return;
            }

            if (postLoginAction === 'automatch_invite') {
                postLoginAction = null;
                openAutomatchFromInvite();
                return;
            }

            if (postLoginAction === 'first_match') {
                postLoginAction = null;
                openFirstMatchFlow();
                return;
            }

            if (postLoginAction === 'go_dashboard_create') {
                postLoginAction = null;
                setDashView('crear');
                maybeStartTutorialAfterLogin();
                return;
            }

            maybeStartTutorialAfterLogin();
        } catch (err) {
            // Show more context for common failures (CORS/network vs 4xx)
            const status = err && err.status;
            const apiErr = err && err.data && (err.data.error || err.data.message);
            let msg = apiErr || err.message || 'No se pudo iniciar sesión';
            if (status === 401) msg = 'Email o contraseña incorrectos.';
            if (status === 403) msg = 'Tu cuenta no tiene acceso o está suspendida.';
            if (status === 429) msg = 'Demasiados intentos. Espera unos minutos y prueba de nuevo.';
            toast(msg, 'error');
            try { console.error('Login error', err); } catch { }
        } finally {
            setLoading(btn, false);
        }
    }

    async function submitRegister(event) {
        event.preventDefault();
        const btn = $('btn-register');
        const displayName = ($('reg-name') && $('reg-name').value || '').trim();
        const email = ($('reg-email') && $('reg-email').value || '').trim();
        const pass = ($('reg-pass') && $('reg-pass').value || '');
        const location = ($('reg-location') && $('reg-location').value || '').trim();

        if (!displayName || !email || !pass) {
            toast('Completa nombre, email y contraseña', 'error');
            return;
        }

        if (pass.length < 8) {
            toast('La contraseña debe tener al menos 8 caracteres', 'error');
            return;
        }

        setLoading(btn, true);
        try {
            const payload = {
                display_name: displayName,
                email,
                password: pass,
                location_text: location || undefined,
            };
            const { user } = await KHApi.register(payload);
            toast(`Cuenta creada. Bienvenido, ${user.display_name} 👑`, 'success');
            closeLoginDirect();
            loadUserInfo(user);

            // After signup, send verify email automatically (best effort).
            try {
                const out = await KHApi.requestVerifyEmail();
                if (out && out.email_sent) toast('Te enviamos el email de verificación. Revisa tu bandeja.', 'success');
                else toast('No pudimos enviar el email de verificación. Puedes solicitarlo desde tu perfil.', 'warn');
            } catch {
                toast('No pudimos enviar el email de verificación. Puedes solicitarlo desde tu perfil.', 'warn');
            }

            showPage('page-dashboard');
            enterDashboardDefault(user);
            loadMatches();
            loadCreations();
            loadFeed();
            loadPremiumProgress();
            loadBadgesMine();
            loadLeaderboard();

            if (postLoginAction === 'automatch_invite') {
                postLoginAction = null;
                openAutomatchFromInvite();
                return;
            }

            if (postLoginAction === 'first_match') {
                postLoginAction = null;
                openFirstMatchFlow();
            } else {
                maybeStartTutorialAfterLogin();
            }
        } catch (err) {
            toast(err.message || 'No se pudo crear la cuenta', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    function loadUserInfo(user) {
        if (!user) return;
        currentUser = user;
        setLandingSessionUI(user);
        const rawName = String(user.display_name || '').trim();
        const parts = rawName ? rawName.split(/\s+/).filter(Boolean) : [];
        const displayName = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : (rawName || '—');
        $('user-name').textContent = displayName;
        const userTier = $('user-tier');
        if (userTier) {
            userTier.textContent = navTierLabel(user.premium_tier);
            userTier.classList.remove('nav-account-tier--silver');
            if (user.premium_tier && user.premium_tier !== 'free') {
                userTier.classList.add('nav-account-tier--silver');
            }
        }
        $('user-avatar').textContent = initials(rawName || displayName || '?');

        const dashName = document.getElementById('dash-menu-name');
        if (dashName) {
            const shortName = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : (rawName || 'Cuenta');
            dashName.textContent = shortName || 'Cuenta';
        }

        updateNavAccount(user);

        const isVerified = user.is_verified === true || user.is_verified === 1;
        const v = document.getElementById('user-verified');
        if (v) v.classList.toggle('hidden', !isVerified);

        // "Reenviar verificación" button: solo visible si el email NO está verificado
        const verifyBtn = document.getElementById('btn-verify-resend');
        if (verifyBtn) verifyBtn.classList.toggle('hidden', isVerified);

        // Indicador de estado de verificación en el perfil
        const verifyStatus = document.getElementById('profile-verify-status');
        if (verifyStatus) {
            verifyStatus.textContent = isVerified ? '✓ Email verificado' : '⚠ Email sin verificar';
            verifyStatus.className = isVerified ? 'profile-verify-ok' : 'profile-verify-warn';
        }

        // Hide/Show premium CTAs depending on status
        const premium = isPremiumActive(user);
        const btnLanding = document.getElementById('btn-premium-landing');
        if (btnLanding) btnLanding.classList.toggle('hidden', premium);
        const btnAm = document.getElementById('btn-am-premium');
        if (btnAm) btnAm.classList.toggle('hidden', premium);

        // Primary nav: show AutoMatch only for Premium
        const primaryAm = document.getElementById('dash-primary-automatch');
        if (primaryAm) primaryAm.classList.toggle('hidden', !premium);
        // Show balance from user object if available
        if (user.points_balance !== undefined) {
            animateCounter($('balance-value'), user.points_balance);
        }

        // Profile card
        if ($('profile-name')) $('profile-name').value = user.display_name || '';
        if ($('profile-bio')) $('profile-bio').value = user.bio || '';
        if ($('profile-location')) $('profile-location').value = user.location_text || '';
        const bioPreview = $('profile-bio-preview');
        if (bioPreview) {
            bioPreview.textContent = user.bio ? String(user.bio) : 'Aún no has añadido una bio.';
        }
        if ($('profile-points')) $('profile-points').textContent = (user.points_balance != null) ? String(user.points_balance) : '—';
        if ($('profile-rating')) {
            const r = user.rating_avg;
            $('profile-rating').textContent = (r == null) ? '—' : Number(r).toFixed(1);
        }
        if ($('profile-rating-count')) $('profile-rating-count').textContent = (user.rating_count != null) ? String(user.rating_count) : '—';

        renderProfileHero(user);
        renderProfilePhotos(user.profile_photos);
    }

    function normalizeProfilePhotos(raw) {
        if (Array.isArray(raw)) return raw;
        if (!raw) return [];
        try {
            const p = JSON.parse(String(raw));
            return Array.isArray(p) ? p : [];
        } catch {
            return [];
        }
    }

    function renderProfileHero(user) {
        if (!user) return;
        const name = user.display_name || '—';
        const loc = String(user.location_text || '').trim();
        const rep = (user.points_balance != null) ? Number(user.points_balance) : null;
        const rating = user.rating_avg;
        const ratingCount = user.rating_count;
        const lvl = repLevelLabel(rep || 0);
        const verified = user.is_verified === true || user.is_verified === 1;

        const avatarEl = $('profile-hero-avatar');
        if (avatarEl) {
            const photos = normalizeProfilePhotos(user.profile_photos);
            const photo = photos.find(p => p && p.url);
            const url = (photo && photo.url) ? String(photo.url) : (user.avatar_url ? String(user.avatar_url) : '');
            if (url) {
                avatarEl.innerHTML = `<img src="${escapeHtml(url)}" alt="" loading="lazy" />`;
            } else {
                avatarEl.innerHTML = '<img src="img/corona2.png" alt="" aria-hidden="true" />';
            }
        }

        if ($('profile-hero-name')) $('profile-hero-name').textContent = name;
        if ($('profile-hero-sub')) $('profile-hero-sub').textContent = loc || 'Zona pendiente';
        const tierEl = $('profile-hero-tier');
        if (tierEl) {
            tierEl.innerHTML = '';
            const tierPill = document.createElement('span');
            tierPill.className = 'profile-hero-pill';
            tierPill.textContent = tierLabel(user.premium_tier);
            const lvlPill = document.createElement('span');
            lvlPill.className = 'profile-hero-pill';
            lvlPill.textContent = lvl;
            tierEl.appendChild(tierPill);
            tierEl.appendChild(lvlPill);
        }

        if ($('profile-hero-level')) $('profile-hero-level').textContent = lvl;
        if ($('profile-hero-rep')) $('profile-hero-rep').textContent = (rep == null) ? '—' : String(rep);
        if ($('profile-hero-rep-score')) $('profile-hero-rep-score').textContent = (rep == null) ? '—' : String(rep);
        if ($('profile-hero-rating')) $('profile-hero-rating').textContent = (rating == null) ? '—' : Number(rating).toFixed(1);
        if ($('profile-hero-rating-count')) $('profile-hero-rating-count').textContent = (ratingCount == null) ? '—' : String(ratingCount);

        const verifiedBadge = $('profile-hero-verified');
        if (verifiedBadge) verifiedBadge.classList.toggle('hidden', !verified);

        const verifyPill = $('profile-hero-verify-pill');
        if (verifyPill) {
            verifyPill.textContent = verified ? 'Verificada' : 'Pendiente';
            verifyPill.classList.toggle('warn', !verified);
        }
    }

    function renderProfilePhotos(raw) {
        const wrap = $('profile-photos-grid');
        if (!wrap) return;
        const photos = normalizeProfilePhotos(raw);

        wrap.innerHTML = '';
        if (!photos.length) {
            wrap.innerHTML = '<div class="ledger-empty">Aún no hay fotos</div>';
            return;
        }

        photos.slice(0, 2).forEach(p => {
            const el = document.createElement('div');
            el.className = 'profile-photo';
            const url = (p && p.url) ? String(p.url) : '';
            const id = (p && p.id) ? String(p.id) : '';
            el.innerHTML = `
              <img src="${escapeHtml(url)}" alt="Foto de perfil" loading="lazy" />
              <button class="photo-remove" type="button" aria-label="Eliminar foto" onclick="KHApp.deleteProfilePhoto('${escapeHtml(id)}')">✕</button>
            `;
            wrap.appendChild(el);
        });
    }

    function pickProfilePhoto() {
        const inp = $('profile-photo-input');
        if (inp) inp.click();
    }

    async function uploadProfilePhoto(event) {
        const inp = event && event.target;
        const file = inp && inp.files && inp.files[0];
        if (!file) return;
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }

        try {
            await ensureCurrentUser();
            await KHApi.uploadMyProfilePhoto(file);
            const user = await KHApi.getMe();
            loadUserInfo(user);
            toast('Foto subida ✓', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo subir la foto', 'error');
        } finally {
            try { if (inp) inp.value = ''; } catch { }
        }
    }

    async function deleteProfilePhoto(photoId) {
        if (!photoId) return;
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }

        try {
            await KHApi.deleteMyProfilePhoto(photoId);
            const user = await KHApi.getMe();
            loadUserInfo(user);
            toast('Foto eliminada', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo eliminar la foto', 'error');
        }
    }

    /* ── Listing photos (requests/offers) ─────────────────────────────────── */
    function renderListingPhotos(gridId, media, deleteHandlerName, listingId) {
        const wrap = $(gridId);
        if (!wrap) return;
        const items = Array.isArray(media) ? media : [];
        wrap.innerHTML = '';
        if (!items.length) {
            wrap.innerHTML = '<div class="ledger-empty">Aún no hay fotos</div>';
            return;
        }

        items.slice(0, 6).forEach(p => {
            const el = document.createElement('div');
            el.className = 'profile-photo';
            const url = (p && p.url) ? String(p.url) : '';
            const id = (p && p.id) ? String(p.id) : '';
            el.innerHTML = `
              <img src="${escapeHtml(url)}" alt="Foto" loading="lazy" />
              <button class="photo-remove" type="button" aria-label="Eliminar foto" onclick="KHApp.${deleteHandlerName}('${escapeHtml(listingId)}','${escapeHtml(id)}')">✕</button>
            `;
            wrap.appendChild(el);
        });
    }

    function pickRequestPhoto() {
        const inp = $('req-photo-input');
        if (inp) inp.click();
    }

    async function uploadRequestPhoto(event) {
        const inp = event && event.target;
        const file = inp && inp.files && inp.files[0];
        if (!file) return;
        if (!lastCreatedRequest || !lastCreatedRequest.id) {
            toast('Primero crea una solicitud', 'error');
            return;
        }
        try {
            await KHApi.uploadRequestPhoto(lastCreatedRequest.id, file);
            const fresh = await KHApi.apiFetch('/requests/' + encodeURIComponent(lastCreatedRequest.id));
            lastCreatedRequest = fresh;
            renderListingPhotos('req-photos-grid', fresh.media_urls, 'deleteRequestPhoto', lastCreatedRequest.id);
            toast('Foto subida ✓', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo subir la foto', 'error');
        } finally {
            try { if (inp) inp.value = ''; } catch { }
        }
    }

    async function deleteRequestPhoto(requestId, photoId) {
        if (!requestId || !photoId) return;
        try {
            const out = await KHApi.deleteRequestPhoto(requestId, photoId);
            renderListingPhotos('req-photos-grid', out.media_urls, 'deleteRequestPhoto', requestId);
            toast('Foto eliminada', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo eliminar', 'error');
        }
    }

    function pickOfferPhoto() {
        const inp = $('off-photo-input');
        if (inp) inp.click();
    }

    async function uploadOfferPhoto(event) {
        const inp = event && event.target;
        const file = inp && inp.files && inp.files[0];
        if (!file) return;
        if (!lastCreatedOffer || !lastCreatedOffer.id) {
            toast('Primero publica una oferta', 'error');
            return;
        }
        try {
            await KHApi.uploadOfferPhoto(lastCreatedOffer.id, file);
            const fresh = await KHApi.apiFetch('/offers/' + encodeURIComponent(lastCreatedOffer.id));
            lastCreatedOffer = fresh;
            renderListingPhotos('off-photos-grid', fresh.media_urls, 'deleteOfferPhoto', lastCreatedOffer.id);
            toast('Foto subida ✓', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo subir la foto', 'error');
        } finally {
            try { if (inp) inp.value = ''; } catch { }
        }
    }

    async function deleteOfferPhoto(offerId, photoId) {
        if (!offerId || !photoId) return;
        try {
            const out = await KHApi.deleteOfferPhoto(offerId, photoId);
            renderListingPhotos('off-photos-grid', out.media_urls, 'deleteOfferPhoto', offerId);
            toast('Foto eliminada', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo eliminar', 'error');
        }
    }

    async function loadProfile() {
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }
        const btn = $('btn-profile-reload');
        if (btn) setLoading(btn, true);
        try {
            const user = await KHApi.getMe();
            loadUserInfo(user);
            const bio = ($('profile-bio-preview') && $('profile-bio-preview').textContent || '').trim();
            if (!bio || bio === '—') {
                const fallback = 'Vecino activo en la comunidad. Me gusta resolver problemas prácticos y acompañar a la gente en el día a día, desde reparaciones rápidas hasta orientación básica. Prefiero acuerdos claros, respuestas rápidas y ayudar con lo que sé.';
                const el = $('profile-bio-preview');
                if (el) el.textContent = fallback;
            }
            loadProfileAvailability();
            await loadFavoritesSection({ silent: true });
            loadBadgesMine();
            loadPremiumProgress();
            loadProfileHeroRank();
            loadProfileHeroActivity();
            toast('Perfil actualizado', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo cargar el perfil', 'error');
        } finally {
            if (btn) setLoading(btn, false);
        }
    }

    async function loadProfileAvailability() {
        const wd = $('profile-availability-weekday');
        const we = $('profile-availability-weekend');
        const note = $('profile-availability-note');
        if (!wd || !we) return;
        try {
            const settings = await KHApi.automatchGetSettings();
            const fmt = (start, end, allDayLabel) => {
                if (!start || !end) return '—';
                if (start === '00:00' && end === '23:59') return allDayLabel;
                return `${start} - ${end}`;
            };
            wd.textContent = fmt(settings.weekday_start, settings.weekday_end, 'Todo el día');
            we.textContent = fmt(settings.weekend_start, settings.weekend_end, 'Todo el día');
            if (note) note.textContent = 'Horarios sincronizados con AutoMatch.';
        } catch {
            if (note) note.textContent = 'Gestiona horarios y alertas desde AutoMatch.';
        }
    }

    async function loadProfileHeroRank() {
        const el = $('profile-hero-rank');
        if (!el || !KHApi.getToken()) return;
        try {
            const me = await KHApi.leaderboardMe({});
            if (me && me.rank && me.total) {
                el.textContent = `Ranking comunitario: #${me.rank} de ${me.total}`;
            } else {
                el.textContent = 'Ranking comunitario: —';
            }
        } catch {
            el.textContent = 'Ranking comunitario: —';
        }
    }

    async function loadProfileHeroActivity() {
        if (!KHApi.getToken()) return;
        try {
            const out = await KHApi.getMyPoints();
            renderProfileHeroActivity(out && out.ledger, out && out.balance);
        } catch {
            const wrap = $('profile-hero-activity');
            if (wrap) wrap.innerHTML = '<div class="ledger-empty">Sin actividad aún</div>';
        }
    }

    function scrollToProfileSection(id) {
        if (!id) return;
        const root = document.querySelector('main.dashboard');
        if (root && root.dataset.view !== 'perfil') {
            setDashView('perfil', { noScroll: true });
        }
        const el = document.getElementById(id);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function submitProfile(event) {
        event.preventDefault();
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }

        const btn = $('btn-profile-save');
        setLoading(btn, true);
        try {
            const display_name = ($('profile-name').value || '').trim();
            const bio = ($('profile-bio').value || '').trim();
            const location_text = ($('profile-location').value || '').trim();

            const body = {
                display_name,
                bio: bio || null,
                location_text: location_text || null,
            };

            const user = await KHApi.updateMe(body);
            loadUserInfo(user);
            toast('Cambios guardados ✓', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo guardar', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    async function resendVerifyEmail() {
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }
        const btn = $('btn-verify-resend');
        if (btn) setLoading(btn, true);
        try {
            const out = await KHApi.requestVerifyEmail();
            if (out && out.already_verified) {
                toast('Tu email ya está verificado ✓', 'success');
            } else if (out && out.email_sent) {
                toast('Email de verificación reenviado. Revisa tu correo.', 'success');
            } else if (out && out.implemented === false) {
                toast('No se pudo enviar el email de verificación (config pendiente).', 'warn');
            } else {
                toast('No se pudo enviar el email de verificación. Inténtalo más tarde.', 'warn');
            }
        } catch (err) {
            toast((err && err.message) || 'No se pudo enviar el email de verificación', 'error');
        } finally {
            if (btn) setLoading(btn, false);
        }
    }

    async function startPremiumCheckout(interval) {
        const chosen = (interval === 'month' || interval === 'year') ? interval : premiumInterval;
        if (!KHApi.getToken()) {
            toast('Inicia sesion para continuar', 'error');
            openLogin();
            return;
        }
        try {
            await ensureCurrentUser();
            await KHApi.createPremiumCheckout({ interval: chosen });
            toast('Stripe estara disponible proximamente', 'info');
        } catch (err) {
            // API returns 501 by design; apiFetch will throw. Show a friendly message.
            toast('Stripe estara disponible proximamente', 'info');
        }
    }

    async function tryUnlockPremiumByReputation() {
        if (!KHApi.getToken()) {
            toast('Inicia sesion para continuar', 'error');
            openLogin();
            return;
        }
        try {
            const out = await KHApi.premiumUnlock();
            toast('AutoMatch Premium desbloqueado ✓', 'success');
            // Refresh user info
            const user = await KHApi.getMe();
            loadUserInfo(user);
            loadCreations();
            loadMatches();
            return out;
        } catch (err) {
            toast(err.message || 'Aun no tienes reputacion suficiente', 'error');
        }
    }

    async function loadPremiumProgress() {
        if (!KHApi.getToken()) return;
        try {
            const e = await KHApi.premiumEligibility();
            renderPremiumProgress(e);
        } catch {
            // ignore
        }
    }

    function renderPremiumProgress(e) {
        if (!e) return;
        const rep = Number(e.reputation || 0);
        const th = Number(e.threshold || 1000);
        const liteDays = Number(e.premium_lite_days || 7);
        const liteListingDays = Number(e.premium_lite_listing_days || 7);
        const pct = Math.max(0, Math.min(100, Math.round((rep / Math.max(1, th)) * 100)));

        if ($('premium-rep')) $('premium-rep').textContent = String(rep);
        if ($('premium-th')) $('premium-th').textContent = String(th);
        if ($('premium-progress-fill')) $('premium-progress-fill').style.width = pct + '%';
        if ($('premium-progress-badge')) {
            $('premium-progress-badge').textContent = e.premium_active ? 'AutoMatch Premium activo' : (pct + '%');
        }

        if ($('profile-hero-premium-mini')) $('profile-hero-premium-mini').textContent = `${rep}/${th}`;
        if ($('profile-hero-premium-fill')) $('profile-hero-premium-fill').style.width = pct + '%';

        const btn = $('btn-premium-unlock');
        if (btn) {
            btn.disabled = !e.eligible || e.premium_active;
            btn.textContent = e.premium_active ? 'Activado' : 'Desbloquear AutoMatch Premium';
        }

        if ($('premium-progress-foot')) {
            if (e.premium_active) {
                $('premium-progress-foot').textContent = `AutoMatch Premium activo: AutoMatch ${liteDays} dias · publicaciones ${liteListingDays} dias.`;
            } else {
                const left = Math.max(0, th - rep);
                $('premium-progress-foot').textContent = left === 0
                    ? 'Listo para desbloquear AutoMatch Premium.'
                    : `Te faltan ${left} de reputacion para desbloquear AutoMatch Premium.`;
            }
        }

        if ($('profile-hero-premium-foot')) {
            if (e.premium_active) {
                $('profile-hero-premium-foot').textContent = `AutoMatch Premium activo: AutoMatch ${liteDays} dias · publicaciones ${liteListingDays} dias.`;
            } else {
                const left = Math.max(0, th - rep);
                $('profile-hero-premium-foot').textContent = left === 0
                    ? 'Listo para desbloquear AutoMatch Premium.'
                    : `Faltan ${left} de reputacion para desbloquear AutoMatch Premium.`;
            }
        }
    }

    async function loadLeaderboard() {
        const btn = $('btn-leaderboard');
        if (btn) setLoading(btn, true);
        try {
            const data = await KHApi.leaderboard({ limit: 10, offset: 0 });
            const rows = (data && data.data) || [];
            const wrap = $('leaderboard-list');
            if (!wrap) return;
            wrap.innerHTML = '';
            if (!rows.length) {
                wrap.innerHTML = '<div class="ledger-empty">Aún no hay ranking</div>';
                return;
            }

            rows.forEach((u, idx) => {
                const el = document.createElement('div');
                const isMe = currentUser && u.id === currentUser.id;
                el.className = 'leaderboard-item' + (isMe ? ' me' : '');
                const tier = (u.premium_tier && u.premium_tier !== 'free')
                    ? (u.premium_tier === 'premium_lite' ? 'premium_lite' : 'premium')
                    : '';
                const badgeCount = Number(u.badge_count || 0);
                const rep = Number(u.points_balance || 0);
                const rating = (u.rating_avg || 0).toFixed(1);

                el.innerHTML = `
                  <div class="leaderboard-left">
                    <span class="leaderboard-rank">${idx + 1}</span>
                    <div style="min-width:0;">
                      <div class="leaderboard-name">${escapeHtml(u.display_name || '—')}</div>
                      <div class="leaderboard-meta">★ ${rating} · ${badgeCount} insignias · ${rep} rep</div>
                    </div>
                  </div>
                  <div class="leaderboard-right">
                    ${tier ? '<span class="lb-chip premium">' + (tier === 'premium_lite' ? 'AutoMatch Premium' : 'Premium') + '</span>' : ''}
                  </div>
                `;
                wrap.appendChild(el);
            });
        } catch (err) {
            const wrap = $('leaderboard-list');
            if (wrap) wrap.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">No se pudo cargar</div>';
        } finally {
            if (btn) setLoading(btn, false);
        }
    }

    /* ── Ranking modal (public) ─────────────────────────────────────────────── */
    function repLevelLabel(rep) {
        const r = Number(rep || 0);
        if (r >= 1000) return 'Leyenda';
        if (r >= 500) return 'Experto';
        if (r >= 250) return 'Veterano';
        if (r >= 100) return 'Vecino Top';
        return 'Vecino';
    }

    function initialsForName(name) {
        const s = String(name || '').trim();
        if (!s) return '—';
        const parts = s.split(/\s+/).filter(Boolean);
        const a = (parts[0] || '').slice(0, 1);
        const b = (parts.length > 1 ? parts[parts.length - 1] : '').slice(0, 1);
        return (a + b).toUpperCase();
    }

    // Paleta de colores para avatares por posición
    const AVATAR_COLORS = [
        { bg: 'linear-gradient(135deg, #D4A942 0%, #C08A1E 100%)', color: '#fff' }, // #1 dorado
        { bg: 'linear-gradient(135deg, #8B98A8 0%, #6B7684 100%)', color: '#fff' }, // #2 plata
        { bg: 'linear-gradient(135deg, #A0785A 0%, #7D5A3C 100%)', color: '#fff' }, // #3 bronce
        { bg: 'linear-gradient(135deg, #7B5CF5 0%, #5E3FD0 100%)', color: '#fff' }, // #4 púrpura
        { bg: 'linear-gradient(135deg, #3B82C4 0%, #2563A0 100%)', color: '#fff' }, // #5 azul
        { bg: 'linear-gradient(135deg, #10927A 0%, #0B715F 100%)', color: '#fff' }, // #6 verde
        { bg: 'linear-gradient(135deg, #D06B3A 0%, #A8511F 100%)', color: '#fff' }, // naranja
        { bg: 'linear-gradient(135deg, #C2487A 0%, #9E2F5C 100%)', color: '#fff' }, // rosa
    ];

    function renderLeaderboardRows(wrap, rows, { highlightUserId, offsetBase = 0 } = {}) {
        if (!wrap) return;
        rows.forEach((u, idx) => {
            const el = document.createElement('div');
            const isMe = highlightUserId && u.id === highlightUserId;
            const absPos = offsetBase + idx + 1;
            const isTop = absPos === 1;
            el.className = 'leaderboard-item' + (isMe ? ' me' : '') + (isTop ? ' is-top' : '');
            el.tabIndex = 0;
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', `Ver perfil de ${String(u.display_name || 'vecino')}`);
            const tier = (u.premium_tier && u.premium_tier !== 'free')
                ? (u.premium_tier === 'premium_lite' ? 'premium_lite' : 'premium')
                : '';
            const badgeCount = Number(u.badge_count || 0);
            const rep = Number(u.points_balance || 0);
            const rating = (u.rating_avg || 0).toFixed(1);
            const lvl = repLevelLabel(rep);
            const showLevel = lvl !== 'Vecino'; // Vecino es el nivel base, no lo mostramos
            const levelBadge = showLevel ? `<span class="ranking-level-badge">${escapeHtml(lvl)}</span>` : `<span class="ranking-level-badge ranking-level-badge--base">${escapeHtml(lvl)}</span>`;

            // Avatar coloreado por posición o imagen real
            const colorIdx = Math.min(absPos - 1, AVATAR_COLORS.length - 1);
            const avColor = AVATAR_COLORS[colorIdx] || AVATAR_COLORS[AVATAR_COLORS.length - 1];
            const initials = escapeHtml(initialsForName(u.display_name));
            const avatarHtml = u.avatar_url
                ? `<img src="${escapeHtml(String(u.avatar_url))}" alt="" loading="lazy" />`
                : `<span class="ranking-avatar-initials">${initials}</span>`;
            const avatarStyle = u.avatar_url ? '' : `style="background:${avColor.bg};color:${avColor.color};"`;

            const premiumHtml = tier ? '<span class="ranking-chip--premium">Premium</span>' : '';
            el.innerHTML = `
              <div class="ranking-row">
                <div class="ranking-rank">${absPos}</div>
                <div class="ranking-avatar${isTop ? ' is-top' : ''}" aria-hidden="true" ${avatarStyle}>${avatarHtml}</div>
                <div class="ranking-content">
                  <div class="ranking-meta-row">
                    ${levelBadge}
                    <span class="ranking-stat-inline">${rep.toLocaleString('es-ES')} rep&nbsp;·&nbsp;${badgeCount}&nbsp;🏅&nbsp;${rating}&nbsp;★</span>
                    ${premiumHtml}
                  </div>
                  <div class="ranking-user">${escapeHtml(u.display_name || '—')}</div>
                </div>
              </div>
            `;

            el.addEventListener('click', () => openUserCard(u));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openUserCard(u);
                }
            });
            wrap.appendChild(el);
        });
    }

    function trapFocusInModal(modalEl) {
        if (!modalEl) return;
        if (rankingTrapHandler) return;
        rankingTrapHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            const items = Array.from(focusables).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first || !modalEl.contains(document.activeElement)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        modalEl.addEventListener('keydown', rankingTrapHandler);
    }

    function releaseFocusTrap(modalEl) {
        if (!modalEl) return;
        if (!rankingTrapHandler) return;
        modalEl.removeEventListener('keydown', rankingTrapHandler);
        rankingTrapHandler = null;
    }

    function initRankingState() {
        loadRankingPrefs();
        rankingOrigin = loadRankingOriginFromSession();
        if (rankingScope === 'near' && !rankingOrigin) rankingScope = 'global';
        rankingOffset = 0;
        rankingHasMore = false;
    }

    function openRanking(event) {
        if (event && event.preventDefault) event.preventDefault();

        if (!KHApi.getToken()) {
            toast('Inicia sesion para ver el ranking', 'info');
            openLogin();
            return;
        }

        rankingLastFocus = document.activeElement;

        initRankingState();
        syncRankingControls();
        show($('modal-ranking'));
        trapFocusInModal($('modal-ranking'));
        loadRankingModal({ reset: true });
        setTimeout(() => {
            const btn = document.querySelector('#modal-ranking .modal-close');
            if (btn) btn.focus();
        }, 60);
    }

    async function openRankingPage(event) {
        if (event && event.preventDefault) event.preventDefault();
        closeLandingMenu();

        if (!KHApi.getToken()) {
            toast('Inicia sesion para ver el ranking', 'info');
            openLogin();
            return;
        }

        await ensureCurrentUser();
        showPage('page-dashboard');
        initRankingState();
        syncRankingControls();
        setDashView('ranking', { noScroll: true, noAutoLoad: true });
        loadRankingPage({ reset: true });
        closeRankingModal();
    }

    function closeRankingModal(event) {
        const m = $('modal-ranking');
        if (!m) return;
        if (event && event.target && event.target !== m) return;
        saveRankingPrefs();
        releaseFocusTrap(m);
        hide(m);
        try {
            if (rankingLastFocus && rankingLastFocus.focus) rankingLastFocus.focus();
        } catch { }
        rankingLastFocus = null;
    }

    function syncRankingControls() {
        document.querySelectorAll('.rank-chip[data-scope]').forEach(b => {
            const active = b.getAttribute('data-scope') === rankingScope;
            b.classList.toggle('rank-chip--active', active);
            b.setAttribute('aria-pressed', String(active));
        });
        document.querySelectorAll('.rank-chip[data-level]').forEach(b => {
            const active = String(b.getAttribute('data-level') || 'all') === String(rankingMinLevel || 'all');
            b.classList.toggle('rank-chip--active', active);
            b.setAttribute('aria-pressed', String(active));
        });
        const selModal = $('rank-radius-modal');
        if (selModal) selModal.value = String(rankingRadiusKm);
        const selPage = $('rank-radius-page');
        if (selPage) selPage.value = String(rankingRadiusKm);

        const lvlModal = $('rank-level-modal');
        if (lvlModal) lvlModal.value = String(rankingMinLevel || 'all');
        const lvlPage = $('rank-level-page');
        if (lvlPage) lvlPage.value = String(rankingMinLevel || 'all');

        const qModal = $('rank-q-modal');
        if (qModal && qModal.value !== String(rankingQuery || '')) qModal.value = String(rankingQuery || '');
        const qPage = $('rank-q-page');
        if (qPage && qPage.value !== String(rankingQuery || '')) qPage.value = String(rankingQuery || '');
    }

    function getRankingEls(ctx) {
        const isPage = ctx === 'page';
        return {
            wrap: $(isPage ? 'leaderboard-list-page' : 'leaderboard-list-modal'),
            moreWrap: $(isPage ? 'ranking-more-wrap-page' : 'ranking-more-wrap'),
            moreBtn: $(isPage ? 'btn-ranking-more-page' : 'btn-ranking-more'),
            meBox: $(isPage ? 'ranking-me-page' : 'ranking-me'),
        };
    }

    function setRankingLevel(v, opts = {}) {
        const ctx = opts.page ? 'page' : 'modal';
        rankingMinLevel = String(v || 'all');
        rankingOffset = 0;
        rankingHasMore = false;
        saveRankingPrefs();
        syncRankingControls();
        if (ctx === 'page') loadRankingPage({ reset: true });
        else loadRankingModal({ reset: true });
    }

    function setRankingQuery(v, opts = {}) {
        const ctx = opts.page ? 'page' : 'modal';
        rankingQuery = String(v || '');
        saveRankingPrefs();
        if (rankingQueryTimer) { clearTimeout(rankingQueryTimer); rankingQueryTimer = null; }
        rankingQueryTimer = setTimeout(() => {
            rankingOffset = 0;
            rankingHasMore = false;
            syncRankingControls();
            if (ctx === 'page') loadRankingPage({ reset: true });
            else loadRankingModal({ reset: true });
        }, 220);
    }

    function setRankingScope(scope, opts = {}) {
        const ctx = opts.page ? 'page' : 'modal';
        rankingScope = (scope === 'near') ? 'near' : 'global';
        rankingOffset = 0;
        rankingHasMore = false;
        saveRankingPrefs();
        syncRankingControls();
        if (rankingScope === 'near' && !rankingOrigin) {
            const wrap = getRankingEls(ctx).wrap;
            if (wrap) wrap.innerHTML = '<div class="ledger-empty">Pulsa “Ubicación” para ver el ranking cerca de ti</div>';
            const more = getRankingEls(ctx).moreWrap;
            if (more) more.style.display = 'none';
            return;
        }
        if (ctx === 'page') loadRankingPage({ reset: true });
        else loadRankingModal({ reset: true });
    }

    function setRankingRadius(v, opts = {}) {
        const ctx = opts.page ? 'page' : 'modal';
        const n = Math.max(1, Math.min(10, Number(v || 5)));
        rankingRadiusKm = n;
        rankingOffset = 0;
        rankingHasMore = false;
        saveRankingPrefs();
        syncRankingControls();
        if (rankingScope === 'near' && rankingOrigin) {
            if (ctx === 'page') loadRankingPage({ reset: true });
            else loadRankingModal({ reset: true });
        }
    }

    function useMyLocation(opts = {}) {
        const ctx = opts.page ? 'page' : 'modal';
        if (!('geolocation' in navigator)) {
            toast('Tu navegador no soporta ubicación', 'error');
            return;
        }
        const wrap = getRankingEls(ctx).wrap;
        if (wrap) wrap.innerHTML = '<div class="ledger-empty">Obteniendo ubicación…</div>';

        navigator.geolocation.getCurrentPosition(
            pos => {
                rankingOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                saveRankingOriginToSession(rankingOrigin);
                rankingScope = 'near';
                rankingOffset = 0;
                rankingHasMore = false;
                saveRankingPrefs();
                syncRankingControls();
                if (ctx === 'page') loadRankingPage({ reset: true });
                else loadRankingModal({ reset: true });
            },
            err => {
                rankingOrigin = null;
                const msg = (err && err.code === 1)
                    ? 'Permiso denegado. Activa la ubicación para ver “cerca de mi”.'
                    : 'No se pudo obtener tu ubicación.';
                if (wrap) wrap.innerHTML = `<div class="ledger-empty" style="color:var(--danger)">${escapeHtml(msg)}</div>`;
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
        );
    }

    async function loadRanking(ctx, { reset = false } = {}) {
        const { wrap, moreWrap, moreBtn, meBox } = getRankingEls(ctx);
        if (!wrap) return;

        if (rankingLoading) return;
        rankingLoading = true;

        if (reset) {
            rankingOffset = 0;
            rankingHasMore = false;
            if (moreWrap) moreWrap.style.display = 'none';
            wrap.innerHTML = '<div class="ledger-empty">Cargando…</div>';
        } else {
            if (moreBtn) setLoading(moreBtn, true);
        }

        try {
            const offsetBase = rankingOffset;
            const params = { limit: rankingLimit, offset: rankingOffset };
            if (rankingMinLevel && rankingMinLevel !== 'all') params.min_level = String(rankingMinLevel);
            if (String(rankingQuery || '').trim()) params.q = String(rankingQuery || '').trim();
            if (rankingScope === 'near') {
                if (!rankingOrigin) {
                    wrap.innerHTML = '<div class="ledger-empty">Pulsa “Cerca de mi” para ver el ranking cerca de ti</div>';
                    if (moreWrap) moreWrap.style.display = 'none';
                    return;
                }
                params.lat = String(rankingOrigin.lat);
                params.lng = String(rankingOrigin.lng);
                params.radius_km = String(rankingRadiusKm);
                params.sort = 'distance';
            }

            const data = await KHApi.leaderboard(params);
            const rows = (data && data.data) || [];

            const meta = data && data.meta;
            rankingHasMore = !!(meta && meta.has_more);

            // If logged in, show exact rank.
            try {
                if (meBox) {
                    if (reset && currentUser && currentUser.id && KHApi.getToken()) {
                        const qs = {};
                        if (rankingScope === 'near' && rankingOrigin) {
                            qs.lat = String(rankingOrigin.lat);
                            qs.lng = String(rankingOrigin.lng);
                            qs.radius_km = String(rankingRadiusKm);
                        }
                        if (rankingMinLevel && rankingMinLevel !== 'all') qs.min_level = String(rankingMinLevel);
                        const me = await KHApi.leaderboardMe(qs);
                        if (me && me.rank && me.total) {
                            meBox.style.display = '';
                            meBox.textContent = `Tu posición: #${me.rank} de ${me.total}`;
                        } else {
                            meBox.style.display = 'none';
                        }
                    } else {
                        meBox.style.display = 'none';
                    }
                }
            } catch {
                if (meBox) meBox.style.display = 'none';
            }

            if (reset) wrap.innerHTML = '';
            if (reset && !rows.length) {
                const q = String(rankingQuery || '').trim();
                let emptyMsg = rankingScope === 'near'
                    ? 'Aún no hay ranking en este radio'
                    : 'Aún no hay ranking global';
                if (q) {
                    const qSafe = escapeHtml(q);
                    emptyMsg = rankingScope === 'near'
                        ? `Sin resultados para "${qSafe}" en este radio`
                        : `Sin resultados para "${qSafe}"`;
                }
                wrap.innerHTML = `<div class="ledger-empty">${emptyMsg}</div>`;
                if (moreWrap) moreWrap.style.display = 'none';
                return;
            }

            if (rows.length) {
                renderLeaderboardRows(wrap, rows, { highlightUserId: currentUser && currentUser.id, offsetBase });
                rankingOffset = rankingOffset + rows.length;
            }

            if (moreWrap) moreWrap.style.display = rankingHasMore ? '' : 'none';
        } catch (err) {
            if (reset) {
                wrap.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">No se pudo cargar el ranking</div>';
            } else {
                toast('No se pudo cargar mas', 'error');
            }
            if (moreWrap) moreWrap.style.display = 'none';
        }
        finally {
            rankingLoading = false;
            if (moreBtn) setLoading(moreBtn, false);
        }
    }

    function loadRankingModal(opts) {
        return loadRanking('modal', opts);
    }

    function loadRankingPage(opts) {
        return loadRanking('page', opts);
    }

    function rankingLoadMore(ctx) {
        if (!rankingHasMore) return;
        if (ctx === 'page') loadRankingPage({ reset: false });
        else loadRankingModal({ reset: false });
    }

    /* ── User card (mini profile) ───────────────────────────────────────── */
    let userCardLastFocus = null;
    let userCardTrapHandler = null;
    let userCardBadgesExpanded = false;

    function trapFocusInUserCard(modalEl) {
        if (!modalEl) return;
        if (userCardTrapHandler) return;
        userCardTrapHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            const items = Array.from(focusables).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first || !modalEl.contains(document.activeElement)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        modalEl.addEventListener('keydown', userCardTrapHandler);
    }

    function releaseFocusTrapUserCard(modalEl) {
        if (!modalEl) return;
        if (!userCardTrapHandler) return;
        modalEl.removeEventListener('keydown', userCardTrapHandler);
        userCardTrapHandler = null;
    }

    function openUserCard(u) {
        const m = $('modal-usercard');
        if (!m) return;
        userCardLastFocus = document.activeElement;
        try { m.__kh_user = u; } catch { }

        const name = String((u && u.display_name) || '—');
        const loc = String((u && u.location_text) || '').trim();
        const rep = Number((u && u.points_balance) || 0);
        const badges = Number((u && u.badge_count) || 0);
        const rating = Number((u && u.rating_avg) || 0).toFixed(1);
        const lvl = repLevelLabel(rep);
        const dist = (u && u.distance_km != null) ? `${Number(u.distance_km).toFixed(1)} km` : null;

        const av = $('usercard-avatar');
        if (av) {
            if (u && u.avatar_url) av.innerHTML = `<img src="${escapeHtml(String(u.avatar_url))}" alt="" loading="lazy" />`;
            else av.textContent = initialsForName(name);
        }
        if ($('usercard-name')) $('usercard-name').textContent = name;
        if ($('usercard-sub')) $('usercard-sub').textContent = loc ? loc : (dist ? `A ${dist}` : '—');
        if ($('usercard-level')) $('usercard-level').textContent = lvl;

        const v = $('usercard-verified');
        if (v) v.classList.toggle('hidden', !(u && (u.is_verified === true || u.is_verified === 1)));

        const stats = $('usercard-stats');
        if (stats) {
            const vOk = (u && (u.is_verified === true || u.is_verified === 1));
            stats.innerHTML = `
              <span class="usercard-chip${vOk ? ' ok' : ''}"><span class="i">${vOk ? '✓' : '!'}</span><strong>${vOk ? 'Verificado' : 'Sin verificar'}</strong></span>
              <span class="usercard-chip"><span class="i">📍</span><strong>${escapeHtml(loc || (dist ? dist : '—'))}</strong></span>
              <span class="usercard-chip"><span class="i">⚡</span><strong>${rep}</strong><span class="s">rep</span></span>
              <span class="usercard-chip"><span class="i">★</span><strong>${escapeHtml(String(rating))}</strong><span class="s">(${Number((u && u.rating_count) || 0)})</span></span>
              <span class="usercard-chip"><span class="i">🏅</span><strong>${badges}</strong><span class="s">insignias</span></span>
              <span class="usercard-chip warm"><span class="i">♛</span><strong>${escapeHtml(lvl)}</strong></span>
            `;
        }

        const grid = $('usercard-badges');
        if (grid) grid.innerHTML = '<div class="ledger-empty">Cargando…</div>';

        userCardBadgesExpanded = false;
        const btnMore = $('usercard-more');
        if (btnMore) {
            btnMore.classList.add('hidden');
            btnMore.textContent = 'Ver todas';
        }

        show(m);
        trapFocusInUserCard(m);
        setTimeout(() => {
            const btn = document.querySelector('#modal-usercard .modal-close');
            if (btn) btn.focus();
        }, 50);

        if (!u || !u.id) return;
        KHApi.listBadgesForUser(u.id).then((rows) => {
            const list = Array.isArray(rows) ? rows : (rows && rows.data) ? rows.data : [];
            if (!grid) return;
            if (!list.length) {
                grid.innerHTML = '<div class="ledger-empty">Aun no hay insignias</div>';
                return;
            }
            grid.innerHTML = '';

            const btnMore = $('usercard-more');
            if (btnMore) {
                btnMore.classList.toggle('hidden', list.length <= 6);
                btnMore.textContent = 'Ver todas';
            }

            const showN = userCardBadgesExpanded ? 24 : 6;
            list.slice(0, showN).forEach(b => {
                const item = document.createElement('div');
                item.className = 'usercard-badge';
                item.innerHTML = `
                  <div class="usercard-badge-name">${escapeHtml(b.name || b.slug || '—')}</div>
                  <div class="usercard-badge-desc">${escapeHtml(b.description || '')}</div>
                `;
                grid.appendChild(item);
            });

            // Add a compact "virtues" line (top 3 badge names) near header.
            try {
                const top = list.slice(0, 3).map(b => b.name || b.slug).filter(Boolean);
                const sub = $('usercard-sub');
                if (sub && top.length) {
                    const base = String((u && u.location_text) || '').trim();
                    const dist = (u && u.distance_km != null) ? `${Number(u.distance_km).toFixed(1)} km` : null;
                    const left = base ? base : (dist ? `A ${dist}` : '—');
                    sub.textContent = `${left} · ${top.join(' · ')}`;
                }
            } catch { }
        }).catch(() => {
            if (grid) grid.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">No se pudieron cargar las insignias</div>';
        });
    }

    function userCardToggleBadges() {
        userCardBadgesExpanded = !userCardBadgesExpanded;
        const btnMore = $('usercard-more');
        if (btnMore) btnMore.textContent = userCardBadgesExpanded ? 'Ver menos' : 'Ver todas';

        // Re-open rendering using whatever is currently in the modal (best-effort).
        // We keep it simple: trigger a refresh by clicking the badge button again isn't available,
        // so we rebuild by re-fetching with the current user id.
        try {
            const name = ($('usercard-name') && $('usercard-name').textContent) || '';
            // Try to reuse last opened user object if present
            // (we store it on the modal element to avoid global state).
            const m = $('modal-usercard');
            const u = m && m.__kh_user;
            if (u && u.id) openUserCard(u);
            else toast(name ? `Actualizado: ${name}` : 'Actualizado', 'info');
        } catch { }
    }

    function closeUserCard(event) {
        const m = $('modal-usercard');
        if (!m) return;
        if (event && event.target && event.target !== m) return;
        releaseFocusTrapUserCard(m);
        hide(m);
        try {
            if (userCardLastFocus && userCardLastFocus.focus) userCardLastFocus.focus();
        } catch { }
        userCardLastFocus = null;
    }

    /* ── Feed (Wallapop-like) ─────────────────────────────────────────────── */
    function catLabel(cat) {
        const map = {
            repairs: 'Reparaciones',
            packages: 'Paquetes',
            pets: 'Mascotas',
            cleaning: 'Limpieza',
            transport: 'Transporte',
            tech: 'Tecnología',
            gardening: 'Jardinería',
            care: 'Acompañamiento',
            tutoring: 'Clases',
            creative: 'Creativo',
            errands: 'Recados',
            other: 'Otros',
        };
        return map[cat] || String(cat || '');
    }

    function compLabel(comp) {
        const c = (comp === 'coins') ? 'cash' : (comp || 'cash');
        if (c === 'barter') return 'Trueque';
        if (c === 'altruistic') return 'Altruista';
        return 'Pago en €';
    }

    let favoritesMap = new Map();
    let favoritesList = [];
    let favoritesLoaded = false;

    function favKey(type, id) {
        return `${type}:${id}`;
    }

    function isFavorite(type, id) {
        return favoritesMap.has(favKey(type, id));
    }

    function normalizeFavoriteRows(rows) {
        return (rows || []).map(r => {
            const kind = r.kind === 'offer' ? 'offer' : 'request';
            const id = r.id || r.target_id;
            return {
                ...r,
                id,
                kind,
                premium_user: r.user_tier && r.user_tier !== 'free',
            };
        });
    }

    async function loadFavoritesSection(opts = {}) {
        if (opts && opts.preventDefault) opts.preventDefault();
        const silent = opts && opts.silent;
        const btn = $('btn-favorites-reload');
        if (btn && !silent) setLoading(btn, true);
        if (!KHApi.getToken()) {
            favoritesLoaded = false;
            favoritesMap = new Map();
            favoritesList = [];
            renderFavorites();
            if (btn && !silent) setLoading(btn, false);
            return;
        }
        try {
            const out = await KHApi.listFavorites({ limit: 80, offset: 0 });
            favoritesList = normalizeFavoriteRows((out && out.data) || []);
            favoritesMap = new Map(favoritesList.map(r => [favKey(r.kind === 'offer' ? 'offer' : 'request', r.id), r]));
            favoritesLoaded = true;
            renderFavorites();
        } catch (err) {
            if (!silent) toast('No se pudieron cargar favoritos', 'error');
        } finally {
            if (btn && !silent) setLoading(btn, false);
        }
    }

    async function ensureFavoritesLoaded() {
        if (!KHApi.getToken()) return;
        if (favoritesLoaded) return;
        await loadFavoritesSection({ silent: true });
    }

    function renderFavorites() {
        const wrap = $('favorites-grid');
        if (!wrap) return;
        renderFeedSection(favoritesList, 'favorites-grid', 'No tienes favoritos todavía');
    }

    function applyFeedSearch(query, opts = {}) {
        const q = String(query || '').trim();
        const input = $('feed-q');
        if (input) input.value = q;
        if (opts && opts.scroll) {
            const card = $('card-feed');
            if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        loadFeed();
    }

    function getFeedFilters() {
        const cat = ($('feed-filter-category') && $('feed-filter-category').value) || 'all';
        const distRaw = ($('feed-filter-distance') && $('feed-filter-distance').value) || 'all';
        const order = ($('feed-filter-order') && $('feed-filter-order').value) || 'recent';
        const dist = distRaw === 'all' ? null : Number(distRaw);
        return { cat, dist, order };
    }

    function applyFeedFilters(rows) {
        const out = Array.isArray(rows) ? rows.slice() : [];
        const { cat, dist, order } = getFeedFilters();

        let filtered = out;
        if (cat && cat !== 'all') {
            filtered = filtered.filter(r => String(r.category || 'other') === cat);
        }
        if (Number.isFinite(dist)) {
            filtered = filtered.filter(r => Number.isFinite(+r.distance_km) && +r.distance_km <= dist);
        }

        if (order === 'distance') {
            filtered.sort((a, b) => {
                const da = Number.isFinite(+a.distance_km) ? +a.distance_km : Number.POSITIVE_INFINITY;
                const db = Number.isFinite(+b.distance_km) ? +b.distance_km : Number.POSITIVE_INFINITY;
                return da - db;
            });
        } else if (order === 'rating') {
            filtered.sort((a, b) => Number(b.user_rating || 0) - Number(a.user_rating || 0));
        } else {
            filtered.sort((a, b) => {
                const ta = parseTime(a.created_at) || 0;
                const tb = parseTime(b.created_at) || 0;
                return tb - ta;
            });
        }

        return filtered;
    }

    async function submitForgotPassword(event) {
        event.preventDefault();
        const btn = $('btn-reset');
        const email = ($('reset-email') && $('reset-email').value || '').trim();
        if (!email) {
            toast('Escribe tu correo electrónico', 'error');
            return;
        }
        if (!email.includes('@')) {
            toast('Revisa tu correo electrónico', 'error');
            return;
        }
        try {
            if (btn) setLoading(btn, true);
            const out = await KHApi.forgotPassword(email);
            if (out && out.implemented === false) {
                toast(out.message || 'El envio de emails no esta configurado todavia.', 'error');
                return;
            }
            toast((out && out.message) || 'Si el correo existe, recibiras un enlace para restablecer la contrasena.', 'success');
            const loginEmail = $('login-email');
            if (loginEmail) loginEmail.value = email;
            showEmailAuth('login');
        } catch (err) {
            toast((err && err.message) || 'No se pudo enviar el email. Inténtalo de nuevo.', 'error');
        } finally {
            if (btn) setLoading(btn, false);
        }
    }

    async function loadFeed() {
        if (!KHApi.getToken()) return;
        if (feedDebounce) clearTimeout(feedDebounce);
        feedDebounce = setTimeout(async () => {
            const btn = $('btn-feed-refresh');
            if (btn) setLoading(btn, true);
            try {
                await ensureFavoritesLoaded();
                const q = (($('feed-q') && $('feed-q').value) || '').trim().toLowerCase();
                const out = await KHApi.feed({ limit: 60, offset: 0 });
                let rows = (out && out.data) || [];
                if (q) {
                    rows = rows.filter(r =>
                        String(r.title || '').toLowerCase().includes(q)
                        || String(r.category || '').toLowerCase().includes(q)
                        || String(r.location_text || '').toLowerCase().includes(q)
                        || String(r.user_name || '').toLowerCase().includes(q)
                    );
                }
                rows = applyFeedFilters(rows);
                renderFeed(rows, q);
                setFeedTab(activeFeedTab);
            } catch (err) {
                ['feed-need', 'feed-offer', 'feed-premium'].forEach(id => {
                    const wrap = $(id);
                    if (wrap) wrap.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">No se pudo cargar el muro</div>';
                });
            } finally {
                if (btn) setLoading(btn, false);
            }
        }, 350);
    }

    const FEED_TAB_KEY = 'kh_feed_tab';
    let activeFeedTab = 'need';

    function getSavedFeedTab() {
        try {
            const v = localStorage.getItem(FEED_TAB_KEY);
            return v || 'need';
        } catch {
            return 'need';
        }
    }

    function setFeedTab(tab) {
        activeFeedTab = tab;
        try { localStorage.setItem(FEED_TAB_KEY, tab); } catch { }
        document.querySelectorAll('.feed-tab').forEach(btn => {
            const isActive = btn.getAttribute('data-feed-tab') === tab;
            btn.classList.toggle('feed-tab--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        const need = document.querySelector('.feed-section--need');
        const offer = document.querySelector('.feed-section--offer');
        const premium = document.querySelector('.feed-section--premium');
        if (need) need.hidden = tab !== 'need';
        if (offer) offer.hidden = tab !== 'offer';
        if (premium) premium.hidden = tab !== 'premium';
    }

    function bindFeedTabs() {
        const tabs = document.querySelectorAll('.feed-tab');
        if (!tabs.length) return;
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-feed-tab') || 'need';
                setFeedTab(tab);
            });
        });
        setFeedTab(getSavedFeedTab());
    }

    function renderFeed(rows, q) {
        if (!rows) rows = [];
        const premium = rows.filter(r => r.premium_user);
        const need = rows.filter(r => r.kind !== 'offer' && !r.premium_user);
        const offer = rows.filter(r => r.kind === 'offer' && !r.premium_user);

        renderFeedSection(need.slice(0, 30), 'feed-need', 'No hay solicitudes todavía', q);
        renderFeedSection(offer.slice(0, 30), 'feed-offer', 'No hay ofertas todavía', q);
        renderFeedSection(premium.slice(0, 18), 'feed-premium', 'No hay anuncios premium en este momento', q);
    }

    function renderFeedSection(rows, wrapId, emptyMsg, q) {
        const wrap = $(wrapId);
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!rows || !rows.length) {
            const query = String(q || '').trim();
            if (query) {
                wrap.innerHTML = `<div class="ledger-empty">Sin resultados para "${escapeHtml(query)}"</div>`;
            } else {
                wrap.innerHTML = `<div class="ledger-empty">${emptyMsg || 'No hay resultados'}</div>`;
            }
            return;
        }

        rows.forEach(r => {
            const kind = r.kind === 'offer' ? 'offer' : 'request';
            const media = (r.media_urls && r.media_urls[0] && (r.media_urls[0].url || r.media_urls[0])) || '';
            const el = document.createElement('div');
            el.className = 'feed-card' + (r.premium_user ? ' is-premium' : '');
            const dist = (r.distance_km != null) ? `${r.distance_km} km` : (r.location_text ? 'cerca' : '—');
            const cat = String(r.category || 'other');
            const ico = inviteIcon(cat);
            const aiSrc = aiImageForCategory(cat);
            const mediaSrc = media || (aiSrc && aiSrc.jpg);
            const isCategoryCover = !media && !!aiSrc;
            const expiry = expiryInfo(r);
            const expiryHtml = expiry
                ? `<div class="feed-time" aria-label="${escapeHtml(expiry.label)}">
                    <div class="feed-time-bar"><span class="feed-time-fill" style="--p:${expiry.pct.toFixed(0)}%; --danger-start:${expiry.dangerStart.toFixed(0)}%; --warn-start:${expiry.warnStart.toFixed(0)}%"></span></div>
                    <div class="feed-time-label">${escapeHtml(expiry.label)}</div>
                  </div>`
                : '';
            let mediaStyle = '';
            if (mediaSrc) {
                const jpg = escapeHtml(String(mediaSrc));
                let style = `--feed-cover:url('${jpg}')`;
                if (isCategoryCover && aiSrc && aiSrc.webp) {
                    const webp = escapeHtml(String(aiSrc.webp));
                    style += `; --feed-cover-webp:image-set(url('${webp}') type('image/webp'), url('${jpg}') type('image/jpeg'))`;
                }
                mediaStyle = ` style="${style}"`;
            }

            const mediaClass = `feed-media${isCategoryCover ? ' feed-media--category' : ''}`;
            const favType = kind === 'offer' ? 'offer' : 'request';
            const favId = r.id;
            const favActive = isFavorite(favType, favId);
            el.innerHTML = `
              <div class="${mediaClass}"${mediaStyle}>
                <span class="feed-badge ${kind}">${kind === 'offer' ? 'OFERTA' : 'NECESIDAD'}</span>
                ${!mediaSrc ? `<div class="feed-hero" data-cat="${escapeHtml(cat)}"><span aria-hidden="true">${escapeHtml(ico)}</span></div>` : ''}
              </div>
              <div class="feed-body">
                <div class="feed-body-panel">
                  <div class="feed-title">${escapeHtml(r.title || '—')}</div>
                  <div class="feed-sub">
                    <span class="feed-pill">${escapeHtml(catLabel(cat))}</span>
                    <span class="feed-pill">${escapeHtml(compLabel(r.compensation_type))}</span>
                    <span class="feed-pill">📍 ${escapeHtml(dist)}</span>
                  </div>
                  <div class="feed-sub" style="margin-top:8px; opacity:.9;">
                    <button class="feed-pill feed-user" type="button" data-user="1">${escapeHtml(r.user_name || '—')}${r.user_verified ? ' ✓' : ''} · ★ ${(Number(r.user_rating || 0)).toFixed(1)}</button>
                    ${r.premium_user ? '<span class="feed-pill feed-pill--silver">AutoMatch Premium</span>' : ''}
                  </div>
                  ${expiryHtml}
                </div>
                <div class="feed-actions">
                  <button class="btn btn-primary btn-sm" type="button" data-feed-match="1">
                    ${kind === 'offer' ? 'Pedir esta ayuda' : 'Ofrecer mi ayuda'}
                  </button>
                  <button class="btn btn-ghost btn-sm" type="button" data-feed-how="1">Ver detalles</button>
                </div>
                <div class="feed-meta-actions">
                  <button class="favorite-btn${favActive ? ' is-active' : ''}" type="button" data-fav="1" data-fav-type="${favType}" data-fav-id="${escapeHtml(String(favId))}">
                    <span class="favorite-icon" aria-hidden="true">${favActive ? '★' : '☆'}</span>
                    <span>Favorito</span>
                  </button>
                  <button class="report-btn" type="button" data-feed-report="1" title="Reportar" aria-label="Reportar este contenido">
                    <span class="report-icon" aria-hidden="true">✕</span>
                    <span>Reportar</span>
                  </button>
                </div>
              </div>
            `;
            const btnUser = el.querySelector('button[data-user]');
            if (btnUser) {
                btnUser.addEventListener('click', async () => {
                    try {
                        const u = await KHApi.getUser(r.user_id);
                        openUserCard(u);
                    } catch {
                        toast('No se pudo cargar el perfil', 'error');
                    }
                });
            }

            const btnHow = el.querySelector('button[data-feed-how]');
            if (btnHow) {
                btnHow.addEventListener('click', () => {
                    openFeedDetails(r);
                });
            }

            const btnFav = el.querySelector('button[data-fav]');
            if (btnFav) {
                btnFav.addEventListener('click', async () => {
                    if (!KHApi.getToken()) {
                        toast('Inicia sesión para guardar favoritos', 'error');
                        openLogin();
                        return;
                    }
                    const type = btnFav.getAttribute('data-fav-type');
                    const id = btnFav.getAttribute('data-fav-id');
                    const key = favKey(type, id);
                    const active = favoritesMap.has(key);
                    try {
                        if (active) {
                            await KHApi.removeFavorite(type, id);
                            favoritesMap.delete(key);
                        } else {
                            await KHApi.addFavorite(type, id);
                            favoritesMap.set(key, { id, kind: type });
                        }
                        btnFav.classList.toggle('is-active', !active);
                        const icon = btnFav.querySelector('.favorite-icon');
                        if (icon) icon.textContent = active ? '☆' : '★';
                        if (document.querySelector('.dashboard')?.dataset.view === 'perfil') {
                            loadFavoritesSection({ silent: true });
                        }
                    } catch (err) {
                        toast('No se pudo actualizar favorito', 'error');
                    }
                });
            }

            const btnMatch = el.querySelector('button[data-feed-match]');
            if (btnMatch) {
                btnMatch.addEventListener('click', async () => {
                    if (!KHApi.getToken()) {
                        postLoginAction = 'go_dashboard_create';
                        openLogin();
                        return;
                    }
                    try {
                        await ensureCurrentUser();
                        await createMatchForFeedRow(r);
                    } catch (e) {
                        toast(e.message || 'No se pudo crear el match', 'error');
                    }
                });
            }

            const btnReport = el.querySelector('button[data-feed-report]');
            if (btnReport) {
                const targetType = kind;
                const targetId = r.id;
                btnReport.addEventListener('click', () => openReportModal(targetType, targetId));
            }

            wrap.appendChild(el);
        });
    }

    // Feed details modal (minimal, keeps existing design system)
    let feedDetailsRow = null;

    function closeFeedDetails(event) {
        if (event && event.target !== $('modal-feed-details')) return;
        hide($('modal-feed-details'));
        feedDetailsRow = null;
    }

    function normalizeFeedDetails(baseRow, detailRow, kind) {
        if (!detailRow) return baseRow;
        const userName = kind === 'offer' ? detailRow.provider_name : detailRow.seeker_name;
        const userRating = kind === 'offer' ? detailRow.provider_rating : detailRow.seeker_rating;
        const userTier = kind === 'offer' ? detailRow.provider_tier : detailRow.seeker_tier;
        const userId = kind === 'offer' ? detailRow.provider_id : detailRow.seeker_id;
        const premium = userTier && userTier !== 'free';
        return {
            ...baseRow,
            ...detailRow,
            user_name: userName || baseRow.user_name,
            user_rating: userRating != null ? userRating : baseRow.user_rating,
            user_tier: userTier || baseRow.user_tier,
            user_id: userId || baseRow.user_id,
            premium_user: premium || baseRow.premium_user,
            kind: kind,
        };
    }

    function renderFeedDetails(row) {
        const body = $('feed-details-body');
        const btn = $('btn-feed-details-match');
        const modalTitle = document.querySelector('#modal-feed-details .modal-title');
        if (!body || !btn) return;

        const kind = (row && row.kind) === 'offer' ? 'offer' : 'request';
        const title = escapeHtml((row && row.title) || '—');
        const desc = escapeHtml((row && row.description) || '');
        const catKey = String((row && row.category) || 'other');
        const cat = escapeHtml(catLabel(catKey));
        const comp = escapeHtml(compLabel(row && row.compensation_type));
        const locRaw = (row && row.location_text) || '';
        const loc = escapeHtml(locRaw || '—');
        const user = escapeHtml((row && row.user_name) || '—');
        const rating = Number((row && row.user_rating) || 0).toFixed(1);
        const dist = (row && row.distance_km != null) ? `${row.distance_km} km` : '';
        const media = (row && row.media_urls && row.media_urls[0] && (row.media_urls[0].url || row.media_urls[0])) || '';
        const aiSrc = aiImageForCategory(catKey);
        const mediaSrc = media || (aiSrc && aiSrc.jpg);
        let mediaStyle = '';
        if (mediaSrc) {
            const jpg = escapeHtml(String(mediaSrc));
            let style = `--feed-cover:url('${jpg}')`;
            if (!media && aiSrc && aiSrc.webp) {
                const webp = escapeHtml(String(aiSrc.webp));
                style += `; --feed-cover-webp:image-set(url('${webp}') type('image/webp'), url('${jpg}') type('image/jpeg'))`;
            }
            mediaStyle = ` style="${style}"`;
        }
        const icon = inviteIcon(catKey);
        const badgeLabel = (kind === 'offer') ? 'OFERTA' : 'NECESIDAD';
        if (modalTitle) {
            modalTitle.textContent = (kind === 'offer') ? 'Detalles de la oferta' : 'Detalles de la solicitud';
        }
        const expiry = expiryInfo(row);
        const expiryHtml = expiry
            ? `<div class="feed-time" aria-label="${escapeHtml(expiry.label)}">
                <div class="feed-time-bar"><span class="feed-time-fill" style="--p:${expiry.pct.toFixed(0)}%"></span></div>
                <div class="feed-time-label">${escapeHtml(expiry.label)}</div>
              </div>`
            : '';

        body.innerHTML = `
          <div class="feed-details-grid">
            <div class="feed-details-hero"${mediaStyle}>
              <div class="feed-details-badge ${kind}">${badgeLabel}</div>
              ${!mediaSrc ? `<div class="feed-details-hero-icon" aria-hidden="true">${escapeHtml(icon)}</div>` : ''}
              <div class="feed-details-hero-info">
                <div class="feed-details-hero-title">${title}</div>
                <div class="feed-details-hero-sub">${cat} · ${comp}</div>
              </div>
            </div>
            <div class="feed-details-info">
              <div class="feed-details-title">${title}</div>
              ${desc ? `<div class="feed-details-desc">${desc}</div>` : '<div class="feed-details-desc is-empty">Sin descripción disponible.</div>'}
              <div class="feed-details-chips">
                <span class="feed-pill">${cat}</span>
                <span class="feed-pill">${comp}</span>
                ${locRaw ? `<span class="feed-pill">📍 ${loc}</span>` : ''}
                ${dist ? `<span class="feed-pill">📏 ${escapeHtml(dist)}</span>` : ''}
              </div>
              <div class="feed-details-meta">
                ${row && row.premium_user ? '<div class="feed-details-meta-item">✨ Publicación AutoMatch Premium</div>' : ''}
                ${row && row.expires_at ? '<div class="feed-details-meta-item">⏱ Caducidad activa</div>' : ''}
              </div>
              <div class="feed-details-user">
                <button class="feed-pill feed-user" type="button" id="btn-feed-details-user">${user}${row && row.user_verified ? ' ✓' : ''}</button>
                <div class="feed-details-user-rating">★ ${rating}</div>
              </div>
              ${expiryHtml}
            </div>
          </div>
        `;

        const btnUser = $('btn-feed-details-user');
        if (btnUser) {
            btnUser.addEventListener('click', async () => {
                try {
                    const u = await KHApi.getUser(row.user_id);
                    openUserCard(u);
                } catch {
                    toast('No se pudo cargar el perfil', 'error');
                }
            }, { once: true });
        }

        btn.querySelector('.btn-label').textContent = (kind === 'offer') ? 'Pedir esta ayuda' : 'Ofrecer mi ayuda';
    }

    function openFeedDetails(row) {
        feedDetailsRow = row || null;
        if (!row) return;
        renderFeedDetails(row);
        show($('modal-feed-details'));

        const kind = (row && row.kind) === 'offer' ? 'offer' : 'request';
        const detailUrl = kind === 'offer'
            ? '/offers/' + encodeURIComponent(row.id)
            : '/requests/' + encodeURIComponent(row.id);
        const currentId = row.id;

        KHApi.apiFetch(detailUrl)
            .then(data => {
                const detail = data && (data.data || data);
                if (!detail) return;
                if (!feedDetailsRow || feedDetailsRow.id !== currentId) return;
                const merged = normalizeFeedDetails(row, detail, kind);
                feedDetailsRow = merged;
                renderFeedDetails(merged);
            })
            .catch(() => { });
    }

    async function feedDetailsCreateMatch() {
        const row = feedDetailsRow;
        if (!row) return;
        if (!KHApi.getToken()) {
            postLoginAction = 'go_dashboard_create';
            openLogin();
            return;
        }
        try {
            closeFeedDetails();
            await createMatchForFeedRow(row);
        } catch (e) {
            toast(e.message || 'No se pudo crear el match', 'error');
        }
    }

    /* ── AutoMatch (Premium) ─────────────────────────────────────────────── */
    const AM_CATS = [
        { id: 'repairs', label: 'Reparaciones', icon: '🔧' },
        { id: 'packages', label: 'Paquetes', icon: '📦' },
        { id: 'pets', label: 'Mascotas', icon: '🐕' },
        { id: 'cleaning', label: 'Limpieza', icon: '🧹' },
        { id: 'transport', label: 'Transporte', icon: '🚗' },
        { id: 'tech', label: 'Tecnología', icon: '💻' },
        { id: 'gardening', label: 'Jardinería', icon: '🌿' },
        { id: 'care', label: 'Acompañamiento', icon: '👴' },
        { id: 'tutoring', label: 'Clases', icon: '📚' },
        { id: 'creative', label: 'Creativo', icon: '🎨' },
        { id: 'errands', label: 'Recados', icon: '🧾' },
        { id: 'other', label: 'Otros', icon: '✨' },
    ];

    const SIMPLE_RADIUS_PRESETS = [2, 5, 10];
    const SIMPLE_DEFAULT_INVITES = 20;
    let autoMatchMode = 'simple';

    let lastInviteIds = new Set();
    let lastAutoMatchRows = [];
    let autoMatchFilterCat = 'all';
    let smartMatchIndex = 0;
    let smartMatchCache = [];
    let smartMatchDismissed = new Set();

    function normalizeAutoMatchMode(mode) {
        const v = String(mode || '').trim().toLowerCase();
        return v === 'advanced' ? 'advanced' : 'simple';
    }

    function setAutoMatchMode(mode, opts = {}) {
        const next = normalizeAutoMatchMode(mode);
        autoMatchMode = next;
        const card = document.getElementById('card-automatch');
        if (card) card.setAttribute('data-am-mode', next);
        const desc = $('am-mode-desc');
        if (desc) {
            desc.textContent = next === 'simple'
                ? 'Configuracion rapida, ideal para empezar.'
                : 'Ajustes detallados de categorias, horarios y limites.';
        }
        document.querySelectorAll('.am-mode-btn').forEach(btn => {
            const btnMode = btn.getAttribute('data-am-mode');
            const active = btnMode === next;
            btn.classList.toggle('am-mode-btn--active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (!opts.silent) updateAutoMatchStatusStrip();
    }

    function isSimpleRoleActive(kind) {
        const btn = document.querySelector(`.am-choice[data-am-role="${kind}"]`);
        return !!(btn && btn.classList.contains('is-active'));
    }

    function setSimpleRole(kind, active) {
        const btn = document.querySelector(`.am-choice[data-am-role="${kind}"]`);
        if (btn) {
            btn.classList.toggle('is-active', !!active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        if (kind === 'provider') {
            const input = $('am-provider-enabled');
            if (input) input.checked = !!active;
        }
        if (kind === 'seeker') {
            const input = $('am-seeker-enabled');
            if (input) input.checked = !!active;
        }
    }

    function toggleSimpleRole(kind) {
        const active = !isSimpleRoleActive(kind);
        setSimpleRole(kind, active);
        updateAutoMatchStatusStrip();
        updateAutoMatchLocalActivity();
    }

    function setSimpleRadius(value, opts = {}) {
        const v = Number(value);
        if (!Number.isFinite(v)) return;
        const syncAdvanced = opts.syncAdvanced !== false;
        document.querySelectorAll('.am-pill[data-am-radius]').forEach(btn => {
            const btnVal = Number(btn.getAttribute('data-am-radius'));
            const active = btnVal === v;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (syncAdvanced) {
            const radiusInput = $('am-radius');
            if (radiusInput) radiusInput.value = String(v);
            const radiusLabel = $('am-radius-value');
            if (radiusLabel) radiusLabel.textContent = `${v} km`;
        }
        updateAutoMatchStatusStrip();
    }

    function getSimpleRadius() {
        const btn = document.querySelector('.am-pill.is-active[data-am-radius]');
        const v = btn ? Number(btn.getAttribute('data-am-radius')) : NaN;
        return Number.isFinite(v) ? v : 5;
    }

    function closestSimpleRadius(value) {
        const v = Number(value);
        if (!Number.isFinite(v)) return 5;
        return SIMPLE_RADIUS_PRESETS.reduce((best, cur) => {
            return Math.abs(cur - v) < Math.abs(best - v) ? cur : best;
        }, SIMPLE_RADIUS_PRESETS[0]);
    }

    function isAutoMatchProviderEnabled() {
        if (autoMatchMode === 'simple') return isSimpleRoleActive('provider');
        return !!($('am-provider-enabled') && $('am-provider-enabled').checked);
    }

    function isAutoMatchSeekerEnabled() {
        if (autoMatchMode === 'simple') return isSimpleRoleActive('seeker');
        return !!($('am-seeker-enabled') && $('am-seeker-enabled').checked);
    }

    function updateAutoMatchStatusStrip() {
        const strip = $('am-status-strip');
        if (!strip) return;
        const text = $('am-status-text');
        const items = $('am-status-items');
        const radiusEl = $('am-status-radius');
        const catsEl = $('am-status-cats');
        const invitesEl = $('am-status-invites');

        const provEnabled = isAutoMatchProviderEnabled();
        const seekEnabled = isAutoMatchSeekerEnabled();
        const isActive = provEnabled || seekEnabled;

        const radiusInput = $('am-radius');
        const maxInvitesInput = $('am-max-invites');
        const radiusVal = autoMatchMode === 'simple'
            ? getSimpleRadius()
            : (radiusInput ? Number(radiusInput.value) : NaN);
        const invitesVal = autoMatchMode === 'simple'
            ? SIMPLE_DEFAULT_INVITES
            : (maxInvitesInput ? Number(maxInvitesInput.value) : NaN);

        let catCount = 0;
        if (autoMatchMode === 'simple') {
            catCount = isActive ? AM_CATS.length : 0;
        } else {
            const provWrap = $('am-provider-cats');
            const seekWrap = $('am-seeker-cats');
            catCount = (provWrap ? provWrap.querySelectorAll('input[type="checkbox"]:checked').length : 0)
                + (seekWrap ? seekWrap.querySelectorAll('input[type="checkbox"]:checked').length : 0);
        }

        if (text) text.textContent = isActive ? 'AutoMatch activo' : 'AutoMatch inactivo';
        if (items) items.classList.toggle('hidden', !isActive);
        strip.classList.toggle('is-inactive', !isActive);

        if (radiusEl) radiusEl.textContent = Number.isFinite(radiusVal) ? `${radiusVal} km` : '— km';
        if (catsEl) catsEl.textContent = String(catCount || 0);
        if (invitesEl) invitesEl.textContent = Number.isFinite(invitesVal) ? String(invitesVal) : '0';
    }

    function updateAutoMatchLocalActivity() {
        const block = document.querySelector('.automatch-local-activity');
        if (!block) return;
        const linesWrap = block.querySelector('.automatch-local-lines');
        if (!linesWrap) return;
        const lines = linesWrap.querySelectorAll('span:not(.am-local-helper)');
        if (!lines || lines.length === 0) return;

        const readCount = (id) => {
            const el = $(id);
            const raw = el ? String(el.textContent || '').trim() : '';
            const n = parseInt(raw, 10);
            return Number.isFinite(n) ? n : 0;
        };

        const reqPending = readCount('am-req-count-pending');
        const offPending = readCount('am-off-count-pending');
        const accepted = readCount('am-req-count-accepted') + readCount('am-off-count-accepted');

        const texts = [
            `• ${reqPending} solicitudes activas`,
            `• ${offPending} ofertas de ayuda`,
            `• ${accepted} ayudas completadas`,
        ];

        lines.forEach((line, idx) => {
            if (texts[idx]) line.textContent = texts[idx];
        });

        const isEmpty = reqPending === 0 && offPending === 0 && accepted === 0;
        let helper = linesWrap.querySelector('.am-local-helper');
        if (isEmpty) {
            if (!helper) {
                helper = document.createElement('span');
                helper.className = 'am-local-helper';
                linesWrap.appendChild(helper);
            }
            helper.textContent = 'Cuando empiece la actividad, aquí verás un resumen rápido de tu zona.';
        } else if (helper) {
            helper.remove();
        }
    }

    function updateAutoMatchLiveFeed(rows = []) {
        const feed = document.querySelector('.automatch-live-feed');
        if (!feed) return;
        const linesWrap = feed.querySelector('.automatch-live-lines');
        if (!linesWrap) return;

        const source = Array.isArray(rows) && rows.length
            ? rows
            : (Array.isArray(lastAutoMatchRows) ? lastAutoMatchRows : []);

        const pending = source.filter(r => r && r.status === 'pending');
        if (!pending.length) {
            linesWrap.innerHTML = `
                <span class="am-empty-line">Todavía no hay actividad reciente en tu zona.</span>
                <span class="am-empty-hint">Cuando aparezcan nuevas solicitudes u ofertas, las verás aquí.</span>
            `;
            return;
        }

        const pickNumber = (...vals) => {
            for (const v of vals) {
                if (v == null) continue;
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0) return n;
            }
            return null;
        };

        const items = pending.slice().sort((a, b) => {
            const ta = parseTime(a && a.created_at) || 0;
            const tb = parseTime(b && b.created_at) || 0;
            return tb - ta;
        }).slice(0, 4);

        const lines = items.map(r => {
            const kind = (r && r.kind === 'offer') ? 'offer' : 'request';
            const base = kind === 'offer' ? 'Vecino ofrece ayuda' : 'Nueva solicitud';
            const detail = String(r.title || r.category || '').trim();
            const distVal = pickNumber(r.distance_km, r.distance, r.dist_km, r.km);
            const distText = (distVal != null) ? ` (${distVal.toFixed(1)} km)` : '';
            const label = detail ? `${base} de ${detail}` : base;
            return `• ${label}${distText}`;
        });

        linesWrap.innerHTML = lines.map(line => `<span>${escapeHtml(line)}</span>`).join('');
    }

    function updateAutoMatchSmartMatch(reqRows = [], offRows = []) {
        const block = document.querySelector('.automatch-smart-match');
        if (!block) return;

        const renderSmartMatchEmpty = () => {
            block.innerHTML = `
              <div class="automatch-smart-title">No hay coincidencias todavía</div>
              <div class="am-smart-empty">Activa tus categorías y espera a que aparezcan solicitudes u ofertas compatibles cerca de ti.</div>
              <div class="am-smart-empty-hint">AutoMatch te avisará cuando encuentre una coincidencia.</div>
            `;
            show(block);
        };

        const providerEnabled = isAutoMatchProviderEnabled();
        const seekerEnabled = isAutoMatchSeekerEnabled();

        if (!providerEnabled && !seekerEnabled) {
            smartMatchCache = [];
            smartMatchIndex = 0;
            renderSmartMatchEmpty();
            return;
        }

        const readSelectedCats = (id) => {
            const wrap = $(id);
            if (!wrap) return new Set();
            const items = wrap.querySelectorAll('input[type="checkbox"]:checked');
            return new Set(Array.from(items).map(i => String(i.value || '').trim()).filter(Boolean));
        };

        const providerCats = readSelectedCats('am-provider-cats');
        const seekerCats = readSelectedCats('am-seeker-cats');

        const source = [];
        if (Array.isArray(reqRows) && reqRows.length) source.push(...reqRows);
        if (Array.isArray(offRows) && offRows.length) source.push(...offRows);
        if (!source.length && Array.isArray(lastAutoMatchRows)) {
            source.push(...lastAutoMatchRows.filter(r => r && r.status === 'pending'));
        }

        if (!source.length) {
            smartMatchCache = [];
            smartMatchIndex = 0;
            renderSmartMatchEmpty();
            return;
        }

        const pickNumber = (...vals) => {
            for (const v of vals) {
                if (v == null) continue;
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0) return n;
            }
            return null;
        };

        const matchCategory = (row, catSet) => {
            if (!catSet || !catSet.size) return { matched: false, label: '' };
            const cat = String(row.category || '').trim();
            if (cat && catSet.has(cat)) return { matched: true, label: catLabel(cat) };
            const title = String(row.title || '').trim().toLowerCase();
            if (title) {
                for (const id of catSet) {
                    const label = String(catLabel(id) || id).toLowerCase();
                    if (label && title.includes(label)) return { matched: true, label: catLabel(id) };
                }
            }
            return { matched: false, label: '' };
        };

        const candidates = source
            .filter(r => r && r.status === 'pending')
            .map(r => {
                const kind = (r.kind === 'offer') ? 'offer' : 'request';
                if (kind === 'request' && !providerEnabled) return null;
                if (kind === 'offer' && !seekerEnabled) return null;
                const catSet = kind === 'offer' ? seekerCats : providerCats;
                const match = matchCategory(r, catSet);
                const dist = pickNumber(r.distance_km, r.distance, r.dist_km, r.km);
                const ts = parseTime(r.created_at) || 0;
                return { r, kind, match, dist, ts };
            })
            .filter(Boolean)
            .filter(c => c.r && c.r.id && !smartMatchDismissed.has(c.r.id));

        if (!candidates.length) {
            smartMatchCache = [];
            smartMatchIndex = 0;
            renderSmartMatchEmpty();
            return;
        }

        candidates.sort((a, b) => {
            if (a.match.matched !== b.match.matched) return a.match.matched ? -1 : 1;
            const ad = (a.dist == null) ? Number.POSITIVE_INFINITY : a.dist;
            const bd = (b.dist == null) ? Number.POSITIVE_INFINITY : b.dist;
            if (ad !== bd) return ad - bd;
            if (a.ts !== b.ts) return b.ts - a.ts;
            return 0;
        });

        smartMatchCache = candidates;
        if (smartMatchIndex >= smartMatchCache.length) smartMatchIndex = 0;

        const chosen = smartMatchCache[smartMatchIndex];
        if (!chosen || !chosen.r) {
            renderSmartMatchEmpty();
            return;
        }

        const row = chosen.r;
        const nameRaw = String(row.other_name || '').trim();
        const name = nameRaw || '';
        const detail = String(row.title || '').trim() || String(catLabel(row.category) || row.category || '').trim();

        let headline = '';
        if (chosen.kind === 'request') {
            if (name && detail) headline = `${name} necesita ayuda con ${detail}`;
            else headline = 'Alguien necesita ayuda';
        } else {
            if (name && detail) headline = `${name} ofrece ayuda con ${detail}`;
            else headline = 'Alguien ofrece ayuda';
        }

        let reasonText = '';
        if (chosen.match.matched) reasonText = 'Coincide con tus categorías';
        else if (chosen.dist != null) reasonText = 'Cerca de ti';
        else reasonText = 'Coincide con tu modo activo';

        let trustText = '';
        if (row.other_verified) {
            trustText = '✔ Vecino verificado por la comunidad';
        } else {
            const rating = Number(row.other_rating || row.rating || row.rating_avg || row.score || 0);
            if (Number.isFinite(rating) && rating > 0) {
                trustText = `⭐ Valoración de vecinos: ${rating.toFixed(1).replace('.', ',')}`;
            }
        }

        const metaParts = [];
        if (chosen.dist != null) metaParts.push(`📍 ${chosen.dist.toFixed(1)} km`);
        if (chosen.match.matched && chosen.match.label) metaParts.push(`Coincide con: ${chosen.match.label}`);
        const metaText = metaParts.join(' • ');

        const remainingMatches = Math.max(0, smartMatchCache.length - 1);
        const moreText = remainingMatches === 1
            ? 'Hay 1 coincidencia más cerca de ti'
            : `Hay ${remainingMatches} coincidencias más cerca de ti`;

        const canRotate = smartMatchCache.length > 1;
        block.innerHTML = `
          <div class="automatch-smart-title">Posible coincidencia para ti</div>
          <div class="automatch-smart-body">
            <div class="automatch-smart-main">
              <div class="automatch-smart-text">${escapeHtml(headline)}</div>
              <div class="am-smart-reason">${escapeHtml(reasonText)}</div>
              ${trustText ? `<div class="am-smart-trust">${escapeHtml(trustText)}</div>` : ''}
              ${metaText ? `<div class="automatch-smart-meta">${escapeHtml(metaText)}</div>` : ''}
            </div>
            ${remainingMatches > 0 ? `<div class="am-smart-more">${escapeHtml(moreText)}</div>` : ''}
            <div class="automatch-smart-actions">
              <button class="btn btn-primary btn-sm am-smart-help-now" type="button" data-smart-help="1">Ayudar ahora</button>
              <button class="btn btn-ghost btn-xs automatch-smart-action" type="button" data-smart-detail="1">Ver detalle</button>
              ${canRotate ? '<button class="btn btn-ghost btn-sm am-smart-next" type="button" data-smart-next="1">Ver otra coincidencia</button>' : ''}
              <button class="btn btn-ghost btn-sm am-smart-dismiss" type="button" data-smart-dismiss="1">No me interesa</button>
            </div>
          </div>
        `;

        const btn = block.querySelector('[data-smart-detail]');
        if (btn) {
            btn.addEventListener('click', async () => {
                try {
                    const otherId = (row.kind === 'offer') ? row.provider_id : row.seeker_id;
                    if (!otherId) throw new Error('missing user id');
                    const u = await KHApi.getUser(otherId);
                    openUserCard(u);
                } catch {
                    toast('No se pudo cargar el perfil', 'error');
                }
            });
        }

        const btnHelp = block.querySelector('[data-smart-help]');
        if (btnHelp) {
            btnHelp.addEventListener('click', async () => {
                if (row.kind === 'request') {
                    if (!row.id) {
                        toast('No se pudo iniciar la ayuda', 'error');
                        return;
                    }
                    acceptAutoMatch(row.id);
                    return;
                }

                try {
                    const otherId = (row.kind === 'offer') ? row.provider_id : row.seeker_id;
                    if (!otherId) throw new Error('missing user id');
                    const u = await KHApi.getUser(otherId);
                    openUserCard(u);
                } catch {
                    toast('No se pudo cargar el perfil', 'error');
                }
            });
        }

        const btnNext = block.querySelector('[data-smart-next]');
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (smartMatchCache.length <= 1) return;
                smartMatchIndex = (smartMatchIndex + 1) % smartMatchCache.length;
                updateAutoMatchSmartMatch();
            });
        }

        const btnDismiss = block.querySelector('[data-smart-dismiss]');
        if (btnDismiss) {
            btnDismiss.addEventListener('click', () => {
                if (row && row.id) smartMatchDismissed.add(row.id);
                updateAutoMatchSmartMatch();
            });
        }

        show(block);
    }

    function updateAutoMatchInvitesEmptyState(isEmpty) {
        const wrap = document.querySelector('.automatch-invites');
        if (!wrap) return;
        let empty = wrap.querySelector('.am-invites-empty');
        if (isEmpty) {
            if (!empty) {
                empty = document.createElement('div');
                empty.className = 'am-invites-empty';
                empty.innerHTML = `
                    <div class="am-invites-empty-title">No hay invitaciones activas por ahora.</div>
                    <div class="am-invites-empty-sub">En cuanto AutoMatch detecte solicitudes u ofertas compatibles, aparecerán aquí.</div>
                `;
                const head = wrap.querySelector('.automatch-settings-head');
                if (head) head.insertAdjacentElement('afterend', empty);
                else wrap.prepend(empty);
            }
        } else if (empty) {
            empty.remove();
        }
    }

    function renderAutoMatchCats(wrapId, selected, disabled) {
        const wrap = $(wrapId);
        if (!wrap) return;
        const sel = new Set(Array.isArray(selected) ? selected : []);
        wrap.innerHTML = '';
        AM_CATS.forEach(c => {
            const isActive = sel.has(c.id);
            const el = document.createElement('label');
            el.className = `am-cat${isActive ? ' am-cat--active' : ''}`;
            el.innerHTML = `
              <input type="checkbox" value="${escapeHtml(c.id)}" ${sel.has(c.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
              <span aria-hidden="true">${c.icon}</span>
              <span>${escapeHtml(c.label)}</span>
            `;
            wrap.appendChild(el);
        });

        if (!disabled) {
            wrap.querySelectorAll('input[type="checkbox"]').forEach(i => {
                i.addEventListener('change', () => {
                    const row = i.closest('.am-cat');
                    if (row) row.classList.toggle('am-cat--active', i.checked);
                    saveAutoMatchSettings();
                    updateAutoMatchStatusStrip();
                    updateAutoMatchLocalActivity();
                });
            });
        }

        updateAutoMatchStatusStrip();
        updateAutoMatchLocalActivity();
    }

    function renderAutoMatchFilterChips() {
        const wrap = $('am-filter');
        if (!wrap) return;

        const mk = (catId, label) => {
            const b = document.createElement('button');
            b.className = 'am-filter-chip';
            b.type = 'button';
            b.setAttribute('data-cat', String(catId));
            b.textContent = String(label || catId);
            b.addEventListener('click', () => setAutoMatchFilter(catId));
            wrap.appendChild(b);
        };

        wrap.innerHTML = '';
        mk('all', 'Todas');
        AM_CATS.forEach(c => mk(c.id, c.label));

        // Ensure active state reflects current selection.
        setAutoMatchFilter(autoMatchFilterCat || 'all');
    }

    function tickInviteCountdowns() {
        document.querySelectorAll('[data-am-expires]').forEach(el => {
            const exp = Number(el.getAttribute('data-am-expires') || 0);
            const leftMs = exp - Date.now();
            if (leftMs <= 0) {
                el.textContent = 'Caducada';
                el.classList.remove('am-chip--urgent');
                return;
            }
            const s = Math.ceil(leftMs / 1000);
            const mm = String(Math.floor(s / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            el.textContent = `${mm}:${ss}`;
            el.classList.toggle('am-chip--urgent', leftMs <= 2 * 60 * 1000);
        });
    }

    function setAutoMatchFilter(cat) {
        autoMatchFilterCat = cat || 'all';
        document.querySelectorAll('.am-filter-chip[data-cat]').forEach(b => {
            b.classList.toggle('am-filter-chip--active', b.getAttribute('data-cat') === autoMatchFilterCat);
        });
        // Re-render from cached data
        if (lastAutoMatchRows && lastAutoMatchRows.length) {
            renderAutoMatchBoards(lastAutoMatchRows);
            tickInviteCountdowns();
        }
    }

    function applyAutoMatchFilter(rows) {
        if (!rows || !rows.length) return [];
        if (!autoMatchFilterCat || autoMatchFilterCat === 'all') return rows;
        return rows.filter(r => String(r.category || '') === autoMatchFilterCat);
    }

    function renderAutoMatchBoards(rowsRaw) {
        const rows = applyAutoMatchFilter(rowsRaw);
        const reqs = rows.filter(r => (r.kind || 'request') !== 'offer');
        const offs = rows.filter(r => (r.kind || 'request') === 'offer');

        const reqPending = reqs.filter(r => r.status === 'pending');
        const reqAccepted = reqs.filter(r => r.status === 'accepted');
        const reqArchived = reqs.filter(r => r.status === 'declined' || r.status === 'expired');

        const offPending = offs.filter(r => r.status === 'pending');
        const offAccepted = offs.filter(r => r.status === 'accepted');
        const offArchived = offs.filter(r => r.status === 'declined' || r.status === 'expired');

        const cr = $('am-count-requests');
        const co = $('am-count-offers');
        if (cr) cr.textContent = String(reqs.length);
        if (co) co.textContent = String(offs.length);

        const rcp = $('am-req-count-pending');
        const rca = $('am-req-count-accepted');
        const rcr = $('am-req-count-archived');
        if (rcp) rcp.textContent = String(reqPending.length);
        if (rca) rca.textContent = String(reqAccepted.length);
        if (rcr) rcr.textContent = String(reqArchived.length);

        const ocp = $('am-off-count-pending');
        const oca = $('am-off-count-accepted');
        const ocr = $('am-off-count-archived');
        if (ocp) ocp.textContent = String(offPending.length);
        if (oca) oca.textContent = String(offAccepted.length);
        if (ocr) ocr.textContent = String(offArchived.length);

        renderInvites('am-req-pending', reqPending, { empty: 'Sin pendientes' });
        renderInvites('am-req-accepted', reqAccepted, { empty: 'Aún no aceptaste' });
        renderInvites('am-req-archived', reqArchived, { empty: 'Nada archivado' });

        renderInvites('am-off-pending', offPending, { empty: 'Sin pendientes' });
        renderInvites('am-off-accepted', offAccepted, { empty: 'Aún no aceptaste' });
        renderInvites('am-off-archived', offArchived, { empty: 'Nada archivado' });

        updateAutoMatchLiveFeed([...reqPending, ...offPending]);
        updateAutoMatchSmartMatch(reqPending, offPending);
        updateAutoMatchInvitesEmptyState(
            reqPending.length === 0
            && reqAccepted.length === 0
            && reqArchived.length === 0
            && offPending.length === 0
            && offAccepted.length === 0
            && offArchived.length === 0
        );
    }

    async function loadAutoMatch(opts = {}) {
        if (!KHApi.getToken()) return;
        const btn = $('btn-am-refresh');
        if (btn && !opts.silent) setLoading(btn, true);
        try {
            const settings = await KHApi.automatchGetSettings();
            const mode = normalizeAutoMatchMode(settings && settings.automatch_mode);
            setAutoMatchMode(mode, { silent: true });
            // Premium user: hide upsell button
            const upsell = $('btn-am-premium');
            if (upsell) upsell.classList.add('hidden');
            const saveBtn = $('btn-am-save');
            if (saveBtn) saveBtn.classList.remove('hidden');

            const provEnabled = !!settings.enabled;
            const seekEnabled = !!settings.seeker_enabled;
            setSimpleRole('provider', provEnabled);
            setSimpleRole('seeker', seekEnabled);

            renderAutoMatchCats('am-provider-cats', settings.categories, false);
            renderAutoMatchCats('am-seeker-cats', settings.seeker_categories, false);

            const radiusInput = $('am-radius');
            const radiusLabel = $('am-radius-value');
            const radiusVal = Number(settings.radius_km || 5);
            if (radiusInput) radiusInput.value = String(radiusVal);
            if (radiusLabel) radiusLabel.textContent = `${radiusVal} km`;
            setSimpleRadius(closestSimpleRadius(radiusVal), { syncAdvanced: false });

            const maxInvitesInput = $('am-max-invites');
            const maxInvitesLabel = $('am-max-invites-value');
            const maxInvitesVal = Number(settings.max_invites_per_day || 20);
            if (maxInvitesInput) maxInvitesInput.value = String(maxInvitesVal);
            if (maxInvitesLabel) maxInvitesLabel.textContent = String(maxInvitesVal);

            const weekdayStart = $('am-weekday-start');
            const weekdayEnd = $('am-weekday-end');
            const weekendStart = $('am-weekend-start');
            const weekendEnd = $('am-weekend-end');
            if (weekdayStart) weekdayStart.value = settings.weekday_start || '17:00';
            if (weekdayEnd) weekdayEnd.value = settings.weekday_end || '21:00';
            if (weekendStart) weekendStart.value = settings.weekend_start || '00:00';
            if (weekendEnd) weekendEnd.value = settings.weekend_end || '23:59';

            renderAutoMatchFilterChips();

            updateAutoMatchStatusStrip();

            const out = await KHApi.automatchListInvites({ limit: 80, offset: 0 });
            const rows = (out && out.data) || [];
            lastAutoMatchRows = rows;

            // Render boards with current filter
            renderAutoMatchBoards(rows);

            const reqPending = rows.filter(r => (r.kind || 'request') !== 'offer' && r.status === 'pending');
            const offPending = rows.filter(r => (r.kind || 'request') === 'offer' && r.status === 'pending');

            const tabBadge = $('am-tab-badge');
            if (tabBadge) {
                const total = reqPending.length + offPending.length;
                tabBadge.textContent = String(total);
                tabBadge.classList.toggle('hidden', total === 0);
            }

            updateAutoMatchLocalActivity();

            const statusPill = $('am-status-pill');
            if (statusPill) statusPill.classList.remove('hidden');

            const ids = new Set(rows.map(r => r.id));
            const hasNew = rows.some(r => !lastInviteIds.has(r.id));
            lastInviteIds = ids;
            if (hasNew && opts.silent) toast('Nueva invitación de AutoMatch', 'info');
            tickInviteCountdowns();
        } catch (err) {
            setAutoMatchMode('simple', { silent: true });
            const upsell = $('btn-am-premium');
            if (upsell) upsell.classList.remove('hidden');
            const saveBtn = $('btn-am-save');
            if (saveBtn) saveBtn.classList.add('hidden');

            setSimpleRole('provider', false);
            setSimpleRole('seeker', false);
            setSimpleRadius(5);
            renderAutoMatchCats('am-provider-cats', [], true);
            renderAutoMatchCats('am-seeker-cats', [], true);
            const msg = (err && err.message) ? err.message : 'AutoMatch no disponible';
            const ids = ['am-req-pending', 'am-req-accepted', 'am-req-archived', 'am-off-pending', 'am-off-accepted', 'am-off-archived'];
            ids.forEach(id => {
                const el = $(id);
                if (el) el.innerHTML = `<div class="ledger-empty" style="color:var(--text-soft)">🔒 ${escapeHtml(msg)}<br/>Desbloquea AutoMatch Premium para recibir invitaciones automáticas.</div>`;
            });
            const cr = $('am-count-requests');
            const co = $('am-count-offers');
            if (cr) cr.textContent = '0';
            if (co) co.textContent = '0';

            const cs = ['am-req-count-pending', 'am-req-count-accepted', 'am-req-count-archived', 'am-off-count-pending', 'am-off-count-accepted', 'am-off-count-archived'];
            cs.forEach(id => { const el = $(id); if (el) el.textContent = '0'; });

            const tabBadge = $('am-tab-badge');
            if (tabBadge) tabBadge.classList.add('hidden');

            const statusPill = $('am-status-pill');
            if (statusPill) statusPill.classList.add('hidden');

            updateAutoMatchLocalActivity();
        } finally {
            if (btn && !opts.silent) setLoading(btn, false);
        }
    }


    function hubStartCreate() {
        setDashView('crear');
        setTimeout(() => {
            const card = $('card-mvp-request');
            if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const title = $('req-title');
            if (title) title.focus();
        }, 80);
    }

    async function hubGoAutoMatch() {
        if (!KHApi.getToken()) {
            openLogin();
            return;
        }

        let user = currentUser;
        if (!user) {
            try { user = await ensureCurrentUser(); } catch { }
        }

        const email = user && user.email ? String(user.email).trim().toLowerCase() : '';
        if (email && AUTOMATCH_ALLOWLIST.has(email)) {
            setDashView('automatch');
            return;
        }

        try {
            const e = await KHApi.premiumEligibility();
            if (e && e.premium_active) {
                setDashView('automatch');
                return;
            }
        } catch {
            // ignore
        }
        // Not premium: open upgrade nudge (more specific) then premium modal
        try {
            const e2 = await KHApi.premiumEligibility();
            if (e2 && !e2.premium_active) {
                openUpgradeModal(e2);
                return;
            }
        } catch { }
        if (window.KHFx && window.KHFx.openPremiumModal) window.KHFx.openPremiumModal();
    }

    async function saveAutoMatchSettings() {
        if (!KHApi.getToken()) return;
        const timeVal = (id, fallback) => {
            const el = $(id);
            const v = el && String(el.value || '').trim();
            return v ? v : fallback;
        };
        const tz_offset_min = new Date().getTimezoneOffset();

        if (autoMatchMode === 'simple') {
            const enabled = isSimpleRoleActive('provider');
            const seeker_enabled = isSimpleRoleActive('seeker');
            if (!enabled && !seeker_enabled) {
                toast('Elige recibir u ofrecer ayuda', 'error');
                return;
            }
            const radius_km = Math.max(1, Math.min(30, Number(getSimpleRadius()) || 5));
            const allCats = AM_CATS.map(c => c.id);
            try {
                await KHApi.automatchUpdateSettings({
                    automatch_mode: 'simple',
                    enabled,
                    categories: enabled ? allCats : [],
                    seeker_enabled,
                    seeker_categories: seeker_enabled ? allCats : [],
                    radius_km,
                    max_invites_per_day: SIMPLE_DEFAULT_INVITES,
                    weekday_start: '17:00',
                    weekday_end: '21:00',
                    weekend_start: '00:00',
                    weekend_end: '23:59',
                    tz_offset_min,
                });
                toast('AutoMatch actualizado ✓', 'success');
                loadAutoMatch({ silent: true });
            } catch (err) {
                toast(err.message || 'No se pudo guardar AutoMatch', 'error');
                loadAutoMatch({ silent: true });
            }
            return;
        }

        const enabled = !!($('am-provider-enabled') && $('am-provider-enabled').checked);
        const seeker_enabled = !!($('am-seeker-enabled') && $('am-seeker-enabled').checked);
        const radiusInput = $('am-radius');
        const maxInvitesInput = $('am-max-invites');
        const radius_km = radiusInput ? Math.max(1, Math.min(30, Number(radiusInput.value) || 5)) : undefined;
        const max_invites_per_day = maxInvitesInput
            ? Math.max(5, Math.min(20, Number(maxInvitesInput.value) || 20))
            : undefined;
        const weekday_start = timeVal('am-weekday-start', '17:00');
        const weekday_end = timeVal('am-weekday-end', '21:00');
        const weekend_start = timeVal('am-weekend-start', '00:00');
        const weekend_end = timeVal('am-weekend-end', '23:59');
        const radiusLabel = $('am-radius-value');
        if (radiusLabel && radius_km != null) radiusLabel.textContent = `${radius_km} km`;
        const maxInvitesLabel = $('am-max-invites-value');
        if (maxInvitesLabel && max_invites_per_day != null) maxInvitesLabel.textContent = String(max_invites_per_day);
        updateAutoMatchStatusStrip();
        const provWrap = $('am-provider-cats');
        const seekWrap = $('am-seeker-cats');
        const cats = provWrap
            ? Array.from(provWrap.querySelectorAll('input[type="checkbox"]')).filter(i => i.checked).map(i => i.value)
            : [];
        const seeker_categories = seekWrap
            ? Array.from(seekWrap.querySelectorAll('input[type="checkbox"]')).filter(i => i.checked).map(i => i.value)
            : [];
        try {
            await KHApi.automatchUpdateSettings({
                automatch_mode: 'advanced',
                enabled,
                categories: cats,
                seeker_enabled,
                seeker_categories,
                radius_km,
                max_invites_per_day,
                weekday_start,
                weekday_end,
                weekend_start,
                weekend_end,
                tz_offset_min,
            });
            toast('AutoMatch actualizado ✓', 'success');
            loadAutoMatch({ silent: true });
        } catch (err) {
            toast(err.message || 'No se pudo guardar AutoMatch', 'error');
            loadAutoMatch({ silent: true });
        }
    }

    function inviteIcon(cat) {
        const hit = AM_CATS.find(c => c.id === cat);
        return hit ? hit.icon : '⚡';
    }

    const AI_CATEGORY_IMAGES_JPG = {
        repairs: '/img/ai/repairs.jpg',
        packages: '/img/ai/packages.jpg',
        pets: '/img/ai/pets.jpg',
        cleaning: '/img/ai/cleaning.jpg',
        transport: '/img/ai/transport.jpg',
        tech: '/img/ai/tech.jpg',
        gardening: '/img/ai/gardening.jpg',
        care: '/img/ai/care.jpg',
        tutoring: '/img/ai/tutoring.jpg',
        creative: '/img/ai/creative.jpg',
        errands: '/img/ai/errands.jpg',
        other: '/img/ai/other.jpg',
    };

    const AI_CATEGORY_IMAGES_WEBP = {
        repairs: '/img/ai/repairs.webp',
        packages: '/img/ai/packages.webp',
        pets: '/img/ai/pets.webp',
        cleaning: '/img/ai/cleaning.webp',
        transport: '/img/ai/transport.webp',
        tech: '/img/ai/tech.webp',
        gardening: '/img/ai/gardening.webp',
        care: '/img/ai/care.webp',
        tutoring: '/img/ai/tutoring.webp',
        creative: '/img/ai/creative.webp',
        errands: '/img/ai/errands.webp',
        other: '/img/ai/other.webp',
    };

    const AI_CATEGORY_PALETTES = {
        repairs: ['#1a1f2d', '#2a5bce', '#7f56d9'],
        packages: ['#20262f', '#0ea5e9', '#7dd3fc'],
        pets: ['#1f2a22', '#16a34a', '#86efac'],
        cleaning: ['#1e2833', '#38bdf8', '#60a5fa'],
        transport: ['#231f2e', '#8b5cf6', '#c4b5fd'],
        tech: ['#161c2c', '#3b82f6', '#93c5fd'],
        gardening: ['#1c2a22', '#22c55e', '#bbf7d0'],
        care: ['#222025', '#f97316', '#fdba74'],
        tutoring: ['#1c2030', '#eab308', '#fde68a'],
        creative: ['#221827', '#ec4899', '#fbcfe8'],
        errands: ['#1c2430', '#14b8a6', '#99f6e4'],
        other: ['#1f2433', '#a855f7', '#c7d2fe'],
    };

    const aiImageCache = {};

    const AI_IMAGE_MODE = (typeof window !== 'undefined' && window.KH_AI_IMAGE_MODE)
        ? String(window.KH_AI_IMAGE_MODE)
        : 'generated';

    function aiImageForCategory(cat) {
        if (AI_IMAGE_MODE === 'file') {
            const jpg = AI_CATEGORY_IMAGES_JPG[cat] || AI_CATEGORY_IMAGES_JPG.other;
            const webp = AI_CATEGORY_IMAGES_WEBP[cat] || AI_CATEGORY_IMAGES_WEBP.other;
            return {
                jpg: jpg ? `${jpg}?v=ai1` : null,
                webp: webp ? `${webp}?v=ai1` : null,
            };
        }
        const generated = generateAiImage(cat);
        return generated ? { jpg: generated, webp: null } : null;
    }

    function generateAiImage(cat) {
        if (aiImageCache[cat]) return aiImageCache[cat];
        const palette = AI_CATEGORY_PALETTES[cat] || AI_CATEGORY_PALETTES.other;
        const icon = inviteIcon(cat);
        const canvas = document.createElement('canvas');
        const w = 720;
        const h = 420;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, palette[0]);
        grad.addColorStop(0.55, palette[1]);
        grad.addColorStop(1, palette[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Soft light blobs
        const blobs = [
            { x: w * 0.2, y: h * 0.2, r: 160, c: 'rgba(255,255,255,0.10)' },
            { x: w * 0.8, y: h * 0.3, r: 180, c: 'rgba(0,0,0,0.18)' },
            { x: w * 0.6, y: h * 0.8, r: 140, c: 'rgba(255,255,255,0.08)' },
        ];
        blobs.forEach(b => {
            const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
            rg.addColorStop(0, b.c);
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = rg;
            ctx.fillRect(0, 0, w, h);
        });

        // Noise texture
        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 220; i += 1) {
            ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
            const x = Math.random() * w;
            const y = Math.random() * h;
            const r = 1 + Math.random() * 2.5;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Icon watermark
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.font = '96px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, w * 0.5, h * 0.52);
        ctx.restore();

        // Vignette
        const vg = ctx.createRadialGradient(w * 0.5, h * 0.4, w * 0.2, w * 0.5, h * 0.4, w * 0.65);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);

        const out = canvas.toDataURL('image/jpeg', 0.82);
        aiImageCache[cat] = out;
        return out;
    }

    function parseTime(val) {
        if (!val) return null;
        const t = Date.parse(val);
        return Number.isFinite(t) ? t : null;
    }

    function formatRemaining(ms) {
        if (ms <= 0) return 'Caducado';
        const totalMin = Math.floor(ms / 60000);
        const days = Math.floor(totalMin / 1440);
        const hours = Math.floor((totalMin % 1440) / 60);
        const mins = totalMin % 60;
        if (days > 0) return `Caduca en ${days}d ${hours}h`;
        if (hours > 0) return `Caduca en ${hours}h ${mins}m`;
        return `Caduca en ${mins}m`;
    }

    function expiryInfo(row) {
        const now = Date.now();
        const expiresTs = parseTime(row && row.expires_at);
        if (!expiresTs) return null;
        const createdTs = parseTime(row && row.created_at);
        const totalMs = createdTs ? Math.max(1, expiresTs - createdTs) : (7 * 24 * 60 * 60 * 1000);
        const remainingMs = expiresTs - now;
        const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
        const dangerStart = Math.max(0, Math.min(100, pct - 12));
        const warnStart = Math.max(0, Math.min(100, dangerStart + 8));
        return {
            pct,
            dangerStart,
            warnStart,
            label: formatRemaining(remainingMs),
        };
    }

    function renderInvites(wrapId, rows, opts = {}) {
        const wrap = $(wrapId);
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!rows || !rows.length) {
            wrap.innerHTML = `<div class="ledger-empty">${escapeHtml(opts.empty || 'Sin elementos')}</div>`;
            return;
        }
        let i = 0;
        rows.forEach(r => {
            const el = document.createElement('div');
            el.style.animationDelay = (i * 40) + 'ms';
            const media = r.media_urls || [];
            const img = (media && media[0] && (media[0].url || media[0])) || '';
            const exp = Date.parse(r.expires_at || '') || 0;
            const title = r.title || '—';
            const cat = r.category || '';
            const loc = r.location_text || '';
            const comp = compLabel(r.compensation_type);
            const kind = r.kind === 'offer' ? 'offer' : 'request';
            const who = r.other_name ? `${r.other_name}${r.other_verified ? ' ✓' : ''}` : '';
            const pickNumber = (...vals) => {
                for (const v of vals) {
                    if (v == null) continue;
                    const n = Number(v);
                    if (Number.isFinite(n) && n > 0) return n;
                }
                return null;
            };
            const pickText = (...vals) => {
                for (const v of vals) {
                    if (v == null) continue;
                    const t = String(v || '').trim();
                    if (t) return t;
                }
                return '';
            };
            const ratingVal = pickNumber(r.other_rating, r.rating, r.rating_avg, r.score);
            const completedVal = pickNumber(r.completed_count, r.helps_completed, r.matches_completed);
            const badgeText = pickText(r.badge, r.rank_label, r.tier_label);
            const trustParts = [];
            if (ratingVal != null) trustParts.push(`⭐ ${ratingVal.toFixed(1)}`);
            if (completedVal != null) trustParts.push(`${completedVal} ayudas completadas`);
            if (badgeText) trustParts.push(badgeText);
            const trustLine = trustParts.join(' • ');
            const distVal = pickNumber(r.distance_km, r.distance, r.dist_km, r.km);
            const distLine = (distVal != null && distVal >= 0) ? `📍 ${distVal.toFixed(1)} km` : '';
            let timeEstimate = '';
            if (distVal != null && distVal >= 0) {
                if (distVal <= 1) timeEstimate = '⏱ 5–10 min';
                else if (distVal <= 3) timeEstimate = '⏱ 10–15 min';
                else if (distVal <= 5) timeEstimate = '⏱ 15–20 min';
                else timeEstimate = '⏱ 20+ min';
            }
            const st = String(r.status || 'pending');
            const stClass = ['pending', 'accepted', 'declined', 'expired'].includes(st) ? st : 'pending';
            let urgencyLabel = '';
            let urgencyAge = '';
            if (kind === 'request' && st === 'pending') {
                const rawPriority = String(r.priority || r.urgency || r.level || '').toLowerCase().trim();
                if (rawPriority) {
                    if (['high', 'urgent', 'alta', 'urgente'].includes(rawPriority)) urgencyLabel = '🔴 Urgente';
                    else if (['medium', 'normal', 'media'].includes(rawPriority)) urgencyLabel = '🟠 Prioridad media';
                    else if (['low', 'baja', 'flexible'].includes(rawPriority)) urgencyLabel = '🟢 Flexible';
                }
                if (!urgencyLabel) {
                    const createdAt = Date.parse(r.created_at || '') || 0;
                    if (createdAt) {
                        const hours = (Date.now() - createdAt) / 36e5;
                        if (hours <= 2) urgencyLabel = '🔴 Urgente';
                        else if (hours <= 12) urgencyLabel = '🟠 Prioridad media';
                        else urgencyLabel = '🟢 Flexible';
                    }
                }
                const createdAt = Date.parse(r.created_at || '') || 0;
                if (createdAt) {
                    const diffMs = Date.now() - createdAt;
                    const minutes = Math.max(0, Math.floor(diffMs / 60000));
                    if (minutes < 60) urgencyAge = `hace ${minutes} min`;
                    else {
                        const hours = Math.floor(minutes / 60);
                        if (hours < 24) urgencyAge = `hace ${hours} h`;
                        else {
                            const days = Math.floor(hours / 24);
                            urgencyAge = `hace ${days} días`;
                        }
                    }
                }
            }
            const canShare = !!navigator.share;
            const pickCoord = (...vals) => {
                for (const v of vals) {
                    if (v == null) continue;
                    const n = Number(v);
                    if (Number.isFinite(n)) return n;
                }
                return null;
            };
            const lat = pickCoord(r.lat, r.latitude);
            const lng = pickCoord(r.lng, r.longitude);
            const mapUrl = (lat != null && lng != null)
                ? `https://www.google.com/maps?q=${lat},${lng}`
                : '';
            const distText = (distVal != null && distVal >= 0) ? `📍 ${distVal.toFixed(1)} km` : '';
            const metaItems = [];
            if (urgencyLabel) {
                const urgencyText = `${urgencyLabel}${urgencyAge ? ` • ${urgencyAge}` : ''}`;
                metaItems.push(`<div class="am-card-meta-item am-card-urgency">${escapeHtml(urgencyText)}</div>`);
            }
            if (distText) metaItems.push(`<div class="am-card-meta-item am-card-distance">${escapeHtml(distText)}</div>`);
            if (timeEstimate) metaItems.push(`<div class="am-card-meta-item am-card-time-estimate">${escapeHtml(timeEstimate)}</div>`);
            if (mapUrl) metaItems.push(`<a class="am-card-meta-item am-card-map-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">Ver en mapa</a>`);
            const metaHtml = metaItems.length ? `<div class="am-card-meta">${metaItems.join('')}</div>` : '';
            el.className = `am-invite am-invite--${stClass}`;
            const stLabel = st === 'accepted' ? 'Aceptada' : (st === 'expired' ? 'Caducada' : (st === 'declined' ? 'Rechazada' : null));
            const showActions = st === 'pending';
            el.innerHTML = `
              <div class="am-invite-img">
                <span class="am-drag-hint" aria-hidden="true">⋮⋮</span>
                ${img ? `<img src="${escapeHtml(String(img))}" alt="" loading="lazy" />` : `<span aria-hidden="true">${inviteIcon(cat)}</span>`}
              </div>
              <div>
                <div class="am-card-body">
                  <div class="am-card-main">
                    ${who ? `<div class="am-card-user-row"><button class="am-chip am-chip-user am-card-user-link" type="button" data-user="1">${escapeHtml(who)}</button>${r.other_verified ? '<span class="am-card-verified">✔ Vecino verificado</span>' : ''}</div>` : ''}
                    <div class="am-invite-title">${escapeHtml(title)}</div>
                    <div class="am-invite-meta">
                      <span class="am-chip ${kind === 'offer' ? 'offer' : 'req'}">${kind === 'offer' ? 'OFERTA' : 'SOLICITUD'}</span>
                      <span class="am-chip">${escapeHtml(catLabel(cat))}</span>
                      <span class="am-chip">${escapeHtml(comp)}</span>
                      ${loc ? `<span class="am-chip">📍 ${escapeHtml(loc)}</span>` : ''}
                      ${st === 'pending' ? `<span class="am-chip ttl" data-am-expires="${exp}">—</span>` : (stLabel ? `<span class="am-chip am-status-chip ${st === 'accepted' ? 'ok' : 'bad'}">${stLabel}</span>` : '')}
                    </div>
                    ${trustLine ? `<div class="am-card-trust">${escapeHtml(trustLine)}</div>` : ''}
                  </div>
                  ${metaHtml}
                </div>
                ${showActions ? `
                  <div class="am-invite-actions">
                    <button class="btn btn-ghost btn-sm am-card-contact" type="button" data-contact="1">Contactar</button>
                    <button class="btn btn-ghost btn-sm am-card-share" type="button" data-share="1">Compartir</button>
                    ${!canShare ? '<button class="btn btn-ghost btn-xs am-card-copy-link" type="button" data-copy="1">Copiar enlace</button>' : ''}
                    <button class="btn btn-primary btn-sm" type="button" onclick="KHApp.acceptAutoMatch('${escapeHtml(r.id)}')">Aceptar</button>
                    <button class="btn btn-ghost btn-sm" type="button" onclick="KHApp.declineAutoMatch('${escapeHtml(r.id)}')">Rechazar</button>
                  </div>
                ` : `
                  <div class="am-invite-actions">
                    <button class="btn btn-ghost btn-sm" type="button" onclick="KHApp.setDashView('matches')">Ver matches</button>
                  </div>
                `}
              </div>
            `;
            wrap.appendChild(el);

            const btnUser = el.querySelector('button[data-user]');
            if (btnUser) {
                btnUser.addEventListener('click', async () => {
                    try {
                        const otherId = (r.kind === 'offer') ? r.provider_id : r.seeker_id;
                        if (!otherId) throw new Error('missing user id');
                        const u = await KHApi.getUser(otherId);
                        openUserCard(u);
                    } catch {
                        toast('No se pudo cargar el perfil', 'error');
                    }
                });
            }

            const btnContact = el.querySelector('button[data-contact]');
            if (btnContact) {
                btnContact.addEventListener('click', async () => {
                    try {
                        const otherId = (r.kind === 'offer') ? r.provider_id : r.seeker_id;
                        if (!otherId) throw new Error('missing user id');
                        const u = await KHApi.getUser(otherId);
                        openUserCard(u);
                    } catch {
                        toast('No se pudo abrir el contacto', 'error');
                    }
                });
            }

            const btnShare = el.querySelector('button[data-share]');
            if (btnShare) {
                btnShare.addEventListener('click', async () => {
                    try {
                        const inviteId = r.id || r.invite_id;
                        if (!inviteId) throw new Error('missing invite id');
                        const url = `${window.location.origin}/invite/${encodeURIComponent(inviteId)}`;
                        const isOffer = r.kind === 'offer';
                        let subject = String(
                            r.title || r.category_label || r.category || (isOffer ? 'oferta de ayuda' : 'solicitud')
                        );
                        subject = subject.replace(/\s+/g, ' ').trim();
                        if (subject.length > 80) {
                            subject = subject.slice(0, 77) + '…';
                        }
                        const title = isOffer ? 'Oferta de ayuda en KingsHelp' : 'Solicitud en KingsHelp';
                        const text = isOffer
                            ? `He encontrado esta oferta de ayuda en KingsHelp: ${subject}`
                            : `He encontrado esta solicitud en KingsHelp: ${subject}`;

                        if (navigator.share) {
                            await navigator.share({ title, text, url });
                            return;
                        }

                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(url);
                            toast('Enlace copiado', 'success');
                            return;
                        }

                        const temp = document.createElement('textarea');
                        temp.value = url;
                        temp.setAttribute('readonly', '');
                        temp.style.position = 'absolute';
                        temp.style.left = '-9999px';
                        document.body.appendChild(temp);
                        temp.select();
                        document.execCommand('copy');
                        document.body.removeChild(temp);
                        toast('Enlace copiado', 'success');
                    } catch {
                        toast('No se pudo compartir', 'error');
                    }
                });
            }

            const btnCopy = el.querySelector('button[data-copy]');
            if (btnCopy) {
                btnCopy.addEventListener('click', async () => {
                    try {
                        const inviteId = r.id || r.invite_id;
                        if (!inviteId) throw new Error('missing invite id');
                        const url = `${window.location.origin}/invite/${encodeURIComponent(inviteId)}`;
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(url);
                            toast('Enlace copiado', 'success');
                            return;
                        }

                        const temp = document.createElement('textarea');
                        temp.value = url;
                        temp.setAttribute('readonly', '');
                        temp.style.position = 'absolute';
                        temp.style.left = '-9999px';
                        document.body.appendChild(temp);
                        temp.select();
                        document.execCommand('copy');
                        document.body.removeChild(temp);
                        toast('Enlace copiado', 'success');
                    } catch {
                        toast('No se pudo copiar el enlace', 'error');
                    }
                });
            }
            i += 1;
        });
    }

    async function acceptAutoMatch(inviteId) {
        try {
            const out = await KHApi.automatchAccept(inviteId);
            toast('Match creado ✓', 'success');
            loadMatches();
            loadAutoMatch({ silent: true });
            const m = out && out.match;
            if (m && m.id) openChat(m.id);
        } catch (err) {
            toast(err.message || 'No se pudo aceptar', 'error');
            loadAutoMatch({ silent: true });
        }
    }

    async function declineAutoMatch(inviteId) {
        try {
            await KHApi.automatchDecline(inviteId);
            toast('Rechazada', 'info');
            loadAutoMatch({ silent: true });
        } catch (err) {
            toast(err.message || 'No se pudo rechazar', 'error');
        }
    }

    function renderProfileHeroBadges(rows) {
        const list = Array.isArray(rows) ? rows : [];
        const grid = $('profile-hero-badges');
        if (!grid) return;
        const countEl = $('profile-hero-badges-count');
        if (countEl) countEl.textContent = list.length ? `${list.length} total` : '—';
        const miniCount = $('profile-hero-badge-count');
        if (miniCount) miniCount.textContent = list.length ? String(list.length) : '—';

        grid.innerHTML = '';
        if (!list.length) {
            grid.innerHTML = '<div class="ledger-empty">Aún no hay insignias</div>';
            return;
        }

        list.slice(0, 6).forEach(b => {
            const el = document.createElement('div');
            el.className = 'badge-item earned';
            const icon = b.icon_url || '🏅';
            el.title = b.description || b.name || '';
            el.innerHTML = `${escapeHtml(icon)}<span>${escapeHtml(b.name || '')}</span>`;
            grid.appendChild(el);
        });
    }

    const CATEGORY_BADGE_SLUGS = [
        'svc_repairs',
        'svc_packages',
        'svc_pets',
        'svc_cleaning',
        'svc_transport',
        'svc_tech',
        'svc_gardening',
        'svc_care',
        'svc_tutoring',
        'svc_creative',
        'svc_errands',
        'svc_other',
    ];

    const COLLECTION_RULES = [
        {
            slug: 'col_vecino_total',
            name: 'Vecino Total',
            desc: 'Consigue 4 insignias de categorias distintas.',
            reward: 120,
            type: 'count',
            count: 4,
        },
        {
            slug: 'col_barrio_solidario',
            name: 'Comunidad Solidaria',
            desc: 'Acompanamiento, recados y clases.',
            reward: 90,
            type: 'all',
            required: ['svc_care', 'svc_errands', 'svc_tutoring'],
        },
        {
            slug: 'col_mano_hogar',
            name: 'Manitas y Hogar',
            desc: 'Reparaciones, limpieza y jardineria.',
            reward: 90,
            type: 'all',
            required: ['svc_repairs', 'svc_cleaning', 'svc_gardening'],
        },
        {
            slug: 'col_movilidad_rapida',
            name: 'Movilidad Rapida',
            desc: 'Transporte y paquetes.',
            reward: 60,
            type: 'all',
            required: ['svc_transport', 'svc_packages'],
        },
        {
            slug: 'col_super_vecino',
            name: 'Super Vecino',
            desc: 'Consigue 8 insignias de categorias distintas.',
            reward: 250,
            type: 'count',
            count: 8,
        },
    ];

    function renderCollectionsFromBadges(rows) {
        const wrap = $('collections-body');
        if (!wrap) return;
        const list = Array.isArray(rows) ? rows : [];
        const slugs = new Set(list.map(b => b.slug));
        const categoryOwned = CATEGORY_BADGE_SLUGS.filter(s => slugs.has(s));

        let completed = 0;
        let earnedRep = 0;
        wrap.innerHTML = '';

        COLLECTION_RULES.forEach(rule => {
            let progress = 0;
            let total = 0;
            let done = false;
            if (rule.type === 'all') {
                total = rule.required.length;
                progress = rule.required.filter(s => slugs.has(s)).length;
                done = progress >= total;
            } else {
                total = Number(rule.count || 0);
                progress = Math.min(categoryOwned.length, total);
                done = categoryOwned.length >= total;
            }

            if (done) {
                completed += 1;
                earnedRep += Number(rule.reward || 0);
            }

            const card = document.createElement('div');
            card.className = 'collection-card' + (done ? ' is-complete' : '');
            card.innerHTML = `
              <div class="collection-left">
                <div class="collection-title">${escapeHtml(rule.name)}</div>
                <div class="collection-desc">${escapeHtml(rule.desc)}</div>
                <div class="collection-progress">${progress}/${total} insignias</div>
              </div>
              <div class="collection-right">
                <div class="collection-reward">+${Number(rule.reward || 0)} rep</div>
                <div class="collection-pill${done ? ' done' : ''}">${done ? 'Completada' : 'En progreso'}</div>
              </div>
            `;
            wrap.appendChild(card);
        });

        if (!COLLECTION_RULES.length) {
            wrap.innerHTML = '<div class="ledger-empty">Sin colecciones activas</div>';
        }

        const perk = $('perk-boost');
        if (perk) {
            perk.textContent = completed
                ? `${completed} completas · +${earnedRep} rep`
                : '0 colecciones';
        }
    }

    async function loadBadgesMine() {
        if (!KHApi.getToken()) return;
        try {
            const data = await KHApi.listMyBadges();
            const rows = (data && data.data) || (Array.isArray(data) ? data : []);
            renderProfileHeroBadges(rows);
            renderCollectionsFromBadges(rows);
            const grid = $('badges-grid');
            if (!grid) return;
            grid.innerHTML = '';
            if ($('badges-badge')) $('badges-badge').textContent = `${rows.length} ganadas`;

            if (!rows.length) {
                grid.innerHTML = '<div class="ledger-empty">Aún no hay insignias</div>';
                return;
            }

            rows.slice(0, 9).forEach(b => {
                const el = document.createElement('div');
                el.className = 'badge-item earned';
                const icon = b.icon_url || '🏅';
                el.title = b.description || b.name || '';
                el.innerHTML = `${escapeHtml(icon)}<span>${escapeHtml(b.name || '')}</span>`;
                grid.appendChild(el);
            });
        } catch {
            // ignore
        }
    }

    function setNext(kind, payload) {
        nextState = { kind, payload: payload || null };
        renderNext();
    }

    function dismissNext() {
        nextDismissedAt = Date.now();
        try { localStorage.setItem('kh_next_dismissed_at', String(nextDismissedAt)); } catch { }
        hide($('dash-next'));
    }

    function renderNext() {
        const card = $('dash-next');
        if (!card) return;
        const wasHidden = card.classList.contains('hidden');

        const dismissed = (() => {
            try {
                const v = Number(localStorage.getItem('kh_next_dismissed_at') || '0');
                return (Date.now() - v) < (6 * 60 * 60 * 1000); // 6h
            } catch {
                return false;
            }
        })();
        if (dismissed) {
            hide(card);
            return;
        }

        const title = $('dash-next-title');
        const desc = $('dash-next-desc');
        const cta = $('dash-next-cta');
        const sec = $('dash-next-secondary');
        if (!title || !desc || !cta || !sec) return;

        if (!nextState || nextState.kind === 'none') {
            hide(card);
            return;
        }

        show(card);
        if (wasHidden) {
            card.classList.remove('card-next--enter');
            void card.offsetWidth;
            card.classList.add('card-next--enter');
            setTimeout(() => card.classList.remove('card-next--enter'), 480);
        }
        if (nextState.kind === 'agreement') {
            title.textContent = 'Falta un acuerdo';
            desc.textContent = 'Tienes un match aceptado. Abre el chat y acordad el pago, el trueque o si es altruista.';
            cta.textContent = 'Abrir chat';
            sec.textContent = 'Ir a matches';
            sec.classList.remove('hidden');
            return;
        }

        if (nextState.kind === 'create') {
            title.textContent = 'Crea tu primera publicación';
            desc.textContent = 'Elige si necesitas ayuda o si ofreces ayuda. En 1 minuto puedes tener un match.';
            cta.textContent = 'Crear';
            sec.textContent = 'Ver guía';
            sec.classList.remove('hidden');
            return;
        }

        hide(card);
    }

    function runNext() {
        if (!nextState) return;
        if (nextState.kind === 'agreement') {
            if (nextState.payload && nextState.payload.matchId) openChat(nextState.payload.matchId);
            return;
        }
        if (nextState.kind === 'create') {
            const card = $('card-mvp-request');
            if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
    }

    function runNextSecondary() {
        if (!nextState) return;
        if (nextState.kind === 'agreement') {
            const card = $('card-mvp-matches');
            if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        if (nextState.kind === 'create') {
            const how = document.getElementById('how');
            if (how && how.scrollIntoView) {
                showPage('page-landing');
                setTimeout(() => how.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }
        }
    }

    function setPremiumInterval(interval) {
        premiumInterval = (interval === 'month') ? 'month' : 'year';

        // Modal picks
        document.querySelectorAll('.premium-pick[data-interval]').forEach(b => {
            b.classList.toggle('premium-pick--active', b.getAttribute('data-interval') === premiumInterval);
        });

        // Landing picks
        document.querySelectorAll('.premium-plan[data-interval]').forEach(b => {
            const active = b.getAttribute('data-interval') === premiumInterval;
            b.classList.toggle('premium-plan--active', active);
            b.setAttribute('aria-checked', String(active));
        });

        // Modal main price
        const price = $('premium-modal-main-price');
        const note = $('premium-modal-main-note');
        if (price) {
            price.innerHTML = 'Gratis<span>AutoMatch Premium</span>';
        }
        if (note) {
            note.textContent = 'Se activa al alcanzar la reputación necesaria';
        }
    }

    /* ── MVP: Requests + Matches ─────────────────────────────────────────────── */

    function toIsoHoursFromNow(hours) {
        const h = Math.max(1, Number(hours) || 24);
        return new Date(Date.now() + h * 3600 * 1000).toISOString();
    }

    function fmtShortDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return new Intl.DateTimeFormat('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            }).format(d);
        } catch {
            return '';
        }
    }

    function initials(name) {
        const s = (name || '').trim();
        return s ? s[0].toUpperCase() : '?';
    }

    function tierLabel(tier) {
        if (tier === 'premium_lite') return '⚡ AutoMatch Premium';
        return (tier && tier !== 'free') ? 'Premium' : 'Gratis';
    }

    function navTierLabel(tier) {
        if (!tier || tier === 'free') return 'Gratis';
        return '⚡ AutoMatch';
    }

    function normalizeNavTriggerLabel() {
        const ids = ['nav-account-tier', 'user-tier'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const text = el.textContent || '';
            if (text.toLowerCase().includes('premium')) {
                el.textContent = '⚡ AutoMatch';
            }
        });
    }


    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
    }

    async function createRequest(event) {
        event.preventDefault();
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }

        // ── Inline validation ──────────────────────────────────────
        const titleEl = $('req-title');
        const locationEl = $('req-location');
        const title = (titleEl && titleEl.value || '').trim();
        const location_text = (locationEl && locationEl.value || '').trim();

        let hasError = false;
        if (!title) {
            showFieldError('req-title', 'req-title-err', 'El título es obligatorio.');
            hasError = true;
        }
        if (!location_text) {
            showFieldError('req-location', 'req-location-err', 'Indica tu zona (ej. comunidad o ciudad).');
            hasError = true;
        }
        if (hasError) return;

        const category = ($('req-category') && $('req-category').value) || 'other';
        const description = ($('req-desc') && $('req-desc').value || '').trim();
        const when = ($('req-when') && $('req-when').value || 'asap');
        const comp = (document.getElementById('req-comp') && document.getElementById('req-comp').value) || 'cash';

        pendingDraft = {
            kind: 'request',
            body: { title, category, points_offered: 0, description: description || undefined, location_text, when, compensation_type: comp },
        };
        showCreatePreview('request');
    }

    async function createOffer(event) {
        event.preventDefault();
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }

        // ── Inline validation ──────────────────────────────────────
        const titleEl = $('off-title');
        const title = (titleEl && titleEl.value || '').trim();
        if (!title) {
            showFieldError('off-title', 'off-title-err', 'El título es obligatorio.');
            return;
        }

        const category = ($('off-category') && $('off-category').value) || 'other';
        const description = ($('off-desc') && $('off-desc').value || '').trim();
        const comp = (document.getElementById('off-comp') && document.getElementById('off-comp').value) || 'cash';

        pendingDraft = {
            kind: 'offer',
            body: { title, category, points_value: 0, description: description || undefined, compensation_type: comp },
        };
        showCreatePreview('offer');
    }

    function showCreatePreview(kind) {
        const isReq = kind === 'request';
        const d = pendingDraft;
        if (!d) return;

        const prefix = isReq ? 'req' : 'off';
        const whenMap = { asap: '⚡ Lo antes posible', today: '📅 Hoy', this_week: '📆 Esta semana', flexible: '🕐 Flexible' };
        const compMap = { cash: 'Pago en €', barter: 'Trueque', altruistic: 'Altruista' };

        const titleEl = $(`${prefix}-preview-title`);
        if (titleEl) titleEl.textContent = d.body.title;

        const chipsEl = $(`${prefix}-preview-chips`);
        if (chipsEl) {
            let chips = `<span class="mvp-meta-tag">${escapeHtml(catLabel(d.body.category))}</span>`;
            if (isReq) {
                chips += `<span class="mvp-meta-tag">${escapeHtml(d.body.location_text)}</span>`;
                chips += `<span class="mvp-meta-tag">${whenMap[d.body.when] || d.body.when}</span>`;
            }
            chips += `<span class="mvp-meta-tag">${compMap[d.body.compensation_type] || d.body.compensation_type}</span>`;
            chipsEl.innerHTML = chips;
        }

        const descEl = $(`${prefix}-preview-desc`);
        if (descEl) {
            descEl.textContent = d.body.description || '';
            descEl.classList.toggle('hidden', !d.body.description);
        }

        const photosEl = $(`${prefix}-preview-photos`);
        if (photosEl) {
            const arr = prePhotos[prefix] || [];
            photosEl.innerHTML = arr.map(p => `<img src="${p.dataUrl}" class="preview-photo-thumb" alt="foto previa">`).join('');
        }

        hide($(isReq ? 'req-form-wrap' : 'off-form-wrap'));
        show($(`${prefix}-preview`));
        const pv = $(`${prefix}-preview`);
        if (pv && pv.scrollIntoView) pv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function backToEdit(kind) {
        const isReq = kind === 'request';
        hide($(`${isReq ? 'req' : 'off'}-preview`));
        show($(`${isReq ? 'req-form-wrap' : 'off-form-wrap'}`));
        pendingDraft = null;
        const form = $(isReq ? 'request-form' : 'offer-form');
        if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function confirmCreate(kind) {
        if (!pendingDraft || pendingDraft.kind !== kind) return;
        const isReq = kind === 'request';
        const prefix = isReq ? 'req' : 'off';
        const btn = $(`btn-${prefix}-confirm`);
        setLoading(btn, true);
        try {
            const whenMap = { asap: '⚡ Lo antes posible', today: '📅 Hoy', this_week: '📆 Esta semana', flexible: '🕐 Flexible' };
            const compMap = { cash: 'Pago en €', barter: 'Trueque', altruistic: 'Altruista' };
            const b = pendingDraft.body;

            if (isReq) {
                const req = await KHApi.createRequest(b);
                lastCreatedRequest = req;
                await uploadStagedPhotos('req', req.id).catch(() => 0);

                const titleEl = $('req-created-title');
                if (titleEl) titleEl.textContent = req.title;
                const meta = $('req-created-meta');
                if (meta) {
                    meta.innerHTML = `<span class="mvp-meta-tag">${escapeHtml(catLabel(b.category))}</span><span class="mvp-meta-tag">${escapeHtml(b.location_text)}</span><span class="mvp-meta-tag">${whenMap[b.when] || b.when}</span><span class="mvp-meta-tag">${compMap[b.compensation_type] || b.compensation_type}</span>`;
                }
                hide($('req-preview'));
                show($('req-created'));
                hide($('req-suggestions'));
                $('req-suggestions-list').innerHTML = '';
                setCreateStep(3);
                toast('¡Solicitud publicada! ✓', 'success');
                try { loadFeed(); } catch { }
                renderListingPhotos('req-photos-grid', req.media_urls, 'deleteRequestPhoto', req.id);
                const f = $('request-form');
                if (f) f.reset();
                loadCreations();
                const blk = $('req-created');
                if (blk && blk.scrollIntoView) blk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                const offer = await KHApi.createOffer(b);
                lastCreatedOffer = offer;
                await uploadStagedPhotos('off', offer.id).catch(() => 0);

                const titleEl = $('off-created-title');
                if (titleEl) titleEl.textContent = offer.title;
                const meta = $('off-created-meta');
                if (meta) {
                    meta.innerHTML = `<span class="mvp-meta-tag">${escapeHtml(catLabel(b.category))}</span><span class="mvp-meta-tag">${compMap[b.compensation_type] || b.compensation_type}</span>`;
                }
                hide($('off-preview'));
                show($('off-created'));
                setCreateStep(3);
                toast('¡Oferta publicada! ✓', 'success');
                try { loadFeed(); } catch { }
                renderListingPhotos('off-photos-grid', offer.media_urls, 'deleteOfferPhoto', offer.id);
                const f = $('offer-form');
                if (f) f.reset();
                loadCreations();
            }
            pendingDraft = null;
        } catch (err) {
            toast(err.message || 'No se pudo publicar', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    async function loadCreations() {
        if (!KHApi.getToken()) return;
        await ensureCurrentUser();
        if (!currentUser) return;

        const btn = $('btn-creations-refresh');
        if (btn) setLoading(btn, true);
        try {
            const wantKind = creationsFilter.kind;
            const wantStatus = creationsFilter.status;
            const reqStatus = wantStatus === 'closed' ? 'closed' : 'open';
            const offStatus = wantStatus === 'closed' ? 'closed' : 'active';

            const calls = [];
            if (wantKind === 'all' || wantKind === 'request') {
                calls.push(KHApi.listRequests({ seeker_id: currentUser.id, status: reqStatus, limit: 20, offset: 0 }));
            } else {
                calls.push(Promise.resolve({ data: [] }));
            }
            if (wantKind === 'all' || wantKind === 'offer') {
                calls.push(KHApi.listOffers({ provider_id: currentUser.id, status: offStatus, limit: 20, offset: 0 }));
            } else {
                calls.push(Promise.resolve({ data: [] }));
            }

            const [reqs, offs] = await Promise.all(calls);
            renderCreations((reqs && reqs.data) || [], (offs && offs.data) || [], wantStatus, creationsFilter.q);
        } catch (err) {
            const list = $('creations-list');
            if (list) list.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">Error al cargar</div>';
        } finally {
            if (btn) setLoading(btn, false);
        }
    }

    function renderCreations(requests, offers, wantStatus, q) {
        const list = $('creations-list');
        if (!list) return;
        list.innerHTML = '';

        const items = [];
        requests.forEach(r => items.push({ kind: 'request', row: r, created_at: r.created_at }));
        offers.forEach(o => items.push({ kind: 'offer', row: o, created_at: o.created_at }));
        items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

        const qlc = String(q || '').trim().toLowerCase();
        const filtered = qlc
            ? items.filter(it => {
                const t = String(it.row.title || '').toLowerCase();
                const c = String(it.row.category || '').toLowerCase();
                const d = String(it.row.description || '').toLowerCase();
                return t.includes(qlc) || c.includes(qlc) || d.includes(qlc);
            })
            : items;

        if (!filtered.length) {
            list.innerHTML = qlc
                ? '<div class="ledger-empty">No hay resultados con ese filtro</div>'
                : '<div class="ledger-empty">Aun no tienes creaciones</div>';
            return;
        }

        const isActive = wantStatus !== 'closed';
        const now = Date.now();
        filtered.slice(0, 12).forEach(it => {
            const el = document.createElement('div');
            el.className = 'mvp-item';
            const isReq = it.kind === 'request';
            const comp = (it.row.compensation_type === 'coins') ? 'cash' : (it.row.compensation_type || 'cash');
            const meta = `${it.row.category} · ${COMP_LABEL[comp] || comp}`;
            const expiresAt = it.row.expires_at ? new Date(it.row.expires_at).getTime() : null;
            const isExpired = expiresAt && expiresAt < now;
            const daysLeft = (expiresAt && !isExpired) ? Math.ceil((expiresAt - now) / 86400000) : null;
            let expiryNote = '';
            if (isExpired) {
                expiryNote = ' · expirada';
            } else if (daysLeft !== null && daysLeft <= 3) {
                expiryNote = ` · caduca en ${daysLeft}d`;
            } else if (expiresAt) {
                expiryNote = ` · caduca ${fmtShortDate(it.row.expires_at)}`;
            }
            const kindLabel = isReq ? 'Solicitud' : 'Oferta';
            const kindClass = isReq ? 'req' : 'off';
            let stateBadge;
            if (!isActive) {
                stateBadge = '<span class="mvp-status err">cerrada</span>';
            } else if (isExpired) {
                stateBadge = '<span class="mvp-status warn">expirada</span>';
            } else {
                stateBadge = '<span class="mvp-status ok">activa</span>';
            }

            el.innerHTML = `
              <div class="mvp-item-left">
                <span class="mvp-kind ${kindClass}">${kindLabel}</span>
                <div class="mvp-txt">
                  <div class="mvp-title">${escapeHtml(it.row.title)}</div>
                  <div class="mvp-meta">${escapeHtml(meta)}${expiryNote ? escapeHtml(expiryNote) : ''}</div>
                </div>
              </div>
              <div class="mvp-actions">
                ${stateBadge}
                ${(isActive && isReq) ? '<button class="btn btn-ghost btn-sm" type="button" data-use="1">usar</button>' : ''}
                ${isActive ? '<button class="btn btn-ghost btn-sm" type="button" data-close="1">cerrar</button>' : ''}
              </div>
            `;

            const btnUse = el.querySelector('button[data-use]');
            if (btnUse) {
                btnUse.addEventListener('click', () => {
                    lastCreatedRequest = it.row;
                    $('req-created-title').textContent = it.row.title;
                    show($('req-created'));
                    hide($('req-form-wrap'));
                    hide($('req-suggestions'));
                    $('req-suggestions-list').innerHTML = '';
                    selectCreateKind('request');
                    const card = $('card-mvp-request');
                    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    toast('Solicitud seleccionada para hacer match', 'success');
                });
            }

            const btnClose = el.querySelector('button[data-close]');
            if (btnClose) {
                btnClose.addEventListener('click', async () => {
                    btnClose.disabled = true;
                    try {
                        if (isReq) {
                            await KHApi.closeRequest(it.row.id);
                            toast('Solicitud cerrada', 'success');
                        } else {
                            await KHApi.closeOffer(it.row.id);
                            toast('Oferta cerrada', 'success');
                        }
                        await loadCreations();
                    } catch (err) {
                        toast(err.message || 'No se pudo cerrar', 'error');
                        btnClose.disabled = false;
                    }
                });
            }

            list.appendChild(el);
        });
    }

    async function loadSuggestedProviders() {
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }
        await ensureCurrentUser();
        if (!lastCreatedRequest) {
            toast('Crea una solicitud primero', 'error');
            return;
        }

        const btn = $('btn-req-suggest');
        setLoading(btn, true);
        try {
            const data = await KHApi.getSuggestedProviders(lastCreatedRequest.id);
            const providers = data.suggested_providers || [];
            const list = $('req-suggestions-list');
            list.innerHTML = '';
            show($('req-suggestions'));

            if (!providers.length) {
                list.innerHTML = '<div class="ledger-empty">Sin sugerencias por ahora</div>';
                return;
            }

            providers.slice(0, 6).forEach(p => {
                const el = document.createElement('div');
                el.className = 'mvp-item';
                const rating = (p.rating_avg || 0).toFixed(1);
                const tier = tierLabel(p.premium_tier);
                el.innerHTML = `
                  <div class="mvp-item-left">
                    <span class="mvp-av">${initials(p.display_name)}</span>
                    <div class="mvp-txt">
                      <div class="mvp-title">${escapeHtml(p.display_name)} <span style="opacity:.6">·</span> ★ ${rating}</div>
                      <div class="mvp-meta">${escapeHtml(tier)} · ${p.active_offer_count || 0} ofertas activas</div>
                    </div>
                  </div>
                  <div class="mvp-actions">
                    <button class="btn btn-primary btn-sm" type="button">Crear match</button>
                  </div>
                `;
                const btnMatch = el.querySelector('button');
                btnMatch.addEventListener('click', async () => {
                    const prev = btnMatch.textContent;
                    btnMatch.disabled = true;
                    btnMatch.textContent = 'Creando...';
                    try {
                        await createMatchFromProvider(p);
                        btnMatch.textContent = 'Creado ✓';
                        // Keep disabled to avoid duplicates
                    } catch {
                        btnMatch.disabled = false;
                        btnMatch.textContent = prev;
                    }
                });
                list.appendChild(el);
            });
        } catch (err) {
            toast(err.message || 'Error al cargar sugerencias', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    async function createMatchForRequest(req, provider) {
        await ensureCurrentUser();
        if (!currentUser) throw new Error('No se pudo cargar tu usuario');

        const offerId = provider && provider.offer_id;
        if (!offerId) {
            toast('Proveedor sin oferta activa', 'error');
            return null;
        }
        const body = { offer_id: offerId };

        try {
            const match = await KHApi.createMatchForRequest(req.id, body);
            toast(`Match creado con ${provider.display_name} ✓`, 'success');
            await loadMatches();
            if (match && match.id) openChat(match.id);
            return match;
        } catch (err) {
            toast(err.message || 'No se pudo crear el match', 'error');
            throw err;
        }
    }

    async function createMatchFromProvider(provider) {
        if (!lastCreatedRequest) return;
        return createMatchForRequest(lastCreatedRequest, provider);
    }

    async function createMatchForFeedRow(row) {
        await ensureCurrentUser();
        if (!currentUser) throw new Error('No se pudo cargar tu usuario');
        if (!row || !row.id) throw new Error('Publicación inválida');
        if (String(row.user_id) === String(currentUser.id)) {
            toast('No puedes hacer match contigo mismo', 'error');
            return;
        }

        const kind = row.kind === 'offer' ? 'offer' : 'request';
        const match = kind === 'offer'
            ? await KHApi.createMatchForOffer(row.id)
            : await KHApi.createMatchForRequest(row.id);
        toast('Match creado ✓', 'success');
        await loadMatches();
        if (match && match.id) openChat(match.id);
        return match;
    }

    function actionsForMatch(match) {
        if (!currentUser) return [];
        const isProvider = match.provider_id === currentUser.id;
        const isSeeker = match.seeker_id === currentUser.id;
        const st = match.status;
        const a = [];
        const receiverRole = match.initiated_by === 'provider' ? 'seeker' : 'provider';
        const initiatorRole = match.initiated_by === 'provider' ? 'provider' : 'seeker';
        const myRole = isProvider ? 'provider' : (isSeeker ? 'seeker' : null);
        if (myRole && myRole === receiverRole && st === 'pending') a.push('accept', 'reject');
        if (isProvider && st === 'accepted') a.push('done');
        if (myRole && myRole === initiatorRole && (st === 'pending' || st === 'accepted')) a.push('cancel');
        return a;
    }

    async function loadMatches() {
        if (!KHApi.getToken()) return;
        await ensureCurrentUser();
        const btn = $('btn-matches-refresh');
        if (btn) setLoading(btn, true);
        try {
            const params = { limit: 30, offset: 0 };
            if (matchesFilter.status && matchesFilter.status !== 'all') params.status = matchesFilter.status;
            const data = await KHApi.listMatches(params);
            const list = $('matches-list');
            if (!list) return;
            const rows = (data && (data.data || data.matches)) || (Array.isArray(data) ? data : []);
            list.innerHTML = '';

            const qlc = String(matchesFilter.q || '').trim().toLowerCase();
            const filtered = qlc
                ? rows.filter(m => {
                    const youAreProvider = m.provider_id === (currentUser && currentUser.id);
                    const otherName = youAreProvider ? (m.seeker_name || '') : (m.provider_name || '');
                    const subject = (m.request_title || m.offer_title || '').trim();
                    return String(otherName).toLowerCase().includes(qlc) || String(subject).toLowerCase().includes(qlc);
                })
                : rows;

            if (!filtered.length) {
                list.innerHTML = qlc
                    ? '<div class="ledger-empty">No hay resultados con ese filtro</div>'
                    : '<div class="ledger-empty">Aún no tienes matches</div>';
                return;
            }

            // Auto-open chat on first accepted match (once per match)
            if (!chatMatchId) {
                const need = filtered.find(m => m.status === 'accepted' && !autoChatOpened.has(m.id));
                if (need && need.id) {
                    autoChatOpened.add(need.id);
                    openChat(need.id);
                }
            }

            // Next step banner
            const needAgree = filtered.find(m => {
                const comp = (m.compensation_type === 'coins') ? 'cash' : (m.compensation_type || 'cash');
                const ok = comp === 'cash'
                    ? (+m.points_agreed || 0) >= 1
                    : (comp === 'barter' ? String(m.barter_terms || '').trim().length > 0 : true);
                return m.status === 'accepted' && !ok;
            });
            if (needAgree && needAgree.id) {
                setNext('agreement', { matchId: needAgree.id });
            } else if (!lastCreatedRequest) {
                setNext('create', {});
            } else {
                setNext('none');
            }

            filtered.forEach(match => {
                const el = document.createElement('div');
                el.className = 'mvp-item';
                const youAreProvider = match.provider_id === (currentUser && currentUser.id);
                const otherName = youAreProvider ? (match.seeker_name || 'Seeker') : (match.provider_name || 'Provider');
                const statusClass = match.status === 'done' ? 'ok' : (match.status === 'accepted' ? 'warn' : (match.status === 'rejected' ? 'err' : ''));
                const acts = actionsForMatch(match);
                const actsHtml = acts.map(a => {
                    const label = MATCH_ACTION_LABEL[a] || a;
                    return `<button class="btn btn-ghost btn-sm" data-act="${a}">${label}</button>`;
                }).join('');
                const myRole = youAreProvider ? 'provider' : 'seeker';
                const myRatingCol = myRole === 'provider' ? 'provider_rating' : 'seeker_rating';
                const otherRatingCol = myRole === 'provider' ? 'seeker_rating' : 'provider_rating';
                const ratedByMe = match[myRatingCol] != null;
                const canRate = match.status === 'done' && !ratedByMe;
                const gotRated = match[otherRatingCol] != null;

                const subject = (match.request_title || match.offer_title || '').trim();
                const when = match.completed_at || match.accepted_at || match.created_at;
                const whenTxt = fmtShortDate(when);
                const comp = (match.compensation_type === 'coins') ? 'cash' : (match.compensation_type || 'cash');
                const compTxt = COMP_LABEL[comp] || comp;
                const agreedCoins = (+match.points_agreed || 0);
                const agreedOk = comp === 'cash'
                    ? agreedCoins > 0
                    : (comp === 'barter' ? String(match.barter_terms || '').trim().length > 0 : true);
                const compMeta = comp === 'cash'
                    ? (agreedCoins > 0 ? `${compTxt} · ${agreedCoins} €` : `${compTxt} · pendiente acuerdo`)
                    : (agreedOk ? `${compTxt} · acordado` : `${compTxt} · pendiente acuerdo`);

                const starsHtml = canRate
                    ? `<span class="mvp-stars" aria-label="Valorar 1 a 5">
                         ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="mvp-star" data-star="${n}" title="${n}">★</button>`).join('')}
                       </span>
                       <button class="btn btn-ghost btn-sm" type="button" data-review="1">reseña</button>`
                    : (match.status === 'done' && ratedByMe ? `<span class="mvp-status ok">valorado (${match[myRatingCol]})</span>` : '');

                const gotRatedHtml = gotRated ? `<span class="mvp-status warn">te valoraron (${match[otherRatingCol]})</span>` : '';

                const pendingAgreement = !agreedOk && (match.status === 'pending' || match.status === 'accepted');
                const agreeBadge = pendingAgreement ? `<span class="mvp-status err">pendiente acuerdo</span>` : '';
                const okBadge = (!pendingAgreement && agreedOk && (match.status === 'pending' || match.status === 'accepted'))
                    ? `<span class="mvp-status ok">acuerdo confirmado</span>`
                    : '';

                el.innerHTML = `
                  <div class="mvp-item-left">
                    <button class="mvp-av mvp-av-btn" type="button" data-user="1" aria-label="Ver perfil de ${escapeHtml(otherName)}">${initials(otherName)}</button>
                    <div class="mvp-txt">
                       <div class="mvp-title"><button class="mvp-title-btn" type="button" data-user="1">${escapeHtml(otherName)}</button></div>
                      <div class="mvp-meta">${escapeHtml(match.status)} · ${escapeHtml(compMeta)}${subject ? ' · ' + escapeHtml(subject) : ''}${whenTxt ? ' · ' + escapeHtml(whenTxt) : ''}</div>
                    </div>
                  </div>
                  <div class="mvp-actions">
                    <span class="mvp-status ${statusClass}">${match.status}</span>
                    <button class="btn btn-ghost btn-sm" type="button" data-chat="1">chat</button>
                    ${actsHtml}
                    ${agreeBadge}
                    ${okBadge}
                    ${gotRatedHtml}
                    ${starsHtml}
                  </div>
                `;

                el.querySelectorAll('button[data-act]').forEach(btnAct => {
                    btnAct.addEventListener('click', async () => {
                        const act = btnAct.dataset.act;
                        if (act === 'done' && pendingAgreement) {
                            toast('Antes de marcar como hecho, cerrad el acuerdo en el chat.', 'info');
                            openChat(match.id);
                            return;
                        }
                        const prev = btnAct.textContent;
                        btnAct.disabled = true;
                        btnAct.textContent = '...';
                        try {
                            await runMatchAction(match.id, act);
                        } finally {
                            // list rerenders on success; if it failed, restore label
                            btnAct.disabled = false;
                            btnAct.textContent = prev;
                        }
                    });
                });

                const btnChat = el.querySelector('button[data-chat]');
                if (btnChat) btnChat.addEventListener('click', () => openChat(match.id));

                el.querySelectorAll('button[data-user]').forEach(btnUser => {
                    btnUser.addEventListener('click', async () => {
                        try {
                            const youAreProvider = match.provider_id === (currentUser && currentUser.id);
                            const otherId = youAreProvider ? match.seeker_id : match.provider_id;
                            const other = await KHApi.getUser(otherId);
                            openUserCard(other);
                        } catch {
                            toast('No se pudo cargar el perfil', 'error');
                        }
                    });
                });

                el.querySelectorAll('button[data-star]').forEach(bs => {
                    bs.addEventListener('click', async () => {
                        const r = Number(bs.getAttribute('data-star'));
                        bs.disabled = true;
                        try {
                            await KHApi.submitMatchRating(match.id, r, undefined);
                            toast('Valoración enviada ✓', 'success');
                            await loadMatches();
                        } catch (err) {
                            toast(err.message || 'No se pudo enviar la valoración', 'error');
                        } finally {
                            bs.disabled = false;
                        }
                    });
                });

                const btnReview = el.querySelector('button[data-review]');
                if (btnReview) btnReview.addEventListener('click', () => openRating(match.id));
                list.appendChild(el);
            });
        } catch (err) {
            toast(err.message || 'Error al cargar matches', 'error');
        } finally {
            if (btn) setLoading(btn, false);
        }
    }

    async function runMatchAction(matchId, action) {
        try {
            const updated = await KHApi.changeMatchStatus(matchId, action);
            const label = MATCH_ACTION_LABEL[action] || action;
            toast(`Estado actualizado: ${label} ✓`, 'success');
            await loadLedger();
            await loadMatches();

            // Bring users to chat after acceptance or pending agreement
            if (updated && updated.id) {
                const comp = (updated.compensation_type === 'coins') ? 'cash' : (updated.compensation_type || 'cash');
                const agreedOk = comp === 'cash'
                    ? (+updated.points_agreed || 0) >= 1
                    : (comp === 'barter' ? String(updated.barter_terms || '').trim().length > 0 : true);
                if (updated.status === 'accepted' && !autoChatOpened.has(updated.id)) {
                    autoChatOpened.add(updated.id);
                    openChat(updated.id);
                }
                if (!agreedOk && (updated.status === 'pending' || updated.status === 'accepted')) {
                    openChat(updated.id);
                }
            }
        } catch (err) {
            const msg = err.message || 'No se pudo actualizar el estado';
            toast(msg, 'error');
            // Backend blocks completion without agreement
            if (String(msg).toLowerCase().includes('agreement required') && matchId) {
                openChat(matchId);
            }
        }
    }

    function logout() {
        KHApi.clearToken();
        currentUser = null;
        setLandingSessionUI(null);
        showPage('page-landing');
        stopNotifPolling();
        closeNotifPanel();
        if ($('dash-menu-name')) $('dash-menu-name').textContent = 'Cuenta';
        if ($('notif-badge')) {
            $('notif-badge').textContent = '0';
            $('notif-badge').classList.add('hidden');
        }
        if ($('notif-list')) $('notif-list').innerHTML = '<div class="notif-empty">Sin notificaciones nuevas</div>';
        $('balance-value').textContent = '—';
        $('ledger-list').innerHTML = '<div class="ledger-empty">Pulsa "Cargar" para ver tu historial</div>';
        $('status-dot').className = 'status-dot';
        hide($('status-response'));
        $('ledger-badge').textContent = '—';
        toast('Sesión cerrada', 'info');
    }

    /* ── Ping /health ─────────────────────────────────────────────────────────── */
    async function ping() {
        const btn = $('btn-ping');
        const dot = $('status-dot');
        const resp = $('status-response');

        setLoading(btn, true);
        dot.className = 'status-dot';
        hide(resp);

        try {
            const data = await KHApi.healthCheck();
            dot.className = 'status-dot ok';
            resp.textContent = JSON.stringify(data, null, 2);
            show(resp);
            toast('API respondiendo ✓', 'success');
        } catch (err) {
            dot.className = 'status-dot err';
            resp.style.color = 'var(--danger)';
            resp.textContent = err.message;
            show(resp);
            toast('API no disponible · ' + err.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    /* ── Load /points/me (reputación) ───────────────────────────────────────── */
    async function loadLedger() {
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }

        const btn = $('btn-ledger');
        const list = $('ledger-list');
        const stage = $('coin-stage');

        setLoading(btn, true);
        list.innerHTML = '';

        try {
            const { balance, ledger } = await KHApi.getMyPoints();

            // Animated counter + coin burst
            animateCounter($('balance-value'), balance, 1200);
            spawnCoins(stage, Math.min(balance > 0 ? 10 : 3, 12));

            // Update pill
            $('ledger-badge').textContent = balance + ' rep';

            renderProfileHeroActivity(ledger, balance);

            // Render transactions
            if (!ledger || ledger.length === 0) {
                list.innerHTML = '<div class="ledger-empty">Sin transacciones aún</div>';
            } else {
                ledger.forEach((entry, i) => {
                    const isPos = entry.delta > 0;
                    const el = document.createElement('div');
                    el.className = 'ledger-item';
                    el.style.animationDelay = (i * 50) + 'ms';
                    el.innerHTML = `
            <span class="reason">${formatReason(entry.reason)}</span>
            <span class="ledger-delta ${isPos ? 'pos' : 'neg'}">
              ${isPos ? '+' : ''}${entry.delta} rep
            </span>`;
                    list.appendChild(el);
                });
            }

            toast(`Reputación cargada · ${balance} rep`, 'success');
        } catch (err) {
            list.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">Error al cargar</div>';
            toast(err.message || 'Error al cargar la reputación', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    function formatReason(reason) {
        const map = {
            match_completed: '🤝 Match completado',
            match_cancelled: '❌ Match cancelado',
            admin_grant: '🎁 Concesión admin',
            badge_bonus: '🏅 Bonus de insignia',
            purchase: '💳 Compra',
            refund: '↩️ Reembolso',
        };
        return map[reason] || reason;
    }

    function formatReasonParts(reason) {
        const label = formatReason(reason);
        const match = String(label || '').match(/^(\S+)\s+(.*)$/);
        if (match) return { icon: match[1], text: match[2] };
        return { icon: '⚡', text: String(label || '') };
    }

    function renderProfileHeroActivity(ledger, balance) {
        const wrap = $('profile-hero-activity');
        if (!wrap) return;
        const meta = $('profile-hero-activity-meta');
        if (meta) meta.textContent = 'Actualizado';

        if (balance != null) {
            if ($('profile-hero-rep-score')) $('profile-hero-rep-score').textContent = String(balance);
            if ($('profile-hero-rep')) $('profile-hero-rep').textContent = String(balance);
        }

        wrap.innerHTML = '';
        if (!ledger || ledger.length === 0) {
            wrap.innerHTML = '<div class="ledger-empty">Sin actividad aún</div>';
            return;
        }

        const show = ledger.slice(0, 3);
        if (meta) meta.textContent = `${show.length} últimas`;

        show.forEach(entry => {
            const { icon, text } = formatReasonParts(entry.reason);
            const delta = Number(entry.delta || 0);
            const sign = delta > 0 ? '+' : '';
            const time = entry.created_at ? fmtShortDate(entry.created_at) : '';
            const label = time ? `${text} · ${time}` : text;

            const row = document.createElement('div');
            row.className = 'rep-act-row';
            row.innerHTML = `
              <span class="rep-act-ico">${escapeHtml(icon)}</span>
              <span class="rep-act-txt">${escapeHtml(label)}</span>
              <span class="rep-act-pts${delta < 0 ? ' neg' : ''}">${sign}${delta} rep</span>
            `;
            wrap.appendChild(row);
        });
    }

    /* ── Keyboard shortcuts ───────────────────────────────────────────────────── */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeLoginDirect();
            closeRating();
            closeChat();
            closeRankingModal();
            closeUserCard();
            closeBadgeNudge();
            closeDashMenu();
            closeLandingMenu();
            closeNotifPanel();
        }
    });

    /* ── CSP-safe bindings (data-* actions) ─────────────────────────────────── */
    function parsePrimitive(val) {
        if (val === 'true') return true;
        if (val === 'false') return false;
        if (val === 'null') return null;
        if (val === 'undefined') return undefined;
        if (val && /^-?\d+(\.\d+)?$/.test(val)) return Number(val);
        return val;
    }

    function parseObjectToken(raw) {
        const out = {};
        String(raw || '').split(',').forEach(part => {
            const seg = part.trim();
            if (!seg) return;
            const idx = seg.indexOf('=');
            if (idx < 0) return;
            const key = seg.slice(0, idx).trim();
            const val = seg.slice(idx + 1).trim();
            if (!key) return;
            out[key] = parsePrimitive(val);
        });
        return out;
    }

    function parseArgs(raw, el, evt) {
        if (!raw) return [];
        return String(raw).split('|').map(token => {
            const t = token.trim();
            if (!t) return '';
            if (t === '$event') return evt;
            if (t === '$value') return el && 'value' in el ? el.value : undefined;
            if (t === '$checked') return el && 'checked' in el ? !!el.checked : false;
            if (t.startsWith('$data:')) {
                const key = t.slice('$data:'.length);
                return el && el.dataset ? el.dataset[key] : undefined;
            }
            if (t.startsWith('obj:')) return parseObjectToken(t.slice(4));
            return parsePrimitive(t);
        });
    }

    function resolveAction(action) {
        if (!action) return null;
        if (action.startsWith('fx.')) {
            const name = action.slice(3);
            return (window.KHFx && typeof window.KHFx[name] === 'function') ? { ctx: window.KHFx, name } : null;
        }
        return (window.KHApp && typeof window.KHApp[action] === 'function') ? { ctx: window.KHApp, name: action } : null;
    }

    function bindDataHandlers() {
        document.body.addEventListener('click', (e) => {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            const action = resolveAction(el.getAttribute('data-action'));
            if (!action) return;
            const args = parseArgs(el.getAttribute('data-args'), el, e);
            action.ctx[action.name](...args);
        });

        document.body.addEventListener('submit', (e) => {
            const el = e.target.closest('[data-submit]');
            if (!el) return;
            const action = resolveAction(el.getAttribute('data-submit'));
            if (!action) return;
            const args = parseArgs(el.getAttribute('data-submit-args'), el, e);
            action.ctx[action.name](e, ...args);
        });

        document.body.addEventListener('input', (e) => {
            const el = e.target.closest('[data-input]');
            if (!el) return;
            const action = resolveAction(el.getAttribute('data-input'));
            if (!action) return;
            const args = parseArgs(el.getAttribute('data-input-args'), el, e);
            action.ctx[action.name](...args);
        });

        document.body.addEventListener('change', (e) => {
            const el = e.target.closest('[data-change]');
            if (!el) return;
            const action = resolveAction(el.getAttribute('data-change'));
            if (!action) return;
            const args = parseArgs(el.getAttribute('data-change-args'), el, e);
            action.ctx[action.name](...args);
        });

        document.body.addEventListener('focusin', (e) => {
            const el = e.target.closest('[data-focus]');
            if (!el) return;
            const action = resolveAction(el.getAttribute('data-focus'));
            if (!action) return;
            const args = parseArgs(el.getAttribute('data-focus-args'), el, e);
            action.ctx[action.name](...args);
        });
    }

    function bindImageFallbacks() {
        const intro = document.getElementById('kh-intro-crown');
        if (intro) {
            intro.addEventListener('error', () => {
                const fallback = intro.getAttribute('data-fallback-src');
                if (fallback && intro.src !== fallback) intro.src = fallback;
            });
        }

        document.querySelectorAll('img.nav-brand-crown').forEach(img => {
            img.addEventListener('error', () => {
                img.style.display = 'none';
            });
        });

        document.querySelectorAll('img.nav-brand-word').forEach(img => {
            img.addEventListener('error', () => {
                img.style.display = 'none';
                const parent = img.parentElement;
                if (!parent) return;
                if (parent.querySelector('.nav-brand-fallback')) return;
                const span = document.createElement('span');
                span.className = 'nav-brand-fallback';
                span.textContent = 'KingsHelp';
                parent.appendChild(span);
            });
        });
    }

    function initCustomSelects() {
        const selects = Array.from(document.querySelectorAll('select'));
        if (!selects.length) return;

        if (!window.__khSelectDocInit) {
            document.addEventListener('click', (e) => {
                const wrap = e.target.closest('.kh-select');
                document.querySelectorAll('.kh-select.open').forEach(el => {
                    if (wrap && el === wrap) return;
                    el.classList.remove('open');
                    const btn = el.querySelector('.kh-select-btn');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                });
            });
            window.__khSelectDocInit = true;
        }

        const getVariant = (sel) => {
            if (sel.classList.contains('feed-filter-select')) return 'pill';
            if (sel.classList.contains('rank-select') || sel.classList.contains('rank-select--chip')) return 'chip';
            return 'field';
        };

        selects.forEach(select => {
            if (select.dataset.khSelectInit === '1') return;
            if (select.closest('.kh-select')) return;

            const wrapper = document.createElement('div');
            wrapper.className = `kh-select kh-select--${getVariant(select)}`;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'kh-select-btn';
            button.setAttribute('aria-haspopup', 'listbox');
            button.setAttribute('aria-expanded', 'false');

            const list = document.createElement('div');
            list.className = 'kh-select-list';
            list.setAttribute('role', 'listbox');

            const updateFromSelect = () => {
                const opt = select.options[select.selectedIndex];
                button.textContent = opt ? opt.textContent : '—';
                list.querySelectorAll('.kh-select-option').forEach(o => {
                    o.classList.toggle('is-selected', o.dataset.value === select.value);
                });
            };

            Array.from(select.options).forEach(opt => {
                const optBtn = document.createElement('button');
                optBtn.type = 'button';
                optBtn.className = 'kh-select-option';
                optBtn.textContent = opt.textContent;
                optBtn.dataset.value = opt.value;
                if (opt.disabled) optBtn.disabled = true;
                optBtn.addEventListener('click', () => {
                    if (opt.disabled) return;
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    updateFromSelect();
                    wrapper.classList.remove('open');
                    button.setAttribute('aria-expanded', 'false');
                });
                optBtn.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        wrapper.classList.remove('open');
                        button.setAttribute('aria-expanded', 'false');
                        button.focus();
                    }
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const opts = Array.from(list.querySelectorAll('.kh-select-option'));
                        const idx = opts.indexOf(document.activeElement);
                        const next = e.key === 'ArrowDown' ? opts[idx + 1] : opts[idx - 1];
                        if (next) next.focus();
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        optBtn.click();
                    }
                });
                list.appendChild(optBtn);
            });

            button.addEventListener('click', (e) => {
                e.preventDefault();
                const isOpen = wrapper.classList.toggle('open');
                button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                if (isOpen) {
                    const selected = list.querySelector('.kh-select-option.is-selected') || list.querySelector('.kh-select-option');
                    if (selected) selected.focus();
                }
            });

            button.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    wrapper.classList.add('open');
                    button.setAttribute('aria-expanded', 'true');
                    const selected = list.querySelector('.kh-select-option.is-selected') || list.querySelector('.kh-select-option');
                    if (selected) selected.focus();
                }
                if (e.key === 'Escape') {
                    wrapper.classList.remove('open');
                    button.setAttribute('aria-expanded', 'false');
                }
            });

            select.addEventListener('change', updateFromSelect);
            select.tabIndex = -1;
            select.setAttribute('aria-hidden', 'true');
            select.dataset.khSelectInit = '1';

            select.parentElement.insertBefore(wrapper, select);
            wrapper.appendChild(select);
            wrapper.appendChild(button);
            wrapper.appendChild(list);

            if (select.disabled) wrapper.classList.add('is-disabled');
            updateFromSelect();
        });
    }

    /* ── Editor mode (admin only) ─────────────────────────────────────────── */
    const EDITOR_OVERRIDES_URL = '/editor/overrides.json';
    const EDITOR_SAVE_URL = '/api/v1/admin/editor/overrides';

    let editorEnabled = false;
    let editorSelected = null;
    let editorDragging = false;
    let editorResizing = false;
    let editorStart = null;
    let editorOverrides = null;
    let editorClipboardHtml = null;
    const editorHistory = [];
    const editorHistoryLimit = 60;
    let editorSnapEnabled = true;
    const editorDeleted = new Map();
    let editorObserver = null;
    let editorReapplyTimer = null;

    function applyEditorOverrides(payload) {
        if (!payload || !Array.isArray(payload.items)) return;
        editorOverrides = payload;
        const deletions = payload.items.filter(i => i && i.deleted);
        if (deletions.length) console.log('[editor] applying deletions:', deletions.map(i => i.id || i.selector));
        const inserts = payload.items.filter(i => i && i.insert);
        inserts.forEach(item => {
            if (item.deleted) return;
            let el = null;
            if (item.id) el = document.querySelector(`[data-editor-id="${item.id}"]`);
            if (!el && item.selector) el = document.querySelector(item.selector);
            if (!el && item && item.deleted && item.fingerprint) {
                el = findByFingerprint(item.fingerprint);
                if (el && item.id) el.setAttribute('data-editor-id', item.id);
                if (el && item.selector) el.dataset.editorSelector = item.selector;
            }
            if (el) return;
            if (!item.insertHtml || !item.parentSelector) return;
            const parent = document.querySelector(item.parentSelector);
            if (!parent) return;
            const temp = document.createElement('div');
            temp.innerHTML = item.insertHtml;
            const node = temp.firstElementChild;
            if (!node) return;
            const before = item.beforeSelector ? document.querySelector(item.beforeSelector) : null;
            parent.insertBefore(node, before || null);
            ensureEditorIdentity(node);
            if (item.id) node.setAttribute('data-editor-id', item.id);
            if (item.selector) node.dataset.editorSelector = item.selector;
        });

        payload.items.forEach(item => {
            let el = null;
            if (item && item.id) {
                el = document.querySelector(`[data-editor-id="${item.id}"]`);
            }
            if (!el && item && item.selector) {
                el = document.querySelector(item.selector);
                if (el && item.id) el.setAttribute('data-editor-id', item.id);
            }
            if (!el && item && item.deleted && item.fingerprint) {
                el = findByFingerprint(item.fingerprint);
                if (el && item.id) el.setAttribute('data-editor-id', item.id);
                if (el && item.selector) el.dataset.editorSelector = item.selector;
            }
            if (!el) {
                if (item && item.deleted) {
                    const entry = { id: item.id || null, selector: item.selector || null, fingerprint: item.fingerprint || null, deleted: true };
                    const key = deletionKey(entry);
                    if (key) editorDeleted.set(key, entry);
                }
                return;
            }
            if (item && item.selector) el.dataset.editorSelector = item.selector;
            if (item && item.fingerprint && !el.dataset.editorFingerprint) {
                try { el.dataset.editorFingerprint = JSON.stringify(item.fingerprint); } catch { }
            }
            if (!item.insert) {
                if (item && typeof item.html === 'string') {
                    el.innerHTML = item.html;
                    el.dataset.editorTextMode = 'html';
                } else if (item && typeof item.text === 'string') {
                    el.textContent = item.text;
                    el.dataset.editorTextMode = 'text';
                } else if (item && typeof item.value === 'string') {
                    el.value = item.value;
                    el.setAttribute('value', item.value);
                    el.dataset.editorTextMode = 'value';
                }
            }
            if (item && item.locked) {
                el.dataset.editorLocked = '1';
                el.classList.add('editor-locked');
            }
            if (item && item.deleted) {
                el.dataset.editorDeleted = '1';
                el.style.display = 'none';
                const entry = { id: item.id || null, selector: item.selector || null, fingerprint: item.fingerprint || null, deleted: true };
                const key = deletionKey(entry);
                if (key) editorDeleted.set(key, entry);
            }
            if (item && item.style) {
                Object.entries(item.style).forEach(([k, v]) => {
                    try { el.style[k] = v; } catch { }
                });
            }
            if (Array.isArray(item.classes)) {
                item.classes.forEach(c => {
                    if (!c) return;
                    try { el.classList.add(String(c)); } catch { }
                });
            }
        });

        if (editorDeleted.size) {
            editorDeleted.forEach((entry) => {
                if (!entry || !entry.deleted) return;
                let el = null;
                if (entry.id) el = document.querySelector(`[data-editor-id="${entry.id}"]`);
                if (!el && entry.selector) el = document.querySelector(entry.selector);
                if (!el && entry.fingerprint) el = findByFingerprint(entry.fingerprint);
                if (!el) return;
                el.dataset.editorDeleted = '1';
                el.style.display = 'none';
            });
        }

        applyDeletedCss();
    }

    function reapplyEditorOverrides() {
        if (!editorOverrides || !Array.isArray(editorOverrides.items)) return;
        applyEditorOverrides(editorOverrides);
    }

    async function loadEditorOverrides() {
        let payload = null;
        let localPayload = null;
        try {
            const raw = localStorage.getItem('kh_editor_overrides_backup');
            if (raw) localPayload = JSON.parse(raw);
        } catch { }
        try {
            const res = await fetch(`${EDITOR_OVERRIDES_URL}?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) payload = await res.json();
        } catch { }
        console.log('[editor] load — server items:', payload && payload.items && payload.items.length, '| local items:', localPayload && localPayload.items && localPayload.items.length);
        const chosen = chooseEditorPayload(payload, localPayload);
        if (!chosen) { ensureEditorObserver(); return; }
        try { localStorage.setItem('kh_editor_overrides_backup', JSON.stringify(chosen)); } catch { }
        console.log('[editor] applying', chosen.items && chosen.items.length, 'items');
        applyEditorOverrides(chosen);
        ensureEditorObserver();
    }

    function collectEditorOverrides() {
        const items = [];
        document.querySelectorAll('[data-editor-id]').forEach(el => {
            const id = el.getAttribute('data-editor-id') || null;
            const selector = el.dataset.editorSelector || null;
            if (!id && !selector) return;
            const style = {};
            const keys = ['left', 'top', 'width', 'height', 'margin', 'padding', 'fontSize', 'fontWeight', 'opacity', 'zIndex', 'color', 'background', 'backgroundColor', 'borderRadius', 'transform'];
            keys.forEach(k => {
                const v = el.style[k];
                if (v) style[k] = v;
            });
            if (el.style.backgroundImage) style.backgroundImage = el.style.backgroundImage;
            if (el.style.backgroundSize) style.backgroundSize = el.style.backgroundSize;
            if (el.style.backgroundPosition) style.backgroundPosition = el.style.backgroundPosition;
            if (el.style.backgroundRepeat) style.backgroundRepeat = el.style.backgroundRepeat;
            const textMode = el.dataset.editorTextMode || '';
            const payload = { id, selector, style, classes: [] };
            if (el.dataset.editorInserted === '1') {
                const parent = el.parentElement;
                const next = el.nextElementSibling;
                payload.insert = true;
                payload.insertHtml = el.outerHTML;
                payload.parentSelector = parent ? buildEditorSelector(parent) : null;
                payload.beforeSelector = next ? (next.dataset.editorSelector || buildEditorSelector(next)) : null;
            }
            const fpRaw = el.dataset.editorFingerprint;
            if (fpRaw) {
                try { payload.fingerprint = JSON.parse(fpRaw); } catch { }
            } else {
                const fp = buildFingerprint(el);
                if (fp) payload.fingerprint = fp;
            }
            if (textMode === 'html') payload.html = el.innerHTML;
            if (textMode === 'text') payload.text = el.innerText || '';
            if (textMode === 'value') payload.value = el.value || '';
            if (el.dataset.editorLocked === '1') payload.locked = true;
            if (el.dataset.editorDeleted === '1') payload.deleted = true;
            if (Object.keys(style).length || payload.html || payload.text || payload.value || payload.deleted || payload.insert) items.push(payload);
        });
        if (editorDeleted.size) {
            editorDeleted.forEach((entry) => {
                if (!entry || !entry.deleted) return;
                const exists = items.some(i => (entry.id && i.id === entry.id) || (entry.selector && i.selector === entry.selector));
                if (exists) return;
                items.push({
                    id: entry.id || null,
                    selector: entry.selector || null,
                    fingerprint: entry.fingerprint || null,
                    deleted: true,
                    style: {},
                    classes: [],
                });
            });
        }
        return { version: 1, items };
    }

    function downloadOverrides(payload) {
        try {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'editor-overrides.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch { }
    }

                el = findByFingerprint(item.fingerprint);
                if (el && item.id) el.setAttribute('data-editor-id', item.id);
                if (el && item.selector) el.dataset.editorSelector = item.selector;
            }
            if (el) return;
            if (!item.insertHtml || !item.parentSelector) return;
            const parent = document.querySelector(item.parentSelector);
            if (!parent) return;
            const temp = document.createElement('div');
            temp.innerHTML = item.insertHtml;
            const node = temp.firstElementChild;
            if (!node) return;
            const before = item.beforeSelector ? document.querySelector(item.beforeSelector) : null;
            parent.insertBefore(node, before || null);
            ensureEditorIdentity(node);
            if (item.id) node.setAttribute('data-editor-id', item.id);
            if (item.selector) node.dataset.editorSelector = item.selector;
        });

        payload.items.forEach(item => {
            let el = null;
            if (item && item.id) {
                el = document.querySelector(`[data-editor-id="${item.id}"]`);
            }
            if (!el && item && item.selector) {
                el = document.querySelector(item.selector);
                if (el && item.id) el.setAttribute('data-editor-id', item.id);
            }
            if (!el && item && item.deleted && item.fingerprint) {
                el = findByFingerprint(item.fingerprint);
                if (el && item.id) el.setAttribute('data-editor-id', item.id);
                if (el && item.selector) el.dataset.editorSelector = item.selector;
            }
            if (!el) {
                if (item && item.deleted) {
                    const entry = { id: item.id || null, selector: item.selector || null, fingerprint: item.fingerprint || null, deleted: true };
                    const key = deletionKey(entry);
                    if (key) editorDeleted.set(key, entry);
                }
                return;
            }
            if (item && item.selector) el.dataset.editorSelector = item.selector;
            if (item && item.fingerprint && !el.dataset.editorFingerprint) {
                try { el.dataset.editorFingerprint = JSON.stringify(item.fingerprint); } catch { }
            }
            if (!item.insert) {
                if (item && typeof item.html === 'string') {
                    el.innerHTML = item.html;
                    el.dataset.editorTextMode = 'html';
                } else if (item && typeof item.text === 'string') {
                    el.textContent = item.text;
                    el.dataset.editorTextMode = 'text';
                } else if (item && typeof item.value === 'string') {
                    el.value = item.value;
                    el.setAttribute('value', item.value);
                    el.dataset.editorTextMode = 'value';
                }
            }
            if (item && item.locked) {
                el.dataset.editorLocked = '1';
                el.classList.add('editor-locked');
            }
            if (item && item.deleted) {
                el.dataset.editorDeleted = "1";
                el.style.setProperty("display", "none", "important");
                const entry = { id: item.id || null, selector: item.selector || null, fingerprint: item.fingerprint || null, deleted: true };
                const key = deletionKey(entry);
                if (key) editorDeleted.set(key, entry);
            }
            if (item && item.style) {
                Object.entries(item.style).forEach(([k, v]) => {
                    try { el.style[k] = v; } catch { }
                });
            }
            if (Array.isArray(item.classes)) {
                item.classes.forEach(c => {
                    if (!c) return;
                    try { el.classList.add(String(c)); } catch { }
                });
            }
        });

        if (editorDeleted.size) {
            editorDeleted.forEach((entry) => {
                if (!entry || !entry.deleted) return;
                let el = null;
                if (entry.id) el = document.querySelector(`[data-editor-id="${entry.id}"]`);
                if (!el && entry.selector) el = document.querySelector(entry.selector);
                if (!el && entry.fingerprint) el = findByFingerprint(entry.fingerprint);
                if (!el) return;
                el.dataset.editorDeleted = "1";
                el.style.setProperty("display", "none", "important");
            });
        }
    }

    function reapplyEditorOverrides() {
        if (!editorOverrides || !Array.isArray(editorOverrides.items)) return;
        applyEditorOverrides(editorOverrides);
    }

    async function loadEditorOverrides() {
        let payload = null;
        let localPayload = null;
        try {
            const raw = localStorage.getItem('kh_editor_overrides_backup');
            if (raw) localPayload = JSON.parse(raw);
        } catch { }
        try {
            const res = await fetch(`${EDITOR_OVERRIDES_URL}?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) payload = await res.json();
        } catch { }
        console.log('[editor] load — server items:', payload && payload.items && payload.items.length, '| local items:', localPayload && localPayload.items && localPayload.items.length);
        const chosen = chooseEditorPayload(payload, localPayload);
        if (!chosen) { ensureEditorObserver(); return; }
        try { localStorage.setItem('kh_editor_overrides_backup', JSON.stringify(chosen)); } catch { }
        console.log('[editor] applying', chosen.items && chosen.items.length, 'items');
        applyEditorOverrides(chosen);
        ensureEditorObserver();
    }

    function collectEditorOverrides() {
        const items = [];
        document.querySelectorAll('[data-editor-id]').forEach(el => {
            const id = el.getAttribute('data-editor-id') || null;
            const selector = el.dataset.editorSelector || null;
            if (!id && !selector) return;
            const style = {};
            const keys = ['left', 'top', 'width', 'height', 'margin', 'padding', 'fontSize', 'fontWeight', 'opacity', 'zIndex', 'color', 'background', 'backgroundColor', 'borderRadius', 'transform'];
            keys.forEach(k => {
                const v = el.style[k];
                if (v) style[k] = v;
            });
            if (el.style.backgroundImage) style.backgroundImage = el.style.backgroundImage;
            if (el.style.backgroundSize) style.backgroundSize = el.style.backgroundSize;
            if (el.style.backgroundPosition) style.backgroundPosition = el.style.backgroundPosition;
            if (el.style.backgroundRepeat) style.backgroundRepeat = el.style.backgroundRepeat;
            const textMode = el.dataset.editorTextMode || '';
            const payload = { id, selector, style, classes: [] };
            if (el.dataset.editorInserted === '1') {
                const parent = el.parentElement;
                const next = el.nextElementSibling;
                payload.insert = true;
                payload.insertHtml = el.outerHTML;
                payload.parentSelector = parent ? buildEditorSelector(parent) : null;
                payload.beforeSelector = next ? (next.dataset.editorSelector || buildEditorSelector(next)) : null;
            }
            const fpRaw = el.dataset.editorFingerprint;
            if (fpRaw) {
                try { payload.fingerprint = JSON.parse(fpRaw); } catch { }
            } else {
                const fp = buildFingerprint(el);
                if (fp) payload.fingerprint = fp;
            }
            if (textMode === 'html') payload.html = el.innerHTML;
            if (textMode === 'text') payload.text = el.innerText || '';
            if (textMode === 'value') payload.value = el.value || '';
            if (el.dataset.editorLocked === '1') payload.locked = true;
            if (el.dataset.editorDeleted === '1') payload.deleted = true;
            if (Object.keys(style).length || payload.html || payload.text || payload.value || payload.deleted || payload.insert) items.push(payload);
        });
        if (editorDeleted.size) {
            editorDeleted.forEach((entry) => {
                if (!entry || !entry.deleted) return;
                const exists = items.some(i => (entry.id && i.id === entry.id) || (entry.selector && i.selector === entry.selector));
                if (exists) return;
                items.push({
                    id: entry.id || null,
                    selector: entry.selector || null,
                    fingerprint: entry.fingerprint || null,
                    deleted: true,
                    style: {},
                    classes: [],
                });
            });
        }
        return { version: 1, items };
    }

    function downloadOverrides(payload) {
        try {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'editor-overrides.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch { }
    }

    async function saveEditorOverrides() {
        const payload = collectEditorOverrides();
        if (payload) payload.updated_at = new Date().toISOString();
        // Always persist locally first — before any network call
        try { localStorage.setItem('kh_editor_overrides_backup', JSON.stringify(payload)); } catch { }
        console.log('[editor] saving', payload.items && payload.items.length, 'items:', JSON.stringify(payload.items));
        try {
            const res = await fetch(EDITOR_SAVE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                console.warn('[editor] server save failed', res.status, errText);
                throw new Error('save failed');
            }
            const out = await res.json();
            const serverData = out.data || out;
            console.log('[editor] server returned', serverData.items && serverData.items.length, 'items');
            // Only update local cache with server data if server returned non-empty items,
            // or if we sent empty items intentionally (cleared overrides).
            const sentItems = payload.items && payload.items.length;
            const gotItems = serverData.items && serverData.items.length;
            const sentCount = Number(sentItems || 0);
            const gotCount = Number(gotItems || 0);
            if (!sentCount || gotCount >= sentCount) {
                editorOverrides = serverData;
                try { localStorage.setItem('kh_editor_overrides_backup', JSON.stringify(editorOverrides)); } catch { }
            } else {
    function ensureEditorObserver() {
        if (editorObserver) return;
        editorObserver = new MutationObserver(() => {
            if (editorReapplyTimer) clearTimeout(editorReapplyTimer);
            editorReapplyTimer = setTimeout(reapplyEditorOverrides, 120);
        });
        try {
            editorObserver.observe(document.body, { subtree: true, childList: true });
        } catch { }
    }

    async function clearEditorOverrides() {
        try {
            const res = await fetch(EDITOR_SAVE_URL, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('clear failed');
            try { localStorage.removeItem('kh_editor_overrides_backup'); } catch { }
            toast('Cambios revertidos', 'info');
            location.reload();
        } catch {
            toast('No se pudo revertir', 'error');
        }
    }

    function ensureEditorToolbar() {
        if (document.getElementById('editor-toolbar')) return;
        const bar = document.createElement('div');
        bar.className = 'editor-toolbar';
        bar.id = 'editor-toolbar';
        bar.classList.add('hidden');
        bar.innerHTML = `
          <button type="button" id="editor-toggle">Editar</button>
                // Server returned fewer items than we sent — keep our local version
                console.warn('[editor] server returned fewer items than sent, keeping local');
                editorOverrides = payload;
            }
            toast('Cambios guardados', 'success');
            downloadOverrides(editorOverrides);
        } catch {
            editorOverrides = payload;
            toast('Guardado local (sin red)', 'info');
            downloadOverrides(payload);
        }
        reapplyEditorOverrides();
    }

    function parseEditorTimestamp(payload) {
        if (!payload || !payload.updated_at) return 0;
        const ts = Date.parse(payload.updated_at);
        return Number.isFinite(ts) ? ts : 0;
    }

    function hasEditorItems(payload) {
        return !!(payload && Array.isArray(payload.items) && payload.items.length);
    }

    function chooseEditorPayload(remote, local) {
        if (!remote && !local) return null;
        if (remote && !local) return remote;
        if (!remote && local) return local;
        const remoteHas = hasEditorItems(remote);
        const localHas = hasEditorItems(local);
        if (localHas && !remoteHas) return local;
        if (remoteHas && !localHas) return remote;
        const rts = parseEditorTimestamp(remote);
        const lts = parseEditorTimestamp(local);
        if (rts && lts) return rts >= lts ? remote : local;
        if (lts && !rts) return local;
        return remote || local;
    }

    function ensureEditorObserver() {
        if (editorObserver) return;
        editorObserver = new MutationObserver(() => {
            if (editorReapplyTimer) clearTimeout(editorReapplyTimer);
            editorReapplyTimer = setTimeout(reapplyEditorOverrides, 120);
        });
        try {
            editorObserver.observe(document.body, { subtree: true, childList: true });
        } catch { }
    }

    async function clearEditorOverrides() {
        try {
            const res = await fetch(EDITOR_SAVE_URL, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('clear failed');
            try { localStorage.removeItem('kh_editor_overrides_backup'); } catch { }
            toast('Cambios revertidos', 'info');
            location.reload();
        } catch {
            toast('No se pudo revertir', 'error');
        }
    }

    function ensureEditorToolbar() {
        if (document.getElementById('editor-toolbar')) return;
        const bar = document.createElement('div');
        bar.className = 'editor-toolbar';
        bar.id = 'editor-toolbar';
        bar.classList.add('hidden');
        bar.innerHTML = `
          <button type="button" id="editor-toggle">Editar</button>
          <button type="button" class="is-primary" id="editor-apply">Aplicar y colgar</button>
          <button type="button" id="editor-copy">Copiar bloque</button>
          <button type="button" id="editor-paste">Pegar bloque</button>
          <button type="button" id="editor-dup">Duplicar</button>
          <button type="button" id="editor-del">Eliminar</button>
          <button type="button" id="editor-undo" title="Deshacer">⟲</button>
          <button type="button" id="editor-snap">Imán</button>
          <button type="button" id="editor-reset">Revertir todo</button>
          <button type="button" id="editor-reset-item">Reset elemento</button>
          <button type="button" id="editor-admin-logout">Cerrar Sesion Admin</button>
        `;
          <div class="editor-field"><span>Z</span><input id="editor-zi" type="number" placeholder="1" /></div>
          <div class="editor-field editor-field--wide"><span>Margin</span><input id="editor-mg" type="text" placeholder="0" /></div>
          <div class="editor-field editor-field--wide"><span>Padding</span><input id="editor-pd" type="text" placeholder="0" /></div>
          <div class="editor-field editor-field--wide"><span>Texto</span><textarea id="editor-text" rows="3" placeholder="Editar texto"></textarea></div>
          <button type="button" class="editor-text-toggle" id="editor-text-toggle">Editar texto inline</button>
          <button type="button" class="editor-text-toggle" id="editor-lock">Bloquear</button>
        `;
        document.body.appendChild(panel);

        const toggle = bar.querySelector('#editor-toggle');
        const apply = bar.querySelector('#editor-apply');
        const copyBtn = bar.querySelector('#editor-copy');
        const pasteBtn = bar.querySelector('#editor-paste');
        const dupBtn = bar.querySelector('#editor-dup');
        const reset = bar.querySelector('#editor-reset');
        const resetItem = bar.querySelector('#editor-reset-item');
        const undoBtn = bar.querySelector('#editor-undo');
        const delBtn = bar.querySelector('#editor-del');
        const snapBtn = bar.querySelector('#editor-snap');
        const adminLogout = bar.querySelector('#editor-admin-logout');

        toggle.addEventListener('click', () => setEditorMode(!editorEnabled));
        apply.addEventListener('click', async () => {

        toggle.addEventListener('click', () => setEditorMode(!editorEnabled));
        apply.addEventListener('click', async () => {
            await saveEditorOverrides();
            setEditorMode(false);
        });
        if (copyBtn) copyBtn.addEventListener('click', copyEditorBlock);
        if (pasteBtn) pasteBtn.addEventListener('click', pasteEditorBlock);
        if (dupBtn) dupBtn.addEventListener('click', duplicateEditorBlock);
        reset.addEventListener('click', clearEditorOverrides);
        if (resetItem) resetItem.addEventListener('click', resetEditorSelection);
        if (undoBtn) undoBtn.addEventListener('click', undoEditorStep);
        if (delBtn) delBtn.addEventListener('click', deleteEditorSelection);
        if (snapBtn) {
            snapBtn.addEventListener('click', () => {
                editorSnapEnabled = !editorSnapEnabled;
                snapBtn.classList.toggle('is-active', editorSnapEnabled);
            });
        }
        if (adminLogout) {
            adminLogout.addEventListener('click', async () => {
                setEditorMode(false);
                document.body.classList.remove('editor-admin');
                try {
                    await fetch('/api/v1/admin/auth/logout', { method: 'POST', credentials: 'include' });
                } catch { }
                try {
                    const barEl = document.getElementById('editor-toolbar');
                    if (barEl) barEl.classList.add('hidden');
                } catch { }
            });
        }

    function pushUpdateSnapshot(el) {
        if (!el) return;
            if (!parent) break;
            const siblings = Array.from(parent.children).filter(n => n.tagName === node.tagName);
            const idx = siblings.indexOf(node) + 1;
            parts.unshift(`${tag}:nth-of-type(${idx})`);
            node = parent;
        }
        return `body > ${parts.join(' > ')}`;
    }

    function buildFingerprint(el) {
        if (!el || !el.tagName) return null;
        const tag = el.tagName.toLowerCase();
        const src = el.getAttribute && el.getAttribute('src') ? el.getAttribute('src') : '';
        const text = (el.innerText || '').trim().slice(0, 60);
        const parentSelector = el.parentElement ? buildEditorSelector(el.parentElement) : '';
        const index = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0;
        return { tag, src, text, parentSelector, index };
    }

    function findByFingerprint(fp) {
        if (!fp || !fp.tag) return null;
        let scope = document;
        if (fp.parentSelector) {
            const parent = document.querySelector(fp.parentSelector);
            if (parent) scope = parent;
        }
        let candidates = Array.from(scope.querySelectorAll(fp.tag));
        if (fp.src) candidates = candidates.filter(el => (el.getAttribute('src') || '') === fp.src);
        if (fp.text) candidates = candidates.filter(el => (el.innerText || '').trim().includes(fp.text));
        if (fp.index != null && candidates[fp.index]) return candidates[fp.index];
        return candidates[0] || null;
    }

    function ensureEditorIdentity(el) {
        if (!el || !el.setAttribute) return;
        if (!el.getAttribute('data-editor-id')) {
            const id = `auto-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            el.setAttribute('data-editor-id', id);
        }
        if (!el.dataset.editorSelector) {
            const selector = buildEditorSelector(el);
            if (selector) el.dataset.editorSelector = selector;
        }
        if (!el.dataset.editorFingerprint) {
            const fp = buildFingerprint(el);
            if (fp) {
                try { el.dataset.editorFingerprint = JSON.stringify(fp); } catch { }
            }
        }
        storeEditorOriginal(el);
    }

    function deletionKey(entry) {
        if (!entry) return '';
        if (entry.id) return `id:${entry.id}`;
        if (entry.selector) return `sel:${entry.selector}`;
        if (entry.fingerprint) return `fp:${JSON.stringify(entry.fingerprint)}`;
        return '';
    }

    function escapeAttr(value) {
        return String(value || '').replace(/"/g, '\\"');
    }

    function applyDeletedCss() {
        const entries = Array.from(editorDeleted.values());
        const selectors = [];
        entries.forEach((entry) => {
            if (!entry || !entry.deleted) return;
            if (entry.id) selectors.push(`[data-editor-id="${escapeAttr(entry.id)}"]`);
            if (entry.selector) selectors.push(entry.selector);
            if (entry.fingerprint && entry.fingerprint.tag === 'img' && entry.fingerprint.src) {
                selectors.push(`img[src=\"${escapeAttr(entry.fingerprint.src)}\"]`);
            }
        });
        const css = selectors.length ? `${selectors.join(',')} { display: none !important; }` : '';
        let styleEl = document.getElementById('editor-deleted-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'editor-deleted-style';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
    }

    function applyEditorPosition(el, x, y) {
        if (!el) return;
        if (el.dataset.editorLocked === '1') return;
        const pos = getComputedStyle(el).position;
        if (pos === 'static') el.style.position = 'relative';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        updateEditorPanel(el);
    }

    function updateEditorPanel(el) {
        if (!el) return;
        const panel = document.getElementById('editor-panel');
        if (!panel) return;
        const x = parseFloat(el.style.left || 0) || 0;
        const y = parseFloat(el.style.top || 0) || 0;
        const rect = el.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const color = el.style.color || '';
        const bg = el.style.background || el.style.backgroundColor || '';
        const fs = parseFloat(el.style.fontSize || 0) || '';
        const fw = el.style.fontWeight || '';
        const op = el.style.opacity || '';
        const zi = el.style.zIndex || '';
        const mg = el.style.margin || '';
        const pd = el.style.padding || '';
        const bgImg = (el.style.backgroundImage || '').replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        const bgPos = el.style.backgroundPosition || '';
        const bgSize = el.style.backgroundSize || '';
        const tag = el.tagName || '';
        const textVal = (tag === 'INPUT' || tag === 'TEXTAREA') ? (el.value || '') : (el.innerText || '');
        panel.querySelector('#editor-x').value = x;
        panel.querySelector('#editor-y').value = y;
        panel.querySelector('#editor-w').value = w;
        panel.querySelector('#editor-h').value = h;
        panel.querySelector('#editor-color').value = color;
        panel.querySelector('#editor-bg').value = bg;
        panel.querySelector('#editor-fs').value = fs;
        panel.querySelector('#editor-fw').value = fw;
        panel.querySelector('#editor-op').value = op;
        panel.querySelector('#editor-zi').value = zi;
        panel.querySelector('#editor-mg').value = mg;
        panel.querySelector('#editor-pd').value = pd;
        const bgImgInput = panel.querySelector('#editor-bg-img');
        const bgPosInput = panel.querySelector('#editor-bg-pos');
        const bgSizeInput = panel.querySelector('#editor-bg-size');
        if (bgImgInput) bgImgInput.value = bgImg && bgImg !== 'none' ? bgImg : '';
        if (bgPosInput) bgPosInput.value = bgPos;
        if (bgSizeInput) bgSizeInput.value = bgSize;
        const txtInput = panel.querySelector('#editor-text');
        if (txtInput) txtInput.value = textVal;
        const lockBtn = panel.querySelector('#editor-lock');
        if (lockBtn) lockBtn.textContent = (el.dataset.editorLocked === '1') ? 'Desbloquear' : 'Bloquear';
    }

    function initEditorPalettes() {
        const colorPalette = document.getElementById('editor-color-palette');
        const bgPalette = document.getElementById('editor-bg-palette');
        if (!colorPalette || !bgPalette) return;
        if (colorPalette.dataset.ready === '1') return;

        const textColors = ['#111827', '#1F2937', '#6B7280', '#B07A1B', '#2563EB', '#7C3AED', '#DC2626', '#0F766E'];
        const bgColors = ['#FFFFFF', '#F3F4F6', '#E5E7EB', '#FFF4DB', '#EFF6FF', '#F5F3FF', '#FEE2E2', '#ECFEFF'];

        const renderSwatches = (wrap, colors, isLight) => {
            wrap.innerHTML = '';
            colors.forEach(c => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `editor-swatch${isLight ? ' is-light' : ''}`;
                b.style.background = c;
                b.dataset.color = c;
                b.addEventListener('click', () => {
                    if (!editorSelected) return;
                    if (wrap.id === 'editor-color-palette') {
                        const input = document.getElementById('editor-color');
                        if (input) input.value = c;
                        editorSelected.style.color = c;
                    } else {
                        const input = document.getElementById('editor-bg');
                        if (input) input.value = c;
                        editorSelected.style.background = c;
                    }
                });
                wrap.appendChild(b);
            });
        };

        renderSwatches(colorPalette, textColors, true);
        renderSwatches(bgPalette, bgColors, true);
        colorPalette.dataset.ready = '1';
    }

    function initEditorInteractions() {
        if (window.__khEditorInit) return;
        window.__khEditorInit = true;
        const guideX = document.createElement('div');
        guideX.className = 'editor-guide editor-guide--x';
        const guideY = document.createElement('div');
        guideY.className = 'editor-guide editor-guide--y';
        document.body.appendChild(guideX);
        document.body.appendChild(guideY);
        document.addEventListener('click', (e) => {
            if (!editorEnabled) return;
            const isToolbar = e.target.closest('.editor-toolbar') || e.target.closest('.editor-panel');
            if (isToolbar) return;
            const target = e.target.closest('body *:not(script):not(style)');
            if (!target) return;
            const rects = target.getClientRects();
            if (!rects || !rects.length) return;
            e.preventDefault();
            ensureEditorIdentity(target);
            clearEditorSelection();
            editorSelected = target;
            target.classList.add('editor-selected');
            const handle = document.createElement('div');
            handle.className = 'editor-handle';
            target.appendChild(handle);
            updateEditorPanel(target);
        });

        document.addEventListener('pointerdown', (e) => {
            if (!editorEnabled) return;
            const handle = e.target.closest('.editor-handle');
            if (handle && editorSelected) {
                editorResizing = true;
                pushUpdateSnapshot(editorSelected);
                const rect = editorSelected.getBoundingClientRect();
                editorStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
                e.preventDefault();
                return;
            }
            const target = e.target.closest('[data-editor-id]');
            if (!target || !editorSelected || target !== editorSelected) return;
            editorDragging = true;
            pushUpdateSnapshot(editorSelected);
            editorStart = {
                x: e.clientX,
                y: e.clientY,
                left: parseFloat(editorSelected.style.left || 0) || 0,
                top: parseFloat(editorSelected.style.top || 0) || 0,
            };
            e.preventDefault();
        });

        document.addEventListener('pointermove', (e) => {
            if (!editorEnabled || !editorSelected || !editorStart) return;
            if (editorDragging) {
                const dx = e.clientX - editorStart.x;
                const dy = e.clientY - editorStart.y;
                let nextLeft = editorStart.left + dx;
                let nextTop = editorStart.top + dy;
                if (editorSnapEnabled) {
                    const parent = editorSelected.offsetParent || document.body;
                    const parentRect = parent.getBoundingClientRect();
                    const rect = editorSelected.getBoundingClientRect();
                    const centerX = nextLeft + rect.width / 2;
                    const centerY = nextTop + rect.height / 2;
                    const targetCenterX = parentRect.width / 2;
                    const targetCenterY = parentRect.height / 2;
                    const snapPx = 8;
                    if (Math.abs(centerX - targetCenterX) <= snapPx) {
                        nextLeft = targetCenterX - rect.width / 2;
                        guideX.style.left = `${parentRect.left + targetCenterX}px`;
                        guideX.style.display = 'block';
                    } else {
                        guideX.style.display = 'none';
                    }
                    if (Math.abs(centerY - targetCenterY) <= snapPx) {
                        nextTop = targetCenterY - rect.height / 2;
                        guideY.style.top = `${parentRect.top + targetCenterY}px`;
                        guideY.style.display = 'block';
                    } else {
                        guideY.style.display = 'none';
                    }
                }
                applyEditorPosition(editorSelected, nextLeft, nextTop);
            }
            if (editorResizing) {
                const dx = e.clientX - editorStart.x;
                const dy = e.clientY - editorStart.y;
                const w = Math.max(40, editorStart.w + dx);
                const h = Math.max(24, editorStart.h + dy);
                editorSelected.style.width = `${Math.round(w)}px`;
                editorSelected.style.height = `${Math.round(h)}px`;
                updateEditorPanel(editorSelected);
            }
        });

        document.addEventListener('pointerup', () => {
            editorDragging = false;
            editorResizing = false;
            editorStart = null;
            guideX.style.display = 'none';
            guideY.style.display = 'none';
        });

        document.addEventListener('keydown', (e) => {
            if (!editorEnabled) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undoEditorStep();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
                e.preventDefault();
                deleteEditorSelection();
            }
        });
    }

    async function initEditorMode() {
        try {
            const res = await fetch('/api/v1/admin/auth/me', { credentials: 'include', cache: 'no-store' });
            if (!res.ok) return;
            ensureEditorToolbar();
            document.body.classList.add('editor-admin');
            const bar = document.getElementById('editor-toolbar');
            if (bar) bar.classList.remove('hidden');
            initEditorInteractions();
        } catch { }
    }

    function initFloatingCreate() {
        const btnA = document.getElementById('floating-create');
        const btnB = document.getElementById('floating-virtud');
        if (!btnA && !btnB) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const seedA = Math.random() * Math.PI * 2;
        const seedB = Math.random() * Math.PI * 2;
        const seedC = Math.random() * Math.PI * 2;
        const seedD = Math.random() * Math.PI * 2;
        const seedE = Math.random() * Math.PI * 2;
        const seedF = Math.random() * Math.PI * 2;
        const seedG = Math.random() * Math.PI * 2;
        let lastTime = performance.now();
        let rafId = null;
        let scrollRaf = null;
        const bounds = { minY: 0, maxY: 0, range: 0 };
        const minDist = 130;

        const stateA = { impulseX: 0, impulseY: 0, velX: 0, velY: 0 };
        const stateB = { impulseX: 0, impulseY: 0, velX: 0, velY: 0 };

        function clamp(val, min, max) {
            return Math.min(max, Math.max(min, val));
        }

        function updateBounds() {
            const vh = Math.max(320, window.innerHeight || 0);
            const btnH = Math.max(btnA ? btnA.offsetHeight : 0, btnB ? btnB.offsetHeight : 0, 56);
            const minY = Math.max(16, Math.round(vh * 0.14));
            const maxY = Math.min(Math.round(vh * 0.84), vh - btnH - 18);
            bounds.minY = minY;
            bounds.maxY = Math.max(minY + 100, maxY);
            bounds.range = Math.max(1, bounds.maxY - bounds.minY);
        }

        function setStaticPosition() {
            updateBounds();
            const yA = bounds.minY + bounds.range * 0.32;
            const yB = bounds.minY + bounds.range * 0.68;
            if (btnA) btnA.style.transform = `translate3d(0, ${yA.toFixed(1)}px, 0) scale(1)`;
            if (btnB) btnB.style.transform = `translate3d(0, ${yB.toFixed(1)}px, 0) scale(1)`;
        }

        function kickImpulse() {
            const angle = (Math.PI / 2) + (Math.random() * 0.7 - 0.35);
            const mag = 28 + Math.random() * 20;
            stateA.velX += Math.cos(angle) * mag;
            stateA.velY += Math.sin(angle) * mag;
            stateB.velX += Math.cos(angle + Math.PI) * mag;
            stateB.velY += Math.sin(angle + Math.PI) * mag;
        }

        function stepState(state, dt) {
            const spring = 8.2;
            const damping = 5.4;
            const ax = (-spring * state.impulseX) - (damping * state.velX);
            const ay = (-spring * state.impulseY) - (damping * state.velY);
            state.velX += ax * dt;
            state.velY += ay * dt;
            state.impulseX += state.velX * dt;
            state.impulseY += state.velY * dt;
            state.impulseX = clamp(state.impulseX, -54, 54);
            state.impulseY = clamp(state.impulseY, -70, 70);
        }

        function tick(now) {
            const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
            lastTime = now;

            const t = now / 1000;
            const sweep = (Math.sin(t * 0.18 + seedA) + 1) / 2;
            const baseY1 = bounds.minY + sweep * bounds.range;
            const baseY2 = bounds.minY + (1 - sweep) * bounds.range;

            const driftX = Math.sin(t * 0.55 + seedB) * 12 + Math.sin(t * 0.22 + seedC) * 8;
            const flutterX = Math.sin(t * 1.35 + seedD) * 2.6;
            const driftX2 = -(Math.sin(t * 0.48 + seedE) * 12 + Math.sin(t * 0.26 + seedF) * 7.5);
            const flutterX2 = Math.sin(t * 1.15 + seedG) * 2.4;

            stepState(stateA, dt);
            stepState(stateB, dt);

            let x1 = driftX + flutterX + stateA.impulseX;
            let y1 = baseY1 + stateA.impulseY;
            let x2 = driftX2 + flutterX2 + stateB.impulseX;
            let y2 = baseY2 + stateB.impulseY;

            y1 = clamp(y1, bounds.minY, bounds.maxY);
            y2 = clamp(y2, bounds.minY, bounds.maxY);

            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < minDist) {
                const push = (minDist - dist) * 0.5;
                const nx = dx / dist;
                const ny = dy / dist;
                x1 -= nx * push;
                y1 -= ny * push;
                x2 += nx * push;
                y2 += ny * push;
            }

            const zoom1 = 1 + (Math.sin(t * 0.85 + seedE) * 0.012) + (Math.sin(t * 1.55 + seedF) * 0.008);
            const zoom2 = 1 + (Math.sin(t * 0.95 + seedG) * 0.012) + (Math.sin(t * 1.25 + seedA) * 0.008);

            if (btnA) btnA.style.transform = `translate3d(${x1.toFixed(2)}px, ${y1.toFixed(2)}px, 0) scale(${zoom1.toFixed(3)})`;
            if (btnB) btnB.style.transform = `translate3d(${x2.toFixed(2)}px, ${y2.toFixed(2)}px, 0) scale(${zoom2.toFixed(3)})`;
            rafId = requestAnimationFrame(tick);
        }

        updateBounds();

        window.addEventListener('resize', () => {
            updateBounds();
        }, { passive: true });

        window.addEventListener('scroll', () => {
            if (scrollRaf) return;
            scrollRaf = requestAnimationFrame(() => {
                scrollRaf = null;
                kickImpulse();
            });
        }, { passive: true });

        if (reduceMotion.matches) {
            setStaticPosition();
            return;
        }

        rafId = requestAnimationFrame(tick);
        reduceMotion.addEventListener('change', (evt) => {
            if (evt.matches) {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = null;
                setStaticPosition();
                return;
            }
            if (!rafId) {
                lastTime = performance.now();
                rafId = requestAnimationFrame(tick);
            }
        });
    }

    function initUsecasesTicker() {
        const ticker = document.querySelector('.usecases-ticker');
        const inner = ticker ? ticker.querySelector('.usecases-ticker-inner') : null;
        const track = ticker ? ticker.querySelector('.usecases-track') : null;
        if (!ticker || !inner || !track) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let baseSpeed = 95; // px/s
        let speed = baseSpeed;
        let target = baseSpeed;
        let offset = 0;
        let trackWidth = 0;
        let last = performance.now();

        const updateWidth = () => {
            trackWidth = track.scrollWidth || 0;
            if (!trackWidth) return;
            offset = offset % trackWidth;
        };

        const frame = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (trackWidth) {
                speed += (target - speed) * 0.05;
                offset = (offset + speed * dt) % trackWidth;
                inner.style.transform = `translateX(${-offset}px)`;
            }
            requestAnimationFrame(frame);
        };

        const onHover = (state) => {
            target = state ? baseSpeed * 0.5 : baseSpeed;
        };

        ticker.addEventListener('mouseenter', () => onHover(true));
        ticker.addEventListener('mouseleave', () => onHover(false));
        window.addEventListener('resize', updateWidth);
        updateWidth();
        requestAnimationFrame(frame);
    }

    /* ── Auto-restore session ─────────────────────────────────────────────────── */
    async function tryRestoreSession() {
        if (!KHApi.getToken()) return;
        try {
            const user = await KHApi.getMe();
            loadUserInfo(user);
            const savedPage = getSavedPage();
            if (savedPage === 'dashboard') {
                showPage('page-dashboard');
                setDashView(getSavedDashView(), { noScroll: true });
                setTimeout(maybeStartTutorialAfterLogin, 120);
            } else {
                showPage('page-landing');
            }
            // Precarga ligera: eligibility para nudges/labels; evita cargar todo el dashboard.
            loadPremiumProgress();
            if (postLoginAction === 'automatch_invite') {
                postLoginAction = null;
                openAutomatchFromInvite();
                return;
            }
            setTimeout(renderNext, 60);
        } catch {
            KHApi.clearToken(); // Token expired / invalid
            currentUser = null;
            setLandingSessionUI(null);
        }
    }

    /* ── Init ─────────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        bindDataHandlers();
        bindImageFallbacks();
        bindFeedTabs();
        initOAuthButtons();
        initFloatingCreate();
        initScrollTopButton();
        initNavAutoHide();
        initAutoMatchStatusStrip();
        const oauthHandled = handleOAuthRedirect();
        handleInviteRedirect();
        initReveal();
        initKpiCounters();
        initUsecasesTicker();
        const initialPage = (KHApi.getToken() && getSavedPage() === 'dashboard') ? 'page-dashboard' : 'page-landing';
        showPage(initialPage);
        setTimeout(maybePromptAppDownload, 2400);
        initCookieConsent();
        initCustomSelects();
        loadEditorOverrides();
        initEditorMode();
        setTimeout(initEditorMode, 1200);
        setTimeout(reapplyEditorOverrides, 1800);
        if (!oauthHandled) tryRestoreSession();
        else setTimeout(tryRestoreSession, 80);
        // Sync tabs with persisted view (or default)
        setDashView(getSavedDashView(), { noAutoLoad: true, noScroll: true });
        // Default selection on dashboard create card
        selectCreateKind('request');

        // Default compensation selectors
        selectComp('req', 'cash');
        selectComp('off', 'cash');
        // Default premium selection (annual)
        setPremiumInterval('year');

        // Header search: jump to explore
        const navQ = document.getElementById('nav-search');
        if (navQ) {
            navQ.addEventListener('keydown', async e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const q = String(navQ.value || '').trim();
                if (!q) {
                    const target = document.getElementById('how');
                    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                }

                if (!KHApi.getToken()) {
                    pendingSearchQuery = q;
                    postLoginAction = 'nav_search';
                    toast('Inicia sesión para ver resultados', 'info');
                    openLogin();
                    return;
                }

                await goDashboardFromLanding('explorar');
                applyFeedSearch(q, { scroll: true });
            });
        }

        // Footer year (legal pages are static too)
        const y = document.getElementById('footer-year');
        if (y) y.textContent = String(new Date().getFullYear());

        // Close account menu on outside click
        document.addEventListener('click', (e) => {
            const pop = document.getElementById('dash-menu-pop');
            const btn = document.getElementById('dash-menu-btn');
            if (!pop || pop.classList.contains('hidden')) return;
            if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
            closeDashMenu();
        });

        // Close landing menu on outside click
        document.addEventListener('click', (e) => {
            const pop = document.getElementById('nav-menu-pop');
            const btn = document.getElementById('nav-burger');
            if (!pop || pop.classList.contains('hidden')) return;
            if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
            closeLandingMenu();
        });

        // Close notifications panel on outside click
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notif-panel');
            const btn = document.getElementById('notif-bell-btn');
            if (!panel || panel.classList.contains('hidden')) return;
            if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
            closeNotifPanel();
        });
    });

    /* ── Report modal ────────────────────────────────────────────────────────── */
    function openReportModal(targetType, targetId) {
        if (!KHApi.getToken()) {
            toast('Inicia sesión para reportar contenido', 'error');
            openLogin();
            return;
        }
        const el = $('modal-report');
        if (!el) return;
        $('report-target-type').value = targetType;
        $('report-target-id').value = targetId;
        $('report-reason').value = 'spam';
        el.classList.remove('hidden');
    }

    function closeReportModal(event) {
        if (event && event.target !== $('modal-report')) return;
        hide($('modal-report'));
    }

    async function submitReport() {
        const targetType = $('report-target-type').value;
        const targetId = $('report-target-id').value;
        const reason = $('report-reason').value;
        if (!targetType || !targetId) return;
        const btn = $('btn-report-submit');
        setLoading(btn, true);
        try {
            await KHApi.createReport({ target_type: targetType, target_id: targetId, reason });
            hide($('modal-report'));
            toast('Reporte enviado. Revisaremos el contenido en breve.', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo enviar el reporte', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    /* ── Public API ───────────────────────────────────────────────────────────── */
    window.KHApp = {
        goLanding,
        goDashboard,
        toggleDashMenu,
        gotoDashFromMenu,
        openCookieSettings,
        closeCookieSettings,
        acceptCookiesAll,
        rejectCookiesAll,
        saveCookiePreferences,
        openLogin,
        openAppDownloadModal,
        showAuthChooser,
        showEmailAuth,
        showPasswordReset,
        authProvider,
        startFirstMatch,
        setDashView,
        tutorialNext,
        tutorialSkip,
        closeUpgradeModal,
        openPremiumFromNudge,
        goPremiumTab,
        closeBadgeNudge,
        goCollectionsFromNudge,
        goBadgesFromNudge,
        selectCreateKind,
        selectComp,
        clearFieldError,
        onFieldInput,
        setCreationsFilter,
        setMatchesFilter,
        resetCreateForm,
        scrollToCreations,
        closeLogin,
        closeLoginDirect,
        closeAppDownloadModal,
        submitLogin,
        submitRegister,
        submitForgotPassword,
        loadProfile,
        loadFavoritesSection,
        goCreateFromFab,
        scrollToProfileSection,
        submitProfile,
        resendVerifyEmail,
        pickProfilePhoto,
        uploadProfilePhoto,
        deleteProfilePhoto,
        pickRequestPhoto,
        uploadRequestPhoto,
        deleteRequestPhoto,
        pickOfferPhoto,
        uploadOfferPhoto,
        deleteOfferPhoto,
        pickPrePhoto,
        addPrePhoto,
        removePrePhoto,
        loadFeed,
        loadAutoMatch,
        saveAutoMatchSettings,
        setAutoMatchMode,
        toggleSimpleRole,
        setSimpleRadius,
        acceptAutoMatch,
        declineAutoMatch,
        setAutoMatchFilter,
        hubStartCreate,
        hubGoAutoMatch,
        startPremiumCheckout,
        setPremiumInterval,
        tryUnlockPremiumByReputation,
        loadPremiumProgress,
        loadLeaderboard,
        openRanking,
        openRankingPage,
        closeRankingModal,
        toggleLandingMenu,
        closeLandingMenu,
        scrollToTop,
        goDashboardFromLanding,
        goAutoMatchFromMenu,
        rankingLoadMore,
        setRankingScope,
        setRankingRadius,
        setRankingLevel,
        useMyLocation,
        setRankingQuery,
        closeUserCard,
        closeFeedDetails,
        feedDetailsCreateMatch,
        userCardToggleBadges,
        loadBadgesMine,
        dismissNext,
        runNext,
        runNextSecondary,
        openChat,
        closeChat,
        chatSelectComp,
        chatPickCoins,
        chatConfirmAgreement,
        chatSend,
        openRating,
        closeRating,
        submitRating,
        logout,
        ping,
        loadLedger,
        createRequest,
        createOffer,
        showCreatePreview,
        backToEdit,
        confirmCreate,
        openReportModal,
        closeReportModal,
        submitReport,
        loadSuggestedProviders,
        loadCreations,
        loadMatches,
        toggleNotifPanel,
        closeNotifPanel,
        markAllNotifsReadUI,
    };

    // Back-compat: tolerate console checks like `khapp` / `khapi`.
    // These were used informally during debugging.
    try { window.khapp = window.KHApp; } catch { }
})();

