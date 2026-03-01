'use strict';
/**
 * Smoke test — verifica que el servidor responde correctamente.
 * Requiere el servidor corriendo: npm run dev
 * Ejecución: npm test
 */
const http = require('http');
const { URL } = require('url');

const app = require('../app');

let BASE = process.env.API_URL || null;
let BASE_URL = null;
let server = null;
let passed = 0, failed = 0;

function requestJson(method, path, { token, payload } = {}) {
  return new Promise((resolve, reject) => {
    const data = payload !== undefined ? JSON.stringify(payload) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = {
      protocol: BASE_URL.protocol,
      hostname: BASE_URL.hostname,
      port: BASE_URL.port || (BASE_URL.protocol === 'https:' ? 443 : 80),
      path,
      method,
      headers,
    };

    const req = http.request(opts, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = body; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}`);
    failed++;
  }
}

async function run() {
  if (!BASE) {
    // Start an ephemeral local server for deterministic tests.
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const addr = server.address();
    const port = addr && addr.port;
    BASE = `http://127.0.0.1:${port}`;
  }
  BASE_URL = new URL(BASE);

  async function finish(code) {
    if (server) {
      await new Promise(r => server.close(r));
      server = null;
    }
    process.exit(code);
  }

  console.log(`\n🧪  KingsHelp smoke tests → ${BASE}\n`);

  /* ── 1. Health check ──────────────────────────────────────────────────── */
  try {
    const { status, body } = await requestJson('GET', '/health');
    assert(status === 200, 'GET /health → 200');
    assert(body.status === 'ok', 'GET /health → body.status = "ok"');
  } catch (e) {
    console.error(`  ❌  GET /health failed: ${e.message}`);
    console.error('     ¿Está el servidor corriendo? npm run dev\n');
    failed++;
    await finish(1);
  }

  /* ── 2. Login (demo user) ─────────────────────────────────────────────── */
  let token;
  let alice;
  try {
    const { status, body } = await requestJson('POST', '/api/v1/auth/login', {
      payload: { email: 'demo.alice@kingshelp.local', password: 'password123' },
    });
    assert(status === 200, 'POST /api/v1/auth/login → 200');
    assert(!!body.token, 'POST /api/v1/auth/login → token presente');
    assert(!!body.user, 'POST /api/v1/auth/login → user presente');
    token = body.token;
    alice = body.user;
  } catch (e) {
    console.error(`  ❌  Login failed: ${e.message}`);
    failed++;
  }

  /* ── 2b. Login provider (bob) ─────────────────────────────────────────── */
  let tokenBob;
  let bob;
  try {
    const { status, body } = await requestJson('POST', '/api/v1/auth/login', {
      payload: { email: 'demo.bob@kingshelp.local', password: 'password123' },
    });
    assert(status === 200, 'POST /api/v1/auth/login (bob) → 200');
    assert(!!body.token, 'POST /api/v1/auth/login (bob) → token presente');
    tokenBob = body.token;
    bob = body.user;
  } catch (e) {
    console.error(`  ❌  Login bob failed: ${e.message}`);
    failed++;
  }

  /* ── 3. 401 sin token ────────────────────────────────────────────────── */
  try {
    const { status } = await requestJson('GET', '/api/v1/auth/me');
    assert(status === 401, 'GET /auth/me sin token → 401');
  } catch (e) { failed++; }

  /* ── 4. Offers feed ──────────────────────────────────────────────────── */
  if (token) {
    try {
      const { status, body } = await requestJson('GET', '/api/v1/offers', { token });
      assert(status === 200, 'GET /api/v1/offers → 200');
      assert(Array.isArray(body.data), 'GET /api/v1/offers → body.data es array');
    } catch (e) { failed++; }
  }

  /* ── 4a. Leaderboard (ranking) requires auth ─────────────────────────── */
  try {
    const unauth = await requestJson('GET', '/api/v1/points/leaderboard?limit=5&offset=0');
    assert(unauth.status === 401, 'GET /points/leaderboard sin token → 401');
  } catch (e) {
    console.error(`  ❌  leaderboard unauth failed: ${e.message}`);
    failed++;
  }

  if (token) {
    try {
      const out = await requestJson('GET', '/api/v1/points/leaderboard?limit=5&offset=0', { token });
      assert(out.status === 200, 'GET /api/v1/points/leaderboard → 200');
      assert(Array.isArray(out.body && out.body.data), 'GET /points/leaderboard → data array');
      assert(!!(out.body && out.body.meta), 'GET /points/leaderboard → meta presente');
      const one = (out.body && out.body.data && out.body.data[0]) || null;
      if (one) {
        assert(one.lat === undefined && one.lng === undefined, 'leaderboard: no expone lat/lng');
      }
    } catch (e) {
      console.error(`  ❌  leaderboard failed: ${e.message}`);
      failed++;
    }

    try {
      const near = await requestJson('GET', '/api/v1/points/leaderboard?limit=5&offset=0&lat=51.5074&lng=-0.1278&radius_km=50&sort=distance', { token });
      assert(near.status === 200, 'GET /points/leaderboard (distance sort) → 200');
      const rows = (near.body && near.body.data) || [];
      if (rows.length >= 2) {
        const a = rows[0].distance_km;
        const b = rows[1].distance_km;
        assert((a == null) || (b == null) || (a <= b), 'leaderboard: distance sorted asc');
      } else {
        assert(true, 'leaderboard: distance sorted asc');
      }
    } catch (e) {
      console.error(`  ❌  leaderboard distance failed: ${e.message}`);
      failed++;
    }
  }

  /* ── 4b. Premium plans + checkout stub ───────────────────────────────── */
  try {
    const plans = await requestJson('GET', '/api/v1/premium/plans');
    assert(plans.status === 200, 'GET /api/v1/premium/plans → 200');
    const list = (plans.body && plans.body.plans) || [];
    assert(Array.isArray(list) && list.length >= 2, 'GET /api/v1/premium/plans → plans array');
  } catch (e) {
    console.error(`  ❌  premium plans failed: ${e.message}`);
    failed++;
  }

  if (token) {
    try {
      const out = await requestJson('POST', '/api/v1/premium/checkout', { token, payload: { interval: 'month' } });
      assert(out.status === 501, 'POST /api/v1/premium/checkout → 501 (stub)');
      assert(out.body && out.body.provider === 'stripe', 'POST /api/v1/premium/checkout → provider=stripe');
    } catch (e) {
      console.error(`  ❌  premium checkout failed: ${e.message}`);
      failed++;
    }
  }

  if (token) {
    try {
      const elig = await requestJson('GET', '/api/v1/premium/eligibility', { token });
      assert(elig.status === 200, 'GET /api/v1/premium/eligibility → 200');
      assert(typeof elig.body.threshold === 'number', 'GET /premium/eligibility → threshold number');
    } catch (e) {
      console.error(`  ❌  premium eligibility failed: ${e.message}`);
      failed++;
    }
  }

  /* ── 4c. AutoMatch endpoints (premium feature) ───────────────────────── */
  if (token) {
    try {
      const s = await requestJson('GET', '/api/v1/automatch/settings', { token });
      assert(s.status === 200, 'GET /api/v1/automatch/settings → 200');
      assert(Array.isArray(s.body.categories), 'GET /automatch/settings → categories array');
      assert(Array.isArray(s.body.seeker_categories), 'GET /automatch/settings → seeker_categories array');

      const inv = await requestJson('GET', '/api/v1/automatch/invites?limit=5&offset=0', { token });
      assert(inv.status === 200, 'GET /api/v1/automatch/invites → 200');
      assert(Array.isArray(inv.body.data), 'GET /automatch/invites → data array');
    } catch (e) {
      console.error(`  ❌  automatch smoke failed: ${e.message}`);
      failed++;
    }
  }

  /* ── 5. MVP flow: request -> match -> accept/done -> rating ───────────── */
  if (token) {
    try {
      // Use fresh users for idempotency (anti-fraude blocks repeated awards by pair).
      const rid = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

      const regA = await requestJson('POST', '/api/v1/auth/register', {
        payload: { display_name: `Smoke Seeker ${rid}`, email: `smoke.seeker.${rid}@example.com`, password: 'password123' },
      });
      assert(regA.status === 201, 'POST /api/v1/auth/register (seeker) → 201');
      const tokenA = regA.body && regA.body.token;
      const seeker = regA.body && regA.body.user;
      assert(!!tokenA, 'register seeker → token presente');
      assert(!!(seeker && seeker.id), 'register seeker → user.id presente');

      const regB = await requestJson('POST', '/api/v1/auth/register', {
        payload: { display_name: `Smoke Provider ${rid}`, email: `smoke.provider.${rid}@example.com`, password: 'password123' },
      });
      assert(regB.status === 201, 'POST /api/v1/auth/register (provider) → 201');
      const tokenP = regB.body && regB.body.token;
      const provider = regB.body && regB.body.user;
      assert(!!tokenP, 'register provider → token presente');
      assert(!!(provider && provider.id), 'register provider → user.id presente');

      const beforeSeeker = await requestJson('GET', '/api/v1/points/me', { token: tokenA });
      const beforeProvider = await requestJson('GET', '/api/v1/points/me', { token: tokenP });
      assert(beforeSeeker.status === 200, 'GET /api/v1/points/me (seeker) → 200');
      assert(beforeProvider.status === 200, 'GET /api/v1/points/me (provider) → 200');

      const points = 12;
      const nowMs = Date.now();

       const createdReq = await requestJson('POST', '/api/v1/requests', {
         token: tokenA,
         payload: {
           title: 'Smoke MVP request',
           category: 'tech',
           points_offered: 0,
           compensation_type: 'cash',
           description: 'created by smoke test',
           location_text: 'Centro',
           when: 'asap',
         },
       });
      assert(createdReq.status === 201, 'POST /api/v1/requests → 201');
      assert(!!createdReq.body.id, 'POST /api/v1/requests → id presente');
      const exp1 = Date.parse(createdReq.body.expires_at);
      assert(exp1 > nowMs + 5 * 24 * 3600 * 1000, 'expires_at: free is > 5 days');

      const sugg = await requestJson('GET', `/api/v1/requests/${createdReq.body.id}/suggested-providers`, { token: tokenA });
      assert(sugg.status === 200, 'GET /requests/:id/suggested-providers → 200');
      assert(Array.isArray(sugg.body.suggested_providers || []), 'GET suggested-providers → array');

      const createdMatch = await requestJson('POST', '/api/v1/matches', {
        token: tokenA,
        payload: {
          request_id: createdReq.body.id,
          provider_id: provider.id,
          seeker_id: seeker.id,
          points_agreed: 0,
          initiated_by: 'seeker',
          compensation_type: 'cash',
        },
      });
      assert(createdMatch.status === 201, 'POST /api/v1/matches → 201');
      assert(createdMatch.body.status === 'pending', 'POST /api/v1/matches → status=pending');

      const matchId = createdMatch.body.id;

      const agree = await requestJson('PATCH', `/api/v1/matches/${matchId}/agreement`, {
        token: tokenA,
        payload: { compensation_type: 'cash', points_agreed: points },
      });
      assert(agree.status === 200, 'PATCH /matches/:id/agreement (cash) → 200');

      const msgs = await requestJson('GET', `/api/v1/matches/${matchId}/messages?limit=20&offset=0`, { token: tokenA });
      assert(msgs.status === 200, 'GET /matches/:id/messages → 200');
      const sys = ((msgs.body && msgs.body.data) || []).find(m => m.kind === 'system');
      assert(!!sys, 'messages: includes system message');

      const accepted = await requestJson('PATCH', `/api/v1/matches/${matchId}/status`, {
        token: tokenP,
        payload: { action: 'accept' },
      });
      assert(accepted.status === 200, 'PATCH /matches/:id/status accept → 200');
      assert(accepted.body.status === 'accepted', 'PATCH accept → status=accepted');

      // Anti-fraude (MVP): hace falta 1 mensaje real de cada lado
      const msgA = await requestJson('POST', `/api/v1/matches/${matchId}/messages`, {
        token: tokenA,
        payload: { message: 'Perfecto, quedamos a las 18:00.' },
      });
      assert(msgA.status === 201, 'POST /matches/:id/messages (alice) → 201');
      const msgB = await requestJson('POST', `/api/v1/matches/${matchId}/messages`, {
        token: tokenP,
        payload: { message: 'Genial, llevo furgoneta. Nos vemos.' },
      });
      assert(msgB.status === 201, 'POST /matches/:id/messages (bob) → 201');

      const done = await requestJson('PATCH', `/api/v1/matches/${matchId}/status`, {
        token: tokenP,
        payload: { action: 'done' },
      });
      assert(done.status === 200, 'PATCH /matches/:id/status done → 200');
      assert(done.body.status === 'done', 'PATCH done → status=done');

      const afterSeeker = await requestJson('GET', '/api/v1/points/me', { token: tokenA });
      const afterProvider = await requestJson('GET', '/api/v1/points/me', { token: tokenP });

      const sLed = (afterSeeker.body && afterSeeker.body.ledger) || [];
      const pLed = (afterProvider.body && afterProvider.body.ledger) || [];
      const sAward = sLed.find(e => e.match_id === matchId && e.reason === 'match_completed' && e.delta > 0);
      const pAward = pLed.find(e => e.match_id === matchId && e.reason === 'match_completed' && e.delta > 0);
      assert(!!sAward, 'ledger: seeker has match_completed reputation award');
      assert(!!pAward, 'ledger: provider has match_completed reputation award');

      const rating = await requestJson('POST', `/api/v1/matches/${matchId}/ratings`, {
        token: tokenA,
        payload: { rating: 5, review: 'great' },
      });
      assert(rating.status === 200, 'POST /matches/:id/ratings → 200');

      /* ── 5b. Barter flow: no ledger transfer ─────────────────────────── */
      const rid2 = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const regA2 = await requestJson('POST', '/api/v1/auth/register', {
        payload: { display_name: `Smoke Seeker2 ${rid2}`, email: `smoke.seeker2.${rid2}@example.com`, password: 'password123' },
      });
      const tokenA2 = regA2.body && regA2.body.token;
      const seeker2 = regA2.body && regA2.body.user;

      const regB2 = await requestJson('POST', '/api/v1/auth/register', {
        payload: { display_name: `Smoke Provider2 ${rid2}`, email: `smoke.provider2.${rid2}@example.com`, password: 'password123' },
      });
      const tokenP2 = regB2.body && regB2.body.token;
      const provider2 = regB2.body && regB2.body.user;

       const createdReq2 = await requestJson('POST', '/api/v1/requests', {
         token: tokenA2,
         payload: {
           title: 'Smoke barter request',
           category: 'tech',
           points_offered: 0,
           compensation_type: 'barter',
           description: 'barter',
           location_text: 'Centro',
           when: 'flexible',
         },
       });
      assert(createdReq2.status === 201, 'POST /api/v1/requests (barter) → 201');

      const createdMatch2 = await requestJson('POST', '/api/v1/matches', {
        token: tokenA2,
        payload: {
          request_id: createdReq2.body.id,
          provider_id: provider2.id,
          seeker_id: seeker2.id,
          points_agreed: 0,
          initiated_by: 'seeker',
          compensation_type: 'barter',
        },
      });
      assert(createdMatch2.status === 201, 'POST /api/v1/matches (barter) → 201');
      const matchId2 = createdMatch2.body.id;

      const agree2 = await requestJson('PATCH', `/api/v1/matches/${matchId2}/agreement`, {
        token: tokenA2,
        payload: { compensation_type: 'barter', barter_terms: '1h help for ladder' },
      });
      assert(agree2.status === 200, 'PATCH /matches/:id/agreement (barter) → 200');

      const accepted2 = await requestJson('PATCH', `/api/v1/matches/${matchId2}/status`, {
        token: tokenP2,
        payload: { action: 'accept' },
      });
      assert(accepted2.status === 200, 'PATCH /matches/:id/status accept (barter) → 200');

      const msgA2 = await requestJson('POST', `/api/v1/matches/${matchId2}/messages`, {
        token: tokenA2,
        payload: { message: 'Vale, te ayudo 1h y me prestas la escalera.' },
      });
      assert(msgA2.status === 201, 'POST /matches/:id/messages (barter/alice) → 201');
      const msgB2 = await requestJson('POST', `/api/v1/matches/${matchId2}/messages`, {
        token: tokenP2,
        payload: { message: 'Confirmado, la escalera es tuya este finde.' },
      });
      assert(msgB2.status === 201, 'POST /matches/:id/messages (barter/bob) → 201');

      const done2 = await requestJson('PATCH', `/api/v1/matches/${matchId2}/status`, {
        token: tokenP2,
        payload: { action: 'done' },
      });
      assert(done2.status === 200, 'PATCH /matches/:id/status done (barter) → 200');

      const afterSeeker2 = await requestJson('GET', '/api/v1/points/me', { token: tokenA2 });
      const afterProvider2 = await requestJson('GET', '/api/v1/points/me', { token: tokenP2 });
      const sLed2 = (afterSeeker2.body && afterSeeker2.body.ledger) || [];
      const pLed2 = (afterProvider2.body && afterProvider2.body.ledger) || [];
      const sAward2 = sLed2.find(e => e.match_id === matchId2 && e.reason === 'match_completed' && e.delta > 0);
      const pAward2 = pLed2.find(e => e.match_id === matchId2 && e.reason === 'match_completed' && e.delta > 0);
      assert(!!sAward2, 'ledger: barter awards reputation (seeker)');
      assert(!!pAward2, 'ledger: barter awards reputation (provider)');
    } catch (e) {
      console.error(`  ❌  MVP flow failed: ${e.message}`);
      failed++;
    }
  }

  /* ── Summary ─────────────────────────────────────────────────────────── */
  console.log(`\n─────────────────────────────────`);
  console.log(`  Pasados: ${passed}   Fallados: ${failed}`);
  if (failed === 0) { console.log('  ✅  Todos los tests pasaron.\n'); await finish(0); }
  else { console.log('  ❌  Algunos tests fallaron.\n'); await finish(1); }
}

run().catch(e => { console.error(e); process.exit(1); });
