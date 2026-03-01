Estado del proyecto (KingsHelp)

Ultima actualizacion: 2026-03-01

URLs
- Frontend (GitHub Pages): https://davidmoner.github.io/Kinshelp/
- Backend (Render): https://kingshelp.onrender.com  (health: /health)

Que esta hecho
- GitHub Pages sirve el frontend desde la raiz del repo (porque Pages no permitio seleccionar /web).
- El frontend detecta github.io y usa como API base: https://kingshelp.onrender.com/api/v1.
- Ranking/leaderboard:
  - Endpoint: /api/v1/points/leaderboard devuelve { data, meta }
  - Filtros: sort=distance, min_level, q; opcion “cerca de mi” con geolocalizacion
  - Privacidad: el leaderboard no expone lat/lng
  - Solo accesible con login (401 sin token); UI lo bloquea si no hay token
- Modal de ranking con filtros y mini-perfil (badges).
- Render esta en plan free; el SQLite en Render es efimero (puede resetear y perder usuarios).
- Seed y cuentas demo:
  - Emails demo namespaced: demo.alice@kingshelp.local, demo.bob@kingshelp.local, demo.carol@kingshelp.local
  - Password demo: password123
  - Seed refresca hashes en cada ejecucion para que siempre funcionen

Decisiones
- Persistencia: migrar a Postgres en Neon (opcion 1).

Problema actual
- Produccion usa SQLite (better-sqlite3) y eso en Render free no es persistente.
- El backend usa db.prepare() (sincronico) en muchos modulos; pasar a Postgres implica refactor a queries async.

Siguiente hito: Neon Postgres
Objetivo: que usuarios/login/ranking/requests/ofertas no se pierdan.

Configuracion en Neon/Render (manual en UI)
1) Crear proyecto en Neon y copiar DATABASE_URL.
2) En Render (servicio kingshelp) agregar env vars:
   - DATABASE_URL = (la de Neon)
   - PGSSLMODE = require
   - JWT_SECRET (ya existe)
   - CORS_ORIGINS (ya existe)
3) Cambiar preDeploy para usar migraciones/seed de Postgres cuando exista DATABASE_URL.

Trabajo pendiente en repo (codigo)
- Agregar dependencia `pg`.
- Agregar scripts:
  - migrate:pg -> node src/db/migrate.pg.js
  - seed:pg -> (crear) node src/db/seed.pg.js
- Implementar un adaptador de DB (sqlite vs pg) o migrar repos a Postgres.
- Primera fase recomendada: auth + users + points + badges.

Comandos locales utiles
- npm test
- npm run migrate
- npm run seed
