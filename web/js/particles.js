/**
 * KingsHelp Particles — capa decorativa de partículas drift.
 * IIFE aislado. No toca KHApp, KHApi, KHFx, KHTheme ni el DOM funcional.
 * Añade un <canvas id="kh-particles"> fijo, pointer-events:none, z-index:1.
 */
(function () {
    'use strict';

    /* ── Respetar prefers-reduced-motion ─────────────────────── */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /* ── Attach canvas (hero-only, clipped) ───────────────────── */
    const hero = document.getElementById('kh-hero');
    if (!hero) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'kh-particles';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = [
        'position:absolute', 'inset:0', 'width:100%', 'height:100%',
        'pointer-events:none', 'z-index:0'
    ].join(';');
    hero.prepend(canvas);

    const ctx = canvas.getContext('2d');

    /* ── Config ───────────────────────────────────────────────── */
    const CFG = {
        count: 240,
        minR: 0.7,
        maxR: 2.0,
        speed: 0.18,
        wobble: 0.00055,
        opacityMaxDark: 0.10,
        opacityMaxLight: 0.075,
        scrollParallax: 0.09,
        scrollEase: 0.075,
        mouseEase: 0.06,
        // Burst focus around title
        focusRadius: 520,
        focusTightness: 0.52,
        dashLenMin: 2.0,
        dashLenMax: 7.0,
        dashWidthMin: 1.0,
        dashWidthMax: 1.8,
    };

    /* Colores para cada tema */
    const PALETTE = {
        // KingsHelp: azul + oro, con toque violeta muy sutil
        dark: ['41,90,173', '201,168,76', '82,49,148'],
        light: ['31,78,158', '160,120,40', '74,42,134'],
    };

    /* ── Estado ───────────────────────────────────────────────── */
    let W, H, particles = [], raf, paused = false;
    let lastScrollY = window.scrollY || 0;
    let scrollOffset = 0;
    let scrollTarget = 0;
    let mx = 0, my = 0, mxT = 0, myT = 0;
    let focusX = 0, focusY = 0;
    let heroVisible = true;

    /* ── Resize ───────────────────────────────────────────────── */
    function dpr() {
        return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    }

    function resize() {
        const r = hero.getBoundingClientRect();
        const ratio = dpr();
        W = canvas.width = Math.max(1, Math.floor(r.width * ratio));
        H = canvas.height = Math.max(1, Math.floor(r.height * ratio));
        canvas.style.width = r.width + 'px';
        canvas.style.height = r.height + 'px';
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        updateFocus();
    }

    function updateFocus() {
        const t = hero.querySelector('.hero-banner.hero-banner--active .hero-title, .hero-banner.hero-banner--active .hb3-title') ||
            hero.querySelector('.hero-title, .hb3-title');
        if (!t) {
            focusX = (W / dpr()) * 0.5;
            focusY = (H / dpr()) * 0.40;
            return;
        }
        const hr = hero.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        focusX = (tr.left - hr.left) + (tr.width * 0.5);
        focusY = (tr.top - hr.top) + (tr.height * 0.45);
    }

    // Clamp scroll offset so particles never disappear on long pages.
    function clampScroll() {
        // keep within ~10% of hero height
        const max = ((H / dpr()) || 800) * 0.10;
        if (scrollTarget > max) scrollTarget = max;
        if (scrollTarget < -max) scrollTarget = -max;
    }

    /* ── Crear una partícula ──────────────────────────────────── */
    function randRange(a, b) {
        return a + Math.random() * (b - a);
    }

    function makeParticle() {
        const angle = Math.random() * Math.PI * 2;
        const oMax = theme() === 'light' ? CFG.opacityMaxLight : CFG.opacityMaxDark;

        // Sample position biased toward focus point.
        const fx = focusX || 0;
        const fy = focusY || 0;
        const rr = Math.pow(Math.random(), CFG.focusTightness) * CFG.focusRadius;
        const aa = Math.random() * Math.PI * 2;
        const x = fx + Math.cos(aa) * rr + randRange(-30, 30);
        const y = fy + Math.sin(aa) * rr * 0.78 + randRange(-28, 28);

        return {
            x,
            y,
            r: randRange(CFG.minR, CFG.maxR),
            dashL: randRange(CFG.dashLenMin, CFG.dashLenMax),
            dashW: randRange(CFG.dashWidthMin, CFG.dashWidthMax),
            angle,
            spin: (Math.random() - 0.5) * 0.002,
            speed: CFG.speed * (0.5 + Math.random()),
            wobble: CFG.wobble * (Math.random() - 0.5) * 2,
            opacity: 0.018 + Math.random() * oMax,
            colorIdx: Math.floor(Math.random() * 3),
            phase: Math.random() * Math.PI * 2,
        };
    }

    /* ── Inicializar pool ─────────────────────────────────────── */
    function init() {
        resize();
        particles = Array.from({ length: CFG.count }, makeParticle);
    }

    // Pause when hero not visible
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            heroVisible = entries[0] && entries[0].isIntersecting;
        }, { threshold: 0.2 });
        io.observe(hero);
    }

    // Update focus when banners change
    if ('MutationObserver' in window) {
        const mo = new MutationObserver(() => updateFocus());
        const stage = document.getElementById('kh-hero-stage');
        if (stage) mo.observe(stage, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }

    // Desktop mouse influence
    const canMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canMouse) {
        hero.addEventListener('mousemove', (e) => {
            const r = hero.getBoundingClientRect();
            mxT = (e.clientX - r.left) / r.width - 0.5;
            myT = (e.clientY - r.top) / r.height - 0.5;
        }, { passive: true });
        hero.addEventListener('mouseleave', () => { mxT = 0; myT = 0; }, { passive: true });
    }

    /* ── Leer tema activo ─────────────────────────────────────── */
    function theme() {
        return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    }

    /* ── Frame ────────────────────────────────────────────────── */
    function tick(t) {
        if (paused) { raf = requestAnimationFrame(tick); return; }
        if (!heroVisible) { raf = requestAnimationFrame(tick); return; }

        ctx.clearRect(0, 0, W, H);

        const palette = PALETTE[theme()];
        const isLight = theme() === 'light';

        // Smooth scroll-driven parallax (hero only)
        const sy = window.scrollY || 0;
        const d = sy - lastScrollY;
        lastScrollY = sy;
        scrollTarget += d * CFG.scrollParallax;
        clampScroll();
        scrollOffset += (scrollTarget - scrollOffset) * CFG.scrollEase;

        // Mouse easing
        mx += (mxT - mx) * CFG.mouseEase;
        my += (myT - my) * CFG.mouseEase;
        const mousePX = mx * 26;
        const mousePY = my * 22;

        particles.forEach(p => {
            const tt = t * 0.001;
            const a = Math.sin(tt * 0.62 + p.phase);
            const b = Math.cos(tt * 0.47 + p.phase * 1.7);

            p.angle += p.wobble + p.spin + (a * 0.00065) + (b * 0.00045);
            p.x += (Math.cos(p.angle) * p.speed) + (Math.sin(tt * 0.22 + p.phase) * 0.05);
            p.y += (Math.sin(p.angle) * p.speed) + (Math.cos(tt * 0.18 + p.phase) * 0.05);

            // Gentle attraction toward focus point keeps density around title
            const dx = focusX - p.x;
            const dy = focusY - p.y;
            p.x += dx * 0.00035;
            p.y += dy * 0.00030;

            // Wrap
            const w = (W / dpr());
            const h = (H / dpr());
            if (p.x < -40) p.x = w + 40;
            if (p.x > w + 40) p.x = -40;
            if (p.y < -40) p.y = h + 40;
            if (p.y > h + 40) p.y = -40;

            const oMax = isLight ? CFG.opacityMaxLight : CFG.opacityMaxDark;
            const drawOp = Math.min(p.opacity, oMax);

            // Draw dash (tiny rotated line)
            const px = p.x + mousePX;
            const py = p.y + scrollOffset + mousePY;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(p.angle);
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineWidth = p.dashW;
            ctx.strokeStyle = `rgba(${palette[p.colorIdx]},${drawOp.toFixed(3)})`;
            ctx.moveTo(-p.dashL, 0);
            ctx.lineTo(p.dashL, 0);
            ctx.stroke();
            ctx.restore();
        });

        raf = requestAnimationFrame(tick);
    }

    /* ── Pausar si pestaña no visible ────────────────────────── */
    document.addEventListener('visibilitychange', () => {
        paused = document.hidden;
    });

    /* ── Ajuste sobre marcha al cambiar tema ─────────────────── */
    const themeObs = new MutationObserver(() => { /* palette se lee en tick */ });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    /* ── Start ────────────────────────────────────────────────── */
    window.addEventListener('resize', resize, { passive: true });
    init();
    raf = requestAnimationFrame(tick);

})();
