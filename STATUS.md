#!/usr/bin/env false
# KingsHelp — STATUS

Este archivo es la memoria viva del proyecto: que esta hecho, que falta y que se decidio.
Mantenerlo actualizado cuando se agregan endpoints, migraciones o cambios de arquitectura.

## Hecho

- DB facade SQLite/Postgres (`src/config/db.js`) y repos adaptados a async cuando `DATABASE_URL` esta presente.
- Leaderboard/ranking funcionando con SQLite y Postgres: `GET /api/v1/points/leaderboard`.
- Smoke tests cubren el flujo MVP (request -> match -> mensajes -> done -> ratings -> ledger).
- Repo sincronizado con GitHub: `main` incluye commit `feat: db facade and pg-compatible points`.
- Tracker de estado agregado: `STATUS.md`.
- Premium Stripe (checkout + webhook) con persistencia en tabla `payments`.
- Notificaciones in-app: tabla `notifications` + endpoints `/api/v1/notifications` (WIP triggers).
- Postgres hardening: transacciones disponibles via `db.tx()` y points transfer atomico en PG.
- Auth: tokens persistidos en `auth_tokens` + endpoints `forgot-password`, `reset-password`, `verify-email`.
- Email: servicio `src/shared/email.service.js` (SendGrid si esta configurado) + `PUBLIC_BASE_URL` para links.
- Mobile (Expo): MVP con login, matches inbox, match detail, chat (polling), notificaciones, forgot/reset password.
- Hero: paneles laterales en banners 1 y 3 con imagenes de `img/` (claro: `N{izquierda|derecha}.*`, oscuro: `N{izquierda|derecha}oscuro.*`), apilado (claro) / 1 por lado (oscuro), seleccion aleatoria sin repetir hasta agotar y sin movimiento por scroll.
- Hero (fix): paneles laterales subidos ~10% para alinear con seccion, y corregida ruta de carga de imagenes desde `web/js/` (usa `../img/...`).

- SEO: metadatos (canonical/OG/Twitter/JSON-LD) + `robots.txt` + `sitemap.xml` + `/.well-known/security.txt`.
- Seguridad: headers via `helmet` + rate limit global; CSP relajada por inline handlers actuales.
- Fix prod: rate limit aplicado solo a `/api/v1` (no bloquea estaticos como `/img/*`).
- OAuth: codigo listo para Google/Facebook (backend callbacks + UI), pero queda pendiente credenciales/validacion en produccion.

- Hero (actualizacion mar 2026):
  - Paneles laterales eliminados y assets laterales borrados (sin "ventanas" semitransparentes).
  - Fondo hero con particulas tipo "antigravity" (burst dashes) dentro del hero + parallax scroll.
  - Titulos de banners con typewriter domino (linea 1 -> linea 2) + cursor `|`.
  - Rotacion de banners mas lenta (config en `web/js/hero.js`).

- Admin panel (mar 2026):
  - UI: `GET /admin/` (static) con Overview/Usuarios/Actividad/Moderacion/Auditoria/Config.
  - API protegida: `/api/v1/admin/*` requiere token + `ADMIN_EMAILS`.
  - Tablas: `admin_audit_log`, `admin_config`, `admin_events`, `reports`.
  - Config via API: `fx_level` (y base para mas flags).

