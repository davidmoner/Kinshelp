# Despliegue en Render (MVP)

Este proyecto esta preparado para desplegarse en Render usando SQLite + disco persistente.

## 1) Requisitos

- Cuenta en GitHub
- Cuenta en Render

## 2) Subir el repo

Desde la raiz del proyecto:

```bash
git init
git add .
git commit -m "init kingshelp"
```

Crea un repo en GitHub y empuja.

## 3) Crear el servicio en Render

Opcion recomendada: Blueprint.

- En Render: New → Blueprint
- Selecciona tu repo
- Render detectara `render.yaml`

## 4) Variables de entorno

En Render, define:

- `JWT_SECRET` (obligatorio)
- `CORS_ORIGINS` (tu dominio del frontend; si usas el mismo servicio, puedes dejarlo amplio o incluir el dominio de Render)

La configuracion ya monta un disco en `/var/data` y guarda:

- DB: `/var/data/kingshelp.db`
- Uploads: `/var/data/uploads/*`

## 5) Inicializar datos (solo una vez)

En Render Shell (una sola vez):

```bash
npm run seed
```

Nota: `migrate` se ejecuta en cada arranque (idempotente).

## 6) Verificar

- `GET /health` → debe responder `ok`
- Abrir `/` (si sirves frontend desde el mismo servicio)

## Siguiente paso (Produccion real)

- Migrar DB a Postgres gestionado (Neon/Supabase)
- Subir imagenes a R2/S3 (en vez de disco)
