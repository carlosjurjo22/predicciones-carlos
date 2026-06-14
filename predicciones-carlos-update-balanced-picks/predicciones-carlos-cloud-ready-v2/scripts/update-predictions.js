"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "data", "matches.json");
const samplePath = path.join(root, "data", "sample-matches.json");

const DEFAULT_TIMEZONE = "America/Havana";
const DEFAULT_THESPORTSDB_KEY = "123";
const DEFAULT_MAX_MATCHES = 5;
const DEFAULT_API_FOOTBALL_LEAGUES = "1:2026,2:2025,3:2025,39:2025,140:2025,135:2025,78:2025,61:2025,128:2026,71:2026,262:2025,253:2026";
const DEFAULT_FOOTBALL_DATA_COMPETITIONS = "WC,CL,PL,PD,SA,BL1,FL1";
const DEFAULT_THESPORTSDB_LEAGUES = [
  "FIFA World Cup",
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Europa Conference League",
  "English Premier League",
  "Spanish La Liga",
  "Italian Serie A",
  "German Bundesliga",
  "French Ligue 1",
  "Copa Libertadores",
  "Copa Sudamericana",
  "Major League Soccer",
  "Argentine Primera Division",
  "Brazilian Serie A",
  "Mexican Primera League",
  "Austrian Bundesliga",
].join(",");

const LEAGUE_PRIORITY = [
  [/world cup|fifa/i, 100],
  [/champions league/i, 96],
  [/europa league/i, 92],
  [/conference league/i, 88],
  [/premier league|england/i, 86],
  [/la liga|spain/i, 84],
  [/serie a|italy/i, 82],
  [/bundesliga|germany/i, 80],
  [/ligue 1|france/i, 78],
  [/libertadores/i, 76],
  [/sudamericana/i, 74],
  [/major league soccer|mls/i, 72],
  [/argentine|argentina/i, 70],
  [/brazil|brasileirao|serie a/i, 68],
  [/mexican|liga mx|mexico/i, 66],
  [/austrian bundesliga|austria/i, 48],
  [/irish premier|regionalliga|reserve|u19|u21|youth|women/i, 8],
];

