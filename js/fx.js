/**
 * KingsHelp FX — SOLO efectos decorativos / visuales.
 * NO toca KHApp, KHApi, ni el flujo de login/API.
 * Expone window.KHFx para uso en atributos onclick decorativos.
 */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const $$ = sel => Array.from(document.querySelectorAll(sel));

    /* ── Match Preview: animación de pasos cíclica ───────────────────────── */
    function initPreviewAnimation() {
        const steps = $$('.preview-step');
        if (!steps.length) return;

        let current = 0;
        const INTERVAL = 1800;

        function activateStep(idx) {
            steps.forEach((s, i) => {
                s.classList.toggle('active', i === idx);
                if (i < idx) s.style.opacity = '0.65';
                else if (i === idx) s.style.opacity = '1';
                else s.style.opacity = '0.35';
            });
        }

        activateStep(0);
        const timer = setInterval(() => {
            current = (current + 1) % steps.length;
            activateStep(current);
        }, INTERVAL);

        const observer = new MutationObserver(() => {
            if (!document.contains(steps[0])) {
                clearInterval(timer);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* ── Modal Premium (solo UI) ─────────────────────────────────────────── */
    function openPremiumModal() {
        const m = $('modal-premium');
        if (!m) return;
        m.classList.remove('hidden');
        setTimeout(() => {
            const btn = m.querySelector('button');
            if (btn) btn.focus();
        }, 80);
    }

    function closePremiumModal(event) {
        const m = $('modal-premium');
        if (!m) return;
        if (event && event.target !== m) return;
        m.classList.add('hidden');
    }

    function closePremiumModalDirect() {
        const m = $('modal-premium');
        if (m) m.classList.add('hidden');
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closePremiumModalDirect();
    });

    /* ── FAQ Accordion ───────────────────────────────────────────────────── */
    function initFaqAccordion() {
        const buttons = $$('.faq-q');
        if (!buttons.length) return;

        buttons.forEach(btn => {
            const panelId = btn.getAttribute('aria-controls');
            const panel = panelId ? document.getElementById(panelId) : null;
            if (!panel) return;

            // Init: ensure panel starts collapsed
            panel.removeAttribute('hidden');
            panel.classList.remove('faq-open');

            btn.addEventListener('click', () => {
                const isOpen = btn.getAttribute('aria-expanded') === 'true';

                if (isOpen) {
                    btn.setAttribute('aria-expanded', 'false');
                    panel.classList.remove('faq-open');
                } else {
                    // Cerrar otros (accordion behavior)
                    buttons.forEach(otherBtn => {
                        if (otherBtn === btn) return;
                        const otherId = otherBtn.getAttribute('aria-controls');
                        const otherPanel = otherId ? document.getElementById(otherId) : null;
                        if (otherPanel && otherBtn.getAttribute('aria-expanded') === 'true') {
                            otherBtn.setAttribute('aria-expanded', 'false');
                            otherPanel.classList.remove('faq-open');
                        }
                    });

                    btn.setAttribute('aria-expanded', 'true');
                    panel.classList.add('faq-open');
                }
            });
        });
    }

    /* ── Intersection Observer: reveal con stagger ───────────────────────── */
    function initReveal() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            $$('.reveal').forEach(el => el.classList.add('revealed'));
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    const delay = el.dataset.revealDelay ? parseFloat(el.dataset.revealDelay) : 0;
                    setTimeout(() => {
                        el.classList.add('revealed');
                    }, delay);
                    io.unobserve(el);
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -48px 0px' }
        );

        // Stagger delay automático por hermanos en el mismo padre
        const parentMap = new Map();
        $$('.reveal').forEach(el => {
            const parent = el.parentElement || document.body;
            if (!parentMap.has(parent)) parentMap.set(parent, []);
            parentMap.get(parent).push(el);
        });

        parentMap.forEach(group => {
            group.forEach((el, i) => {
                if (i > 0 && !el.dataset.revealDelay) {
                    el.dataset.revealDelay = Math.min(i * 80, 320);
                }
            });
        });

        $$('.reveal').forEach(el => io.observe(el));
    }

    /* ── Lazy image loader ───────────────────────────────────────────────── */
    function initLazyImages() {
        $$('img[loading="lazy"]').forEach(img => {
            if (img.complete) {
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', () => img.classList.add('loaded'));
            }
        });
    }

    /* ── KPI counter animation ───────────────────────────────────────────── */
    function initKpiCounters() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const kpis = $$('[data-target]');
        if (!kpis.length) return;

        const counterIO = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const target = parseInt(el.dataset.target, 10);
                const duration = 1800;
                const start = performance.now();

                function tick(now) {
                    const progress = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    const value = Math.round(eased * target);
                    el.textContent = value >= 1000
                        ? value.toLocaleString('es-ES')
                        : value;
                    if (progress < 1) requestAnimationFrame(tick);
                }

                requestAnimationFrame(tick);
                counterIO.unobserve(el);
            });
        }, { threshold: 0.5 });

        kpis.forEach(el => counterIO.observe(el));
    }

    /* ── Cursor glow ─────────────────────────────────────────────────────── */
    function initCursorGlow() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (window.matchMedia('(hover: none)').matches) return;

        const glow = document.createElement('div');
        glow.id = 'fx-cursor-glow';
        glow.setAttribute('aria-hidden', 'true');
        glow.style.cssText = [
            'position:fixed', 'pointer-events:none', 'z-index:9999',
            'width:320px', 'height:320px', 'border-radius:50%',
            'background:radial-gradient(circle, rgba(123,92,250,0.05) 0%, transparent 70%)',
            'transform:translate(-50%,-50%)', 'transition:opacity 0.4s',
            'top:0', 'left:0', 'opacity:0', 'will-change:transform'
        ].join(';');
        document.body.appendChild(glow);

        let raf, cx = 0, cy = 0, visible = false;

        document.addEventListener('mousemove', e => {
            cx = e.clientX; cy = e.clientY;
            if (!visible) { glow.style.opacity = '1'; visible = true; }
            if (!raf) raf = requestAnimationFrame(function frame() {
                glow.style.left = cx + 'px';
                glow.style.top = cy + 'px';
                raf = null;
            });
        }, { passive: true });

        document.addEventListener('mouseleave', () => {
            glow.style.opacity = '0';
            visible = false;
        });
    }

    /* ── Smooth anchor scrolling ─────────────────────────────────────────── */
    function initSmoothAnchors() {
        document.addEventListener('click', e => {
            const link = e.target.closest('a[href^="#"]');
            if (!link) return;
            const id = link.getAttribute('href').slice(1);
            if (!id) return;
            const target = document.getElementById(id);
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    /* ── Init ─────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        initPreviewAnimation();
        initCursorGlow();
        initReveal();
        initFaqAccordion();
        initLazyImages();
        initKpiCounters();
        initSmoothAnchors();
    });

    /* ── API pública ──────────────────────────────────────────────────────── */
    window.KHFx = {
        openPremiumModal,
        closePremiumModal,
        closePremiumModalDirect,
    };

})();
