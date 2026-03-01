# KingsHelp Web — Frontend

Interfaz premium de KingsHelp. Puro HTML/CSS/JS — sin build step.

## Abrir

```bash
# Opción A: abrir directamente
# Doble clic en web/index.html
# (las llamadas a la API requieren el servidor en localhost:3000)

# Opción B: servir con Node (recomendado — evita CORS en algunos navegadores)
npx serve web/
# → http://localhost:3000 debe correr el backend
# → el frontend en http://localhost:PORT_que_asigne_serve
```

## Archivos

```
web/
├── index.html          → Landing + Dashboard + Login modal (SPA)
├── css/
│   └── style.css       → Dark glassmorphism, animaciones
└── js/
    ├── api.js          → KHApi: setToken, getToken, apiFetch, login, getMyPoints…
    └── app.js          → KHApp: UI, contadores, partículas, scroll reveal
```

## API config

Por defecto conecta a `http://localhost:3000/api/v1`.  
Para cambiarlo, antes de cargar los scripts:

```html
<script>window.KINGSHELP_BASE_URL = 'https://tu-api.com/api/v1';</script>
```

## Demo rápido

1. `npm run dev` (backend)
2. Abrir `web/index.html`
3. Clic en **Probar demo** → login con `demo.alice@kingshelp.local` / `password123`
4. Dashboard: **Ping /health** → verde ✓ · **Cargar /points/me** → animación de puntos ⚡
