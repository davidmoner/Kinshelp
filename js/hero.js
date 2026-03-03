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
    var BANNER_DURATIONS = [4000, 6000, 4000]; // ms per banner (banner 2 needs +2s)
    var TRANSITION_MS = 550;                // must match CSS
    var PAUSE_AFTER_INTERACTION_MS = 20000;    // 20s pause after user touch
    var INTRO_HOLD_MS = 820;                // ms KingsHelp intro is shown
    var INTRO_EXIT_MS = 650;                // clip-path ripple duration
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
                BANNER_DURATIONS = [baseMs, baseMs + 2000, baseMs];
                setProgress(current);
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

    if (!stage) return;

    banners = Array.from(stage.querySelectorAll('.hero-banner'));
    progressSegs = progressEl ? Array.from(progressEl.querySelectorAll('.hero-progress-seg')) : [];

    if (!banners.length) return;

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
        } else {
            resumeIfShould();
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
    /* ── Intro Overlay (video) ─────────────────────────── */
    var overlay = document.getElementById('kh-intro-overlay');
    var video = document.getElementById('kh-intro-video');
    var videoWrap = document.getElementById('kh-intro-video-wrap');

    function startBanners() {
        banners[0].classList.add('hero-banner--active');
        banners[0].setAttribute('aria-hidden', 'false');
        setProgress(0);
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
        }, 620);
    }

    /* Show intro on each fresh load (skip for reduced motion). */
    if (!overlay || prefersReduced) {
        /* Reduced-motion / already seen / no overlay: skip instantly */
        if (overlay) {
            overlay.style.display = 'none';
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        try { document.body.classList.remove('intro-active'); } catch { }
        startBanners();
    } else {
        try { document.body.classList.add('intro-active'); } catch { }
        var durationMs = 5000;
        var dismissed = false;
        var dismissTimer = null;
        var playbackRate = 1.75;

        function scheduleDismiss(ms) {
            if (dismissTimer) clearTimeout(dismissTimer);
            dismissTimer = setTimeout(function () {
                if (dismissed) return;
                dismissed = true;
                dismissOverlay();
            }, ms);
        }

        if (video) {
            try {
                video.controls = false;
                video.loop = false;
                video.muted = true;
                video.playbackRate = playbackRate;
                video.defaultPlaybackRate = playbackRate;
                if (video.disablePictureInPicture !== undefined) video.disablePictureInPicture = true;
                if (video.controlsList !== undefined) video.controlsList = 'nodownload noplaybackrate noremoteplayback';
                try { video.currentTime = 0; } catch { }
                var playPromise = video.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(function () { /* ignore autoplay errors */ });
                }
            } catch { }

            video.addEventListener('ended', function () {
                if (dismissed) return;
                dismissed = true;
                dismissOverlay();
            }, { once: true });
        }

        if (videoWrap) videoWrap.style.setProperty('--intro-shrink', durationMs + 'ms');

        /* Start banners early so they're ready behind overlay */
        setTimeout(startBanners, 1600);

        /* Dismiss after video duration + fade time */
        scheduleDismiss(durationMs + 700);
    }

})();

