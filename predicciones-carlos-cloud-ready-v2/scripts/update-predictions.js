"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "data", "matches.json");
const samplePath = path.join(root, "data", "sample-matches.json");

const DEFAULT_TIMEZONE = "America/Havana";
const DEFAULT_THESPORTSDB_KEY = "123";

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv(root);
  const date = args.date || env.PREDICTIONS_DATE || todayInTimezone(env.TIMEZONE || DEFAULT_TIMEZONE);
  const timezone = args.timezone || env.TIMEZONE || DEFAULT_TIMEZONE;
  const maxMatches = Number(args.max || env.PREDICTIONS_MAX_MATCHES || 12);
  const provider = args.provider || env.PREDICTIONS_PROVIDER || "auto";

  const keepCurrentOnFallback =
    args.keepCurrentOnFallback || env.PREDICTIONS_KEEP_CURRENT_ON_FAIL !== "false";
  const requestedSample = provider === "sample";

  const result = await fetchDataset(provider, env, { date, timezone, maxMatches });
  let dataset = result.matches.length
    ? buildDataset(result.provider, result.matches, result.sources, result.notices, { date, timezone })
    : fallbackDataset(result.provider, result.notices, { date, timezone });

  if (keepCurrentOnFallback && !requestedSample && dataset.provider === "sample") {
    dataset = keepCurrentLiveDataset(dataset);
  }

  if (args.dryRun) {
    console.log(summary(dataset, true));
    return;
  }

  preserveSampleDataset();
  fs.writeFileSync(jsonPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  runSyncData();
  console.log(summary(dataset, false));
}

async function fetchDataset(provider, env, options) {
  const attempts = provider === "auto" ? providerOrder(env) : [provider];
  const notices = [];

  for (const name of attempts) {
    try {
      const result = await fetchFromProvider(name, env, options);
      if (result.matches.length) {
        return { ...result, notices: [...notices, ...(result.notices || [])] };
      }
      notices.push(`${name}: sin partidos para ${options.date}.`);
    } catch (error) {
      notices.push(`${name}: ${error.message}`);
    }
  }

  return {
    provider: provider === "auto" ? "sample" : provider,
    matches: [],
    sources: {},
    notices,
  };
}

function providerOrder(env) {
  const order = [];
  if (env.API_FOOTBALL_KEY) order.push("api-football");
  if (env.FOOTBALL_DATA_TOKEN) order.push("football-data");
  order.push("thesportsdb");
  if (env.OPENLIGADB_LEAGUE) order.push("openligadb");
  order.push("sample");
  return order;
}

async function fetchFromProvider(name, env, options) {
  switch (name) {
    case "api-football":
      return fetchApiFootball(env, options);
    case "football-data":
      return fetchFootballData(env, options);
    case "thesportsdb":
      return fetchTheSportsDb(env, options);
    case "openligadb":
      return fetchOpenLigaDb(env, options);
    case "sample":
      return fetchSample(options);
    default:
      throw new Error(`Proveedor no soportado: ${name}`);
  }
}

