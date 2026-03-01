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
    let quickDraft = null;
    let createKind = 'request';
    const creationsFilter = { kind: 'all', status: 'active', q: '' };
    const matchesFilter = { status: 'all', q: '' };

    let chatMatchId = null;
    let chatPollTimer = null;
    let chatComp = 'cash';
    const autoChatOpened = new Set();

    let premiumInterval = 'year';

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
        btn.disabled = state;
        if (label) label.style.opacity = state ? 0 : 1;
        if (spinner) state ? show(spinner) : hide(spinner);
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
        const kpiObs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    const target = parseInt(e.target.dataset.target);
                    animateCounter(e.target, target);
                    kpiObs.unobserve(e.target);
                }
            });
        }, { threshold: 0.5 });
        document.querySelectorAll('.kpi-value[data-target]').forEach(el => kpiObs.observe(el));
    }

    /* ── Page Navigation ──────────────────────────────────────────────────────── */
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

        relocateThemeToggle(pageId);

        if (pageId === 'page-landing') {
            onLandingShown();
        }
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
        const out = document.getElementById('nav-logout-btn');
        const rank = document.getElementById('nav-ranking-btn');
        const logged = !!(user && user.id);
        if (auth) auth.classList.toggle('hidden', logged);
        if (panel) panel.classList.toggle('hidden', !logged);
        if (out) out.classList.toggle('hidden', !logged);
        if (rank) rank.classList.toggle('hidden', !logged);
    }

    /* ── Dashboard account menu ───────────────────────────────────────────── */
    function toggleDashMenu(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
        const pop = document.getElementById('dash-menu-pop');
        const btn = document.getElementById('dash-menu-btn');
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

    function closeDashMenu() {
        const pop = document.getElementById('dash-menu-pop');
        const btn = document.getElementById('dash-menu-btn');
        if (pop) pop.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function gotoDashFromMenu(view) {
        closeDashMenu();
        setDashView(view);
    }

    /* ── Dashboard views (tabs) ─────────────────────────────────────────────── */
    function normalizeDashView(view) {
        const v = String(view || '').toLowerCase();
        if (v === 'inicio' || v === 'automatch' || v === 'explorar' || v === 'crear' || v === 'creaciones' || v === 'matches' || v === 'perfil' || v === 'premium') return v;
        return 'explorar';
    }

    function getSavedDashView() {
        try {
            return normalizeDashView(localStorage.getItem('kh_dash_view'));
        } catch {
            return 'crear';
        }
    }

    const dashAutoLoadAt = { inicio: 0, automatch: 0, explorar: 0, crear: 0, creaciones: 0, matches: 0, perfil: 0, premium: 0 };

    let automatchPollTimer = null;
    let automatchCountdownTimer = null;
    let feedDebounce = null;
    let premiumNudgeTimer = null;

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

        if (opts.noAutoLoad) return;

        // Start/stop view-specific polling
        if (automatchPollTimer) { clearInterval(automatchPollTimer); automatchPollTimer = null; }
        if (automatchCountdownTimer) { clearInterval(automatchCountdownTimer); automatchCountdownTimer = null; }

        // Lazy refresh on section entry (avoid spamming requests)
        const now = Date.now();
        if (now - (dashAutoLoadAt[v] || 0) < 5000) return;
        dashAutoLoadAt[v] = now;

        if (v === 'explorar') loadFeed();
        if (v === 'inicio') loadHub();
        if (v === 'automatch') {
            loadAutoMatch();
            automatchPollTimer = setInterval(() => {
                const root = document.querySelector('main.dashboard');
                if (!root || root.dataset.view !== 'automatch') return;
                loadAutoMatch({ silent: true });
            }, 12000);
            automatchCountdownTimer = setInterval(() => {
                const root = document.querySelector('main.dashboard');
                if (!root || root.dataset.view !== 'automatch') return;
                tickInviteCountdowns();
            }, 1000);
        }
        if (v === 'creaciones') loadCreations();
        if (v === 'matches') loadMatches();
        if (v === 'perfil') { loadProfile(); loadBadgesMine(); }
        if (v === 'premium') { loadPremiumProgress(); loadLeaderboard(); }
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

    function shouldShowHub(user) {
        const premium = isPremiumActive(user);
        if (premium) {
            try { return localStorage.getItem('kh_hub_seen_premium') !== '1'; } catch { return true; }
        }
        try {
            const last = Number(localStorage.getItem('kh_hub_last_shown') || 0);
            return (Date.now() - last) > 24 * 3600 * 1000;
        } catch {
            return true;
        }
    }

    function markHubShown(user) {
        const premium = isPremiumActive(user);
        try {
            if (premium) localStorage.setItem('kh_hub_seen_premium', '1');
            else localStorage.setItem('kh_hub_last_shown', String(Date.now()));
            // Si mostramos Hub, no necesitamos el nudge hoy.
            localStorage.setItem('kh_premium_nudge_ts', String(Date.now()));
        } catch { }
    }

    function enterDashboardDefault(user) {
        const premium = isPremiumActive(user);
        // Hub rule (opcion 2): premium 1 vez (por navegador); no-premium 1 vez al dia.
        if (shouldShowHub(user)) {
            markHubShown(user);
            setDashView('inicio', { noScroll: true });
            return;
        }

        const initial = premium ? 'automatch' : 'explorar';
        setDashView(initial, { noScroll: true });
        if (!premium) schedulePremiumNudge();
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
            foot.textContent = leftPartners > 0
                ? `Te faltan ${leftRep} rep y ${leftPartners} vecinos distintos para desbloquear Premium.`
                : (leftRep === 0 ? 'Listo para desbloquear Premium.' : `Te faltan ${leftRep} rep para desbloquear Premium.`);
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
        }, 2000);
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
        if (kind === 'offer') {
            const f = $('offer-form');
            if (f) f.reset();
            hide($('off-created'));
            show($('off-form-wrap'));
            selectCreateKind('offer');
            selectComp('off', (document.getElementById('off-comp') && document.getElementById('off-comp').value) || 'cash');
            const t = $('off-title');
            if (t) t.focus();
            return;
        }

        const f = $('request-form');
        if (f) f.reset();
        hide($('req-created'));
        hide($('req-suggestions'));
        show($('req-form-wrap'));
        selectCreateKind('request');
        selectComp('req', (document.getElementById('req-comp') && document.getElementById('req-comp').value) || 'cash');
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

    function authProvider(provider) {
        if (provider === 'google' || provider === 'facebook') {
            toast('Próximamente. Por ahora, continúa con el email.', 'info');
            showEmailAuth('register');
            return;
        }
        showEmailAuth('login');
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

    async function submitLogin(event) {
        event.preventDefault();
        const btn = $('btn-login');
        const email = $('login-email').value.trim();
        const pass = $('login-pass').value;

        setLoading(btn, true);
        try {
            const { user, token } = await KHApi.login(email, pass);
            toast(`Bienvenido, ${user.display_name} 👑`, 'success');
            closeLoginDirect();
            loadUserInfo(user);

            if (postLoginAction === 'quick_match' && quickDraft) {
                const draft = quickDraft;
                quickDraft = null;
                postLoginAction = null;
                showPage('page-landing');
                await runQuickMatch(draft);
                return;
            }

            showPage('page-dashboard');
            enterDashboardDefault(user);
            loadMatches();
            loadCreations();
            loadFeed();
            loadPremiumProgress();
            loadBadgesMine();
            loadLeaderboard();

            if (postLoginAction === 'first_match') {
                postLoginAction = null;
                openFirstMatchFlow();
            }
        } catch (err) {
            // Show more context for common failures (CORS/network vs 4xx)
            const status = err && err.status;
            const apiErr = err && err.data && (err.data.error || err.data.message);
            const msg = apiErr || err.message || 'Error al iniciar sesión';
            toast(status ? `${msg} (HTTP ${status})` : msg, 'error');
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

            if (postLoginAction === 'quick_match' && quickDraft) {
                const draft = quickDraft;
                quickDraft = null;
                postLoginAction = null;
                showPage('page-landing');
                await runQuickMatch(draft);
                return;
            }

            showPage('page-dashboard');
            enterDashboardDefault(user);
            loadMatches();
            loadCreations();
            loadFeed();
            loadPremiumProgress();
            loadBadgesMine();
            loadLeaderboard();

            if (postLoginAction === 'first_match') {
                postLoginAction = null;
                openFirstMatchFlow();
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
        $('user-name').textContent = user.display_name || '—';
        $('user-tier').textContent = tierLabel(user.premium_tier);
        $('user-avatar').textContent = (user.display_name || '?')[0].toUpperCase();
        $('user-tier').style.color = (user.premium_tier && user.premium_tier !== 'free') ? 'var(--gold-light)' : 'var(--kh-brand-500)';

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
        if ($('profile-points')) $('profile-points').textContent = (user.points_balance != null) ? String(user.points_balance) : '—';
        if ($('profile-rating')) {
            const r = user.rating_avg;
            $('profile-rating').textContent = (r == null) ? '—' : Number(r).toFixed(1);
        }
        if ($('profile-rating-count')) $('profile-rating-count').textContent = (user.rating_count != null) ? String(user.rating_count) : '—';

        renderProfilePhotos(user.profile_photos);
    }

    function renderProfilePhotos(raw) {
        const wrap = $('profile-photos-grid');
        if (!wrap) return;
        let photos = [];
        if (Array.isArray(raw)) photos = raw;
        else if (raw) {
            try { const p = JSON.parse(String(raw)); photos = Array.isArray(p) ? p : []; }
            catch { photos = []; }
        }

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
            toast('Perfil actualizado', 'success');
        } catch (err) {
            toast(err.message || 'No se pudo cargar el perfil', 'error');
        } finally {
            if (btn) setLoading(btn, false);
        }
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
            toast('Premium desbloqueado ✓', 'success');
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
        const partners = Number(e.partners_done_distinct || 0);
        const partnersReq = Number(e.partners_required || 0);
        const pct = Math.max(0, Math.min(100, Math.round((rep / Math.max(1, th)) * 100)));

        if ($('premium-rep')) $('premium-rep').textContent = String(rep);
        if ($('premium-th')) $('premium-th').textContent = String(th);
        if ($('premium-progress-fill')) $('premium-progress-fill').style.width = pct + '%';
        if ($('premium-progress-badge')) {
            $('premium-progress-badge').textContent = e.premium_active ? 'Premium activo' : (pct + '%');
        }

        const btn = $('btn-premium-unlock');
        if (btn) {
            btn.disabled = !e.eligible || e.premium_active;
            btn.textContent = e.premium_active ? 'Activado' : 'Desbloquear';
        }

        if ($('premium-progress-foot')) {
            if (e.premium_active) {
                $('premium-progress-foot').textContent = 'Ya tienes Premium. Tus publicaciones se renuevan solas.';
            } else {
                const left = Math.max(0, th - rep);
                const partsLeft = Math.max(0, partnersReq - partners);
                if (partsLeft > 0) {
                    $('premium-progress-foot').textContent = `Te faltan ${left} de reputación y ${partsLeft} vecinos distintos para desbloquear Premium.`;
                } else {
                    $('premium-progress-foot').textContent = left === 0
                        ? 'Listo para desbloquear Premium.'
                        : `Te faltan ${left} de reputación para desbloquear Premium.`;
                }
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
                const tier = (u.premium_tier && u.premium_tier !== 'free') ? 'premium' : '';
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
                    ${tier ? '<span class="lb-chip premium">Premium</span>' : ''}
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
        if (r >= 500) return 'Oro';
        if (r >= 250) return 'Plata';
        if (r >= 100) return 'Bronce';
        return 'Incept';
    }

    function initialsForName(name) {
        const s = String(name || '').trim();
        if (!s) return '—';
        const parts = s.split(/\s+/).filter(Boolean);
        const a = (parts[0] || '').slice(0, 1);
        const b = (parts.length > 1 ? parts[parts.length - 1] : '').slice(0, 1);
        return (a + b).toUpperCase();
    }

    function renderLeaderboardRows(wrap, rows, { highlightUserId, offsetBase = 0 } = {}) {
        if (!wrap) return;
        rows.forEach((u, idx) => {
            const el = document.createElement('div');
            const isMe = highlightUserId && u.id === highlightUserId;
            el.className = 'leaderboard-item' + (isMe ? ' me' : '');
            el.tabIndex = 0;
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', `Ver perfil de ${String(u.display_name || 'vecino')}`);
            const tier = (u.premium_tier && u.premium_tier !== 'free') ? 'premium' : '';
            const badgeCount = Number(u.badge_count || 0);
            const rep = Number(u.points_balance || 0);
            const rating = (u.rating_avg || 0).toFixed(1);
            const lvl = repLevelLabel(rep);
            const distVal = (u.distance_km != null) ? Number(u.distance_km).toFixed(1) : null;
            const loc = String(u.location_text || '').trim();

            const avatarHtml = u.avatar_url
                ? `<img src="${escapeHtml(String(u.avatar_url))}" alt="" loading="lazy" />`
                : escapeHtml(initialsForName(u.display_name));

            el.innerHTML = `
              <div class="leaderboard-left">
                <span class="leaderboard-rank">${offsetBase + idx + 1}</span>
                <span class="lb-avatar" aria-hidden="true">${avatarHtml}</span>
                <div style="min-width:0;">
                  <div class="leaderboard-name">${escapeHtml(u.display_name || '—')}</div>
                  <div class="lb-mini">${escapeHtml(loc || '—')}</div>
                </div>
              </div>
              <div class="leaderboard-right">
                <span class="lb-stat" title="Nivel"><strong>${escapeHtml(lvl)}</strong></span>
                <span class="lb-stat" title="Reputacion"><strong>${rep}</strong> rep</span>
                <span class="lb-stat" title="Insignias"><strong>${badgeCount}</strong> 🏅</span>
                <span class="lb-stat" title="Valoracion"><strong>${rating}</strong> ★</span>
                ${distVal ? `<span class="lb-stat" title="Distancia"><strong>${escapeHtml(distVal)}</strong> km</span>` : ''}
                ${tier ? '<span class="lb-chip premium">Premium</span>' : ''}
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

    function openRanking(event) {
        if (event && event.preventDefault) event.preventDefault();

        if (!KHApi.getToken()) {
            toast('Inicia sesion para ver el ranking', 'info');
            openLogin();
            return;
        }

        rankingLastFocus = document.activeElement;

        // Restore last used filters.
        loadRankingPrefs();
        rankingOrigin = loadRankingOriginFromSession();
        if (rankingScope === 'near' && !rankingOrigin) rankingScope = 'global';

        rankingOffset = 0;
        rankingHasMore = false;
        syncRankingControls();
        show($('modal-ranking'));
        trapFocusInModal($('modal-ranking'));
        loadRankingModal({ reset: true });
        setTimeout(() => {
            const btn = document.querySelector('#modal-ranking .modal-close');
            if (btn) btn.focus();
        }, 60);
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
        const sel = $('rank-radius-modal');
        if (sel) sel.value = String(rankingRadiusKm);

        const lvl = $('rank-level-modal');
        if (lvl) lvl.value = String(rankingMinLevel || 'all');

        const q = $('rank-q-modal');
        if (q && q.value !== String(rankingQuery || '')) q.value = String(rankingQuery || '');
    }

    function setRankingLevel(v, { modal } = {}) {
        if (!modal) return;
        rankingMinLevel = String(v || 'all');
        rankingOffset = 0;
        rankingHasMore = false;
        saveRankingPrefs();
        syncRankingControls();
        loadRankingModal({ reset: true });
    }

    function setRankingQuery(v, { modal } = {}) {
        if (!modal) return;
        rankingQuery = String(v || '');
        saveRankingPrefs();
        if (rankingQueryTimer) { clearTimeout(rankingQueryTimer); rankingQueryTimer = null; }
        rankingQueryTimer = setTimeout(() => {
            rankingOffset = 0;
            rankingHasMore = false;
            syncRankingControls();
            loadRankingModal({ reset: true });
        }, 220);
    }

    function setRankingScope(scope, { modal } = {}) {
        if (!modal) return;
        rankingScope = (scope === 'near') ? 'near' : 'global';
        rankingOffset = 0;
        rankingHasMore = false;
        saveRankingPrefs();
        syncRankingControls();
        if (rankingScope === 'near' && !rankingOrigin) {
            const wrap = $('leaderboard-list-modal');
            if (wrap) wrap.innerHTML = '<div class="ledger-empty">Pulsa “Ubicación” para ver el ranking cerca de ti</div>';
            const more = $('ranking-more-wrap');
            if (more) more.style.display = 'none';
            return;
        }
        loadRankingModal({ reset: true });
    }

    function setRankingRadius(v, { modal } = {}) {
        if (!modal) return;
        const n = Math.max(1, Math.min(10, Number(v || 5)));
        rankingRadiusKm = n;
        rankingOffset = 0;
        rankingHasMore = false;
        saveRankingPrefs();
        syncRankingControls();
        if (rankingScope === 'near' && rankingOrigin) loadRankingModal({ reset: true });
    }

    function useMyLocation({ modal } = {}) {
        if (!modal) return;
        if (!('geolocation' in navigator)) {
            toast('Tu navegador no soporta ubicación', 'error');
            return;
        }
        const wrap = $('leaderboard-list-modal');
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
                loadRankingModal({ reset: true });
            },
            err => {
                rankingOrigin = null;
                const msg = (err && err.code === 1)
                    ? 'Permiso denegado. Activa la ubicación para ver “cerca de mí”.'
                    : 'No se pudo obtener tu ubicación.';
                if (wrap) wrap.innerHTML = `<div class="ledger-empty" style="color:var(--danger)">${escapeHtml(msg)}</div>`;
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
        );
    }

    async function loadRankingModal({ reset = false } = {}) {
        const wrap = $('leaderboard-list-modal');
        if (!wrap) return;
        const moreWrap = $('ranking-more-wrap');
        const moreBtn = $('btn-ranking-more');

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
                    wrap.innerHTML = '<div class="ledger-empty">Pulsa “Ubicación” para ver el ranking cerca de ti</div>';
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
                const meBox = $('ranking-me');
                if (meBox) {
                    if (reset && currentUser && currentUser.id && KHApi.getToken()) {
                        const qs = { };
                        if (rankingScope === 'near' && rankingOrigin) {
                            qs.lat = String(rankingOrigin.lat);
                            qs.lng = String(rankingOrigin.lng);
                            qs.radius_km = String(rankingRadiusKm);
                        }
                        if (rankingMinLevel && rankingMinLevel !== 'all') qs.min_level = String(rankingMinLevel);
                        const me = await KHApi.leaderboardMe(qs);
                        if (me && me.rank && me.total) {
                            meBox.style.display = '';
                            meBox.textContent = `Tu puesto: #${me.rank} de ${me.total}`;
                        } else {
                            meBox.style.display = 'none';
                        }
                    } else {
                        meBox.style.display = 'none';
                    }
                }
            } catch {
                const meBox = $('ranking-me');
                if (meBox) meBox.style.display = 'none';
            }

            if (reset) wrap.innerHTML = '';
            if (reset && !rows.length) {
                wrap.innerHTML = '<div class="ledger-empty">Aún no hay ranking en este radio</div>';
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

    function rankingLoadMore() {
        if (!rankingHasMore) return;
        loadRankingModal({ reset: false });
    }

    /* ── User card (mini profile) ───────────────────────────────────────── */
    let userCardLastFocus = null;
    let userCardTrapHandler = null;

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

        const stats = $('usercard-stats');
        if (stats) {
            stats.innerHTML = `
              <span class="lb-stat"><strong>${escapeHtml(lvl)}</strong> nivel</span>
              <span class="lb-stat"><strong>${rep}</strong> rep</span>
              <span class="lb-stat"><strong>${badges}</strong> insignias</span>
              <span class="lb-stat"><strong>${escapeHtml(String(rating))}</strong> ★</span>
              ${dist ? `<span class="lb-stat"><strong>${escapeHtml(dist)}</strong></span>` : ''}
            `;
        }

        const grid = $('usercard-badges');
        if (grid) grid.innerHTML = '<div class="ledger-empty">Cargando…</div>';

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
            list.slice(0, 12).forEach(b => {
                const item = document.createElement('div');
                item.className = 'usercard-badge';
                item.innerHTML = `
                  <div class="usercard-badge-name">${escapeHtml(b.name || b.slug || '—')}</div>
                  <div class="usercard-badge-desc">${escapeHtml(b.description || '')}</div>
                `;
                grid.appendChild(item);
            });
        }).catch(() => {
            if (grid) grid.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">No se pudieron cargar las insignias</div>';
        });
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

    async function loadFeed() {
        if (!KHApi.getToken()) return;
        if (feedDebounce) clearTimeout(feedDebounce);
        feedDebounce = setTimeout(async () => {
            const btn = $('btn-feed-refresh');
            if (btn) setLoading(btn, true);
            try {
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
                renderFeed(rows);
            } catch (err) {
                const wrap = $('feed-grid');
                if (wrap) wrap.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">No se pudo cargar el muro</div>';
            } finally {
                if (btn) setLoading(btn, false);
            }
        }, 180);
    }

    function renderFeed(rows) {
        const wrap = $('feed-grid');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!rows || !rows.length) {
            wrap.innerHTML = '<div class="ledger-empty">No hay resultados</div>';
            return;
        }

        rows.slice(0, 60).forEach(r => {
            const kind = r.kind === 'offer' ? 'offer' : 'request';
            const img = (r.media_urls && r.media_urls[0] && (r.media_urls[0].url || r.media_urls[0])) || '';
            const el = document.createElement('div');
            el.className = 'feed-card';
            const dist = (r.distance_km != null) ? `${r.distance_km} km` : (r.location_text ? 'cerca' : '—');
            el.innerHTML = `
              <div class="feed-media">
                <span class="feed-badge ${kind}">${kind === 'offer' ? 'OFERTA' : 'NECESIDAD'}</span>
                ${img ? `<img src="${escapeHtml(String(img))}" alt="" loading="lazy" />` : ''}
              </div>
              <div class="feed-body">
                <div class="feed-title">${escapeHtml(r.title || '—')}</div>
                <div class="feed-sub">
                  <span class="feed-pill">${escapeHtml(catLabel(r.category))}</span>
                  <span class="feed-pill">${escapeHtml(compLabel(r.compensation_type))}</span>
                  <span class="feed-pill">📍 ${escapeHtml(dist)}</span>
                </div>
                <div class="feed-sub" style="margin-top:8px; opacity:.9;">
                  <span class="feed-pill">${escapeHtml(r.user_name || '—')} · ★ ${(Number(r.user_rating || 0)).toFixed(1)}</span>
                  ${r.premium_user ? '<span class="feed-pill" style="border-color:rgba(201,168,76,.25); color:var(--gold-light)">Premium</span>' : ''}
                </div>
              </div>
            `;
            wrap.appendChild(el);
        });
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

    let lastInviteIds = new Set();
    let lastAutoMatchRows = [];
    let autoMatchFilterCat = 'all';

    function renderAutoMatchCats(wrapId, selected, disabled) {
        const wrap = $(wrapId);
        if (!wrap) return;
        const sel = new Set(Array.isArray(selected) ? selected : []);
        wrap.innerHTML = '';
        AM_CATS.forEach(c => {
            const el = document.createElement('label');
            el.className = 'am-cat';
            el.innerHTML = `
              <input type="checkbox" value="${escapeHtml(c.id)}" ${sel.has(c.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
              <span aria-hidden="true">${c.icon}</span>
              <span>${escapeHtml(c.label)}</span>
            `;
            wrap.appendChild(el);
        });

        if (!disabled) {
            wrap.querySelectorAll('input[type="checkbox"]').forEach(i => {
                i.addEventListener('change', () => saveAutoMatchSettings());
            });
        }
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
                return;
            }
            const s = Math.ceil(leftMs / 1000);
            const mm = String(Math.floor(s / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            el.textContent = `${mm}:${ss}`;
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
    }

    async function loadAutoMatch(opts = {}) {
        if (!KHApi.getToken()) return;
        const btn = $('btn-am-refresh');
        if (btn && !opts.silent) setLoading(btn, true);
        try {
            const settings = await KHApi.automatchGetSettings();
            // Premium user: hide upsell button
            const upsell = $('btn-am-premium');
            if (upsell) upsell.classList.add('hidden');

            const provEnabled = !!settings.enabled;
            const seekEnabled = !!settings.seeker_enabled;
            const provBox = $('am-provider-enabled');
            const seekBox = $('am-seeker-enabled');
            if (provBox) provBox.checked = provEnabled;
            if (seekBox) seekBox.checked = seekEnabled;

            renderAutoMatchCats('am-provider-cats', settings.categories, false);
            renderAutoMatchCats('am-seeker-cats', settings.seeker_categories, false);

            renderAutoMatchFilterChips();

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

            const statusPill = $('am-status-pill');
            if (statusPill) statusPill.classList.remove('hidden');

            const ids = new Set(rows.map(r => r.id));
            const hasNew = rows.some(r => !lastInviteIds.has(r.id));
            lastInviteIds = ids;
            if (hasNew && opts.silent) toast('Nueva invitación de AutoMatch', 'info');
            tickInviteCountdowns();
        } catch (err) {
            const upsell = $('btn-am-premium');
            if (upsell) upsell.classList.remove('hidden');

            const provBox = $('am-provider-enabled');
            const seekBox = $('am-seeker-enabled');
            if (provBox) provBox.checked = false;
            if (seekBox) seekBox.checked = false;
            renderAutoMatchCats('am-provider-cats', [], true);
            renderAutoMatchCats('am-seeker-cats', [], true);
            const msg = (err && err.message) ? err.message : 'AutoMatch no disponible';
            const ids = ['am-req-pending', 'am-req-accepted', 'am-req-archived', 'am-off-pending', 'am-off-accepted', 'am-off-archived'];
            ids.forEach(id => {
                const el = $(id);
                if (el) el.innerHTML = `<div class="ledger-empty" style="color:var(--text-soft)">🔒 ${escapeHtml(msg)}<br/>Activa Premium para recibir invitaciones automáticas.</div>`;
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
        } finally {
            if (btn && !opts.silent) setLoading(btn, false);
        }
    }

    /* ── Hub (Inicio) ─────────────────────────────────────────────────────── */
    async function loadHub() {
        if (!KHApi.getToken()) return;
        const badge = $('hub-badge');
        if (badge) badge.textContent = isPremiumActive(currentUser) ? 'Premium' : 'Gratis';

        // Default texts
        const sub = $('hub-automatch-sub');
        const mini = $('hub-automatch-mini');
        if (sub) sub.textContent = 'Recibe notificaciones y acepta en segundos.';
        if (mini) mini.textContent = '—';

        try {
            const e = await KHApi.premiumEligibility();
            const premium = !!(e && e.premium_active);
            if (badge) badge.textContent = premium ? 'Premium activo' : 'Gratis';
            if (!premium) {
                const rep = Number(e.reputation || 0);
                const th = Number(e.threshold || 1000);
                const partners = Number(e.partners_done_distinct || 0);
                const partnersReq = Number(e.partners_required || 0);
                const leftRep = Math.max(0, th - rep);
                const leftPartners = Math.max(0, partnersReq - partners);
                if (sub) sub.textContent = 'AutoMatch te avisa cuando una solicitud encaja con lo que ofreces.';
                if (mini) mini.textContent = `Te faltan ${leftRep} rep y ${leftPartners} vecinos distintos.`;
                return;
            }

            // Premium: show pending invites count
            try {
                const inv = await KHApi.automatchListInvites({ status: 'pending', limit: 20, offset: 0 });
                const rows = (inv && inv.data) || [];
                const reqs = rows.filter(r => (r.kind || 'request') !== 'offer').length;
                const offs = rows.filter(r => (r.kind || 'request') === 'offer').length;
                const n = rows.length;
                if (mini) mini.textContent = n === 0 ? 'No hay invitaciones pendientes.' : `${n} pendientes (solicitudes: ${reqs} · ofertas: ${offs}).`;
            } catch {
                if (mini) mini.textContent = 'AutoMatch listo.';
            }
        } catch {
            // ignore
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
        const enabled = !!($('am-provider-enabled') && $('am-provider-enabled').checked);
        const seeker_enabled = !!($('am-seeker-enabled') && $('am-seeker-enabled').checked);
        const provWrap = $('am-provider-cats');
        const seekWrap = $('am-seeker-cats');
        const cats = provWrap
            ? Array.from(provWrap.querySelectorAll('input[type="checkbox"]')).filter(i => i.checked).map(i => i.value)
            : [];
        const seeker_categories = seekWrap
            ? Array.from(seekWrap.querySelectorAll('input[type="checkbox"]')).filter(i => i.checked).map(i => i.value)
            : [];
        try {
            await KHApi.automatchUpdateSettings({ enabled, categories: cats, seeker_enabled, seeker_categories });
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
            el.className = 'am-invite';
            el.style.animationDelay = (i * 40) + 'ms';
            const media = r.media_urls || [];
            const img = (media && media[0] && (media[0].url || media[0])) || '';
            const exp = Date.parse(r.expires_at || '') || 0;
            const title = r.title || '—';
            const cat = r.category || '';
            const loc = r.location_text || '';
            const comp = compLabel(r.compensation_type);
            const kind = r.kind === 'offer' ? 'offer' : 'request';
            const who = r.other_name ? `${r.other_name} · ★ ${(Number(r.other_rating || 0)).toFixed(1)}` : '';
            const st = String(r.status || 'pending');
            const stLabel = st === 'accepted' ? 'Aceptada' : (st === 'expired' ? 'Caducada' : (st === 'declined' ? 'Rechazada' : null));
            const showActions = st === 'pending';
            el.innerHTML = `
              <div class="am-invite-img">
                <span class="am-drag-hint" aria-hidden="true">⋮⋮</span>
                ${img ? `<img src="${escapeHtml(String(img))}" alt="" loading="lazy" />` : `<span aria-hidden="true">${inviteIcon(cat)}</span>`}
              </div>
              <div>
                <div class="am-invite-title">${escapeHtml(title)}</div>
                <div class="am-invite-meta">
                  <span class="am-chip ${kind === 'offer' ? 'offer' : 'req'}">${kind === 'offer' ? 'OFERTA' : 'SOLICITUD'}</span>
                  <span class="am-chip">${escapeHtml(catLabel(cat))}</span>
                  <span class="am-chip">${escapeHtml(comp)}</span>
                  ${loc ? `<span class="am-chip">📍 ${escapeHtml(loc)}</span>` : ''}
                  ${st === 'pending' ? `<span class="am-chip ttl" data-am-expires="${exp}">—</span>` : (stLabel ? `<span class="am-chip am-status-chip ${st === 'accepted' ? 'ok' : 'bad'}">${stLabel}</span>` : '')}
                </div>
                ${who ? `<div class="am-invite-meta" style="margin-top:8px;"><span class="am-chip">${escapeHtml(who)}</span></div>` : ''}
                ${showActions ? `
                  <div class="am-invite-actions">
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

    async function loadBadgesMine() {
        if (!KHApi.getToken()) return;
        try {
            const data = await KHApi.listMyBadges();
            const rows = (data && data.data) || (Array.isArray(data) ? data : []);
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
            sec.textContent = 'Ver demo';
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
            price.innerHTML = premiumInterval === 'month'
                ? '0,99&nbsp;€<span>/mes</span>'
                : '7,99&nbsp;€<span>/año</span>';
        }
        if (note) {
            note.textContent = premiumInterval === 'month'
                ? 'sin permanencia'
                : '≈ 0,67 €/mes · mejor precio';
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
        return (tier && tier !== 'free') ? 'Premium' : 'Gratis';
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

        await ensureCurrentUser();

        const btn = $('btn-req-create');
        setLoading(btn, true);
        try {
            const title = $('req-title').value.trim();
            const category = $('req-category').value;
            const description = $('req-desc').value.trim();

            const comp = (document.getElementById('req-comp') && document.getElementById('req-comp').value) || 'cash';
            const points = 0;

            const body = {
                title,
                category,
                points_offered: points,
                description: description || undefined,
                compensation_type: comp,
            };

            const req = await KHApi.createRequest(body);
            lastCreatedRequest = req;
            $('req-created-title').textContent = req.title;
            show($('req-created'));
            hide($('req-form-wrap'));
            hide($('req-suggestions'));
            $('req-suggestions-list').innerHTML = '';
            toast('Solicitud creada ✓', 'success');

            renderListingPhotos('req-photos-grid', req.media_urls, 'deleteRequestPhoto', req.id);

            const f = $('request-form');
            if (f) f.reset();

            loadCreations();

            // Bring the "buscar" CTA into view
            const blk = $('req-created');
            if (blk && blk.scrollIntoView) blk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (err) {
            toast(err.message || 'No se pudo crear la solicitud', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    async function createOffer(event) {
        event.preventDefault();
        if (!KHApi.getToken()) {
            toast('Inicia sesión primero', 'error');
            openLogin();
            return;
        }

        await ensureCurrentUser();
        const btn = $('btn-off-create');
        setLoading(btn, true);
        try {
            const title = $('off-title').value.trim();
            const category = $('off-category').value;
            const description = $('off-desc').value.trim();

            const comp = (document.getElementById('off-comp') && document.getElementById('off-comp').value) || 'cash';
            const points = 0;

            const body = {
                title,
                category,
                points_value: points,
                description: description || undefined,
                compensation_type: comp,
            };

            const offer = await KHApi.createOffer(body);
            lastCreatedOffer = offer;
            $('off-created-title').textContent = offer.title;
            show($('off-created'));
            hide($('off-form-wrap'));
            toast('Oferta publicada ✓', 'success');

            renderListingPhotos('off-photos-grid', offer.media_urls, 'deleteOfferPhoto', offer.id);

            const f = $('offer-form');
            if (f) f.reset();

            loadCreations();
            scrollToCreations();
        } catch (err) {
            toast(err.message || 'No se pudo publicar la oferta', 'error');
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
        filtered.slice(0, 12).forEach(it => {
            const el = document.createElement('div');
            el.className = 'mvp-item';
            const isReq = it.kind === 'request';
            const title = isReq ? it.row.title : it.row.title;
            const comp = (it.row.compensation_type === 'coins') ? 'cash' : (it.row.compensation_type || 'cash');
            const meta = `${it.row.category} · ${COMP_LABEL[comp] || comp}`;
            const when = fmtShortDate(it.row.expires_at || it.row.created_at);
            const kindLabel = isReq ? 'Solicitud' : 'Oferta';
            const kindClass = isReq ? 'req' : 'off';
            const stateBadge = isActive ? '' : '<span class="mvp-status err">cerrada</span>';

            el.innerHTML = `
              <div class="mvp-item-left">
                <span class="mvp-kind ${kindClass}">${kindLabel}</span>
                <div class="mvp-txt">
                  <div class="mvp-title">${escapeHtml(title)}</div>
                  <div class="mvp-meta">${escapeHtml(meta)}${when ? ' · caduca ' + escapeHtml(when) : ''}</div>
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

    /* ── Landing MVP: Quick match flow ───────────────────────────────────────── */
    function collectQuickDraft() {
        return {
            title: ($('quick-title') && $('quick-title').value || '').trim(),
            category: $('quick-category') ? $('quick-category').value : 'tech',
            compensation_type: (document.getElementById('quick-comp') && document.getElementById('quick-comp').value) || 'cash',
            description: ($('quick-desc') && $('quick-desc').value || '').trim() || undefined,
        };
    }

    async function startQuickMatch(event) {
        event.preventDefault();
        const draft = collectQuickDraft();
        if (!draft.title) {
            toast('Escribe un título', 'error');
            return;
        }
        // No numeric amount in the quick demo — compensation type only

        if (!KHApi.getToken()) {
            quickDraft = draft;
            postLoginAction = 'quick_match';
            openLogin();
            return;
        }

        await runQuickMatch(draft);
    }

    async function runQuickMatch(draft) {
        const btn = $('btn-quick');
        const out = $('quick-out');
        const status = $('quick-status');
        const list = $('quick-suggestions-list');

        if (!btn || !out || !status || !list) {
            toast('Demo no disponible en este layout', 'error');
            return;
        }

        setLoading(btn, true);
        show(out);
        status.textContent = 'Creando solicitud...';
        list.innerHTML = '';

        try {
            await ensureCurrentUser();
            if (!currentUser) throw new Error('No se pudo cargar tu usuario');

            const body = {
                title: draft.title,
                category: draft.category,
                points_offered: 0,
                description: draft.description,
                compensation_type: draft.compensation_type || 'cash',
            };

            const req = await KHApi.createRequest(body);
            lastCreatedRequest = req;
            status.textContent = 'Buscando KingsHelp cerca...';

            const data = await KHApi.getSuggestedProviders(req.id);
            const providers = data.suggested_providers || [];

            if (!providers.length) {
                status.textContent = 'Sin sugerencias por ahora';
                list.innerHTML = '<div class="ledger-empty">Vuelve a intentar en un momento</div>';
                return;
            }

            status.textContent = 'Sugerencias listas';
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
                        await createMatchForRequest(req, p);
                        btnMatch.textContent = 'Creado ✓';
                        status.textContent = 'Match creado ✓';
                    } catch {
                        btnMatch.disabled = false;
                        btnMatch.textContent = prev;
                    }
                });
                list.appendChild(el);
            });
        } catch (err) {
            status.textContent = 'Error';
            list.innerHTML = '<div class="ledger-empty" style="color:var(--danger)">No se pudo completar</div>';
            toast(err.message || 'Error en la demo', 'error');
        } finally {
            setLoading(btn, false);
        }
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

        const body = {
            request_id: req.id,
            provider_id: provider.id,
            seeker_id: currentUser.id,
            points_agreed: 0,
            initiated_by: 'seeker',
            compensation_type: req.compensation_type || 'cash',
        };

        try {
            const match = await KHApi.createMatch(body);
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

    function actionsForMatch(match) {
        if (!currentUser) return [];
        const isProvider = match.provider_id === currentUser.id;
        const isSeeker = match.seeker_id === currentUser.id;
        const st = match.status;
        const a = [];
        if (isProvider && st === 'pending') a.push('accept', 'reject');
        if (isProvider && st === 'accepted') a.push('done');
        if (isSeeker && (st === 'pending' || st === 'accepted')) a.push('cancel');
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

            // If a match is accepted but missing agreement, bring chat once
            if (!chatMatchId) {
                const need = filtered.find(m => {
                    const comp = (m.compensation_type === 'coins') ? 'cash' : (m.compensation_type || 'cash');
                    const ok = comp === 'cash'
                        ? (+m.points_agreed || 0) >= 1
                        : (comp === 'barter' ? String(m.barter_terms || '').trim().length > 0 : true);
                    return m.status === 'accepted' && !ok && !autoChatOpened.has(m.id);
                });
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
                    <span class="mvp-av">${initials(otherName)}</span>
                    <div class="mvp-txt">
                       <div class="mvp-title">${escapeHtml(otherName)}</div>
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

            // If agreement missing, bring users to chat
            if (updated && updated.id) {
                const comp = (updated.compensation_type === 'coins') ? 'cash' : (updated.compensation_type || 'cash');
                const agreedOk = comp === 'cash'
                    ? (+updated.points_agreed || 0) >= 1
                    : (comp === 'barter' ? String(updated.barter_terms || '').trim().length > 0 : true);
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

    /* ── Keyboard shortcuts ───────────────────────────────────────────────────── */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeLoginDirect();
            closeRating();
            closeChat();
            closeRankingModal();
            closeUserCard();
            closeDashMenu();
        }
    });

    /* ── Auto-restore session ─────────────────────────────────────────────────── */
    async function tryRestoreSession() {
        if (!KHApi.getToken()) return;
        try {
            const user = await KHApi.getMe();
            loadUserInfo(user);
            // Mantener la pagina de inicio como default incluso logueado.
            showPage('page-landing');
            // Precarga ligera: eligibility para nudges/labels; evita cargar todo el dashboard.
            loadPremiumProgress();
            setTimeout(renderNext, 60);
        } catch {
            KHApi.clearToken(); // Token expired / invalid
            currentUser = null;
            setLandingSessionUI(null);
        }
    }

    /* ── Init ─────────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        initReveal();
        initKpiCounters();
        relocateThemeToggle('page-landing');
        tryRestoreSession();
        // Sync tabs with persisted view (or default)
        setDashView(getSavedDashView(), { noAutoLoad: true, noScroll: true });
        // Default selection on dashboard create card
        selectCreateKind('request');

        // Default compensation selectors
        selectComp('req', 'cash');
        selectComp('off', 'cash');
        selectComp('quick', 'cash');

        // Default premium selection (annual)
        setPremiumInterval('year');

        // Header search: jump to quick demo (landing)
        const navQ = document.getElementById('nav-search');
        if (navQ) {
            navQ.addEventListener('keydown', e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const target = $('quick-title') || document.getElementById('how');
                if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if ($('quick-title')) {
                    $('quick-title').value = navQ.value;
                    setTimeout(() => $('quick-title').focus(), 60);
                }
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
    });

    /* ── Public API ───────────────────────────────────────────────────────────── */
    window.KHApp = {
        goLanding,
        goDashboard,
        toggleDashMenu,
        gotoDashFromMenu,
        openLogin,
        showAuthChooser,
        showEmailAuth,
        authProvider,
        startFirstMatch,
        startQuickMatch,
        setDashView,
        closeUpgradeModal,
        openPremiumFromNudge,
        goPremiumTab,
        selectCreateKind,
        selectComp,
        setCreationsFilter,
        setMatchesFilter,
        resetCreateForm,
        scrollToCreations,
        closeLogin,
        closeLoginDirect,
        submitLogin,
        submitRegister,
        loadProfile,
        submitProfile,
        pickProfilePhoto,
        uploadProfilePhoto,
        deleteProfilePhoto,
        pickRequestPhoto,
        uploadRequestPhoto,
        deleteRequestPhoto,
        pickOfferPhoto,
        uploadOfferPhoto,
        deleteOfferPhoto,
        loadFeed,
        loadAutoMatch,
        saveAutoMatchSettings,
        acceptAutoMatch,
        declineAutoMatch,
        setAutoMatchFilter,
        loadHub,
        hubStartCreate,
        hubGoAutoMatch,
        startPremiumCheckout,
        setPremiumInterval,
        tryUnlockPremiumByReputation,
        loadPremiumProgress,
        loadLeaderboard,
        openRanking,
        closeRankingModal,
        rankingLoadMore,
        setRankingScope,
        setRankingRadius,
        setRankingLevel,
        useMyLocation,
        setRankingQuery,
        closeUserCard,
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
        loadSuggestedProviders,
        loadCreations,
        loadMatches,
    };
})();
