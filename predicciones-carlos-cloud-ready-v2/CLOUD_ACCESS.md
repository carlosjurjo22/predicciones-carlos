# Acceso desde el movil sin laptop

La solucion correcta es publicar la carpeta en GitHub Pages y dejar que GitHub Actions actualice la web todos los dias en la nube.

## Enlace final

Cuando subas este proyecto a GitHub con un repositorio llamado, por ejemplo:

`predicciones-carlos`

tu enlace sera:

```text
https://TU_USUARIO.github.io/predicciones-carlos/
```

Ejemplo:

```text
https://carlos.github.io/predicciones-carlos/
```

Ese enlace se abre desde cualquier movil, sin laptop encendida.

## Lo que ya esta preparado

Workflow:

`.github/workflows/publish-predictions.yml`

Hace esto automaticamente:

1. Corre todos los dias a las `11:20 UTC`, que son las `07:20` en Cuba cuando aplica UTC-4.
2. Busca partidos y genera las 5 sugerencias diarias.
3. Construye una version publica en `dist/`.
4. Publica la pagina con GitHub Pages.

Tambien se puede ejecutar manualmente desde GitHub en:

`Actions -> Publish daily predictions -> Run workflow`

## Pasos para activarlo

1. Crea una cuenta en GitHub si no la tienes.
2. Crea un repositorio publico llamado `predicciones-carlos`.
3. Sube todos los archivos del proyecto, excepto `.env`.
4. En GitHub, entra al repositorio.
5. Ve a `Settings -> Pages`.
6. En `Build and deployment`, selecciona `GitHub Actions`.
7. Ve a `Actions`.
8. Abre `Publish daily predictions`.
9. Presiona `Run workflow`.
10. Cuando termine, entra a `Settings -> Pages` y abre `Visit site`.

## API key recomendada

Para mejores picks, crea una key gratis en API-Football y guardala como secreto:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Nombre:

```text
API_FOOTBALL_KEY
```

Valor:

```text
tu_key_de_api_football
```

Si no pones esa key, el sistema usara TheSportsDB gratis con key publica `123`, pero los datos son mas basicos.

## Archivos seguros para publicar

El workflow solo publica `dist/`, que contiene:

- `index.html`
- `styles.css`
- `app.js`
- `assets/`
- `data/`
- `robots.txt`

No publica `.env`, scripts internos, logs ni capturas.
