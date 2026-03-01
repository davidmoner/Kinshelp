/**
 * KingsHelp Theme — selector oscuro/claro.
 * IIFE aislado. No toca KHApp, KHApi ni el DOM funcional.
 * Clave localStorage: "kh_theme". Valores: "dark" | "light".
 */
(function () {
    'use strict';

    const KEY = 'kh_theme';
    const ROOT = document.documentElement;
    const THEMES = { dark: 'dark', light: 'light' };

    /* ── Leer preferencia inicial ─────────────────────────────────────── */
    function getStoredTheme() {
        try { return localStorage.getItem(KEY); } catch { return null; }
    }

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: light)').matches
            ? THEMES.light : THEMES.dark;
    }

    /* ── Aplicar tema al <html> ───────────────────────────────────────── */
    function applyTheme(theme) {
        ROOT.dataset.theme = theme;
        try { localStorage.setItem(KEY, theme); } catch { /* noop */ }
        updateToggleUI(theme);
    }

    /* ── Toggle ───────────────────────────────────────────────────────── */
    function toggle() {
        const current = ROOT.dataset.theme === THEMES.light ? THEMES.light : THEMES.dark;
        applyTheme(current === THEMES.dark ? THEMES.light : THEMES.dark);
    }

    /* ── Actualizar el botón con el icono correcto ────────────────────── */
    function updateToggleUI(theme) {
        const btns = document.querySelectorAll('.kh-theme-toggle');
        const isLight = theme === THEMES.light;
        btns.forEach(btn => {
            const icon = btn.querySelector('.kh-theme-icon');
            const label = btn.querySelector('.kh-theme-label');
            if (icon) icon.textContent = isLight ? '☀️' : '🌙';
            if (label) label.textContent = isLight ? 'Claro' : 'Oscuro';
            btn.setAttribute('aria-pressed', isLight ? 'false' : 'true');
            btn.setAttribute('aria-label', isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
        });
    }

    /* ── Init ─────────────────────────────────────────────────────────── */
    const initial = getStoredTheme() || getSystemTheme();
    applyTheme(initial);

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.kh-theme-toggle').forEach(btn => {
            btn.addEventListener('click', toggle);
        });
        updateToggleUI(ROOT.dataset.theme);
    });

    /* ── API pública mínima ───────────────────────────────────────────── */
    window.KHTheme = { toggle, applyTheme };

})();
