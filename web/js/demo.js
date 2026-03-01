/**
 * KingsHelp — Demo phone scene carousel controller (v2, isolated IIFE)
 *
 * Behaviour:
 *  - 5 scenes cycle automatically (scene duration configurable below)
 *  - IntersectionObserver: only runs when section is ≥25% visible
 *  - document.visibilitychange: pauses when tab hidden
 *  - prefers-reduced-motion: shows scene 0 only, no cycling
 *  - Adds/removes .ds-paused on phone screen to freeze CSS animations
 *  - Zero global variables; zero interference with KHApp / KHFx
 */
(function () {
    'use strict';

    /* ── Config ─────────────────────────────────────────── */
    var SCENE_DURATION = 3400;   // ms per scene
    var TRANSITION_MS = 420;    // must match CSS --ds-transition
    var TOTAL_SCENES = 5;

    /* ── Reduced-motion check ───────────────────────────── */
    var prefersReducedMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── DOM refs ───────────────────────────────────────── */
    function init() {
        var section = document.getElementById('demo-section');
        var screen = document.getElementById('demo-phone-screen');
        if (!section || !screen) return;

        var scenes = screen.querySelectorAll('.ds-scene');
        var dots = screen.querySelectorAll('.ds-dot');
        if (!scenes.length) return;

        /* Under reduced motion: ensure scene 0 visible, stop here */
        if (prefersReducedMotion) {
            activateScene(scenes, dots, 0, false);
            return;
        }

        var current = 0;
        var timer = null;
        var isVisible = false;
        var isHidden = false; // document.hidden state

        /* ── Scene switcher ─────────────────────────────────── */
        function activateScene(sceneList, dotList, idx, animate) {
            sceneList.forEach(function (s, i) {
                if (i === idx) {
                    /* Reset entry animations by re-cloning the active node */
                    if (animate) {
                        restartAnimations(s);
                    }
                    s.classList.add('ds-scene--active');
                    s.classList.remove('ds-scene--exit');
                } else if (s.classList.contains('ds-scene--active')) {
                    s.classList.remove('ds-scene--active');
                    s.classList.add('ds-scene--exit');
                    /* Clean exit class after transition completes */
                    var exitScene = s;
                    setTimeout(function () {
                        exitScene.classList.remove('ds-scene--exit');
                    }, TRANSITION_MS + 50);
                } else {
                    s.classList.remove('ds-scene--active', 'ds-scene--exit');
                }
            });

            dotList.forEach(function (d, i) {
                d.classList.toggle('ds-dot--active', i === idx);
            });
        }

        /* Force CSS animations to replay by toggling a class */
        function restartAnimations(scene) {
            var animated = scene.querySelectorAll(
                '.ds-anim-slide-up, .ds-anim-fade-in-delay, .ds-anim-pop, ' +
                '.ds-anim-bounce, .ds-anim-progress, .ds-confetti-dot'
            );
            animated.forEach(function (el) {
                el.style.animation = 'none';
                /* Trigger reflow */
                void el.offsetWidth;
                el.style.animation = '';
            });
        }

        /* ── Advance to next scene ──────────────────────────── */
        function nextScene() {
            current = (current + 1) % TOTAL_SCENES;
            activateScene(scenes, dots, current, true);
        }

        /* ── Timer control ──────────────────────────────────── */
        function startTimer() {
            if (timer) return;
            timer = setInterval(nextScene, SCENE_DURATION);
            screen.classList.remove('ds-paused');
        }

        function stopTimer() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            screen.classList.add('ds-paused');
        }

        function syncState() {
            if (isVisible && !isHidden) {
                startTimer();
            } else {
                stopTimer();
            }
        }

        /* ── IntersectionObserver ───────────────────────────── */
        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    isVisible = e.isIntersecting;
                    syncState();
                });
            }, { threshold: 0.25 });
            io.observe(section);
        } else {
            /* Fallback: just start */
            isVisible = true;
            startTimer();
        }

        /* ── Page Visibility API ────────────────────────────── */
        document.addEventListener('visibilitychange', function () {
            isHidden = document.hidden;
            syncState();
        });

        /* ── Initial state ──────────────────────────────────── */
        activateScene(scenes, dots, 0, false);
    }

    /* Run after DOM ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
