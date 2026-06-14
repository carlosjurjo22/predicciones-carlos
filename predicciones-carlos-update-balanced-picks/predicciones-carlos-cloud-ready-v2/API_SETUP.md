# Conexion a APIs gratis

El proyecto ya esta preparado para importar partidos reales y convertirlos al formato de `Predicciones Carlos`.

## Orden recomendado

1. `api-football`: mejor opcion gratis para este MVP porque el plan free incluye fixtures, estadisticas, odds y predicciones, limitado a 100 requests/dia.
2. `football-data`: buen respaldo para fixtures, tablas y calendario; plan free con 12 competiciones y 10 llamadas/minuto.
3. `thesportsdb`: agenda gratuita con key publica `123`; util como fallback, no como fuente profunda de apuestas.
4. `openligadb`: sin autenticacion, buena para ligas compatibles de su base comunitaria.

## Configuracion

Edita [`.env`](</C:/Users/luisi/Documents/Predicciones Carlos/.env>) y pon al menos una llave:

```text
API_FOOTBALL_KEY=tu_key_de_api_football
```

Con API-Football puedes ajustar ligas:

```text
API_FOOTBALL_LEAGUES=39,140,135,78,61
API_FOOTBALL_SEASON=2025
```

IDs de ejemplo:

- `39`: Premier League
- `140`: LaLiga
- `135`: Serie A
- `78`: Bundesliga
- `61`: Ligue 1

## Actualizar datos

Con Node instalado:

```powershell
node scripts/update-predictions.js
```

En este entorno:

```powershell
& "C:\Users\luisi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/update-predictions.js
```

Prueba sin escribir archivos:

```powershell
& "C:\Users\luisi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/update-predictions.js --dry-run
```

Forzar proveedor:

```powershell
& "C:\Users\luisi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/update-predictions.js --provider api-football
```

Cambiar fecha:

```powershell
& "C:\Users\luisi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/update-predictions.js --date 2026-06-12
```

## Automatizacion diaria

Ejecuta `scripts/update-predictions.js` una vez al dia, por ejemplo 7:00 AM, y despues publica la carpeta en tu hosting.

Para no depender de la laptop, usa el workflow `.github/workflows/publish-predictions.yml`. Ese proceso corre en GitHub, genera 5 sugerencias diarias y publica la pagina.

No pongas un boton publico para refrescar datos desde la web. Eso gastaria tu cuota gratis y podria ser usado por bots.

## Calidad de datos

Cada partido queda marcado con `dataQuality`:

- `fixtures+provider-prediction`: fixture real mas prediccion del proveedor.
- `fixtures+baseline-estimates`: fixture real con estimaciones internas por falta de estadisticas profundas.
- `fixtures`: fixture real sin prediccion externa.

Los picks siguen siendo informativos. Las APIs gratis ayudan a automatizar, pero no convierten el modelo en garantia.
