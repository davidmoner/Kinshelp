/**
 * KingsHelp — Hero alternative FX for sections without side panels
 * Option B: iOS-like notifications entering the phone on scroll.
 * Uses IntersectionObserver + rAF; supports prefers-reduced-motion.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var targets = Array.from(document.querySelectorAll('[data-hero-alt="ios-notifs"]'));
  if (!targets.length) return;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function mkNotif(txt, sub) {
    var el = document.createElement('div');
    el.className = 'kh-ios-notif';
    el.innerHTML =
      '<div class="kh-ios-dot"></div>' +
      '<div class="kh-ios-body">' +
      '<div class="kh-ios-title">' + txt + '</div>' +
      (sub ? '<div class="kh-ios-sub">' + sub + '</div>' : '') +
      '</div>';
    return el;
  }

  targets.forEach(function (t) {
    var host = t.querySelector('.kh-ios-stack');
    if (!host) return;
    host.innerHTML = '';
  });

  function updateFor(target) {
    var rect = target.getBoundingClientRect();
    var vh = window.innerHeight || 800;
    var p = 1 - (rect.top / (vh * 0.9));
    p = clamp(p, 0, 1);
    var stack = target.querySelector('.kh-ios-stack');
    if (!stack) return;
    var notifs = Array.from(stack.querySelectorAll('.kh-ios-notif'));
    notifs.forEach(function (n, i) {
      var delay = i * 0.16;
      var local = clamp((p - delay) / 0.6, 0, 1);
      var y = (1 - local) * 18;
      var o = local;
      n.style.opacity = o.toFixed(3);
      n.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
    });
  }

  var active = new Set();
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      active.forEach(function (t) { updateFor(t); });
    });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          active.add(e.target);
          updateFor(e.target);
        } else {
          active.delete(e.target);
        }
      });
    }, { threshold: [0, 0.15, 0.35, 0.6, 1] });
    targets.forEach(function (t) { io.observe(t); });
  } else {
    targets.forEach(function (t) { active.add(t); });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();
