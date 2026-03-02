# KingsHelp — UI Action Inventory (Master)

This is the single source of truth for every user-facing control (button/link/form)
and what it does.

Legend:
- OK: end-to-end works
- Confusing: does something, but the label/UX implies something else
- Broken: does not work / leads to missing route
- Misleading: advertises a feature that is not implemented

## Landing + App Shell (`index.html`)

| Control | Location | Handler | API | Status | Notes / Fix |
|---|---|---|---|---|---|
| `.nav-brand-lockup` (top) | Landing nav | none (`href="#"`) | - | Confusing | Consider `href="/"` or smooth scroll top with `preventDefault()` |
| `#nav-search` Enter | Landing nav | `js/app.js` keydown | - | Confusing | Currently jumps to quick demo; either rename placeholder or route to dashboard search |
| `#kh-theme-toggle` | Landing nav | `KHTheme.toggle()` | - | OK | - |
| `#nav-ranking-btn` | Landing nav | `KHApp.openRanking()` | `GET /api/v1/points/leaderboard` | OK | - |
| `#nav-auth-btn` | Landing nav | `KHApp.openLogin()` | `POST /api/v1/auth/login` | OK | - |
| `#nav-panel-btn` | Landing nav | `KHApp.goDashboard()` | `GET /api/v1/auth/me` | OK | - |
| `#nav-logout-btn` | Landing nav | `KHApp.logout()` | - | OK | - |
| `.btn-create` | Landing nav | `KHApp.startFirstMatch()` | - | OK | - |
| `.hero-progress-seg` | Hero | `web/js/hero.js` | - | OK | - |
| Hero CTA buttons | Hero | `KHApp.startFirstMatch()` | - | OK | - |
| `a[href="#how"]` | Hero | anchor | - | OK | - |
| Premium plan select | Premium landing | `KHApp.setPremiumInterval()` | - | OK | - |
| `#btn-premium-landing` | Premium landing | `KHFx.openPremiumModal()` | - | OK | - |
| Quick match form `#quick-form` | Landing quick demo | `KHApp.startQuickMatch()` | `POST /api/v1/requests` + suggested | Broken | Missing `location_text` handling (fix in Step 2) |
| Legal links | Footer | anchors | - | OK | - |

## Dashboard (`index.html`)

| Control | Location | Handler | API | Status | Notes / Fix |
|---|---|---|---|---|---|
| Tabs `data-view` | Dashboard | `KHApp.setDashView()` | feed/matches/etc | OK | - |
| Feed search `#feed-q` | Explorar | `KHApp.loadFeed()` | `GET /api/v1/feed` | OK | - |
| Create request | Crear | `KHApp.createRequest()` | `POST /api/v1/requests` | OK | - |
| Suggested providers | Crear | `KHApp.loadSuggestedProviders()` | `GET /api/v1/requests/:id/suggested-providers` | OK | - |
| Create match | Crear/Quick | `KHApp.createMatch...` | `POST /api/v1/matches` | OK | - |
| Match chat | Matches | `KHApp.openChat()` | messages/agreement endpoints | OK | - |
| Leaderboard preview rows | Premium card | none | - | Confusing | Make rows open user card (like ranking modal) |
| OAuth buttons | Login modal | `KHApp.authProvider()` | - | Misleading | Either implement OAuth or disable/label "Proximamente" |

## Transactional Pages (`web/`)

| Control | Page | Handler | API | Status | Notes / Fix |
|---|---|---|---|---|---|
| Reset password submit | `web/reset-password/index.html` | inline script | `POST /api/v1/auth/reset-password` | OK | Backend email link must open this page |
| Verify email "Abrir app web" | `web/verify-email/*.html` | anchor | - | Broken | Links to `/web/index.html` (does not exist) |

## Admin Panel (`/admin/`)

| Control | Location | Handler | API | Status | Notes / Fix |
|---|---|---|---|---|---|
| Nav views | Sidebar | inline | `/api/v1/admin/*` | OK | - |
| Verify toggle | Usuarios | inline | `PATCH /api/v1/admin/users/:id` | OK | Extend later: ban/unban, user detail |
| Resolve report | Overview/Moderacion | inline | `POST /api/v1/admin/reports/:id/resolve` | OK | Reports are admin-created for now; add user-facing report entry later |
