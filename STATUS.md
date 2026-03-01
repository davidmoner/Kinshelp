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

## Estado Actual

- Backend API: Express (`src/app.js`) con rutas v1 para auth, users, offers, requests, matches, points, badges, premium, automatch, feed.
- Frontend: SPA simple en `web/` consumiendo `http://localhost:3000/api/v1` por defecto.

## Siguiente (Prioridad Alta)

- Premium real (Stripe): implementar checkout + webhook y persistir pagos (WIP).
- Notificaciones in-app: agregar triggers restantes (mensajes, invites) y sumar smoke coverage.
- Matches inbox: listar matches por usuario, estado y paginacion.
- App movil (Expo / React Native) (MVP): Login, Matches inbox, Chat, Notificaciones.

## Mobile (Decidido)

- Stack: Expo (React Native).
- Orden MVP: matches inbox + chat primero.
- Push/email: se implementan despues de tener app movil; por ahora `notifications` es la fuente de verdad.

## Auth (Pendiente)

- Email real: verificacion de email + reset password.
- Google login real: OAuth (mobile) + callback backend.
- Facebook login real: OAuth (mobile) + callback backend.
- Objetivo UX mobile: auth simplificado (1-2 pantallas), mantener mismo look&feel que web pero adaptado a touch.

## Auth (En Progreso)

- Endpoints OAuth (stub): `POST /api/v1/auth/google`, `POST /api/v1/auth/facebook` (501 si no hay credenciales).
- Mobile: botones Google/Facebook usan Expo AuthSession (requiere setear `GOOGLE_CLIENT_ID` / `FACEBOOK_APP_ID` en `mobile/src/config.js`).

## Backlog (Prioridad Media)

- Discovery de requests para providers (search, category, geo opcional).
- Perfil publico seguro por usuario (reputacion, badges, sin PII).
- Moderacion basica: report/ban y antispam.
- Observabilidad: logs estructurados, health extendido, y error reporting.

## Decisiones

- Base de datos:
  - Local/dev: SQLite (better-sqlite3) sobre `./database`.
  - Produccion: Postgres (Neon/Render) via `DATABASE_URL`.
  - API intenta mantener compatibilidad de campos entre capas (snake_case/camelCase).

## Notas

- Cuando se complete una epica, moverla de "Siguiente" a "Hecho" y anotar los endpoints/migraciones.
