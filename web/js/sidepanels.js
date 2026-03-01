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

  function pickPanelImages(side) {
    // Convention: numbered images with side in filename, e.g. "1izquierda.png", "12derecha.png".
    // NOTE: In-browser we can't list a folder, so this probes candidates until they load.
    var exts = ['png', 'jpg', 'jpeg', 'webp'];

    function probeTop2(cb) {
      var done = false;
      var n = 99;
      var found = [];

      function tryOne() {
        if (done) return;
        if (n <= 0) {
          done = true;
          cb(found);
          return;
        }

        var i = 0;
        function tryExt() {
          if (done) return;
          if (i >= exts.length) {
            n--;
            tryOne();
            return;
          }
          var cand = 'img/' + n + side + '.' + exts[i++];
          var img = new Image();
          img.onload = function () {
            if (done) return;
            // Avoid duplicates by path
            if (found.indexOf(cand) === -1) found.push(cand);
            if (found.length >= 2) {
              done = true;
              cb(found);
              return;
            }
            // keep scanning down for 2nd
            n--;
            tryOne();
          };
          img.onerror = function () {
            tryExt();
          };
          img.src = cand;
        }

        tryExt();
      }

      tryOne();
    }

    return {
      initial: ['img/1' + side + '.png'],
      probeTop2: probeTop2
    };
  }

  var leftPick = pickPanelImages('izquierda');
  var rightPick = pickPanelImages('derecha');

  function scene(side, who, pick) {
    return {
      side: side,
      img: pick.initial[0],
      alt: 'Panel ' + side,
      pill: who,
      kind: 'scene',
      _picker: pick
    };
  }

  // Two images per side (no repeats within the same side)
  // Order: L1, L2, R1, R2
  var SCENES = [
    Object.assign(scene('izquierda', 'Vecina', leftPick), { _slot: 0 }),
    Object.assign(scene('izquierda', 'Vecina', leftPick), { _slot: 1 }),
    Object.assign(scene('derecha', 'Vecino', rightPick), { _slot: 0 }),
    Object.assign(scene('derecha', 'Vecino', rightPick), { _slot: 1 })
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
      img.draggable = false;
      img.onerror = function () {
        // Keep layout intact even if a file is missing.
        this.style.opacity = '0';
      };

      // Upgrade to top-2 matches when found (per side).
      if (scene._picker && typeof scene._picker.probeTop2 === 'function') {
        scene._picker.probeTop2(function (list) {
          if (!list || !list.length) return;
          var pick = list[Math.max(0, Math.min(list.length - 1, scene._slot || 0))];
          if (!pick) return;
          if (img.src && img.src.indexOf(pick) !== -1) return;
          img.style.opacity = '';
          img.src = pick;
        });
      }

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

  // Ensure each side alternates between its 2 slots (0/1) and never repeats back-to-back.
  var idxL = 0;
  var idxR = 0;
  fillFeed(leftFeed, 0);
  fillFeed(rightFeed, 2);

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
    idxL = (idxL + 1) % 2;
    idxR = (idxR + 1) % 2;
    // Left uses scenes 0/1, right uses scenes 2/3
    swapOne(leftFeed, idxL);
    swapOne(rightFeed, 2 + idxR);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onFrame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();