- Sprint rendimiento + diseño (mar 2026):
  - Performance: preload CSS critico + logos LCP con `fetchpriority:high`, fuente Manrope weight 900 añadido.
  - Sección "Manual de usuario" estilo Apple scroll-storytelling: 5 pasos con iconos SVG, checklist, flow diagram, preview de reputacion, paso Premium con CTA dorado.
  - Sección FAQ animada: 8 preguntas con acordeon accesible (aria-expanded, aria-controls, max-height CSS transition).
  - Links Manual y FAQ en nav principal.
  - `js/fx.js` refactorizado: IntersectionObserver con stagger automático por grupos, KPI counter animation (ease out cubic), FAQ accordion JS, lazy image .loaded, smooth anchor scroll, cursor glow mejorado con RAF.
  - CSS: scrollbar premium, `::selection` con color de marca, hover lift mejorado para feature/trust/usecase cards, shimmer effect en btn-primary y btn-gold, `.reveal` con delay CSS vars.
  - Admin panel: columna Estado (baneado/activo), botones Ban/Unban con confirmacion por fila.
  - Backend ban/unban, logEvent en register/login/match, markAllRead notifications, bug async offers.service.js corregido.
  - Tag git `backup-pre-redesign-2026-03-03` creado antes de los cambios.

- Paso 1 — UX Crear solicitud/oferta (mar 2026):
  - Preview inline antes de publicar: al pulsar "Publicar solicitud/oferta →" se muestra un panel de revisión con título, chips (categoría, zona, cuándo, compensación), descripción y fotos staged; dos botones: "← Editar" (vuelve al form) y "Confirmar y publicar" (llama a la API).
  - Variables de estado: `pendingDraft` almacena el borrador hasta confirmación; `showCreatePreview()`, `backToEdit()`, `confirmCreate()` son las nuevas funciones exportadas a `KHApp`.
  - `resetCreateForm()` ahora también cierra el panel de preview y limpia `pendingDraft`.
  - Badges de estado en "Mis creaciones": activa (verde), expirada (naranja, cuando `expires_at < now`), cerrada (rojo). Expiry note inteligente: muestra "caduca en Xd" si quedan ≤ 3 días.
  - CSS: `.preview-card`, `.preview-head`, `.preview-title`, `.preview-kind-label`, `.preview-desc`, `.preview-photos`, `.preview-photo-thumb` en `css/style.css`.


## Estado Actual

- Backend API: Express (`src/app.js`) con rutas v1 para auth, users, offers, requests, matches, points, badges, premium, automatch, feed.
- Frontend: SPA simple en `web/` consumiendo `http://localhost:3000/api/v1` por defecto.

## Siguiente (Prioridad Alta) — Próxima sesión

### ✅ Ya resuelto (no tocar)
- Bug async `offers.service.js` (addPhoto/deletePhoto/boost48h).
- Admin ban/unban (backend + UI admin panel).
- Login bloqueado para baneados (403).
- `admin_events` instrumentados en register, login, match.created, match.status.
- Notificaciones `markAllRead` (PATCH /notifications/read-all).
- FAQ animada con 8 preguntas reales y acordeón accesible.
- Manual de usuario estilo Apple (5 pasos con SVG, checklist, flows).
- Links Manual + FAQ en nav principal.
- CSS premium: scrollbar, shimmer btns, hover lift cards, stagger reveal.
- KPI counters animados (ease cubic) en el landing.
- Tick verificación minimalista (sin círculo verde).
- Ranking popup +20% ancho (770px → 924px).
- **Paso 1 completo**: preview inline antes de publicar, badges activa/expirada/cerrada en "Mis creaciones", expiry countdown ≤ 3 días.

---

### ✅ Paso 1 — UX Crear solicitud/oferta — COMPLETADO
- ✅ Validaciones front claras (errores inline, no alert).
- ✅ Preview antes de publicar (panel inline con chips, fotos, ← Editar / Confirmar).
- ✅ Confirmación visual al crear (toast + scroll al bloque de éxito).
- ✅ Soporte de fotos en el formulario (upload con previsualización staged).
- ✅ Estado de la publicación visible (activa / expirada / archivada) con countdown.

### ✅ Paso 2 — Mobile Web: repaso layout — COMPLETADO
- ✅ Header ≤560px: logo centrado (position absolute + translateX(-50%)), avatar/nombre del header ocultos (accesibles via burger).
- ✅ Menú como bottom-sheet (position fixed, no deforma layout) — ya existía.
- ✅ Dashboard tabs scroll horizontal (overflow-x: auto; white-space: nowrap) — ya existía.
- ✅ Hero ≤400px: letter-spacing reducido a -0.5px (a 36px era demasiado apretado), hero-sub a 15px.
- ✅ Modal y dashboard padding compactados en ≤400px.

