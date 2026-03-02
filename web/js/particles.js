/**
 * KingsHelp Particles — capa decorativa de partículas drift.
 * IIFE aislado. No toca KHApp, KHApi, KHFx, KHTheme ni el DOM funcional.
 * Añade un <canvas id="kh-particles"> fijo, pointer-events:none, z-index:1.
 */
(function () {
    'use strict';

    /* ── Respetar prefers-reduced-motion ─────────────────────── */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /* ── Crear canvas ─────────────────────────────────────────── */
    const canvas = document.createElement('canvas');
    canvas.id = 'kh-particles';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = [
        'position:fixed', 'inset:0', 'width:100%', 'height:100%',
        'pointer-events:none', 'z-index:1'
    ].join(';');
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');

    /* ── Config ───────────────────────────────────────────────── */
    const CFG = {
        count: 56,
        minR: 1.0,
        maxR: 2.6,
        speed: 0.12,
        wobble: 0.00045,
        opacityMaxDark: 0.085,
        opacityMaxLight: 0.048,
        scrollParallax: 0.12,
        scrollEase: 0.08,
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

    /* ── Resize ───────────────────────────────────────────────── */
    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    // Clamp scroll offset so particles never disappear on long pages.
    function clampScroll() {
        // keep within ~12% of viewport height
        const max = (H || window.innerHeight || 800) * 0.12;
        if (scrollTarget > max) scrollTarget = max;
        if (scrollTarget < -max) scrollTarget = -max;
    }

    /* ── Crear una partícula ──────────────────────────────────── */
    function makeParticle() {
        const angle = Math.random() * Math.PI * 2;
        const oMax = theme() === 'light' ? CFG.opacityMaxLight : CFG.opacityMaxDark;
        return {
            x: Math.random() * (W || 800),
            y: Math.random() * (H || 600),
            r: CFG.minR + Math.random() * (CFG.maxR - CFG.minR),
            angle,
            speed: CFG.speed * (0.5 + Math.random()),
            wobble: CFG.wobble * (Math.random() - 0.5) * 2,
            opacity: 0.02 + Math.random() * oMax,
            colorIdx: Math.floor(Math.random() * 3),
            phase: Math.random() * Math.PI * 2,
        };
    }

    /* ── Inicializar pool ─────────────────────────────────────── */
    function init() {
        resize();
        particles = Array.from({ length: CFG.count }, makeParticle);
    }

    /* ── Leer tema activo ─────────────────────────────────────── */
    function theme() {
        return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    }

    /* ── Frame ────────────────────────────────────────────────── */
    function tick(t) {
        if (paused) { raf = requestAnimationFrame(tick); return; }

        ctx.clearRect(0, 0, W, H);

        const palette = PALETTE[theme()];
        const isLight = theme() === 'light';

        // Smooth scroll-driven parallax (subtle)
        const sy = window.scrollY || 0;
        const d = sy - lastScrollY;
        lastScrollY = sy;
        scrollTarget += d * CFG.scrollParallax;
        clampScroll();
        scrollOffset += (scrollTarget - scrollOffset) * CFG.scrollEase;

        particles.forEach(p => {
            // Drift hipnotico, mas simetrico: mezcla de 2 ondas suaves (Lissajous-ish)
            const tt = t * 0.001;
            const a = Math.sin(tt * 0.55 + p.phase);
            const b = Math.cos(tt * 0.42 + p.phase * 1.7);
            p.angle += p.wobble + (a * 0.00055) + (b * 0.00040);
            p.x += (Math.cos(p.angle) * p.speed) + (Math.sin(tt * 0.22 + p.phase) * 0.06);
            p.y += (Math.sin(p.angle) * p.speed) + (Math.cos(tt * 0.18 + p.phase) * 0.06);

            /* wrap (reaparece en el otro lado) */
            if (p.x < -p.r) p.x = W + p.r;
            if (p.x > W + p.r) p.x = -p.r;
            if (p.y < -p.r) p.y = H + p.r;
            if (p.y > H + p.r) p.y = -p.r;

            /* opacidad adaptada al tema actual */
            const oMax = isLight ? CFG.opacityMaxLight : CFG.opacityMaxDark;
            const drawOp = Math.min(p.opacity, oMax);

            /* dibujar (parallax) */
            ctx.beginPath();
            ctx.arc(p.x, p.y + scrollOffset, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${palette[p.colorIdx]},${drawOp.toFixed(3)})`;
            ctx.fill();
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
