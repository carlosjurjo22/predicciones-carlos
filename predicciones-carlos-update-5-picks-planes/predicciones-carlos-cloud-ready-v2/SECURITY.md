# Seguridad y anti-bots

Esta version evita dependencias externas y deja controles basicos listos.

## Ya incluido

- `server.js` aplica rate limit por IP:
  - `STATIC_RATE_LIMIT`: 80 solicitudes por minuto.
  - `API_RATE_LIMIT`: 40 solicitudes por minuto.
- Bloqueo simple de agentes automatizados obvios.
- Cabeceras de seguridad:
  - `Content-Security-Policy`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy`
- `_headers` para hostings tipo Cloudflare Pages o Netlify.
- `robots.txt` para reducir rastreo voluntario.

## Para publicar sin que te tumben facil

1. Pon la web detras de Cloudflare con proxy activado.
2. Activa WAF Managed Rules.
3. Crea rate limits:
   - `/api/*`: 30 a 60 solicitudes por minuto por IP.
   - `/*`: 120 a 240 solicitudes por minuto por IP.
4. Usa Turnstile cuando agregues login, comentarios, pagos o formularios.
5. Sirve los pronosticos del dia como archivos cacheados, no calcules todo en cada visita.
6. Nunca pongas llaves de APIs deportivas en `app.js`.
7. Guarda las llaves solo en `.env` o en secretos del hosting.
8. No expongas un endpoint publico que ejecute `scripts/update-predictions.js`.
9. Guarda logs y alertas de picos de trafico.
10. Si empiezas a cobrar, separa pagos, usuarios y predicciones en backend.

`robots.txt` no es proteccion real contra ataques. La defensa real es CDN/WAF, cache y rate limiting en servidor.