### ✅ Paso 3 — Email verificación (código) — COMPLETADO
- ✅ Botón "Reenviar verificación" ahora oculto si `is_verified` (se muestra solo a usuarios no verificados).
- ✅ Indicador visual en perfil: "✓ Email verificado" (verde) / "⚠ Email sin verificar" (naranja) — `#profile-verify-status`.
- ✅ Email de verificación en español: subject "KingsHelp — Verifica tu email", body con saludo y disclaimer.
- ✅ Pages success/invalid/error en `/web/verify-email/` ya existen y el GET redirect funciona.
- ⏳ Validar entrega SendGrid en producción (pendiente: configurar env vars en Render).
- ⏳ Domain auth SPF/DKIM/DMARC: pendiente de que kingshelp.es resuelva correctamente en Hostinger/Cloudflare.

### Config pendiente en Render (env vars)
```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<tu key>
MAIL_FROM=KingsHelp <davidmoner90@gmail.com>
PUBLIC_BASE_URL=https://kingshelp.es
```

### ✅ Paso 4 — Admin: moderación real (parcial) — COMPLETADO fase 1
- ✅ Botón "⚑" en tarjetas del feed para reportar contenido (discreto, baja opacidad).
- ✅ Modal de reporte con selector de motivo (spam / estafa / abuso / inapropiado / otro).
- ✅ `POST /api/v1/reports` — endpoint público autenticado (`src/modules/reports/reports.routes.js`).
- ✅ Admin panel ya tenía: listado de reports, resolución, ban/unban, log de auditoría.
- ⏳ Pendiente fase 2:
  - Hide/unhide publicaciones reportadas (requiere columna `is_hidden` en offers/requests + migración).
  - Vista detalle de usuario en admin (historial matches, reportes recibidos, badges).
  - Reset cooldowns desde admin.

### 🔜 Paso 5 — OAuth Google/Facebook (cuando haya credenciales)
- Crear apps en Google Developer Console y Facebook Developers.
- Setear `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_APP_ID/SECRET` en Render env.
- Validar redirect URIs reales.
- Botones con logos oficiales (web + mobile).
- Flujo completo: callback backend → token → dashboard.

### ✅ Optimización de rendimiento (mar 2026)
- ✅ `index.html`: scripts visuales (fx.js, particles.js, demo.js, hero.js, hero_alt_fx.js) con `defer` → no bloquean parsing.
- ✅ `index.html`: `loading="lazy"` en imágenes fuera del fold (demo mockups, iconos OAuth).
- ✅ `js/app.js`: chat polling 2000ms → 5000ms (−60% llamadas API en chat); automatch countdown 1000ms → 2000ms; automatch poll 12000ms → 20000ms; feed debounce 180ms → 350ms.
- ✅ `js/api.js`: deduplicación de GETs en vuelo (evita llamadas duplicadas simultáneas).
- ✅ `.claude/settings.local.json`: comandos de desarrollo pre-aprobados (git, npm run, node --check).

### ✅ Paso 6 — Paridad Postgres (producción) — COMPLETADO
- ✅ `matches.service.js`: `requireMatch/requireOffer/requireRequest/ensureAntiFraudForDone/updateUserRating` ahora async; `changeStatus`, `setAgreement`, `listMessages`, `postMessage`, `submitRating` correctamente awaiteados en PG.
- ✅ `offers.repo.js` + `requests.repo.js`: `patch()` convierte `?` → `$N` dinámicamente para PG.
- ✅ `offers.service.js`: `update()`, `addPhoto()`, `deletePhoto()`, `boost48h()` — eliminados 501, soporte PG.
- ✅ `requests.service.js`: `update()`, `addPhoto()`, `deletePhoto()`, `boost48h()` — eliminados 501, soporte PG.
- ✅ `automatch.repo.js`: `getSettings()`, `upsertSettings()` (ON CONFLICT), `getInvite/OfferInvite`, `markAccepted/Declined`, `expireOtherPending*` — soporte PG.
- ✅ `automatch.service.js`: `acceptInvite()` y `declineInvite()` convertidas a async, PG compatible.

