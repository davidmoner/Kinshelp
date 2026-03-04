# Performance Changes

Date: 2026-03-05

## FASE 2 — Carga inicial

- Scripts base ahora usan `defer` para evitar bloquear el parseo HTML:
  - `js/base-url.js`
  - `js/api.js`
  - `js/app.js`
  - `js/theme.js`
- Partículas decorativas: se inicializan solo cuando el hero entra en viewport (IntersectionObserver).

### Motivo
- Reducir trabajo en el hilo principal durante el primer render.
- Diferir efectos decorativos hasta que realmente se vean.

### Sin cambios visibles
- No se modifica la UI ni el comportamiento funcional.