const TEAM_STRENGTH_PRIORS = new Map(Object.entries({
  argentina: 0.95,
  france: 0.94,
  brazil: 0.93,
  spain: 0.91,
  england: 0.9,
  germany: 0.88,
  portugal: 0.87,
  netherlands: 0.86,
  italy: 0.84,
  belgium: 0.82,
  croatia: 0.8,
  uruguay: 0.79,
  colombia: 0.78,
  morocco: 0.76,
  switzerland: 0.75,
  japan: 0.74,
  denmark: 0.74,
  senegal: 0.73,
  usa: 0.72,
  "united states": 0.72,
  mexico: 0.71,
  ecuador: 0.7,
  austria: 0.7,
  scotland: 0.68,
  "ivory coast": 0.68,
  "cote divoire": 0.68,
  chile: 0.66,
  norway: 0.66,
  serbia: 0.65,
  poland: 0.65,
  peru: 0.63,
  paraguay: 0.62,
  venezuela: 0.6,
  haiti: 0.42,
  curacao: 0.34,
  "real madrid": 0.95,
  barcelona: 0.92,
  "manchester city": 0.94,
  liverpool: 0.91,
  arsenal: 0.89,
  "bayern munich": 0.92,
  "paris saint germain": 0.9,
  psg: 0.9,
  inter: 0.87,
  "ac milan": 0.84,
  juventus: 0.84,
  "atletico madrid": 0.86,
  "borussia dortmund": 0.83,
  chelsea: 0.82,
  "manchester united": 0.81,
  tottenham: 0.8,
}));

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv(root);
  const date = args.date || env.PREDICTIONS_DATE || todayInTimezone(env.TIMEZONE || DEFAULT_TIMEZONE);
  const timezone = args.timezone || env.TIMEZONE || DEFAULT_TIMEZONE;
  const maxMatches = Number(args.max || env.PREDICTIONS_MAX_MATCHES || DEFAULT_MAX_MATCHES);
  const lookaheadDays = Number(args.lookaheadDays || env.PREDICTIONS_LOOKAHEAD_DAYS || 2);
  const provider = args.provider || env.PREDICTIONS_PROVIDER || "auto";

  const keepCurrentOnFallback =
    args.keepCurrentOnFallback || env.PREDICTIONS_KEEP_CURRENT_ON_FAIL !== "false";
  const requestedSample = provider === "sample";

  if (args.recalculateCurrent) {
    const dataset = recalculateCurrentDataset({ date, timezone, lookaheadDays });
    if (args.dryRun) {
      console.log(summary(dataset, true));
      return;
    }
    fs.writeFileSync(jsonPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    runSyncData();
    console.log(summary(dataset, false));
    return;
  }

  const result = await fetchDataset(provider, env, { date, timezone, maxMatches, lookaheadDays });
  let dataset = result.matches.length
    ? buildDataset(result.provider, result.matches, result.sources, result.notices, { date, timezone, lookaheadDays })
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

async function fetchApiFootball(env, { date, timezone, maxMatches, lookaheadDays }) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("falta API_FOOTBALL_KEY en .env");
  }

  const fixtures = [];
  const leagues = parseLeagueSpecs(env.API_FOOTBALL_LEAGUES || DEFAULT_API_FOOTBALL_LEAGUES);
  const season = env.API_FOOTBALL_SEASON || seasonForDate(date);

  for (const fixtureDate of dateWindow(date, lookaheadDays)) {
    if (!leagues.length) {
      const payload = await apiFootball(env.API_FOOTBALL_KEY, "fixtures", {
        date: fixtureDate,
        timezone,
      });
      fixtures.push(...(payload.response || []));
      if (fixtures.length >= maxMatches) break;
      continue;
    }

    for (const spec of leagues) {
      const payload = await apiFootball(env.API_FOOTBALL_KEY, "fixtures", {
        date: fixtureDate,
        timezone,
        league: spec.id,
        season: spec.season || season,
      });
      fixtures.push(...(payload.response || []));
      if (fixtures.length >= maxMatches) break;
    }
    if (fixtures.length >= maxMatches) break;
  }

  const scheduled = fixtures
    .filter((item) => item.fixture && item.teams && !isFinishedStatus(item.fixture.status && item.fixture.status.short))
    .sort((a, b) => leagueScore(b.league && b.league.name, b.league && b.league.country) - leagueScore(a.league && a.league.name, a.league && a.league.country))
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

async function fetchFootballData(env, { date, maxMatches, lookaheadDays }) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error("falta FOOTBALL_DATA_TOKEN en .env");
  }

  const url = new URL("https://api.football-data.org/v4/matches");
  url.searchParams.set("dateFrom", date);
  url.searchParams.set("dateTo", addDays(date, lookaheadDays));
  url.searchParams.set("competitions", env.FOOTBALL_DATA_COMPETITIONS || DEFAULT_FOOTBALL_DATA_COMPETITIONS);

  const payload = await fetchJson(url, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      "X-Unfold-Goals": "true",
      "X-Unfold-Bookings": "true",
    },
  });

  const matches = (payload.matches || [])
    .filter((match) => !isFinishedStatus(match.status))
    .sort((a, b) =>
      leagueScore(b.competition && b.competition.name, b.area && b.area.name) -
      leagueScore(a.competition && a.competition.name, a.area && a.area.name)
    )
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

