/**
 * charts.js — Chart rendering with Chart.js
 */

const Charts = (() => {

  const COLORS = {
    blue:   '#4f8ef7',
    green:  '#4caf50',
    yellow: '#ffc107',
    red:    '#f44336',
    purple: '#9c27b0',
    cyan:   '#00bcd4',
    orange: '#ff9800',
    grey:   '#607d8b',
  };

  const SPORT_COLORS = {
    Football:   COLORS.blue,
    Baseball:   COLORS.green,
    Basketball: COLORS.orange,
    Other:      COLORS.grey,
  };

  let chartInstances = {};

  function destroyChart(id) {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
  }

  function defaultOptions(overrides = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e0e0e0', font: { size: 12 } } },
        tooltip: {
          backgroundColor: '#1e1e2e',
          titleColor: '#e0e0e0',
          bodyColor: '#b0b0c0',
          borderColor: '#3a3a5c',
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: '#9090a0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9090a0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
      ...overrides,
    };
  }

  function chartAvailable(canvasId) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded — skipping chart render for', canvasId);
      const ctx = document.getElementById(canvasId);
      if (ctx) {
        const msg = document.createElement('p');
        msg.style.cssText = 'color:#8888a0;font-size:0.85rem;text-align:center;padding:20px;';
        msg.textContent = 'Chart unavailable (Chart.js blocked by browser extension)';
        ctx.parentNode.insertBefore(msg, ctx);
        ctx.style.display = 'none';
      }
      return false;
    }
    return true;
  }

  // ─── Promoted vs Organic Bar Chart ─────────────────────────────────────────

  function renderPromotedVsOrganic(canvasId, data) {
    if (!chartAvailable(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Impressions', 'Page Views', 'Avg CTR (%)'],
        datasets: [
          {
            label: 'Promoted',
            data: [data.promotedImpressions, data.promotedPageViews, parseFloat(data.promotedCTR.toFixed(2))],
            backgroundColor: COLORS.blue + 'cc',
            borderColor: COLORS.blue,
            borderWidth: 1,
          },
          {
            label: 'Organic',
            data: [data.organicImpressions, data.organicPageViews, parseFloat(data.organicCTR.toFixed(2))],
            backgroundColor: COLORS.green + 'cc',
            borderColor: COLORS.green,
            borderWidth: 1,
          },
        ],
      },
      options: defaultOptions(),
    });
  }

  // ─── Sport Breakdown Doughnut Chart ────────────────────────────────────────

  function renderSportBreakdown(canvasId, breakdown) {
    if (!chartAvailable(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Object.keys(breakdown);
    const impressionData = labels.map(s => breakdown[s].totalImpressions);
    const colors = labels.map(s => SPORT_COLORS[s] || COLORS.grey);

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: impressionData,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#e0e0e0', font: { size: 13 } } },
          tooltip: {
            backgroundColor: '#1e1e2e',
            titleColor: '#e0e0e0',
            bodyColor: '#b0b0c0',
          },
        },
      },
    });
  }

  // ─── Sport Bar Chart (count + impressions) ─────────────────────────────────

  function renderSportBar(canvasId, breakdown) {
    if (!chartAvailable(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Object.keys(breakdown);
    const countData = labels.map(s => breakdown[s].count);
    const colors = labels.map(s => SPORT_COLORS[s] || COLORS.grey);

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Listings',
          data: countData,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 1,
        }],
      },
      options: defaultOptions({ plugins: { legend: { display: false } } }),
    });
  }

  // ─── Trending Bar Charts ────────────────────────────────────────────────────

  function renderTrendingChart(canvasId, listings, getChange, direction) {
    if (!chartAvailable(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = listings.map(l => truncate(l.title, 30));
    const values = listings.map(l => parseFloat(getChange(l).toFixed(1)));
    const color = direction === 'up' ? COLORS.green : COLORS.red;

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: direction === 'up' ? '% Change (Up)' : '% Change (Down)',
          data: values,
          backgroundColor: color + 'aa',
          borderColor: color,
          borderWidth: 1,
        }],
      },
      options: {
        ...defaultOptions(),
        indexAxis: 'y',
        plugins: {
          ...defaultOptions().plugins,
          legend: { display: false },
        },
      },
    });
  }

  // ─── Health Score distribution ──────────────────────────────────────────────

  function renderHealthDistribution(canvasId, listings) {
    if (!chartAvailable(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    listings.forEach(l => {
      const s = l.healthScore || 0;
      if (s <= 20) buckets['0-20']++;
      else if (s <= 40) buckets['21-40']++;
      else if (s <= 60) buckets['41-60']++;
      else if (s <= 80) buckets['61-80']++;
      else buckets['81-100']++;
    });

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(buckets),
        datasets: [{
          label: 'Listings',
          data: Object.values(buckets),
          backgroundColor: [COLORS.red + 'cc', COLORS.orange + 'cc', COLORS.yellow + 'cc', COLORS.cyan + 'cc', COLORS.green + 'cc'],
          borderColor: [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.cyan, COLORS.green],
          borderWidth: 1,
        }],
      },
      options: defaultOptions({ plugins: { legend: { display: false } } }),
    });
  }

  function truncate(str, len) {
    return str && str.length > len ? str.substring(0, len) + '…' : str;
  }

  return {
    renderPromotedVsOrganic,
    renderSportBreakdown,
    renderSportBar,
    renderTrendingChart,
    renderHealthDistribution,
    destroyChart,
  };
})();
