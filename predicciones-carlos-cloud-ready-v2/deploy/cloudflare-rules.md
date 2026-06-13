# Reglas sugeridas para Cloudflare

## WAF

- Activar Cloudflare Managed Rules.
- Activar Bot Fight Mode o Super Bot Fight Mode si tu plan lo permite.
- Desafio administrado para paises o ASNs con trafico anormal.

## Rate limiting

Regla API:

- Expresion: `http.request.uri.path contains "/api/"`
- Umbral inicial: 40 solicitudes por minuto por IP.
- Accion: Managed Challenge o Block durante 10 minutos.

Regla sitio:

- Expresion: `http.request.uri.path ne "/assets/analytics-hero.png"`
- Umbral inicial: 180 solicitudes por minuto por IP.
- Accion: Managed Challenge.

## Cache

- Cachear `/assets/*` por 1 ano.
- Cachear `/api/predictions` por 5 minutos si los datos no son personalizados.
- No cachear paneles privados cuando exista login.

## Turnstile

Usarlo al agregar:

- Registro.
- Login.
- Comentarios.
- Pagos.
- Formularios para recibir picks por WhatsApp o correo.