async function fetchApiFootball(env, { date, timezone, maxMatches }) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("falta API_FOOTBALL_KEY en .env");
  }

  const fixtures = [];
  const leagues = list(env.API_FOOTBALL_LEAGUES);
  const season = env.API_FOOTBALL_SEASON || seasonForDate(date);

  if (leagues.length) {
    for (const league of leagues) {
      const payload = await apiFootball(env.API_FOOTBALL_KEY, "fixtures", {
        date,
        timezone,
        league,
        season,
      });
      fixtures.push(...(payload.response || []));
    }
  } else {
    const payload = await apiFootball(env.API_FOOTBALL_KEY, "fixtures", { date, timezone });
    fixtures.push(...(payload.response || []));
  }

  const scheduled = fixtures
    .filter((item) => item.fixture && item.teams && !isFinishedStatus(item.fixture.status && item.fixture.status.short))
    .slice(0, maxMatches);

  const predictions = new Map();
  if (env.API_FOOTBALL_PREDICTIONS !== "false") {
    for (const fixture of scheduled) {
      try {
        const payload = await apiFootball(env.API_FOOTBALL_KEY, "predictions", {
          fixture: fixture.fixture.id,
        });
        predictions.set(String(fixture.fixture.id), (payload.response || [])[0] || null);
      } catch (_error) {
        predictions.set(String(fixture.fixture.id), null);
      }
    }
  }

  return {
    provider: "api-football",
    sources: {
      fixtures: "API-Football fixtures",
      predictions: env.API_FOOTBALL_PREDICTIONS === "false" ? "disabled" : "API-Football predictions",
      notes: "Free plan is limited; keep max matches low.",
    },
    notices: [`API-Football: ${scheduled.length} partidos importados.`],
    matches: scheduled.map((fixture) =>
      fromApiFootballFixture(fixture, predictions.get(String(fixture.fixture.id))),
    ),
  };
}

async function apiFootball(key, endpoint, query) {
  const url = new URL(`https://v3.football.api-sports.io/${endpoint}`);
  Object.entries(query || {}).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  });

  return fetchJson(url, {
    headers: {
      "x-apisports-key": key,
    },
  });
}

function fromApiFootballFixture(fixture, prediction) {
  const league = fixture.league || {};
  const home = fixture.teams.home || {};
  const away = fixture.teams.away || {};
  const hints = hintsFromApiFootballPrediction(prediction);

  return baseMatch({
    id: `api-football-${fixture.fixture.id}`,
    providerId: String(fixture.fixture.id),
    kickoff: fixture.fixture.date,
    league: league.name || "Football",
    country: league.country || "",
    home: home.name || "Local",
    away: away.name || "Visitante",
    provider: "api-football",
    dataQuality: prediction ? "fixtures+provider-prediction" : "fixtures",
    hints,
  });
}

function hintsFromApiFootballPrediction(prediction) {
  const percent = prediction && prediction.predictions && prediction.predictions.percent;
  const comparison = (prediction && prediction.comparison) || {};

  return {
    homeWinPct: parsePercent(percent && percent.home),
    drawPct: parsePercent(percent && percent.draw),
    awayWinPct: parsePercent(percent && percent.away),
    homeForm: parsePercent(comparison.form && comparison.form.home),
    awayForm: parsePercent(comparison.form && comparison.form.away),
    homeAttack: parsePercent(comparison.att && comparison.att.home),
    awayAttack: parsePercent(comparison.att && comparison.att.away),
    homeDefense: parsePercent(comparison.def && comparison.def.home),
    awayDefense: parsePercent(comparison.def && comparison.def.away),
    homeGoals: parseNumber(comparison.goals && comparison.goals.home),
    awayGoals: parseNumber(comparison.goals && comparison.goals.away),
  };
}

async function fetchFootballData(env, { date, maxMatches }) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error("falta FOOTBALL_DATA_TOKEN en .env");
  }

  const url = new URL("https://api.football-data.org/v4/matches");
  url.searchParams.set("dateFrom", date);
  url.searchParams.set("dateTo", date);
  if (env.FOOTBALL_DATA_COMPETITIONS) {
    url.searchParams.set("competitions", env.FOOTBALL_DATA_COMPETITIONS);
  }

  const payload = await fetchJson(url, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      "X-Unfold-Goals": "true",
      "X-Unfold-Bookings": "true",
    },
  });

  const matches = (payload.matches || [])
    .filter((match) => !isFinishedStatus(match.status))
    .slice(0, maxMatches)
    .map(fromFootballDataMatch);

  return {
    provider: "football-data",
    sources: {
      fixtures: "football-data.org /v4/matches",
      notes: "Free tier has delayed scores and limited competitions.",
    },
    notices: [`football-data: ${matches.length} partidos importados.`],
    matches,
  };
}

