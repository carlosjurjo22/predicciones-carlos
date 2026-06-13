# Automatizacion diaria

## Link local

Abre la pagina local aqui:

`file:///C:/Users/luisi/Documents/Predicciones%20Carlos/index.html`

Si levantas el servidor:

`http://localhost:4173`

## Link publico para movil

Cuando subas el proyecto a GitHub Pages, el enlace sera:

`https://TU_USUARIO.github.io/predicciones-carlos/`

Ese es el enlace que debes guardar en el movil. No depende de la laptop.

## Automatizacion instalada en Windows

Se creo una tarea programada llamada:

`Predicciones Carlos - Actualizacion diaria`

Horario:

`07:00` todos los dias.

Accion:

```powershell
C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\luisi\Documents\PREDIC~1\scripts\RUN-DA~1.PS1
```

Log:

`logs/daily-update.log`

Nota: Windows solo puede ejecutar la tarea si la computadora esta encendida y tiene internet. Si quieres que se actualice aunque tu PC este apagada, usa la automatizacion de GitHub Actions incluida.

## Reinstalar tarea local

```powershell
& "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\Users\luisi\Documents\Predicciones Carlos\scripts\install-daily-update-task.ps1" -Time "07:00"
```

## Quitar tarea local

```powershell
& "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\Users\luisi\Documents\Predicciones Carlos\scripts\uninstall-daily-update-task.ps1"
```

## Automatizacion en la nube

Tambien deje preparado:

`.github/workflows/publish-predictions.yml`

Ese workflow actualiza `data/matches.json` y `data/matches.js`, genera `dist/` y publica GitHub Pages todos los dias a las 11:20 UTC. Si publicas la pagina con GitHub Pages, esa es la forma mas automatica porque no depende de que tu computadora este encendida.

Secretos recomendados en GitHub:

- `API_FOOTBALL_KEY`
- `FOOTBALL_DATA_TOKEN`
- `THESPORTSDB_KEY` opcional; si no existe usa `123`.

Guia paso a paso: [CLOUD_ACCESS.md](</C:/Users/luisi/Documents/Predicciones Carlos/CLOUD_ACCESS.md>).
