(function () {
  "use strict";

  const state = {
    league: "all",
    market: "all",
    risk: "all",
    sort: "confidence",
    query: "",
    valueOnly: false,
    selectedId: null,
    analyses: [],
  };

  const els = {};

  const marketLabels = {
    "1x2": "1X2",
    goals: "Goles",
    corners: "Corners",
    cards: "Tarjetas",
  };

  const riskRank = {
    conservador: 3,
    medio: 2,
    agresivo: 1,
  };

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    cacheElements();
    setCurrentDate();
    bindEvents();
    await hydrateData();
    render();
  }

  function cacheElements() {
    [
      "leagueFilter",
      "marketFilter",
      "riskFilter",
      "sortFilter",
      "searchInput",
      "valueToggle",
      "matchList",
      "matchDetail",
      "visibleCount",
      "detailRisk",
      "dataStatus",
      "kpiMatches",
      "kpiConfidence",
      "kpiStrong",
      "kpiValue",
      "dataLedger",
      "currentDateLabel",
      "recalculateButton",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.leagueFilter.addEventListener("change", (event) => {
      state.league = event.target.value;
      render();
    });

    els.marketFilter.addEventListener("change", (event) => {
      state.market = event.target.value;
      render();
    });

    els.riskFilter.addEventListener("change", (event) => {
      state.risk = event.target.value;
      render();
    });

    els.sortFilter.addEventListener("change", (event) => {
      state.sort = event.target.value;
      render();
    });

    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      render();
    });

    els.valueToggle.addEventListener("change", (event) => {
      state.valueOnly = event.target.checked;
      render();
    });

    els.recalculateButton.addEventListener("click", () => {
      state.analyses = analyzeDataset(getDataset());
      render();
    });

    els.matchList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-match-id]");
      if (!card) return;
      state.selectedId = card.dataset.matchId;
      render();
    });
  }

  async function hydrateData() {
    if (window.location.protocol !== "file:") {
      try {
        const response = await fetch("/api/predictions", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (response.ok) {
          window.PC_MATCHES = await response.json();
        }
      } catch (error) {
        console.warn("Usando datos locales por fallback.", error);
      }
    }

    const dataset = getDataset();
    state.analyses = analyzeDataset(dataset);
    state.selectedId = state.analyses[0] ? state.analyses[0].match.id : null;
    renderLeagueOptions(dataset.matches || []);
    renderDataLedger(dataset);
    els.dataStatus.textContent = dataset.sample
      ? "Datos de muestra listos"
      : `Datos conectados: ${dataset.provider || "api"}`;
  }

  function getDataset() {
    return window.PC_MATCHES || { updatedAt: null, sample: true, matches: [] };
  }

  function setCurrentDate() {
    const now = new Date();
    els.currentDateLabel.textContent = new Intl.DateTimeFormat("es", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(now);
  }

  function renderLeagueOptions(matches) {
    const leagues = Array.from(new Set(matches.map((match) => match.league))).sort();
    els.leagueFilter.innerHTML = [
      '<option value="all">Todas</option>',
      ...leagues.map((league) => `<option value="${escapeHtml(league)}">${escapeHtml(league)}</option>`),
    ].join("");
  }

  function renderDataLedger(dataset) {
    const matches = dataset.matches || [];
    const leagues = new Set(matches.map((match) => match.league)).size;
    const updated = dataset.updatedAt ? formatDateTime(dataset.updatedAt) : "Sin fecha";
    const sourceCount = Object.keys(dataset.sources || {}).length;
    const sampleLabel = dataset.sample ? "Muestra" : "Produccion";
    const provider = dataset.provider || "manual";

    els.dataLedger.innerHTML = [
      ledgerItem("Actualizado", updated),
      ledgerItem("Partidos cargados", matches.length),
      ledgerItem("Ligas", leagues),
      ledgerItem("Estado", `${sampleLabel} - ${provider} - ${sourceCount} fuentes`),
    ].join("");
  }

  function ledgerItem(label, value) {
    return `<div class="ledger-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
  }

  function render() {
    const filtered = getFilteredAnalyses();
    updateKpis(filtered);
    renderMatchList(filtered);

    if (!filtered.some((item) => item.match.id === state.selectedId)) {
      state.selectedId = filtered[0] ? filtered[0].match.id : null;
    }

    const selected = state.analyses.find((item) => item.match.id === state.selectedId);
    renderDetail(selected);
  }

  function getFilteredAnalyses() {
    return state.analyses
      .filter((analysis) => {
        const match = analysis.match;
        const text = `${match.home} ${match.away} ${match.league}`.toLowerCase();
        const marketOk =
          state.market === "all" ||
          analysis.recommendations.some((item) => item.marketKey === state.market);
        const riskOk = state.risk === "all" || analysis.bestPick.risk === state.risk;
        const valueOk = !state.valueOnly || analysis.bestPick.value >= 0.035;
        return (
          (state.league === "all" || match.league === state.league) &&
          marketOk &&
          riskOk &&
          valueOk &&
          (!state.query || text.includes(state.query))
        );
      })
      .sort((a, b) => {
        if (state.sort === "time") {
          return new Date(a.match.kickoff) - new Date(b.match.kickoff);
        }
        if (state.sort === "value") {
          return b.bestPick.value - a.bestPick.value || b.bestPick.confidence - a.bestPick.confidence;
        }
        return b.bestPick.confidence - a.bestPick.confidence || riskRank[b.bestPick.risk] - riskRank[a.bestPick.risk];
      });
  }

  function updateKpis(items) {
    const matchCount = items.length;
    const avgConfidence = matchCount
      ? items.reduce((sum, item) => sum + item.bestPick.confidence, 0) / matchCount
      : 0;
    const strong = items.filter((item) => item.bestPick.confidence >= 0.66).length;
    const value = items.filter((item) => item.bestPick.value >= 0.035).length;

    els.kpiMatches.textContent = matchCount;
    els.kpiConfidence.textContent = `${toPercent(avgConfidence)}%`;
    els.kpiStrong.textContent = strong;
    els.kpiValue.textContent = value;
    els.visibleCount.textContent = `${matchCount} visibles`;
  }

  function renderMatchList(items) {
    if (!items.length) {
      els.matchList.innerHTML = '<div class="empty-state">No hay partidos con esos filtros.</div>';
      return;
    }

    els.matchList.innerHTML = items.map((analysis) => matchCard(analysis)).join("");
  }

  function matchCard(analysis) {
    const match = analysis.match;
    const best = analysis.bestPick;
    const isActive = match.id === state.selectedId ? " is-active" : "";
    const probs = analysis.probabilities;

    return `
      <button class="match-card${isActive}" type="button" data-match-id="${escapeHtml(match.id)}" aria-pressed="${isActive ? "true" : "false"}">
        <div class="match-card__top">
          <span>${escapeHtml(match.league)}</span>
          <span>${formatTime(match.kickoff)}</span>
        </div>
        <h3>${escapeHtml(match.home)} <span>vs</span> ${escapeHtml(match.away)}</h3>
        <div class="pick-line">
          <span class="market-chip">${escapeHtml(marketLabels[best.marketKey] || best.market)}</span>
          <strong>${escapeHtml(best.pick)}</strong>
          <small>${toPercent(best.confidence)}%</small>
        </div>
        <div class="prob-stack" aria-label="Probabilidades 1X2">
          ${probRow("Local", probs.homeWin)}
          ${probRow("Empate", probs.draw)}
          ${probRow("Visita", probs.awayWin)}
        </div>
        <div class="match-meta">
          <span class="risk-badge risk-${best.risk}">${capitalize(best.risk)}</span>
          <span class="pill">Valor ${signedPercent(best.value)}</span>
        </div>
      </button>
    `;
  }

  function probRow(label, value) {
    return `
      <div class="prob-row">
        <span>${escapeHtml(label)}</span>
        <span class="bar" aria-hidden="true"><span style="--value:${toPercent(value)}%"></span></span>
        <strong>${toPercent(value)}%</strong>
      </div>
    `;
  }

  function renderDetail(analysis) {
    if (!analysis) {
      els.detailRisk.textContent = "Sin partido";
      els.matchDetail.innerHTML = '<div class="empty-state">Selecciona otro filtro.</div>';
      return;
    }

    const match = analysis.match;
    const risk = analysis.bestPick.risk;
    els.detailRisk.textContent = capitalize(risk);
    els.detailRisk.className = `pill risk-badge risk-${risk}`;

    els.matchDetail.innerHTML = `
      <div class="detail-score">
        <div class="team-block">
          <small>Local</small>
          <strong>${escapeHtml(match.home)}</strong>
        </div>
        <div class="score-block">
          <small>xG estimado</small>
          <strong>${analysis.expected.homeGoals.toFixed(1)} - ${analysis.expected.awayGoals.toFixed(1)}</strong>
        </div>
        <div class="team-block">
          <small>Visitante</small>
          <strong>${escapeHtml(match.away)}</strong>
        </div>
      </div>

      <ul class="recommendations">
        ${analysis.recommendations.map(recommendationRow).join("")}
      </ul>

      <div class="detail-grid">
        ${metricRow("Goles totales", analysis.expected.totalGoals.toFixed(2))}
        ${metricRow("Corners totales", analysis.expected.totalCorners.toFixed(1))}
        ${metricRow("Tarjetas totales", analysis.expected.totalCards.toFixed(1))}
        ${metricRow("BTTS", `${toPercent(analysis.probabilities.btts)}%`)}
      </div>

      <ul class="scorelines" aria-label="Marcadores probables">
        ${analysis.scorelines
          .slice(0, 4)
          .map((item) => `<li class="metric-row"><span>${item.home}-${item.away}</span><strong>${toPercent(item.probability)}%</strong></li>`)
          .join("")}
      </ul>

      <ul class="reason-list">
        ${analysis.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
    `;
  }

  function recommendationRow(item) {
    return `
      <li class="recommendation-row">
        <div>
          <span>${escapeHtml(item.market)}</span>
          <strong>${escapeHtml(item.pick)}</strong>
          <span>${escapeHtml(item.note)}</span>
        </div>
        <span class="confidence-ring" style="--ring:${toPercent(item.confidence)}%">${toPercent(item.confidence)}%</span>
      </li>
    `;
  }

  function metricRow(label, value) {
    return `<div class="metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
  }

  function analyzeDataset(dataset) {
    return (dataset.matches || []).map(analyzeMatch);
  }

  function analyzeMatch(match) {
    const home = match.stats.home;
    const away = match.stats.away;
    const context = match.context || {};
    const marketOdds = match.marketOdds || {};
    const homeForm = formScore(home.form);
    const awayForm = formScore(away.form);
    const restDiff = clamp((home.restDays - away.restDays) * 0.018, -0.12, 0.12);
    const injuryDiff = clamp((away.injuries - home.injuries) * 0.035, -0.16, 0.16);
    const formDiff = clamp((homeForm - awayForm) * 0.22, -0.18, 0.18);
    const homeBoost = Number(context.homeAdvantage || 0.12);
    const weatherDrag = Number(context.weatherImpact || 0);

    const homeGoals = clamp(
      home.xgFor * 0.46 +
        away.xgAgainst * 0.34 +
        home.goalsFor * 0.12 +
        away.goalsAgainst * 0.1 +
        home.shotsFor * 0.012 -
        away.shotsAgainst * 0.004 +
        homeBoost +
        restDiff +
        injuryDiff +
        formDiff -
        weatherDrag,
      0.28,
      3.4,
    );

    const awayGoals = clamp(
      away.xgFor * 0.44 +
        home.xgAgainst * 0.35 +
        away.goalsFor * 0.12 +
        home.goalsAgainst * 0.1 +
        away.shotsFor * 0.012 -
        home.shotsAgainst * 0.004 -
        homeBoost * 0.42 -
        restDiff -
        injuryDiff -
        formDiff -
        weatherDrag,
      0.22,
      3.2,
    );

    const goalModel = buildGoalModel(homeGoals, awayGoals);
    const totalGoals = homeGoals + awayGoals;
    const totalCorners = clamp(
      (home.cornersFor + away.cornersAgainst + away.cornersFor + home.cornersAgainst) / 2 +
        (home.shotsFor + away.shotsFor - 22) * 0.08,
      5.2,
      14.8,
    );
    const totalCards = clamp(
      (home.cardsFor + away.cardsAgainst + away.cardsFor + home.cardsAgainst) / 2 +
        (Number(context.refereeCardsAvg || 4.4) - 4.4) * 0.56 +
        (context.rivalry ? 0.45 : 0),
      2.1,
      8.8,
    );

    const implied = normalizeOdds(marketOdds);
    const resultPick = pickResult(goalModel, match, implied);
    const goalPick = pickGoals(goalModel, totalGoals, marketOdds);
    const cornerPick = pickCorners(totalCorners, match.lines || {});
    const cardPick = pickCards(totalCards, match.lines || {});
    const recommendations = [resultPick, goalPick, cornerPick, cardPick].sort(
      (a, b) => b.confidence + b.value * 0.35 - (a.confidence + a.value * 0.35),
    );

    return {
      match,
      probabilities: goalModel.probabilities,
      expected: {
        homeGoals,
        awayGoals,
        totalGoals,
        totalCorners,
        totalCards,
      },
      scorelines: goalModel.scorelines,
      recommendations,
      bestPick: recommendations[0],
      reasons: buildReasons(match, {
        homeForm,
        awayForm,
        homeGoals,
        awayGoals,
        totalCorners,
        totalCards,
        implied,
        bestPick: recommendations[0],
      }),
    };
  }

  function buildGoalModel(homeLambda, awayLambda) {
    const maxGoals = 7;
    const matrix = [];
    let totalMass = 0;
    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let over25 = 0;
    let btts = 0;
    const scorelines = [];

    for (let h = 0; h <= maxGoals; h += 1) {
      for (let a = 0; a <= maxGoals; a += 1) {
        const probability = poisson(homeLambda, h) * poisson(awayLambda, a);
        matrix.push({ home: h, away: a, probability });
        totalMass += probability;
      }
    }

    matrix.forEach((item) => {
      const probability = item.probability / totalMass;
      if (item.home > item.away) homeWin += probability;
      if (item.home === item.away) draw += probability;
      if (item.home < item.away) awayWin += probability;
      if (item.home + item.away > 2.5) over25 += probability;
      if (item.home > 0 && item.away > 0) btts += probability;
      scorelines.push({ ...item, probability });
    });

    scorelines.sort((a, b) => b.probability - a.probability);

    return {
      probabilities: {
        homeWin,
        draw,
        awayWin,
        over25,
        under25: 1 - over25,
        btts,
      },
      scorelines,
    };
  }

  function pickResult(model, match, implied) {
    const options = [
      { key: "homeWin", label: `Gana ${match.home}`, oddsKey: "home" },
      { key: "draw", label: "Empate", oddsKey: "draw" },
      { key: "awayWin", label: `Gana ${match.away}`, oddsKey: "away" },
    ].map((option) => ({
      ...option,
      probability: model.probabilities[option.key],
      value: implied.available ? model.probabilities[option.key] - (implied[option.oddsKey] || 0) : 0,
    }));

    options.sort((a, b) => b.probability - a.probability);
    const top = options[0];
    const gap = top.probability - options[1].probability;
    const confidence = clamp(top.probability + gap * 0.42, 0, 0.83);

    return {
      market: "Resultado",
      marketKey: "1x2",
      pick: top.label,
      confidence,
      value: top.value,
      valueSource: implied.available ? "odds" : "none",
      risk: riskFromConfidence(confidence),
      note: `Brecha 1X2 de ${toPercent(gap)} puntos.`,
    };
  }

  function pickGoals(model, totalGoals, odds) {
    const over = model.probabilities.over25;
    const under = model.probabilities.under25;
    const pickOver = over >= under;
    const line = odds.goalsLine || 2.5;
    const confidence = clamp(Math.max(over, under) + Math.abs(totalGoals - line) * 0.045, 0, 0.86);
    const overImplied = impliedFromOdd(odds.over25);
    const underImplied = impliedFromOdd(odds.under25);
    const hasGoalOdds = overImplied > 0 || underImplied > 0;
    const value = hasGoalOdds ? (pickOver ? over - overImplied : under - underImplied) : 0;

    return {
      market: `Alta/baja ${line}`,
      marketKey: "goals",
      pick: pickOver ? `Alta de ${line} goles` : `Baja de ${line} goles`,
      confidence,
      value,
      valueSource: hasGoalOdds ? "odds" : "none",
      risk: riskFromConfidence(confidence),
      note: `Media proyectada: ${totalGoals.toFixed(2)} goles.`,
    };
  }

  function pickCorners(totalCorners, lines) {
    const line = Number(lines.corners || 8.5);
    const diff = totalCorners - line;
    const confidence = clamp(0.5 + Math.abs(diff) * 0.09, 0, 0.82);

    return {
      market: `Corners ${line}`,
      marketKey: "corners",
      pick: diff >= 0 ? `Alta de ${line} corners` : `Baja de ${line} corners`,
      confidence,
      value: Math.abs(diff) / 24,
      valueSource: "line",
      risk: riskFromConfidence(confidence),
      note: `Proyeccion: ${totalCorners.toFixed(1)} corners.`,
    };
  }

  function pickCards(totalCards, lines) {
    const line = Number(lines.cards || 4.5);
    const diff = totalCards - line;
    const confidence = clamp(0.5 + Math.abs(diff) * 0.095, 0, 0.82);

    return {
      market: `Tarjetas ${line}`,
      marketKey: "cards",
      pick: diff >= 0 ? `Alta de ${line} tarjetas` : `Baja de ${line} tarjetas`,
      confidence,
      value: Math.abs(diff) / 22,
      valueSource: "line",
      risk: riskFromConfidence(confidence),
      note: `Proyeccion: ${totalCards.toFixed(1)} tarjetas.`,
    };
  }

  function buildReasons(match, stats) {
    const formEdge = stats.homeForm - stats.awayForm;
    const favorite =
      stats.homeGoals > stats.awayGoals
        ? `${match.home} llega con xG estimado superior`
        : `${match.away} equilibra el xG pese a jugar fuera`;
    const formReason =
      Math.abs(formEdge) < 0.08
        ? "La forma reciente esta pareja; el modelo baja la agresividad del 1X2."
        : formEdge > 0
          ? `${match.home} tiene mejor forma reciente en los ultimos cinco partidos.`
          : `${match.away} trae mejor forma reciente en los ultimos cinco partidos.`;
    const valueReason =
      stats.bestPick.value >= 0.035 && stats.bestPick.valueSource === "odds"
        ? `El mejor pick supera la probabilidad implicita de mercado por ${signedPercent(stats.bestPick.value)}.`
        : stats.bestPick.value >= 0.035 && stats.bestPick.valueSource === "line"
          ? `El mejor pick tiene margen estadistico contra la linea por ${signedPercent(stats.bestPick.value)}.`
          : "No hay ventaja amplia frente a cuotas; la confianza pesa mas que el valor.";

    return [
      `${favorite}: ${stats.homeGoals.toFixed(2)} contra ${stats.awayGoals.toFixed(2)}.`,
      formReason,
      `El ritmo combinado deja ${stats.totalCorners.toFixed(1)} corners y ${stats.totalCards.toFixed(1)} tarjetas esperadas.`,
      valueReason,
    ];
  }

  function formScore(form) {
    if (!Array.isArray(form) || !form.length) return 0.5;
    return form.reduce((sum, points) => sum + Number(points || 0), 0) / (form.length * 3);
  }

  function normalizeOdds(odds = {}) {
    const keys = ["home", "draw", "away"];
    const raw = keys.reduce((acc, key) => {
      acc[key] = impliedFromOdd(odds[key]);
      return acc;
    }, {});
    const total = keys.reduce((sum, key) => sum + raw[key], 0);
    if (!total) return { available: false };
    const normalized = keys.reduce((acc, key) => {
      acc[key] = raw[key] / total;
      return acc;
    }, {});
    normalized.available = true;
    return normalized;
  }

  function impliedFromOdd(odd) {
    const value = Number(odd);
    return value > 1 ? 1 / value : 0;
  }

  function poisson(lambda, k) {
    return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
  }

  function factorial(number) {
    let result = 1;
    for (let i = 2; i <= number; i += 1) result *= i;
    return result;
  }

  function riskFromConfidence(confidence) {
    if (confidence >= 0.66) return "conservador";
    if (confidence >= 0.58) return "medio";
    return "agresivo";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function toPercent(value) {
    return Math.round(clamp(value, -1, 1) * 100);
  }

  function signedPercent(value) {
    const rounded = toPercent(value);
    return `${rounded >= 0 ? "+" : ""}${rounded}%`;
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("es", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