function fromFootballDataMatch(match) {
  return baseMatch({
    id: `football-data-${match.id}`,
    providerId: String(match.id),
    kickoff: match.utcDate,
    league: (match.competition && match.competition.name) || "Football",
    country: (match.area && match.area.name) || "",
    home: (match.homeTeam && match.homeTeam.name) || "Local",
    away: (match.awayTeam && match.awayTeam.name) || "Visitante",
    provider: "football-data",
    dataQuality: "fixtures+baseline-estimates",
    hints: {},
  });
}

async function fetchTheSportsDb(env, { date, maxMatches }) {
  const key = env.THESPORTSDB_KEY || DEFAULT_THESPORTSDB_KEY;
  const url = new URL(`https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php`);
  url.searchParams.set("d", date);
  url.searchParams.set("s", "Soccer");
  if (env.THESPORTSDB_LEAGUE) {
    url.searchParams.set("l", env.THESPORTSDB_LEAGUE);
  }

  const payload = await fetchJson(url);
  const matches = (payload.events || [])
    .filter((event) => event.strHomeTeam && event.strAwayTeam)
    .slice(0, maxMatches)
    .map(fromTheSportsDbEvent);

  return {
    provider: "thesportsdb",
    sources: {
      fixtures: "TheSportsDB eventsday",
      notes: "Free key 123 is public and limited; use for schedules, not deep betting data.",
    },
    notices: [`TheSportsDB: ${matches.length} partidos importados.`],
    matches,
  };
}

function fromTheSportsDbEvent(event) {
  return baseMatch({
    id: `thesportsdb-${event.idEvent}`,
    providerId: String(event.idEvent),
    kickoff: event.strTimestamp || composeEventDate(event.dateEvent, event.strTime),
    league: event.strLeague || "Football",
    country: event.strCountry || "",
    home: event.strHomeTeam || "Local",
    away: event.strAwayTeam || "Visitante",
    provider: "thesportsdb",
    dataQuality: "fixtures+baseline-estimates",
    hints: {},
  });
}

async function fetchOpenLigaDb(env, { maxMatches }) {
  if (!env.OPENLIGADB_LEAGUE) {
    throw new Error("falta OPENLIGADB_LEAGUE en .env");
  }

  const season = env.OPENLIGADB_SEASON || String(new Date().getFullYear());
  const parts = ["getmatchdata", env.OPENLIGADB_LEAGUE, season];
  if (env.OPENLIGADB_MATCHDAY) parts.push(env.OPENLIGADB_MATCHDAY);
  const url = `https://api.openligadb.de/${parts.map(encodeURIComponent).join("/")}`;

  const payload = await fetchJson(url);
  const matches = (Array.isArray(payload) ? payload : [])
    .filter((match) => match.Team1 && match.Team2)
    .slice(0, maxMatches)
    .map(fromOpenLigaDbMatch);

  return {
    provider: "openligadb",
    sources: {
      fixtures: "OpenLigaDB getmatchdata",
      notes: "Open community database without authentication.",
    },
    notices: [`OpenLigaDB: ${matches.length} partidos importados.`],
    matches,
  };
}

function fromOpenLigaDbMatch(match) {
  return baseMatch({
    id: `openligadb-${match.MatchID}`,
    providerId: String(match.MatchID),
    kickoff: match.MatchDateTimeUTC || match.MatchDateTime,
    league: match.LeagueName || "OpenLigaDB",
    country: "",
    home: match.Team1.TeamName || "Local",
    away: match.Team2.TeamName || "Visitante",
    provider: "openligadb",
    dataQuality: "fixtures+baseline-estimates",
    hints: {},
  });
}