async function fetchTheSportsDb(env, { date, maxMatches, lookaheadDays }) {
  const key = env.THESPORTSDB_KEY || DEFAULT_THESPORTSDB_KEY;
  const preferredLeagues = list(env.THESPORTSDB_LEAGUES || DEFAULT_THESPORTSDB_LEAGUES);
  const eventMap = new Map();
  const notices = [];

  for (const fixtureDate of dateWindow(date, lookaheadDays)) {
    const payload = await theSportsDbEventsDay(key, fixtureDate, "");
    for (const event of payload.events || []) {
      if (event.strHomeTeam && event.strAwayTeam) {
        eventMap.set(String(event.idEvent), event);
      }
    }
    if (eventMap.size >= maxMatches) break;
  }

  if (eventMap.size < maxMatches && env.THESPORTSDB_QUERY_PREFERRED_LEAGUES !== "false") {
    for (const fixtureDate of dateWindow(date, lookaheadDays)) {
      for (const league of preferredLeagues) {
        const payload = await theSportsDbEventsDay(key, fixtureDate, league);
        for (const event of payload.events || []) {
          if (event.strHomeTeam && event.strAwayTeam) {
            eventMap.set(String(event.idEvent), event);
          }
        }
        if (eventMap.size >= maxMatches) break;
      }
      if (eventMap.size >= maxMatches) break;
    }
  }

  const events = Array.from(eventMap.values())
    .filter((event) => event.strHomeTeam && event.strAwayTeam)
    .sort((a, b) => leagueScore(b.strLeague, b.strCountry) - leagueScore(a.strLeague, a.strCountry))
    .slice(0, maxMatches)
    .map(fromTheSportsDbEvent);

  return {
    provider: "thesportsdb",
    sources: {
      fixtures: "TheSportsDB eventsday",
      leagues: preferredLeagues.join(", "),
      notes: "Free key 123 is public and limited; use for schedules, not deep betting data.",
    },
    notices: [
      `TheSportsDB: ${events.length} partidos importados.`,
      `Ventana: ${date} a ${addDays(date, lookaheadDays)}.`,
      ...notices,
    ],
    matches: events,
  };
}

