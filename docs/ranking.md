# KingsHelp Ranking (Leaderboard)

## Objetivo
El ranking vecinal muestra vecinos destacados de forma simple y verificable.
Se prioriza el historial (insignias) y la reputacion (rep), con desempates claros.

## Endpoint
`GET /api/v1/points/leaderboard`

### Query params
- `limit` (1-50, default 10)
- `offset` (>=0, default 0)
- `lat`, `lng` (opcional) para calcular `distance_km`
- `radius_km` (opcional) filtra a vecinos dentro del radio (0.2-50)
- `sort=distance` (opcional) ordena por cercania si hay `lat/lng`
- `min_level` (opcional) filtra por nivel minimo: `incept|bronze|silver|gold|legend` (0/100/250/500/1000+ rep)
- `q` (opcional) busca por nombre o zona (display_name/location_text)

### Respuesta
```json
{
  "data": [
    {
      "id": "...",
      "display_name": "...",
      "avatar_url": null,
      "location_text": "...",
      "points_balance": 500,
      "rating_avg": 4.8,
      "rating_count": 12,
      "premium_tier": "free",
      "emblem_slug": null,
      "badge_count": 7,
      "distance_km": 1.2
    }
  ],
  "meta": { "limit": 10, "offset": 0, "total": 123, "has_more": true }
}
```

Nota: el ranking publico no expone coordenadas exactas (`lat/lng`).

## Mi puesto
`GET /api/v1/points/leaderboard/me` (requiere auth)

Devuelve el mismo orden que el ranking con los mismos filtros geograficos (si aplican)
y `min_level` (si aplica)
y responde:
```json
{ "me": { "id": "..." }, "rank": 12, "total": 340 }
```

## Regla de orden (desempates)
Orden por defecto:
1) `badge_count` (desc)
2) `points_balance` (desc)
3) `rating_avg` (desc)
4) si hay origen (`lat/lng`), `distance_km` (asc)
5) `display_name` (asc)

Con `sort=distance`:
1) `distance_km` (asc) (si hay origen)
2) luego aplica la regla por defecto