function fetchSample({ date, timezone }) {
  const source = fs.existsSync(samplePath) ? samplePath : jsonPath;
  const dataset = JSON.parse(fs.readFileSync(source, "utf8"));
  return {
    provider: "sample",
    sources: dataset.sources || { sample: "Local sample data" },
    notices: [`sample: usando datos locales para ${date} (${timezone}).`],
    matches: dataset.matches || [],
  };
}

function baseMatch(input) {
  const stats = estimatedStats(input.home, input.away, input.league, input.hints || {});
  const totalGoals = stats.home.xgFor * 0.58 + stats.away.xgFor * 0.58;

  return {
    id: input.id,
    providerId: input.providerId,
    provider: input.provider,
    dataQuality: input.dataQuality,
    kickoff: input.kickoff || new Date().toISOString(),
    league: input.league,
    country: input.country || "",
    home: input.home,
    away: input.away,
    marketOdds: input.marketOdds || {},
    lines: {
      goals: 2.5,
      corners: totalGoals >= 2.7 ? 9.5 : 8.5,
      cards: stats.home.cardsFor + stats.away.cardsFor >= 5.2 ? 5.5 : 4.5,
    },
    context: {
      homeAdvantage: 0.12,
      weatherImpact: 0,
      rivalry: false,
      refereeCardsAvg: Number(((stats.home.cardsFor + stats.away.cardsFor) / 2 + 2.1).toFixed(1)),
    },
    stats,
  };
}

function estimatedStats(home, away, league, hints) {
  const homeSeed = seeded(`${league}:${home}`);
  const awaySeed = seeded(`${league}:${away}`);
  const homeForm = validPct(hints.homeForm, 0.46 + homeSeed * 0.24);
  const awayForm = validPct(hints.awayForm, 0.46 + awaySeed * 0.24);
  const homeAttack = validPct(hints.homeAttack, 0.45 + homeSeed * 0.28);
  const awayAttack = validPct(hints.awayAttack, 0.45 + awaySeed * 0.28);
  const homeDefense = validPct(hints.homeDefense, 0.45 + (1 - homeSeed) * 0.22);
  const awayDefense = validPct(hints.awayDefense, 0.45 + (1 - awaySeed) * 0.22);

  const homeXgFor = clamp(0.85 + homeAttack * 1.25 + homeForm * 0.34 + 0.12, 0.65, 2.55);
  const awayXgFor = clamp(0.82 + awayAttack * 1.2 + awayForm * 0.32 - 0.04, 0.55, 2.45);
  const homeXgAgainst = clamp(1.85 - homeDefense * 1.15 + awayAttack * 0.18, 0.55, 2.2);
  const awayXgAgainst = clamp(1.88 - awayDefense * 1.12 + homeAttack * 0.22, 0.55, 2.25);

  return {
    home: teamStats(homeSeed, homeForm, homeXgFor, homeXgAgainst, true),
    away: teamStats(awaySeed, awayForm, awayXgFor, awayXgAgainst, false),
  };
}

function teamStats(seed, form, xgFor, xgAgainst, isHome) {
  return {
    form: formToResults(form, seed),
    xgFor: round(xgFor),
    xgAgainst: round(xgAgainst),
    shotsFor: round(8.8 + xgFor * 3.0 + seed * 2.3),
    shotsAgainst: round(8.6 + xgAgainst * 2.7 + (1 - seed) * 2.1),
    cornersFor: round(3.3 + xgFor * 1.35 + seed * 1.2),
    cornersAgainst: round(3.4 + xgAgainst * 1.15 + (1 - seed) * 0.9),
    cardsFor: round(1.6 + (1 - form) * 1.25 + seed * 0.5),
    cardsAgainst: round(1.8 + form * 0.75 + (1 - seed) * 0.4),
    goalsFor: round(xgFor * 0.92),
    goalsAgainst: round(xgAgainst * 0.92),
    restDays: isHome ? 5 + Math.round(seed * 2) : 4 + Math.round(seed * 2),
    injuries: Math.max(0, Math.round((1 - form) * 4 - seed)),
  };
}

