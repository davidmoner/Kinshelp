# KingsHelp API (REST) — v1

Este documento describe los endpoints REST del MVP.

Base URL (local): `http://localhost:3000/api/v1`

## Auth

### POST `/auth/register`
Crea usuario.

Body:
```json
{
  "display_name": "Ana",
  "email": "ana@example.com",
  "password": "password123",
  "location_text": "Madrid"
}
```

Respuesta:
```json
{ "user": { "id": "..." } }
```

### POST `/auth/login`
Login.

Body:
```json
{ "email": "alice@example.com", "password": "password123" }
```

Respuesta:
```json
{ "user": { "id": "..." }, "token": "..." }
```

### GET `/auth/me`
Devuelve el usuario autenticado.

Header:
`Authorization: Bearer <token>`

## Feed (muro)

### GET `/feed?limit=60&offset=0`
Devuelve un muro mixto de solicitudes (`kind=request`) y ofertas (`kind=offer`).

Respuesta:
```json
{ "data": [ { "kind": "request", "title": "...", "distance_km": 1.2 } ] }
```

## Requests (solicitudes)

### POST `/requests`
Crea solicitud.

Body (minimo):
```json
{ "title": "Mudanza", "category": "transport", "compensation_type": "cash" }
```

Respuesta: `201` con la solicitud.

### GET `/requests?status=open&category=tech&seeker_id=<id>`
Lista solicitudes.

### GET `/requests/:id/suggested-providers`
Sugerencias para crear match.

### POST `/requests/:id/photos`
Sube 1 foto para la solicitud (multipart).

FormData:
- `photo`: archivo JPG/PNG/WEBP (max 900KB)

### DELETE `/requests/:id/photos/:photoId`
Elimina 1 foto.

## Offers (ofertas)

### POST `/offers`
Crea oferta.

Body (minimo):
```json
{ "title": "Paseo perros", "category": "pets", "compensation_type": "barter" }
```

### GET `/offers?status=active&category=pets&provider_id=<id>`
Lista ofertas.

### POST `/offers/:id/photos`
Sube 1 foto para la oferta (multipart).

### DELETE `/offers/:id/photos/:photoId`
Elimina 1 foto.

## Matches + Chat + Acuerdo

### POST `/matches`
Crea match manual.

Body:
```json
{ "request_id": "...", "provider_id": "...", "seeker_id": "..." }
```

### PATCH `/matches/:id/status`
Cambia estado del match.

Body:
```json
{ "action": "accept" }
```

Acciones:
- `accept` (provider)
- `reject` (provider)
- `done` (provider)
- `cancel` (seeker)

Nota anti-fraude MVP:
- Para completar (`done`), se requiere acuerdo y 1 mensaje real por parte.

### GET `/matches/:id/messages`
Lista mensajes.

### POST `/matches/:id/messages`
Envia mensaje.

Body:
```json
{ "message": "Quedamos a las 18:00" }
```

### PATCH `/matches/:id/agreement`
Define el acuerdo dentro del match.

Ejemplos:
```json
{ "compensation_type": "cash", "points_agreed": 25 }
```
```json
{ "compensation_type": "barter", "barter_terms": "1h ayuda por prestamo de escalera" }
```
```json
{ "compensation_type": "altruistic" }
```

## Premium

### GET `/premium/plans`
Planes.

### POST `/premium/checkout`
Stub Stripe (MVP): devuelve `501`.

### GET `/premium/eligibility`
Progreso y elegibilidad para desbloquear Premium por reputacion.

Campos:
- `reputation`, `threshold`
- `partners_done_distinct`, `partners_required`
- `eligible_reputation`, `eligible_partners`, `eligible`

### POST `/premium/unlock`
Desbloquea Premium por reputacion si cumple requisitos.

## AutoMatch (Premium)

AutoMatch funciona en 2 direcciones:
- `Ofrezco` (provider): recibes solicitudes
- `Necesito` (seeker): recibes ofertas

### GET `/automatch/settings`
Devuelve settings del usuario (solo Premium).

### PUT `/automatch/settings`
Actualiza settings.

Body:
```json
{
  "enabled": true,
  "categories": ["pets", "gardening"],
  "seeker_enabled": true,
  "seeker_categories": ["transport", "repairs"]
}
```

### GET `/automatch/invites?status=pending`
Invitaciones mixtas.

Cada item:
- `kind`: `request` o `offer`
- `expires_at`
- `title`, `category`, `location_text`, `compensation_type`, `media_urls`

### POST `/automatch/invites/:id/accept`
Acepta y crea match.

### POST `/automatch/invites/:id/decline`
Rechaza.

## Uploads (static)

Las imagenes se sirven desde:
- `GET /uploads/<filename>`

## Notas

- REST: usamos JSON para body/responses, salvo uploads (multipart).
- Autenticacion: `Bearer token`.
- En produccion: mover uploads a S3/R2 y DB a Postgres gestionado.
