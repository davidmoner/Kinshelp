/**
 * KingsHelp — Hero Side Panels controller
 * Sticky vertical panels with infinite-ish feed (recycles scenes).
 * Uses IntersectionObserver + rAF (transform/opacity only).
 */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.getElementById('kh-sidepanels');
  if (!root) return;
  if (reduced) return;

  var hero = document.getElementById('kh-hero');
  if (!hero) return;

  // Only show side panels on banner 1 and 3.
  // Current hero uses data-banner 0/1/2, so "1 y 3" => 0 and 2.
  var ALLOWED = { '0': true, '2': true };
  var stage = document.getElementById('kh-hero-stage');
  var bannerObs = null;
  var activeBanner = '0';

  function updatePanelVisibility() {
    var on = !!ALLOWED[String(activeBanner)];
    root.style.display = on ? '' : 'none';
  }

  if ('MutationObserver' in window && stage) {
    bannerObs = new MutationObserver(function () {
      // Find active banner
      var active = stage.querySelector('.hero-banner.hero-banner--active');
      if (!active) return;
      var b = active.getAttribute('data-banner');
      if (!b) return;
      if (b === activeBanner) return;
      activeBanner = b;
      updatePanelVisibility();
    });
    bannerObs.observe(stage, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  var leftFeed = document.getElementById('kh-panel-feed-left');
  var rightFeed = document.getElementById('kh-panel-feed-right');
  if (!leftFeed || !rightFeed) return;

  // Both panels visible (banner 1 and 3 only).
  rightFeed.parentElement.style.opacity = '';
  rightFeed.parentElement.style.pointerEvents = '';

  // Using provided reference images (swappable later)
  var SCENES = [
    { img: 'img/1izquierda.png', alt: 'Vecina en la ventana', pill: 'Vecina', kind: 'scene' },
    { img: 'img/1derecha.png', alt: 'Vecino en la ventana', pill: 'Vecino', kind: 'scene' }
  ];

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function makeItem(scene) {
    var wrap = el('div', 'kh-panel-item');
    var card = el('div', 'kh-panel-scene');
    var top = el('div', 'kh-scene-top');
    if (scene.img) {
      var img = document.createElement('img');
      img.className = 'kh-scene-img';
      img.src = scene.img;
      img.alt = scene.alt || '';
      img.loading = 'eager';
      img.decoding = 'async';
      top.appendChild(img);
    } else {
      var person = el('div', 'kh-scene-person');
      person.textContent = scene.emoji || '👤';
      top.appendChild(person);
    }
    var body = el('div', 'kh-scene-body');

    var mini = el('div', 'kh-mini-card');
    var ava = el('div', 'kh-mini-ava');
    var lines = el('div', 'kh-mini-lines');
    var l1 = el('div', 'kh-mini-line');
    var l2 = el('div', 'kh-mini-line l2');
    lines.appendChild(l1);
    lines.appendChild(l2);
    var pill = el('div', 'kh-mini-pill');
    pill.textContent = scene.pill || 'Vecino';
    mini.appendChild(ava);
    mini.appendChild(lines);
    mini.appendChild(pill);

    body.appendChild(mini);
    card.appendChild(top);
    card.appendChild(body);
    wrap.appendChild(card);
    return wrap;
  }

  function pickScene(i) {
    return SCENES[i % SCENES.length];
  }

  function fillFeed(feed, startIdx) {
    feed.innerHTML = '';
    for (var i = 0; i < 1; i++) {
      var item = makeItem(pickScene(startIdx + i));
      feed.appendChild(item);
    }
    // Stagger in
    requestAnimationFrame(function () {
      Array.from(feed.children).forEach(function (c, idx) {
        setTimeout(function () { c.classList.add('is-in'); }, 30 + idx * 90);
      });
    });
  }

  var idxL = 0;
  var idxR = 1;
  fillFeed(leftFeed, idxL);
  fillFeed(rightFeed, idxR);

  updatePanelVisibility();

  var inHero = false;
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      inHero = entries[0] && entries[0].isIntersecting;
    }, { threshold: 0.18 });
    io.observe(hero);
  } else {
    inHero = true;
  }

  var ticking = false;
  var lastSwapAt = 0;
  var SWAP_MS = 1200;

  function swapOne(feed, nextIdx) {
    var first = feed.firstElementChild;
    if (!first) return;
    first.classList.remove('is-in');
    // animate out using same transition; remove after
    setTimeout(function () {
      try { first.remove(); } catch { }
      var item = makeItem(pickScene(nextIdx));
      feed.appendChild(item);
      // animate in
      requestAnimationFrame(function () {
        item.classList.add('is-in');
      });
    }, 240);
  }

  function onFrame(now) {
    ticking = false;
    if (!inHero) return;
    if (now - lastSwapAt < SWAP_MS) return;
    lastSwapAt = now;
    idxL++;
    idxR++;
    swapOne(leftFeed, idxL);
    swapOne(rightFeed, idxR);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onFrame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();