function formToResults(form, seed) {
  const scores = [];
  let cursor = seed;
  for (let index = 0; index < 5; index += 1) {
    cursor = (cursor * 9301 + 49297) % 233280;
    const value = cursor / 233280;
    if (value < form * 0.58) scores.push(3);
    else if (value < form * 0.58 + 0.28) scores.push(1);
    else scores.push(0);
  }
  return scores;
}

function buildDataset(provider, matches, sources, notices, meta) {
  return {
    sample: provider === "sample",
    provider,
    updatedAt: new Date().toISOString(),
    generatedFor: meta.date,
    timezone: meta.timezone,
    sources,
    notices,
    matches,
  };
}

function fallbackDataset(provider, notices, meta) {
  const source = fs.existsSync(samplePath) ? samplePath : jsonPath;
  const dataset = JSON.parse(fs.readFileSync(source, "utf8"));
  return {
    ...dataset,
    sample: true,
    provider: "sample",
    updatedAt: new Date().toISOString(),
    generatedFor: meta.date,
    timezone: meta.timezone,
    notices: [
      ...(notices || []),
      `${provider}: no se genero dataset vivo; se conserva muestra local.`,
    ],
  };
}

function keepCurrentLiveDataset(fallback) {
  if (!fs.existsSync(jsonPath)) return fallback;

  try {
    const current = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (current.sample !== false || !Array.isArray(current.matches) || !current.matches.length) {
      return fallback;
    }

    return {
      ...current,
      lastUpdateAttemptAt: new Date().toISOString(),
      lastUpdateStatus: "kept-current-after-provider-failure",
      notices: [
        ...(Array.isArray(current.notices) ? current.notices.slice(-3) : []),
        ...(Array.isArray(fallback.notices) ? fallback.notices : []),
        "Se conservaron los ultimos datos reales porque la actualizacion no trajo partidos vivos.",
      ],
    };
  } catch (_error) {
    return fallback;
  }
}

function preserveSampleDataset() {
  if (!fs.existsSync(samplePath) && fs.existsSync(jsonPath)) {
    fs.copyFileSync(jsonPath, samplePath);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} en ${url}: ${body.slice(0, 160)}`);
  }

  return response.json();
}

function runSyncData() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "sync-data.js")], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("No se pudo sincronizar data/matches.js");
  }
}

function loadEnv(projectRoot) {
  const env = { ...process.env };
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return env;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in env)) env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") args.dryRun = true;
    else if (token.startsWith("--")) {
      const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
    }
  }
  return args;
}

function summary(dataset, dryRun) {
  const mode = dryRun ? "DRY RUN" : "OK";
  const notices = Array.isArray(dataset.notices) && dataset.notices.length
    ? `\nnotices:\n- ${dataset.notices.join("\n- ")}`
    : "";
  return `${mode}: provider=${dataset.provider}; sample=${dataset.sample}; matches=${dataset.matches.length}; generatedFor=${dataset.generatedFor}${notices}`;
}

function list(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function todayInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function seasonForDate(date) {
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4));
  return month >= 7 ? String(year) : String(year - 1);
}

function isFinishedStatus(status) {
  return ["FT", "AET", "PEN", "FINISHED", "AWARDED", "CANCELLED", "PST", "POSTPONED"].includes(
    String(status || "").toUpperCase(),
  );
}

function composeEventDate(date, time) {
  if (!date) return new Date().toISOString();
  const cleanTime = String(time || "12:00:00").replace(/\+00:00$/, "");
  return `${date}T${cleanTime || "12:00:00"}Z`;
}

function parsePercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(number)) return null;
  return clamp(number / 100, 0, 1);
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function validPct(value, fallback) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? clamp(fallback, 0, 1)
    : clamp(value, 0, 1);
}

function seeded(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function round(value) {
  return Number(value.toFixed(2));
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}
