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
        count: 42,        // partículas totales
        minR: 1.6,       // radio mínimo (px)
        maxR: 3.6,       // radio máximo
        speed: 0.12,      // velocidad base (px/frame)
        wobble: 0.0006,    // amplitud oscilación angular
        opacityMaxDark: 0.12,   // opacidad máx en tema oscuro
        opacityMaxLight: 0.07, // ~45% menos visible en tema claro
        repelRadius: 160,
        repelForce: 0.6,
    };

    /* Colores para cada tema */
    const PALETTE = {
        dark: ['201,168,76', '123,92,250', '61,139,255'],   // gold · violeta · azul
        light: ['160,120,40', '91,63,232', '45,107,228'],
    };

    /* ── Estado ───────────────────────────────────────────────── */
    let W, H, particles = [], raf, paused = false;
    const mouse = { x: 0, y: 0, active: false };
    const introOverlay = document.getElementById('kh-intro-overlay');

    /* ── Resize ───────────────────────────────────────────────── */
    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
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
            vx: 0,
            vy: 0,
            shape: Math.random() > 0.72 ? 'square' : 'circle',
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
        const introActive = introOverlay && introOverlay.isConnected;
        if (paused || introActive) { raf = requestAnimationFrame(tick); return; }

        ctx.clearRect(0, 0, W, H);

        const palette = PALETTE[theme()];
        const isLight = theme() === 'light';

        particles.forEach(p => {
            /* drift + wobble suave */
            p.angle += p.wobble + Math.sin(t * 0.0002 + p.phase) * 0.0008;
            p.vx += Math.cos(p.angle) * p.speed;
            p.vy += Math.sin(p.angle) * p.speed;

            if (mouse.active) {
                const dx = p.x - mouse.x;
                const dy = p.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < CFG.repelRadius && dist > 0.1) {
                    const force = (1 - dist / CFG.repelRadius) * CFG.repelForce;
                    p.vx += (dx / dist) * force;
                    p.vy += (dy / dist) * force;
                }
            }

            p.vx *= 0.92;
            p.vy *= 0.92;
            p.x += p.vx;
            p.y += p.vy;

            /* wrap (reaparece en el otro lado) */
            if (p.x < -p.r) p.x = W + p.r;
            if (p.x > W + p.r) p.x = -p.r;
            if (p.y < -p.r) p.y = H + p.r;
            if (p.y > H + p.r) p.y = -p.r;

            /* opacidad adaptada al tema actual */
            const oMax = isLight ? CFG.opacityMaxLight : CFG.opacityMaxDark;
            const drawOp = Math.min(p.opacity, oMax);

            /* dibujar */
            ctx.fillStyle = `rgba(${palette[p.colorIdx]},${drawOp.toFixed(3)})`;
            if (p.shape === 'square') {
                const s = p.r * 1.9;
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(p.x - s / 2, p.y - s / 2, s, s, s * 0.35);
                } else {
                    ctx.rect(p.x - s / 2, p.y - s / 2, s, s);
                }
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
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
    window.addEventListener('pointermove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
    }, { passive: true });
    window.addEventListener('pointerleave', () => { mouse.active = false; }, { passive: true });
    init();
    raf = requestAnimationFrame(tick);

})();
