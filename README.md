# Fondos Dashboard

Dashboard de seguimiento de VCP para 10 FCI, con actualizacion diaria automatica.

## Estructura

- `historico.csv` - historico de VCP (fondo, fecha, vcp). Se actualiza solo todos los dias.
- `actualizar_historico_cafci.py` - script que baja la planilla diaria de CAFCI y suma filas nuevas a historico.csv
- `.github/workflows/actualizar.yml` - corre el script automaticamente de lunes a viernes a las 9am (Argentina)
- `components/FondosDashboard.jsx` - el dashboard en si (Next.js + React), lee historico.csv en vivo desde GitHub

## Primer setup

1. Crear un repo en GitHub y subir esta carpeta completa
2. En `components/FondosDashboard.jsx`, cambiar la constante `HISTORICO_URL` al inicio del archivo
   por la URL raw real de tu historico.csv:
   `https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/historico.csv`
3. `npm install`
4. `npm run dev` (para probar local) o `vercel --prod` (para deployar)

## Actualizacion diaria

El workflow de GitHub Actions corre solo. Tambien se puede disparar a mano desde
GitHub -> pestaña "Actions" -> "Actualizar historico VCP FCI" -> "Run workflow".
