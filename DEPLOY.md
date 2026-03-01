# Deploy (GitHub -> Render)

Este proyecto se despliega desde GitHub a Render.

## Checklist rapido (cuando quieras ver cambios en la web)

1) Probar local

   - `npm test`

2) Revisar cambios

   - `git status`
   - `git diff`

3) Guardar en Git

   - `git add <archivos>`
   - `git commit -m "mensaje"`

4) Subir a GitHub

   - `git push`

5) Render

   - Si Auto-Deploy esta activo: Render desplegara el ultimo commit automaticamente.
   - Si no: Deploy manual desde el dashboard de Render.

6) Verificar

   - Abre `https://kingshelp.es`
   - Si el cambio es de backend: prueba el endpoint o revisa logs en Render.

## Notas

- No subir secretos: `.env`, keys, credenciales.
- Si aparece un archivo raro sin trackear (ej. `nul`), no lo subas.