### 🔜 Paso 7 — Observabilidad
- Logging estructurado (request-id, user-id, latencia).
- Health extendido: `GET /health` devuelve estado DB + uptime.
- Error reporting básico (console.error → Sentry o similar cuando escale).

### 🔜 Paso 8 — Hero: flags desde admin_config
- `fx_level` ya existe en admin_config.
- Hero debería leerlo via API al cargar y ajustar efectos sin redeploy.
- Añadir `hero_banner_duration` como flag configurable.

### 🔜 Paso 9 — SEO + Contenido real
- FAQ en sitemap.xml (añadir `#faq` o futura `/faq.html`).
- Contenido real en secciones (no datos de ejemplo tipo "34 servicios completados").
- KPIs reales desde la API real del servidor.
- `og:image` real (captura de pantalla de la web).

### 🔜 Paso 10 — CSP Hardening
- Migrar `onclick=`, `onsubmit=`, `oninput=` de `index.html` a listeners en `js/app.js`.
- Quitar `'unsafe-inline'` de la Content-Security-Policy.
- Objetivo: A+ en securityheaders.com.

## Pendiente (OAuth)

- Nota: Login con Google/Facebook queda pendiente de configurar en produccion (apps/credenciales + callbacks). Codigo listo; faltan `GOOGLE_CLIENT_ID/SECRET` y `FACEBOOK_APP_ID/SECRET` en env y validar redirects reales.

## Pendiente (Seguridad Web)

- Endurecer CSP: eliminar handlers inline (`onclick=`, `onsubmit=`, etc.) en `index.html` moviendo eventos a `web/js/app.js`, para poder quitar `'unsafe-inline'` de CSP.

## Backup / Rollback

- Tag de backup antes del rework visual: `backup-pre-antigravity-hero`.

## Plan (Paso a Paso) — Construccion de Todo

1) Seguridad critica de estaticos (NO saltar)
   - Revisar `src/app.js` para que NO sirva estaticos desde la raiz del repo.
   - Objetivo: servir solo assets publicos (landing, `web/`, `legal/`, `uploads/` si aplica) y bloquear DB/codigo.

2) SEO de rutas y coherencia de archivos
   - Asegurar que `/robots.txt`, `/sitemap.xml` y `/.well-known/security.txt` existen en la raiz que Google ve.
   - Validar que el sitemap incluye landing + legales + futura FAQ.

3) Endurecer CSP (cuando el punto 1 este estable)
   - Migrar todos los `onclick/onsubmit/oninput/onchange` de `index.html` a listeners en `web/js/app.js`.
   - Quitar `'unsafe-inline'` de CSP y bloquear `blob:` si no es necesario.

4) OAuth Google/Facebook (pendiente de credenciales)
   - Crear apps en Google/Facebook.
   - Setear env vars en prod: `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_APP_ID/SECRET`.
   - Validar redirect URIs reales y corregir cualquier mismatch de rutas.
   - Evitar token en URL (ideal: cookie httpOnly).
   - Botones con logos oficiales en web/mobile (ya en marcha, pero revisar assets finales).

5) Paridad Postgres vs SQLite
   - Implementar los 501 pendientes en PG (offers/requests edit, fotos, boost, automatch accept/decline, checks en matches).
   - Decidir si prod sera PG obligatorio o SQLite con disco persistente.

6) Bugs funcionales detectados
   - Revisar `offers.service.js`: `requireOffer()` async usado como sync en fotos/boost.
   - Agregar smoke tests de upload/boost.