async function theSportsDbEventsDay(key, date, league) {
  const url = new URL(`https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php`);
  url.searchParams.set("d", date);
  url.searchParams.set("s", "Soccer");
  if (league) url.searchParams.set("l", league);
  return fetchJson(url);
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
  const league = cleanText(input.league, "Football");
  const country = cleanText(input.country, "");
  const home = cleanText(input.home, "Local");
  const away = cleanText(input.away, "Visitante");
  const stats = estimatedStats(home, away, league, input.hints || {});
  const totalGoals = stats.home.xgFor * 0.58 + stats.away.xgFor * 0.58;
  const projectedCorners =
    (stats.home.cornersFor + stats.away.cornersAgainst + stats.away.cornersFor + stats.home.cornersAgainst) / 2;
  const projectedCards = stats.home.cardsFor + stats.away.cardsFor;

  return {
    id: input.id,
    providerId: input.providerId,
    provider: input.provider,
    dataQuality: input.dataQuality,
    kickoff: input.kickoff || new Date().toISOString(),
    league,
    country,
    home,
    away,
    marketOdds: input.marketOdds || {},
    lines: {
      goals: 2.5,
      corners: projectedCorners >= 9.4 ? 9.5 : 8.5,
      cards: projectedCards >= 5.2 ? 5.5 : 4.5,
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
  const homeQuality = teamStrength(home, homeSeed);
  const awayQuality = teamStrength(away, awaySeed);
  const homeForm = validPct(hints.homeForm, 0.4 + homeQuality * 0.36 + homeSeed * 0.08);
  const awayForm = validPct(hints.awayForm, 0.4 + awayQuality * 0.36 + awaySeed * 0.08);
  const homeAttack = validPct(hints.homeAttack, 0.39 + homeQuality * 0.42 + homeSeed * 0.08);
  const awayAttack = validPct(hints.awayAttack, 0.39 + awayQuality * 0.42 + awaySeed * 0.08);
  const homeDefense = validPct(hints.homeDefense, 0.38 + homeQuality * 0.36 + (1 - homeSeed) * 0.08);
  const awayDefense = validPct(hints.awayDefense, 0.38 + awayQuality * 0.36 + (1 - awaySeed) * 0.08);
  const qualityEdge = homeQuality - awayQuality;

  const homeXgFor = clamp(0.85 + homeAttack * 1.25 + homeForm * 0.34 + 0.12 + qualityEdge * 0.5, 0.65, 2.55);
  const awayXgFor = clamp(0.82 + awayAttack * 1.2 + awayForm * 0.32 - 0.04 - qualityEdge * 0.5, 0.55, 2.45);
  const homeXgAgainst = clamp(1.85 - homeDefense * 1.15 + awayAttack * 0.18 - qualityEdge * 0.35, 0.55, 2.2);
  const awayXgAgainst = clamp(1.88 - awayDefense * 1.12 + homeAttack * 0.22 + qualityEdge * 0.35, 0.55, 2.25);

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
    cornersFor: round(2.35 + xgFor * 0.92 + seed * 0.72),
    cornersAgainst: round(2.45 + xgAgainst * 0.78 + (1 - seed) * 0.58),
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
    generatedTo: addDays(meta.date, meta.lookaheadDays || 0),
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

function recalculateCurrentDataset(meta) {
  const current = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const matches = (current.matches || []).map((match) =>
    baseMatch({
      id: match.id,
      providerId: match.providerId,
      provider: match.provider || current.provider || "manual",
      dataQuality: match.dataQuality || "fixtures+baseline-estimates",
      kickoff: match.kickoff,
      league: match.league,
      country: match.country,
      home: match.home,
      away: match.away,
      marketOdds: match.marketOdds || {},
      hints: {},
    }),
  );

  return {
    ...current,
    updatedAt: new Date().toISOString(),
    generatedFor: meta.date || current.generatedFor,
    generatedTo: addDays(meta.date || current.generatedFor || todayInTimezone(meta.timezone || DEFAULT_TIMEZONE), meta.lookaheadDays || 0),
    timezone: meta.timezone || current.timezone || DEFAULT_TIMEZONE,
    notices: [
      "Dataset recalibrado localmente con balance de mercados.",
      ...(Array.isArray(current.notices) ? current.notices.slice(-2) : []),
    ],
    matches,
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

function cleanText(value, fallback = "") {
  let text = String(value || fallback || "").trim();
  if (!text) text = fallback;

  if (/[ÃÂ]/.test(text)) {
    const decoded = Buffer.from(text, "latin1").toString("utf8");
    if (!decoded.includes("\uFFFD")) text = decoded;
  }

  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function teamStrength(name, seed) {
  const key = cleanText(name, "").toLowerCase();
  if (!key) return 0.44 + seed * 0.24;
  if (TEAM_STRENGTH_PRIORS.has(key)) return TEAM_STRENGTH_PRIORS.get(key);

  for (const [knownName, strength] of TEAM_STRENGTH_PRIORS) {
    if (key.includes(knownName) || knownName.includes(key)) return strength;
  }

  return 0.44 + seed * 0.24;
}

function parseLeagueSpecs(value) {
  return list(value).map((item) => {
    const [id, season] = item.split(":").map((part) => part.trim());
    return { id, season };
  });
}

function leagueScore(name = "", country = "") {
  const text = `${name} ${country}`;
  for (const [pattern, score] of LEAGUE_PRIORITY) {
    if (pattern.test(text)) return score;
  }
  return 35;
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

function dateWindow(startDate, lookaheadDays) {
  const days = [];
  for (let offset = 0; offset <= lookaheadDays; offset += 1) {
    days.push(addDays(startDate, offset));
  }
  return days;
}

function addDays(date, amount) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + Number(amount || 0));
  return parsed.toISOString().slice(0, 10);
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
