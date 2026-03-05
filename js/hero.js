/**
 * KingsHelp — Hero Banner Controller (v1)
 * Isolated IIFE. No KHApp / KHApi / KHFx / login contact.
 * Manages: adaptive banner rotation, progress navigation, parallax,
 * pause-on-interaction, IntersectionObserver, visibilitychange.
 */
(function () {
    'use strict';

    /* ── Reduced-motion guard ────────────────────────────── */
    var prefersReduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── Config ──────────────────────────────────────────── */
    var EXTRA_BANNER_MS = 1500;
    var BANNER_DURATIONS = [5500, 7500, 5500]; // ms per banner (+1.5s each)
    var TRANSITION_MS = 550;                // must match CSS
    var PAUSE_AFTER_INTERACTION_MS = 20000;    // 20s pause after user touch
    var INTRO_DURATION_MS = 2000;           // total intro duration
    var INTRO_WORD_DELAY_MS = 1100;         // wordmark reveal timing
    var INTRO_EXIT_MS = 620;                // overlay fade duration
    var INTRO_BANNERS_START_MS = INTRO_DURATION_MS + INTRO_EXIT_MS;
    var fxLevel = 'wow';

    function applyConfig(cfg) {
        if (!cfg) return;
        if (cfg.fx_level === 'off' || cfg.fx_level === 'subtle' || cfg.fx_level === 'wow') {
            fxLevel = cfg.fx_level;
        }
        if (fxLevel === 'off') {
            prefersReduced = true;
            isPlaying = false;
            pause();
            if (overlay) {
                overlay.style.display = 'none';
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
            if (video) {
                try { video.pause(); } catch { }
            }
        }
        if (cfg.hero_banner_duration) {
            var baseMs = Math.max(3000, Number(cfg.hero_banner_duration) * 1000);
            if (isFinite(baseMs)) {
                baseMs = baseMs + EXTRA_BANNER_MS;
                BANNER_DURATIONS = [baseMs, baseMs + 2000, baseMs];
                setProgress(current);
                syncPhoneTimeline();
                resumeIfShould();
            }
        }
        try { document.documentElement.dataset.fx = fxLevel; } catch (e) { }
    }

    function fetchPublicConfig() {
        var base = window.KINGSHELP_BASE_URL || '/api/v1';
        if (!base) return;
        if (base.indexOf('/api/v1') === -1) base = base.replace(/\/$/, '') + '/api/v1';
        var url = base.replace(/\/$/, '') + '/config';
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var data = (j && (j.data || j.config)) || j;
                applyConfig(data || {});
            })
            .catch(function () { });
    }

    /* ── DOM refs ────────────────────────────────────────── */
    var heroSection = document.querySelector('section.hero');
    var stage = document.getElementById('kh-hero-stage');
    var progressEl = document.getElementById('kh-hero-progress');
    var banners, progressSegs;
    var phoneBanner = null;

    if (!stage) return;

    banners = Array.from(stage.querySelectorAll('.hero-banner'));
    phoneBanner = stage.querySelector('.hero-banner[data-banner="1"]');
    progressSegs = progressEl ? Array.from(progressEl.querySelectorAll('.hero-progress-seg')) : [];

    if (!banners.length) return;

    /* ── Hero subtitle rotation ──────────────────────────── */
    var subtitleWrap = stage.querySelector('.hero-banner[data-banner="0"] .hero-sub-cycle');
    var subtitleTextEl = subtitleWrap ? subtitleWrap.querySelector('.hero-sub-text') : null;
    var subtitlePhrases = [
        'Pide ayuda u ofrécela. Match local en segundos.',
        'Activa tu barrio: ayuda cuando puedas, recibe cuando lo necesites.',
        'Sin comisiones. Vecinos verificados. Rápido y seguro.',
        'Reputación real por ayudar. Comunidad que funciona.',
        'Solicita u ofrece con un clic. Match automático.'
    ];
    var subtitleIndex = 0;
    var subtitleInterval = null;
    var subtitleSwapTimer = null;

    function setSubtitle(nextIndex, immediate) {
        if (!subtitleTextEl) return;
        var nextText = subtitlePhrases[nextIndex % subtitlePhrases.length];
        if (prefersReduced || immediate) {
            subtitleTextEl.textContent = nextText;
            return;
        }
        subtitleTextEl.classList.add('is-out');
        if (subtitleSwapTimer) clearTimeout(subtitleSwapTimer);
        subtitleSwapTimer = setTimeout(function () {
            subtitleTextEl.textContent = nextText;
            subtitleTextEl.classList.remove('is-out');
        }, 220);
    }

    function startSubtitleRotation() {
        if (!subtitleTextEl || subtitleInterval || !subtitlePhrases.length) return;
        subtitleInterval = setInterval(function () {
            subtitleIndex = (subtitleIndex + 1) % subtitlePhrases.length;
            setSubtitle(subtitleIndex, false);
        }, 3000);
    }

    function stopSubtitleRotation() {
        if (subtitleInterval) clearInterval(subtitleInterval);
        subtitleInterval = null;
        if (subtitleSwapTimer) clearTimeout(subtitleSwapTimer);
        subtitleSwapTimer = null;
    }

    if (subtitleTextEl && subtitlePhrases.length) {
        setSubtitle(0, true);
        startSubtitleRotation();
        window.addEventListener('pagehide', stopSubtitleRotation);
        window.addEventListener('beforeunload', stopSubtitleRotation);
    }

    fetchPublicConfig();

    /* ── State ───────────────────────────────────────────── */
    var current = 0;
    var timer = null;
    var isPlaying = true;
    var isVisible = true;
    var isHidden = false;   // document.hidden
    var interPauseTimer = null;

    /* ── Progress bar ───────────────────────────────────── */
    function setProgress(idx) {
        if (!progressSegs || !progressSegs.length) return;
        progressSegs.forEach(function (seg, i) {
            seg.classList.toggle('hero-progress-seg--active', i === idx);
            seg.setAttribute('aria-selected', String(i === idx));
            seg.setAttribute('tabindex', i === idx ? '0' : '-1');

            var fill = seg.querySelector('.hero-progress-fill');
            if (!fill) return;
            fill.style.setProperty('--dur', (BANNER_DURATIONS[idx] || 4000) + 'ms');
            /* Restart animation */
            fill.style.animation = 'none';
            fill.offsetHeight; // force reflow
            fill.style.animation = '';
        });
    }

    function syncPhoneTimeline() {
        if (!phoneBanner) return;
        var dur = BANNER_DURATIONS[1] || 8000;
        phoneBanner.style.setProperty('--hb2p-dur', dur + 'ms');
    }

    /* ── Show a banner ───────────────────────────────────── */
    function showBanner(idx, fromUser) {
        if (idx === current && !fromUser) return;

        var prev = current;
        current = ((idx % banners.length) + banners.length) % banners.length;

        /* Exit prev */
        banners[prev].classList.remove('hero-banner--active');
        banners[prev].classList.add('hero-banner--exit');
        banners[prev].setAttribute('aria-hidden', 'true');

        /* Clean exit class after transition */
        var exitBanner = banners[prev];
        setTimeout(function () {
            exitBanner.classList.remove('hero-banner--exit');
        }, TRANSITION_MS + 50);

        /* Enter new */
        banners[current].classList.add('hero-banner--active');
        banners[current].classList.remove('hero-banner--exit');
        banners[current].setAttribute('aria-hidden', 'false');

        setProgress(current);
        syncPhoneTimeline();
    }

    /* ── Advance one ─────────────────────────────────────── */
    function advance() {
        var next = (current + 1) % banners.length;
        showBanner(next, false);
        scheduleNext();
    }

    /* ── Schedule next ───────────────────────────────────── */
    function scheduleNext() {
        clearTimeout(timer);
        if (!isPlaying || prefersReduced) return;
        var duration = BANNER_DURATIONS[current] || 7000;
        timer = setTimeout(advance, duration);
    }

    /* ── Play / Pause ────────────────────────────────────── */
    function pause() {
        clearTimeout(timer);
    }

    function resumeIfShould() {
        if (isPlaying && isVisible && !isHidden) {
            scheduleNext();
        }
    }

    /* ── User interaction → pause for 20s ───────────────── */
    function onUserInteraction() {
        pause();
        isPlaying = false;
        clearTimeout(interPauseTimer);
        interPauseTimer = setTimeout(function () {
            isPlaying = true;
            resumeIfShould();
        }, PAUSE_AFTER_INTERACTION_MS);
    }

    /* ── IntersectionObserver ────────────────────────────── */
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            isVisible = entries[0].intersectionRatio >= 0.3;
            if (isVisible) {
                resumeIfShould();
            } else {
                pause();
            }
        }, { threshold: 0.3 });
        io.observe(heroSection || stage);
    }

    /* ── visibilitychange ────────────────────────────────── */
    document.addEventListener('visibilitychange', function () {
        isHidden = document.hidden;
        if (isHidden) {
            pause();
            stopSubtitleRotation();
        } else {
            resumeIfShould();
            startSubtitleRotation();
        }
    });

    /* ── Interaction listeners ───────────────────────────── */
    /* NOTE: scroll is deferred 2s so page-load scroll doesn't kill auto-play */
    var lastScrollY = window.scrollY;

    function onScrollCheck() {
        var delta = Math.abs(window.scrollY - lastScrollY);
        lastScrollY = window.scrollY;
        /* Only pause if user scrolled significantly (> 40px) */
        if (delta > 40) onUserInteraction();
    }

    /* keydown and click pause immediately */
    ['keydown', 'pointerdown'].forEach(function (evt) {
        window.addEventListener(evt, onUserInteraction, { once: false, passive: true });
    });

    /* Scroll listener attached after 2s to survive initial page render */
    setTimeout(function () {
        lastScrollY = window.scrollY;
        window.addEventListener('scroll', onScrollCheck, { passive: true });
    }, 2000);


    /* ── Optional interaction on progress bar ───────────── */
    if (progressEl) {
        progressEl.addEventListener('click', function (e) {
            var seg = e.target.closest('.hero-progress-seg');
            if (!seg) return;
            var target = parseInt(seg.getAttribute('data-target') || '0', 10);
            if (isNaN(target)) return;

            onUserInteraction();
            isPlaying = true;
            showBanner(target, true);
            scheduleNext();
        });

        progressEl.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                onUserInteraction();
                isPlaying = true;
                showBanner(current + (e.key === 'ArrowLeft' ? -1 : 1), true);
                scheduleNext();
            }
        });
    }

    /* ── Parallax (desktop only, hover:hover) ────────────── */
    var canParallax = !prefersReduced &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (canParallax && heroSection) {
        heroSection.addEventListener('mousemove', function (e) {
            var rect = heroSection.getBoundingClientRect();
            var cy = (e.clientY - rect.top) / rect.height; // 0..1
            var oy = (cy - 0.5) * -12; // ±6px range
            heroSection.style.setProperty('--hero-parallax-y', oy.toFixed(2) + 'px');
        }, { passive: true });

        heroSection.addEventListener('mouseleave', function () {
            heroSection.style.setProperty('--hero-parallax-y', '0px');
        });
    }

    /* ── Init: show banner 0 immediately — but after intro splash ───── */
    /* ── Intro Overlay (logo images) ────────────────────── */
    var overlay = document.getElementById('kh-intro-overlay');
    var wordmarkEl = document.getElementById('kh-intro-wordmark');

    function startBanners() {
        banners[0].classList.add('hero-banner--active');
        banners[0].setAttribute('aria-hidden', 'false');
        setProgress(0);
        syncPhoneTimeline();
        if (!prefersReduced) scheduleNext();
    }

    function dismissOverlay() {
        if (!overlay) return;
        overlay.classList.add('kh-intro-overlay--exit');
        try { document.body.classList.remove('intro-active'); } catch { }
        setTimeout(function () {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, INTRO_EXIT_MS);
    }

    /* Show intro on each fresh load. */
    if (!overlay) {
        startBanners();
    } else {
        try { document.body.classList.add('intro-active'); } catch { }
        var dismissed = false;
        var dismissTimer = null;

        function scheduleDismiss(ms) {
            if (dismissTimer) clearTimeout(dismissTimer);
            dismissTimer = setTimeout(function () {
                if (dismissed) return;
                dismissed = true;
                dismissOverlay();
            }, ms);
        }

        /* Reveal wordmark */
        setTimeout(function () {
            if (wordmarkEl) wordmarkEl.classList.add('kh-intro-word--visible');
        }, INTRO_WORD_DELAY_MS);

        /* Start banners early so they're ready behind overlay */
        setTimeout(startBanners, INTRO_BANNERS_START_MS);

        /* Dismiss after intro duration */
        scheduleDismiss(INTRO_DURATION_MS);
    }

})();