7) Validaciones y UX de errores
   - Normalizar emails, reforzar password reset, limites de texto, lat/lng.
   - Unificar respuestas 4xx para web/mobile.

8) Observabilidad minima
   - Logging estructurado, request-id, health extendido (DB ok).

9) FAQ + soporte
   - FAQ en landing (anchor `#faq`) + pagina dedicada (para SEO).
   - Contenido inicial: 10-15 preguntas sobre funcionamiento, acuerdos (cash/barter/altruistic), reputacion, ranking, premium, automatch, fotos, privacidad, seguridad, verificacion email, abuso.
   - Vincular desde nav/footer y meterla en `sitemap.xml`.

## FAQ (Pendiente) — Contenido propuesto

- Que es KingsHelp y como funciona el match?
- KingsHelp gestiona pagos?
- Que tipos de acuerdo hay (pago/trueque/altruista)?
- Cuando se puede marcar un match como hecho?
- Como funciona la reputacion/puntos y por que a veces no suma?
- Como funciona el ranking vecinal?
- Que es Premium y como se desbloquea?
- Que es AutoMatch y que limites tiene?
- Cuanto duran mis publicaciones?
- Puedo subir fotos? formatos/limites?
- Que datos de mi perfil se ven publicamente?
- Hay notificaciones push?
- Como verifico mi email o recupero mi contrasena?
- Que hago si hay abuso/estafa/contenido peligroso?
- Notificaciones in-app: agregar triggers restantes (mensajes, invites) y sumar smoke coverage.

## Estado (mar 2026)

- API publica (sin login): `GET /api/v1/health`, `GET /api/v1/feed`, `GET /api/v1/requests`, `GET /api/v1/offers`, `GET /api/v1/users/:id` (sanitizado).
- API privada (con login): crear/cerrar, matches/chat/ratings, badges mine, automatch.

## Mobile (Decidido)

- Stack: Expo (React Native).
- Orden MVP: matches inbox + chat primero.
- Push/email: se implementan despues de tener app movil; por ahora `notifications` es la fuente de verdad.

## Auth (Pendiente)

- Email real: entregabilidad + templates/UX (links y pantallas).
- Google login real: OAuth (mobile) + callback backend.
- Facebook login real: OAuth (mobile) + callback backend.
- Objetivo UX mobile: auth simplificado (1-2 pantallas), mantener mismo look&feel que web pero adaptado a touch.

## Auth (En Progreso)

- Endpoints OAuth (stub): `POST /api/v1/auth/google`, `POST /api/v1/auth/facebook` (501 si no hay credenciales).
- Mobile: botones Google/Facebook usan Expo AuthSession (requiere setear `GOOGLE_CLIENT_ID` / `FACEBOOK_APP_ID` en `mobile/src/config.js`).

## Email (Decidido)

- Proveedor recomendado: SendGrid o Mailgun (transaccional) para verify/reset.
- Dominio: `kingshelp.es` (Hostinger) -> configurar SPF/DKIM/DMARC para entregabilidad.

## Email (En Progreso)

- SendGrid: para no bloquear MVP, usar "Single Sender Verification" con `MAIL_FROM` temporal.
- Dominio `kingshelp.es`: en el momento del setup devolvia NXDOMAIN publicamente; hasta resolver delegacion DNS, SendGrid domain authentication no valida.
- Cuando el dominio resuelva: reintentar domain authentication (SPF/DKIM/DMARC) y pasar `MAIL_FROM` a `no-reply@kingshelp.es`.

## Render (Checklist)

- Env vars para email:
  - EMAIL_PROVIDER=sendgrid
  - SENDGRID_API_KEY=...
  - MAIL_FROM=KingsHelp <davidmoner90@gmail.com> (temporal; requiere Single Sender verificado)
  - PUBLIC_BASE_URL=https://kingshelp.es
  - NODE_ENV=production
  - (opcional) CORS_ORIGINS=https://kingshelp.es,https://www.kingshelp.es

