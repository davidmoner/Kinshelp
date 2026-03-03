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
    var INTRO_DURATION_MS = 4000;           // total intro duration
    var INTRO_BURST_MS = 3000;              // particle burst timing
    var INTRO_EXIT_MS = 620;                // overlay fade duration
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
    /* ── Intro Overlay (logo image + burst) ─────────────── */
    var overlay = document.getElementById('kh-intro-overlay');
    var burstCanvas = document.getElementById('kh-intro-burst');
    var logoWrap = document.getElementById('kh-intro-logo-wrap');
    var burstTimer = null;
    var burstRaf = null;

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
        if (burstTimer) clearTimeout(burstTimer);
        if (burstRaf) cancelAnimationFrame(burstRaf);
        setTimeout(function () {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, INTRO_EXIT_MS);
    }

    function startBurst() {
        if (!burstCanvas || !logoWrap || prefersReduced) return;
        var ctx = burstCanvas.getContext('2d');
        if (!ctx) return;

        var rect = burstCanvas.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        burstCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
        burstCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var logoRect = logoWrap.getBoundingClientRect();
        var cx = logoRect.left + logoRect.width / 2 - rect.left;
        var cy = logoRect.top + logoRect.height / 2 - rect.top;

        var colors = ['#7c3aed', '#8b5cf6', '#a855f7'];
        var count = Math.floor(80 + Math.random() * 60);
        var particles = [];

        for (var i = 0; i < count; i += 1) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 1.8 + Math.random() * 4.2;
            var size = 1.2 + Math.random() * 2.6;
            var life = 750 + Math.random() * 350;
            var color = colors[Math.floor(Math.random() * colors.length)];
            particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: size,
                life: life,
                age: 0,
                color: color,
                dash: Math.random() < 0.45,
                glow: 10 + Math.random() * 18
            });
        }

        var start = performance.now();
        var last = start;
        ctx.lineCap = 'round';

        function frame(now) {
            var dt = Math.min(32, now - last);
            last = now;
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.globalCompositeOperation = 'lighter';

            var alive = 0;
            for (var i = 0; i < particles.length; i += 1) {
                var p = particles[i];
                p.age += dt;
                if (p.age >= p.life) continue;
                alive += 1;

                var t = p.age / p.life;
                var fade = 1 - t;
                var step = dt / 16.666;

                p.vx *= 0.985;
                p.vy *= 0.985;
                p.x += p.vx * step * 6;
                p.y += p.vy * step * 6;

                ctx.globalAlpha = fade;
                ctx.shadowBlur = p.glow * fade;
                ctx.shadowColor = p.color;

                if (p.dash) {
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = p.size;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.vx * 1.8, p.y - p.vy * 1.8);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * (0.8 + fade * 0.6), 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            if (alive > 0 && now - start < 1400) {
                burstRaf = requestAnimationFrame(frame);
            } else {
                ctx.clearRect(0, 0, rect.width, rect.height);
            }
        }

        burstRaf = requestAnimationFrame(frame);
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

        /* Start banners early so they're ready behind overlay */
        setTimeout(startBanners, 1600);

        if (!prefersReduced) {
            burstTimer = setTimeout(startBurst, INTRO_BURST_MS);
        }

        /* Dismiss after intro duration */
        scheduleDismiss(INTRO_DURATION_MS);
    }

})();

