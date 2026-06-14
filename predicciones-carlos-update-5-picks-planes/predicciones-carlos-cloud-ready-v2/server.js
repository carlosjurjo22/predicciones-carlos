"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000);
const STATIC_LIMIT = Number(process.env.STATIC_RATE_LIMIT || 80);
const API_LIMIT = Number(process.env.API_RATE_LIMIT || 40);

const buckets = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

setInterval(cleanBuckets, WINDOW_MS).unref();

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  applySecurityHeaders(response);

  if (request.method !== "GET" && request.method !== "HEAD") {
    return send(response, 405, "Metodo no permitido", "text/plain; charset=utf-8");
  }

  if (isBlockedBot(request)) {
    return send(response, 403, "Solicitud bloqueada", "text/plain; charset=utf-8");
  }

  const limit = url.pathname.startsWith("/api/") ? API_LIMIT : STATIC_LIMIT;
  const limited = rateLimit(request, url.pathname, limit);
  response.setHeader("X-RateLimit-Limit", String(limit));
  response.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - limited.count)));

  if (limited.blocked) {
    response.setHeader("Retry-After", String(Math.ceil(limited.resetMs / 1000)));
    return send(response, 429, "Demasiadas solicitudes", "text/plain; charset=utf-8");
  }

  if (url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true, service: "Predicciones Carlos" });
  }

  if (url.pathname === "/api/predictions") {
    return servePredictions(response);
  }

  return serveStatic(url.pathname, response, request.method === "HEAD");
});

server.listen(PORT, () => {
  console.log(`Predicciones Carlos disponible en http://localhost:${PORT}`);
});

function servePredictions(response) {
  const file = path.join(ROOT, "data", "matches.json");
  fs.readFile(file, "utf8", (error, data) => {
    if (error) {
      return sendJson(response, 500, { error: "No se pudieron cargar los datos." });
    }

    response.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return send(response, 200, data, "application/json; charset=utf-8");
  });
}

function serveStatic(pathname, response, headOnly) {
  const decoded = safeDecode(pathname);
  if (!decoded) {
    return send(response, 400, "Ruta invalida", "text/plain; charset=utf-8");
  }

  const route = decoded === "/" ? "/index.html" : decoded;
  const filePath = path.normalize(path.join(ROOT, route));
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;

  if (filePath !== ROOT && !filePath.startsWith(rootWithSep)) {
    return send(response, 403, "Ruta bloqueada", "text/plain; charset=utf-8");
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      return send(response, 404, "No encontrado", "text/plain; charset=utf-8");
    }

    const ext = path.extname(filePath).toLowerCase();
    response.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    response.setHeader(
      "Cache-Control",
      ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    );

    if (headOnly) {
      response.statusCode = 200;
      return response.end();
    }

    fs.createReadStream(filePath)
      .on("error", () => send(response, 500, "Error leyendo archivo", "text/plain; charset=utf-8"))
      .pipe(response);
  });
}

function rateLimit(request, pathname, limit) {
  const ip = clientIp(request);
  const routeGroup = pathname.startsWith("/api/") ? "api" : "static";
  const key = `${ip}:${routeGroup}`;
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    count: bucket.count,
    blocked: bucket.count > limit,
    resetMs: Math.max(0, bucket.resetAt - now),
  };
}

function cleanBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt + WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return request.socket.remoteAddress || "0.0.0.0";
}

function isBlockedBot(request) {
  const ua = String(request.headers["user-agent"] || "").toLowerCase();
  const blocked = [
    "curl",
    "wget",
    "python-requests",
    "scrapy",
    "sqlmap",
    "nikto",
    "masscan",
    "httpclient",
  ];

  if (!ua) return true;
  return blocked.some((item) => ua.includes(item));
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
}

function sendJson(response, status, payload) {
  return send(response, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

function send(response, status, body, contentType) {
  if (!response.headersSent) {
    response.statusCode = status;
    response.setHeader("Content-Type", contentType);
  }
  response.end(body);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return null;
  }
}
