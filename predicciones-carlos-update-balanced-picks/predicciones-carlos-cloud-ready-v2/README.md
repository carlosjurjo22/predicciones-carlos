# Predicciones Carlos

MVP gratuito para publicar pronosticos deportivos basados en estadisticas: 1X2, alta/baja de goles, corners y tarjetas.

## Abrir la pagina

Puedes abrir directamente:

`C:\Users\luisi\Documents\Predicciones Carlos\index.html`

Tambien puedes servirla con Node:

```powershell
node server.js
```

Si Node no esta instalado en tu sistema, en este entorno funciona con:

```powershell
& "C:\Users\luisi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

Luego abre `http://localhost:4173`.

Link local directo:

`file:///C:/Users/luisi/Documents/Predicciones%20Carlos/index.html`

Para abrirla desde el movil sin laptop, publicala en GitHub Pages. Guia: [CLOUD_ACCESS.md](</C:/Users/luisi/Documents/Predicciones Carlos/CLOUD_ACCESS.md>).

## Datos

La fuente principal es `data/matches.json`. La web tambien usa `data/matches.js` para poder abrir el HTML directo sin servidor.

Para conectar APIs gratis, revisa [API_SETUP.md](</C:/Users/luisi/Documents/Predicciones Carlos/API_SETUP.md>). El script principal es:

```powershell
node scripts/update-predictions.js
```

Cuando edites `data/matches.json`, sincroniza el archivo local:

```powershell
node scripts/sync-data.js
```

En este entorno sin Node instalado en el PATH:

```powershell
& "C:\Users\luisi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/sync-data.js
```

El servidor opcional expone `data/matches.json` por `/api/predictions`.

La automatizacion diaria local y en la nube esta documentada en [AUTOMATION.md](</C:/Users/luisi/Documents/Predicciones Carlos/AUTOMATION.md>).

El importador automatico intenta proveedores en este orden:

1. API-Football, si existe `API_FOOTBALL_KEY`.
2. football-data.org, si existe `FOOTBALL_DATA_TOKEN`.
3. TheSportsDB con la key publica gratuita `123`.
4. OpenLigaDB, si configuras `OPENLIGADB_LEAGUE`.
5. Datos de muestra locales.

Los partidos actuales son de muestra. Para usar partidos reales, cambia estos campos por datos de una fuente autorizada:

- `xgFor`, `xgAgainst`: goles esperados a favor y en contra.
- `shotsFor`, `shotsAgainst`: tiros a favor y en contra.
- `cornersFor`, `cornersAgainst`: corners propios y concedidos.
- `cardsFor`, `cardsAgainst`: tarjetas propias y del rival.
- `form`: ultimos cinco resultados en puntos, usando `3`, `1`, `0`.
- `marketOdds`: cuotas decimales para calcular valor frente a mercado.
- `lines`: lineas de goles, corners y tarjetas.

## Modelo

El motor combina:

- Poisson para probabilidades de marcador, victoria, empate, derrota y alta/baja 2.5.
- Forma reciente, localia, descanso, lesiones y clima.
- Promedios cruzados para corners y tarjetas.
- Probabilidad implicita de cuotas normalizadas para detectar valor.

No promete acierto perfecto. La idea es reducir corazonadas y guardar cada pronostico con explicacion.

## Siguiente fase

El siguiente paso serio es crear una rutina diaria para ejecutar `scripts/update-predictions.js`, medir aciertos por mercado y guardar historico. Evita scraping sin permiso; muchas paginas de estadisticas lo bloquean o lo prohiben en sus terminos.