- Prueba end-to-end (verify email):
  - En la app: "Reenviar verificacion"
  - El email debe incluir: https://kingshelp.es/api/v1/auth/verify-email?token=...
  - Debe redirigir a: /web/verify-email/success.html (o invalid/error)

## Email con dominio (Hostinger) — ruta gratis (anotado)

- Objetivo: tener direcciones tipo `hola@kingshelp.es` sin pagar buzones.
- Opcion A (si Hostinger lo incluye):
  - Hostinger -> Email -> Alias/Reenvio (Forwarders)
  - Crear `hola@kingshelp.es` -> reenviar a `davidmoner90@gmail.com`
  - Nota: suele ser solo recepcion (responder como @kingshelp.es requiere SMTP/servicio de envio)
- Opcion B (alternativa si Hostinger no ofrece reenvio gratis):
  - Pasar DNS a Cloudflare (gratis)
  - Activar Cloudflare Email Routing (gratis hoy) para reenviar `@kingshelp.es` a Gmail
- Recomendacion actual (sin coste):
  - Mantener emails transaccionales (verify/reset) con SendGrid Single Sender usando Gmail
  - `MAIL_FROM=KingsHelp <davidmoner90@gmail.com>`

## Backlog (Prioridad Media)

- Discovery de requests para providers (search, category, geo opcional).
- Perfil publico seguro por usuario (reputacion, badges, sin PII).
- Moderacion basica: report/ban y antispam.
- Observabilidad: logs estructurados, health extendido, y error reporting.

## Requests (UX + datos)

- Formulario web (crear solicitud) ahora pide:
  - `title` (titulo)
  - `location_text` (zona)
  - `category`
  - `compensation_type`
  - `when` (asap/today/this_week/flexible)
- Backend valida `location_text` + `when` y persiste `when_text`.

## UI (calido vecinal)

- Dashboard cards: headers unificados con icono + subtitulo (clases `.card-title`, `.card-ico`, `.card-sub`).
- Halo calido sutil al hover de `.glass-card` (sin cambiar el layout).

## UI (progreso reciente)

- Verificado:
  - Tick verde en header del dashboard (`#user-verified`) cuando `user.is_verified`.
  - Tick verde en carnet de usuario (`#usercard-verified`).
- Carnet KingsHelp (perfil de vecino):
  - Modal `#modal-usercard` estilo "KingsHelp ID" con sello y chips (verificado, zona/km, rep, rating, insignias, nivel).
  - Se abre desde: ranking, sugeridos (providers), y matches (carga `/users/:id`).
- Movil dashboard:
  - Header usa hamburguesa `#dash-burger` en <=560px y oculta botones que no caben.

## Perfiles publicos (vecinos)

- `GET /api/v1/users/:id` ahora es publico con auth opcional (no expone email/coords exactas).
- `users.findById` incluye `badge_count`.
- Feed incluye `user_verified` y se puede abrir carnet desde el nombre.
- AutoMatch invita/mostrar "quien" muestra ✓ y permite abrir carnet (cuando esta disponible).

## Produccion (Render)

- Fix critico: Offers/Requests usan Postgres via `src/config/db.js` cuando hay `DATABASE_URL` (evita SQLite en `/tmp`).
- Verify email:
  - `POST /api/v1/auth/request-verify-email` responde `already_verified:true` para cuentas ya verificadas.

## Deploy

- Pasos para publicar cambios: ver `DEPLOY.md`

## Decisiones

- Base de datos:
  - Local/dev: SQLite (better-sqlite3) sobre `./database`.
  - Produccion: Postgres (Neon/Render) via `DATABASE_URL`.
  - API intenta mantener compatibilidad de campos entre capas (snake_case/camelCase).

## Notas

- Cuando se complete una epica, moverla de "Siguiente" a "Hecho" y anotar los endpoints/migraciones.
