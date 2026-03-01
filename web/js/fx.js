/**
 * KingsHelp FX — SOLO efectos decorativos / visuales.
 * NO toca KHApp, KHApi, ni el flujo de login/API.
 * Expone window.KHFx para uso en atributos onclick decorativos.
 */
(function () {
    'use strict';

    /* ── Helpers ─────────────────────────────────────────────────────────── */
    const $ = id => document.getElementById(id);

    /* ── Match Preview: animación de pasos cíclica ───────────────────────── */
    function initPreviewAnimation() {
        const steps = document.querySelectorAll('.preview-step');
        if (!steps.length) return;

        let current = 0;
        const INTERVAL = 1800; // ms por paso

        function activateStep(idx) {
            steps.forEach((s, i) => {
                s.classList.toggle('active', i === idx);
                // Pasos anteriores: opacidad reducida pero visible
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

        // Limpiar si el elemento desaparece
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
        // Trampa de foco accesible: enfocar el primer elemento focusable
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

    /* ── Teclado: Escape cierra modal premium ────────────────────────────── */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closePremiumModalDirect();
    });

    /* ── Cursor glow (opcional, decorativo) ──────────────────────────────── */
    function initCursorGlow() {
        // Desactivar si prefers-reduced-motion
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const glow = document.createElement('div');
        glow.id = 'fx-cursor-glow';
        glow.setAttribute('aria-hidden', 'true');
        glow.style.cssText = [
            'position:fixed', 'pointer-events:none', 'z-index:9999',
            'width:320px', 'height:320px', 'border-radius:50%',
            'background:radial-gradient(circle, rgba(123,92,250,0.05) 0%, transparent 70%)',
            'transform:translate(-50%,-50%)', 'transition:opacity 0.4s',
            'top:0', 'left:0', 'opacity:0'
        ].join(';');
        document.body.appendChild(glow);

        let visible = false;
        document.addEventListener('mousemove', e => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
            if (!visible) {
                glow.style.opacity = '1';
                visible = true;
            }
        }, { passive: true });
        document.addEventListener('mouseleave', () => {
            glow.style.opacity = '0';
            visible = false;
        });
    }

    /* ── Init ─────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        initPreviewAnimation();
        initCursorGlow();
    });

    /* ── API pública (solo para onclick decorativos en HTML) ──────────────── */
    window.KHFx = {
        openPremiumModal,
        closePremiumModal,
        closePremiumModalDirect,
    };

})();
