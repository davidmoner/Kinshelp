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

  // Side panels disabled (no images next to banners).
  var ALLOWED = { };
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

  function randInt(n) {
    return Math.floor(Math.random() * Math.max(1, n));
  }

  function shuffle(arr) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // Both panels visible (banner 1 and 3 only).
  rightFeed.parentElement.style.opacity = '';
  rightFeed.parentElement.style.pointerEvents = '';

  function pickPanelImages(side, themeSuffix) {
    // Convention: numbered images with side in filename, e.g. "1izquierda.png", "12derecha.png".
    // NOTE: In-browser we can't list a folder, so this probes candidates until they load.
    var exts = ['png', 'jpg', 'jpeg', 'webp'];
    var suff = themeSuffix || '';

    function probeAll(cb) {
      var done = false;
      var n = 99;
      var found = [];

      function finish() {
        if (done) return;
        done = true;
        cb(found);
      }

      function tryOne() {
        if (done) return;
        if (n <= 0) return finish();

        var i = 0;
        function tryExt() {
          if (done) return;
          if (i >= exts.length) {
            n--;
            tryOne();
            return;
          }
          var cand = 'img/' + n + side + suff + '.' + exts[i++];
          var img = new Image();
          img.onload = function () {
            if (done) return;
            if (found.indexOf(cand) === -1) found.push(cand);
            n--;
            tryOne();
          };
          img.onerror = function () {
            tryExt();
          };
          img.referrerPolicy = 'no-referrer';
          img.src = cand;
        }

        tryExt();
      }

      tryOne();

      // No timeout: we need full pool so nothing gets skipped.
    }

    return {
      initial: ['img/1' + side + suff + '.png'],
      probeAll: probeAll
    };
  }

  function pickThemePool(picker, cb) {
    if (!picker || typeof picker.probeAll !== 'function') return cb([]);
    picker.probeAll(function (list) {
      var out = (list || []).slice();
      // Fallback: ensure at least 2 candidates
      if (out.length < 2) {
        var s = (picker.initial && picker.initial[0]) || '';
        if (s) out.push(s);
        var s2 = s ? s.replace(/\/1([a-z]+)([^\/]+)\.png$/, '/2$1$2.png') : '';
        if (s2) out.push(s2);
      }
      cb(out);
    });
  }

  function isDarkTheme() {
    try {
      return document.documentElement && document.documentElement.dataset && document.documentElement.dataset.theme === 'dark';
    } catch (e) {
      return false;
    }
  }

  var DARK_SUFFIX = 'oscuro';

  var leftPick = pickPanelImages('izquierda', '');
  var rightPick = pickPanelImages('derecha', '');
  var leftPickDark = pickPanelImages('izquierda', DARK_SUFFIX);
  var rightPickDark = pickPanelImages('derecha', DARK_SUFFIX);

  var pool = {
    light: { izquierda: [], derecha: [] },
    dark: { izquierda: [], derecha: [] }
  };
  var used = {
    light: { izquierda: [] , derecha: [] },
    dark: { izquierda: [] , derecha: [] }
  };

  function themeKey() {
    return isDarkTheme() ? 'dark' : 'light';
  }

  function ensurePoolsReady(cb) {
    var pending = 4;
    function done() {
      pending--;
      if (pending <= 0) cb();
    }

    pickThemePool(leftPick, function (list) {
      pool.light.izquierda = shuffle(list.filter(function (p) { return p.indexOf(DARK_SUFFIX) === -1; }));
      used.light.izquierda = [];
      done();
    });
    pickThemePool(rightPick, function (list) {
      pool.light.derecha = shuffle(list.filter(function (p) { return p.indexOf(DARK_SUFFIX) === -1; }));
      used.light.derecha = [];
      done();
    });
    pickThemePool(leftPickDark, function (list) {
      pool.dark.izquierda = shuffle(list);
      used.dark.izquierda = [];
      done();
    });
    pickThemePool(rightPickDark, function (list) {
      pool.dark.derecha = shuffle(list);
      used.dark.derecha = [];
      done();
    });
  }

  function takeNext(side) {
    var t = themeKey();
    var p = pool[t][side] || [];
    var u = used[t][side] || [];
    if (!p.length) return null;
    if (u.length >= p.length) u.length = 0;

    for (var i = 0; i < p.length; i++) {
      var idx = (randInt(p.length) + i) % p.length;
      var cand = p[idx];
      if (u.indexOf(cand) === -1) {
        u.push(cand);
        used[t][side] = u;
        return cand;
      }
    }

    var cand2 = p[randInt(p.length)];
    u.push(cand2);
    used[t][side] = u;
    return cand2;
  }

  function isDarkAssetPath(p) {
    return !!p && String(p).indexOf(DARK_SUFFIX) !== -1;
  }

  function mkScene(side, imgPath) {
    return {
      img: imgPath,
      alt: 'Panel ' + side,
      pill: side === 'izquierda' ? 'Vecina' : 'Vecino',
      _darkImg: isDarkAssetPath(imgPath)
    };
  }

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
      if (scene._darkImg) img.setAttribute('data-kh-darkimg', '1');
      img.onerror = function () {
        // Keep layout intact even if a file is missing.
        this.style.opacity = '0';
        this.setAttribute('data-kh-img-error', '1');
      };
      img.addEventListener('load', function () {
        try {
          // Debug aid: remove this later if noisy.
          // console.log('[sidepanels] loaded', this.currentSrc || this.src);
        } catch (e) { }
      });

      // (image already selected)

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

  function renderSide(feed, side, count) {
    feed.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var imgPath = takeNext(side) || (side === 'izquierda' ? leftPick.initial[0] : rightPick.initial[0]);
      var item = makeItem(mkScene(side, imgPath));
      feed.appendChild(item);
    }
    requestAnimationFrame(function () {
      Array.from(feed.children).forEach(function (c, idx) {
        setTimeout(function () { c.classList.add('is-in'); }, 30 + idx * 90);
      });
    });
  }

  function visiblePerSide() {
    return isDarkTheme() ? 1 : 3;
  }

  ensurePoolsReady(function () {
    var n = visiblePerSide();
    renderSide(leftFeed, 'izquierda', n);
    renderSide(rightFeed, 'derecha', n);
    updatePanelVisibility();
  });

  // Static panels: no scroll-driven swapping/movement.

  // React to theme changes (dataset.theme) and swap images accordingly.
  if ('MutationObserver' in window) {
    var themeObs = new MutationObserver(function () {
      try {
        ensurePoolsReady(function () {
          var n = visiblePerSide();
          renderSide(leftFeed, 'izquierda', n);
          renderSide(rightFeed, 'derecha', n);
        });
      } catch (e) { }
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
})();
