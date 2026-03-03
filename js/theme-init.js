'use strict';
(function () {
  var t;
  try { t = localStorage.getItem('kh_theme'); } catch (e) { }
  if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
})();
