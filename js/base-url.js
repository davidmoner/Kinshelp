'use strict';
(function () {
  // Allow explicit override (e.g. injected by hosting).
  if (window.KINGSHELP_BASE_URL) return;

  var host = window.location && window.location.hostname;
  var port = window.location && window.location.port;

  // Local dev: Vite on 5173 + API on 3000.
  if ((host === 'localhost' || host === '127.0.0.1') && port === '5173') {
    window.KINGSHELP_BASE_URL = (host === '127.0.0.1' ? 'http://127.0.0.1:3000' : 'http://localhost:3000') + '/api/v1';
    return;
  }

  // Default: same origin (Render / production / node static).
  if (window.location && window.location.origin && String(window.location.origin).startsWith('http')) {
    // GitHub Pages hosts static only, API lives elsewhere.
    if (String(window.location.hostname).endsWith('github.io')) {
      window.KINGSHELP_BASE_URL = 'https://kingshelp.onrender.com/api/v1';
      return;
    }
    window.KINGSHELP_BASE_URL = window.location.origin + '/api/v1';
    // OAuth provider IDs (optional). If not set, provider buttons fall back to email.
    window.PUBLIC_BASE_URL = window.PUBLIC_BASE_URL || window.location.origin;
    window.GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || '';
    window.FACEBOOK_APP_ID = window.FACEBOOK_APP_ID || '';
    window.KH_AI_IMAGE_MODE = window.KH_AI_IMAGE_MODE || 'file';
    return;
  }

  // Fallback
  window.KINGSHELP_BASE_URL = 'http://localhost:3000/api/v1';
  window.PUBLIC_BASE_URL = window.PUBLIC_BASE_URL || 'http://localhost:3000';
  window.GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || '';
  window.FACEBOOK_APP_ID = window.FACEBOOK_APP_ID || '';
})();
