/**
 * app.js — Main ShazbotCards Analytics application logic
 * Orchestrates CSV loading, analysis, storage, and DOM rendering.
 */

(function () {
  'use strict';

  // ─── State ─────────────────────────────────────────────────────────────────

  let allListings = [];
  let filteredListings = [];
  let sortColumn = 'totalImpressions';
  let sortDir = 'desc';
  let searchQuery = '';
  let perfFilterLevel = 'all';  // 'all' | 'high' | 'moderate' | 'low'
  let activeDetailRow = null;
  let activeReportId = null;   // id of the report currently being viewed
  let currentMode = 'current'; // 'current' | 'trends' | 'compare'
  let compareR1Id = null;
  let compareR2Id = null;
  // Map of itemId → prediction (populated asynchronously)
  const predictionCache = new Map();

  // ─── Boot ──────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    setupDropzone();
    setupUploadButton();
    setupSearch();
    setupHistoryPanel();
    setupModeToggle();
    setupCompare();
    setupExportImport();
    setupTitleOptimizer();
    setupPerformancePredictor();
    setupDebugMode();
    setupDebugConsoleButton();
    setupLiveAnalytics();
    setupCOGSSection();
    renderHistorySidebar();
    applyConnectedModeUI();
    setupHeaderActions();
    loadDefaultCSV();
    if (typeof eBayUI !== 'undefined') eBayUI.injectConfigPanel();
  });

  // ─── CSV Loading ───────────────────────────────────────────────────────────

  function loadDefaultCSV() {
    setStatus('Loading demo data…', 'info');
    fetch('data/sample-traffic-report.csv')
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch demo CSV');
        return r.text();
      })
      .then(text => processCSV(text, 'Demo: Feb 19 2026 Traffic Report', null, false))
      .catch(() => setStatus('Could not load demo data. Upload your own CSV to begin.', 'warning'));
  }

  function processCSV(text, label, filename, shouldSave) {
    try {
      const raw = CSVParser.parse(text);
      if (!raw.length) throw new Error('No listings found in CSV');
      allListings = Analyzer.enrichWithScores(raw);
      filteredListings = [...allListings];
      setStatus(`Loaded ${allListings.length} listings — ${label}`, 'success');
    } catch (err) {
      setStatus('Error parsing CSV: ' + err.message, 'error');
      console.error(err);
      return;
    }

    // Save to history if this is a user upload
    if (shouldSave !== false && filename && Storage.isAvailable()) {
      const saved = Storage.saveReport(filename, allListings, null);
      if (saved) {
        activeReportId = saved.id;
        renderHistorySidebar();
      }
    }

    try {
      renderAll();
    } catch (err) {
      console.error('Render error:', err);
    }
  }

  // ─── Dropzone & Upload ─────────────────────────────────────────────────────

  function setupDropzone() {
    const dz = document.getElementById('dropzone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    });
    dz.addEventListener('click', () => document.getElementById('fileInput').click());

    // Replace inline onclick handler on upload button
    const uploadTrigger = document.getElementById('btn-upload-trigger');
    if (uploadTrigger) {
      uploadTrigger.addEventListener('click', e => {
        e.stopPropagation();
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.click();
      });
    }
  }

  function setupUploadButton() {
    const input = document.getElementById('fileInput');
    if (!input) return;
    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) readFile(file);
      input.value = '';
    });
  }

  function readFile(file) {
    if (!file.name.endsWith('.csv')) {
      setStatus('Please upload a .csv file', 'error');
      return;
    }
    setStatus('Reading file…', 'info');
    const reader = new FileReader();
    reader.onload = e => processCSV(e.target.result, file.name, file.name, true);
    reader.onerror = () => setStatus('Failed to read file', 'error');
    reader.readAsText(file);
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      applyFilters();
    });
  }

  function applyFilters() {
    filteredListings = allListings.filter(l => {
      if (searchQuery && !l.title.toLowerCase().includes(searchQuery) && !l.itemId.includes(searchQuery)) return false;
      if (perfFilterLevel !== 'all') {
        const pred = predictionCache.get(l.itemId);
        if (!pred) return true; // include unscored listings until prediction is available
        const level = getPerfLevel(pred.saleProbability);
        if (level !== perfFilterLevel) return false;
      }
      return true;
    });
    renderFullTable();
  }

  // ─── History Panel ─────────────────────────────────────────────────────────

  function setupHistoryPanel() {
    const toggleBtn = document.getElementById('btn-history-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const body = document.getElementById('history-body');
        if (!body) return;
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? '' : 'none';
        toggleBtn.textContent = collapsed ? '▲ Collapse' : '▼ Expand';
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      });
    }

    const deleteAllBtn = document.getElementById('btn-delete-all');
    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', () => {
        if (confirm('Delete ALL saved reports? This cannot be undone.')) {
          Storage.deleteAllReports();
          activeReportId = null;
          renderHistorySidebar();
        }
      });
    }
  }

  function renderHistorySidebar() {
    if (!Storage.isAvailable()) return;

    const list = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    const quota = document.getElementById('quota-indicator');
    const deleteAllBtn = document.getElementById('btn-delete-all');
    const exportBtn = document.getElementById('btn-export-json');
    const modeBar = document.getElementById('mode-toggle-bar');

    const reports = Storage.getReportList();
    const q = Storage.getQuota();

    if (quota) quota.textContent = `${q.used} of ${q.max} reports saved`;

    // Toggle bulk action button visibility
    if (deleteAllBtn) deleteAllBtn.style.display = reports.length ? 'inline-flex' : 'none';
    if (exportBtn) exportBtn.style.display = reports.length ? 'inline-flex' : 'none';
    if (modeBar) modeBar.style.display = reports.length >= 2 ? 'flex' : 'none';

    if (!list) return;

    // Clear existing cards (keep empty message node)
    Array.from(list.children).forEach(ch => {
      if (ch.id !== 'history-empty') ch.remove();
    });

    if (reports.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    reports.forEach(r => {
      const card = document.createElement('div');
      card.className = 'history-card' + (r.id === activeReportId ? ' active-report' : '');
      card.dataset.reportId = r.id;

      const uploadDate = new Date(r.uploadedAt).toLocaleString();
      const periodText = r.reportPeriod
        ? `${r.reportPeriod.start} → ${r.reportPeriod.end}`
        : 'Date range unknown';

      card.innerHTML = `
        <div class="history-card-filename" title="${esc(r.filename)}">${esc(truncate(r.filename, 28))}</div>
        <div class="history-card-meta">
          <div>📅 Uploaded: ${esc(uploadDate)}</div>
          <div>📋 ${r.listingCount} listings</div>
          <div>📆 ${esc(periodText)}</div>
        </div>
        <div class="history-card-actions">
          <button class="btn-sm btn-primary btn-set-active" data-id="${esc(r.id)}">View</button>
          <button class="btn-sm btn-danger btn-delete-report" data-id="${esc(r.id)}">🗑</button>
        </div>
      `;

      // View report
      card.querySelector('.btn-set-active').addEventListener('click', e => {
        e.stopPropagation();
        loadReportById(r.id);
      });

      // Delete report
      card.querySelector('.btn-delete-report').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`Delete "${r.filename}"?`)) {
          Storage.deleteReport(r.id);
          if (activeReportId === r.id) activeReportId = null;
          renderHistorySidebar();
          refreshCompareSelects();
        }
      });

      list.appendChild(card);
    });

    refreshCompareSelects();
  }

  function loadReportById(id) {
    const report = Storage.getReport(id);
    if (!report) { setStatus('Report not found.', 'error'); return; }
    allListings = report.data || [];
    filteredListings = [...allListings];
    activeReportId = id;
    setStatus(`Viewing: ${report.filename} (${allListings.length} listings)`, 'success');
    renderHistorySidebar();
    switchMode('current');
    renderAll();
  }

  // ─── Mode Toggle ───────────────────────────────────────────────────────────

  function setupModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });
  }

  function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const currentView = document.getElementById('trends-view');
    const compareView = document.getElementById('compare-view');
    const mainSections = document.querySelectorAll(
      '.kpi-section, .priority-section, .promo-section, .trending-section, .sport-section, .full-table-section'
    );

    mainSections.forEach(el => el.style.display = mode === 'current' ? 'block' : 'none');
    if (currentView) currentView.style.display = mode === 'trends' ? 'block' : 'none';
    if (compareView) compareView.style.display = mode === 'compare' ? 'block' : 'none';

    if (mode === 'trends') renderTrendsView();
  }

  // ─── Trends View ───────────────────────────────────────────────────────────

  function renderTrendsView() {
    if (!Storage.isAvailable()) return;
    const reports = Storage.getAllReports();
    if (reports.length < 2) {
      setStatus('Upload at least 2 reports to see trends.', 'info');
      return;
    }

    const aggregateTrend = Trends.computeAggregateTrend(reports);
    const timeline = Trends.buildListingTimeline(reports);
    const topListings = Trends.getTopListingTimelines(timeline, 5);

    Charts.renderImpressionsOverTime('impressionsOverTimeChart', aggregateTrend);
    Charts.renderCTRTrend('ctrTrendChart', aggregateTrend);
    Charts.renderTopListingsOverTime('topListingsChart', topListings, aggregateTrend);
    Charts.renderHealthOverTime('healthOverTimeChart', aggregateTrend);

    renderDeclinedListings(timeline);
  }

  function renderDeclinedListings(timeline) {
    const tbody = document.getElementById('declined-tbody');
    if (!tbody) return;

    const declined = Trends.getDeclinedListings(timeline);
    tbody.innerHTML = '';

    if (!declined.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;color:var(--text-muted);text-align:center">No declined listings detected — great job! 🎉</td></tr>';
      return;
    }

    declined.slice(0, 20).forEach(({ listing, change }) => {
      const tr = document.createElement('tr');
      const healthBadge = (badge) => `<span class="badge badge-health-${badge}">${badge}</span>`;
      const statusBadge = change.isNewIssue
        ? '<span class="badge badge-new-issue">🆕 New Issue</span>'
        : '<span class="badge badge-declined">⬇ Declined</span>';

      const impressionsPct = change.impressionsChange !== null
        ? fmtChg(change.impressionsChange)
        : '<span class="chg-na">N/A</span>';

      tr.innerHTML = `
        <td class="title-cell">${esc(truncate(listing.title, 50))}</td>
        <td>${healthBadge(change.currSnap.healthBadge)}</td>
        <td>${healthBadge(change.prevSnap.healthBadge)}</td>
        <td>${fmtChgAbs(change.healthScoreChange)}</td>
        <td>${impressionsPct}</td>
        <td>${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ─── KPI Trend Indicators ──────────────────────────────────────────────────

  function renderKPITrends() {
    if (!Storage.isAvailable()) return;
    const reports = Storage.getAllReports();
    if (reports.length < 2) return;

    const aggregateTrend = Trends.computeAggregateTrend(reports);
    const comparison = Trends.computeKPIComparison(aggregateTrend);
    if (!comparison) return;

    setKPITrend('kpi-impressions', comparison.totalImpressions);
    setKPITrend('kpi-ctr', comparison.avgCTR);
    setKPITrend('kpi-sold', comparison.totalSold);
    setKPITrend('kpi-total', comparison.listingCount);
  }

  function setKPITrend(kpiId, diffObj) {
    const card = document.getElementById(kpiId)?.closest('.kpi-card');
    if (!card) return;

    // Remove existing trend el
    const existing = card.querySelector('.kpi-trend');
    if (existing) existing.remove();

    if (!diffObj || diffObj.pctChange === null) return;

    const pct = diffObj.pctChange;
    const trendEl = document.createElement('div');
    trendEl.className = 'kpi-trend';

    if (Math.abs(pct) < 0.1) {
      trendEl.className += ' kpi-trend-neutral';
      trendEl.textContent = '→ No change';
    } else if (pct > 0) {
      trendEl.className += ' kpi-trend-up';
      trendEl.textContent = `↑ +${pct.toFixed(1)}% vs prev`;
    } else {
      trendEl.className += ' kpi-trend-down';
      trendEl.textContent = `↓ ${pct.toFixed(1)}% vs prev`;
    }

    card.appendChild(trendEl);
  }

  // ─── Compare Reports ───────────────────────────────────────────────────────

  function setupCompare() {
    const btn = document.getElementById('btn-run-compare');
    if (btn) btn.addEventListener('click', runComparison);
  }

  function refreshCompareSelects() {
    const sel1 = document.getElementById('compare-select-1');
    const sel2 = document.getElementById('compare-select-2');
    if (!sel1 || !sel2) return;

    const reports = Storage.getReportList();
    const makeOptions = (selectedId) => {
      let html = '<option value="">-- Select a report --</option>';
      reports.forEach(r => {
        const date = new Date(r.uploadedAt).toLocaleDateString();
        html += `<option value="${esc(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${esc(truncate(r.filename, 30))} (${date})</option>`;
      });
      return html;
    };

    sel1.innerHTML = makeOptions(compareR1Id);
    sel2.innerHTML = makeOptions(compareR2Id);
  }

  function runComparison() {
    const sel1 = document.getElementById('compare-select-1');
    const sel2 = document.getElementById('compare-select-2');
    if (!sel1 || !sel2) return;

    compareR1Id = sel1.value;
    compareR2Id = sel2.value;

    if (!compareR1Id || !compareR2Id) {
      setStatus('Select two reports to compare.', 'warning');
      return;
    }
    if (compareR1Id === compareR2Id) {
      setStatus('Please select two different reports.', 'warning');
      return;
    }

    const r1 = Storage.getReport(compareR1Id);
    const r2 = Storage.getReport(compareR2Id);

    // Update column headers
    setText('compare-th-1', truncate(r1.filename, 20));
    setText('compare-th-2', truncate(r2.filename, 20));

    const rows = Trends.buildComparison(r1, r2);
    renderCompareTable(rows);

    const exportBtn = document.getElementById('btn-export-trend-csv');
    if (exportBtn) {
      exportBtn.style.display = 'inline-flex';
      exportBtn.onclick = () => exportTrendCSV(rows, r1, r2);
    }
  }

  function renderCompareTable(rows) {
    const tbody = document.getElementById('compare-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:20px;color:var(--text-muted);text-align:center">No listings to compare.</td></tr>';
      return;
    }

    rows.slice(0, 100).forEach(row => {
      const tr = document.createElement('tr');

      const statusLabel = row.isNew ? '<span class="badge badge-good">New</span>'
        : row.isDelisted ? '<span class="badge badge-declined">Delisted</span>'
        : '';

      const r1 = row.r1;
      const r2 = row.r2;

      function cell(r, key, fmt) {
        if (!r) return '<td class="chg-na">—</td>';
        return `<td>${fmt ? fmt(r[key]) : r[key]}</td>`;
      }

      function changeCell(r1, r2, key) {
        if (!r1 || !r2) return '<td class="chg-na">—</td>';
        const a = r1[key], b = r2[key];
        if (a === 0 && b === 0) return '<td class="chg-neutral">—</td>';
        if (a === 0) return '<td class="chg-na">N/A</td>';
        const pct = ((b - a) / Math.abs(a)) * 100;
        return `<td>${fmtChg(pct)}</td>`;
      }

      const healthCell = (r) => {
        if (!r) return '<td class="chg-na">—</td>';
        return `<td><span class="badge badge-health-${r.healthBadge}">${r.healthScore}</span></td>`;
      };

      tr.innerHTML = `
        <td class="title-cell">${esc(truncate(row.title, 45))}${statusLabel ? ' ' + statusLabel : ''}</td>
        ${cell(r1, 'totalImpressions', v => v.toLocaleString())}
        ${cell(r2, 'totalImpressions', v => v.toLocaleString())}
        ${changeCell(r1, r2, 'totalImpressions')}
        ${changeCell(r1, r2, 'ctr')}
        ${changeCell(r1, r2, 'totalPageViews')}
        ${changeCell(r1, r2, 'quantitySold')}
        ${healthCell(r2 || r1)}
      `;
      tbody.appendChild(tr);
    });
  }

  // ─── Export / Import ───────────────────────────────────────────────────────

  function setupExportImport() {
    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!Storage.isAvailable()) return;
        const json = Storage.exportAll();
        downloadText(json, 'shazbotcards-history.json', 'application/json');
      });
    }

    const importInput = document.getElementById('importInput');
    if (importInput) {
      importInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          const count = Storage.importAll(ev.target.result);
          if (count < 0) {
            setStatus('Import failed — invalid file format.', 'error');
          } else {
            setStatus(`Imported ${count} new report(s) successfully.`, 'success');
            renderHistorySidebar();
          }
        };
        reader.readAsText(file);
        importInput.value = '';
      });
    }
  }

  function exportTrendCSV(rows, r1, r2) {
    const headers = ['Item ID', 'Title', `${r1.filename} Impressions`, `${r2.filename} Impressions`, 'Impr % Change', 'CTR Change %', 'Views Change %', 'Sold Change %'];
    const lines = [headers.join(',')];

    function pctChgStr(a, b) {
      if (a === null || a === undefined || b === null || b === undefined) return 'N/A';
      if (a === 0 && b === 0) return '0%';
      if (a === 0) return 'N/A';
      return (((b - a) / Math.abs(a)) * 100).toFixed(1) + '%';
    }

    rows.forEach(row => {
      lines.push([
        row.itemId,
        `"${(row.title || '').replace(/"/g, '""')}"`,
        row.r1 ? row.r1.totalImpressions : '',
        row.r2 ? row.r2.totalImpressions : '',
        pctChgStr(row.r1?.totalImpressions, row.r2?.totalImpressions),
        pctChgStr(row.r1?.ctr, row.r2?.ctr),
        pctChgStr(row.r1?.totalPageViews, row.r2?.totalPageViews),
        pctChgStr(row.r1?.quantitySold, row.r2?.quantitySold),
      ].join(','));
    });

    downloadText(lines.join('\n'), 'shazbotcards-trend-report.csv', 'text/csv');
  }

  function downloadText(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  // ─── Render All ────────────────────────────────────────────────────────────

  function renderAll() {
    renderKPIs();
    renderKPITrends();
    renderCOGSKPIs();
    renderPriorityTable();
    renderPromotedSection();
    renderTrendingSection();
    renderSportSection();
    renderFullTable();
    // Clear predictor cache when new data loads, then refresh badges
    if (window.PerformancePredictor) window.PerformancePredictor.clearCache();
    predictionCache.clear();
    renderPerformanceWidget();
    refreshPerformanceBadges();
  }

  // ─── KPI Cards ─────────────────────────────────────────────────────────────

  function renderKPIs() {
    const kpi = Analyzer.computeKPIs(allListings);

    setText('kpi-total', kpi.total);
    setText('kpi-impressions', kpi.totalImpressions.toLocaleString());
    setText('kpi-ctr', kpi.avgCTR.toFixed(2) + '%');
    setText('kpi-sold', kpi.totalSold);
    setText('kpi-dead', kpi.deadListings);

    const healthScores = allListings.map(l => l.healthScore || 0);
    const avgHealth = healthScores.length ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0;
    setText('kpi-health', avgHealth + '/100');
  }

  // ─── COGS KPI Cards ───────────────────────────────────────────────────────

  function renderCOGSKPIs() {
    if (typeof COGS === 'undefined') return;
    // Only show meaningful data when we have real prices (eBay mode)
    const hasPrice = allListings.some(l => l.price > 0);
    if (!hasPrice) {
      setText('kpi-inventory-value', '—');
      setText('kpi-total-cogs', '—');
      setText('kpi-net-profit', '—');
      setText('kpi-avg-margin', '—');
      return;
    }

    const settings = COGS.load();
    const portfolio = COGS.calcPortfolio(allListings, settings);

    setText('kpi-inventory-value', '$' + portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('kpi-total-cogs',      '$' + portfolio.totalCogs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('kpi-net-profit',      '$' + portfolio.totalNetProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('kpi-avg-margin',      portfolio.avgMargin.toFixed(1) + '%');
  }

  // ─── Priority Table ────────────────────────────────────────────────────────

  function renderPriorityTable() {
    const tbody = document.getElementById('priority-tbody');
    if (!tbody) return;

    const priorityList = Analyzer.computePriorityList(allListings).slice(0, 15);
    tbody.innerHTML = '';

    priorityList.forEach(l => {
      const tr = document.createElement('tr');
      const prio = l._rec.priority;
      tr.className = 'priority-' + prio;

      tr.innerHTML = `
        <td class="title-cell">${esc(truncate(l.title, 55))}</td>
        <td>${(l.totalImpressions || 0).toLocaleString()}</td>
        <td>${fmtPct(l.ctr)}</td>
        <td>${l.totalPageViews || 0}</td>
        <td>${l.quantitySold || 0}</td>
        <td><span class="badge badge-${prio}">${l._rec.text}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ─── Promoted vs Organic ───────────────────────────────────────────────────

  function renderPromotedSection() {
    const data = Analyzer.computePromotedVsOrganic(allListings);

    setText('promo-count', data.promotedCount);
    setText('organic-count', data.organicCount);
    setText('promo-impressions', data.promotedImpressions.toLocaleString());
    setText('organic-impressions', data.organicImpressions.toLocaleString());
    setText('promo-ctr', data.promotedCTR.toFixed(2) + '%');
    setText('organic-ctr', data.organicCTR.toFixed(2) + '%');
    setText('promo-views', data.promotedPageViews.toLocaleString());
    setText('organic-views', data.organicPageViews.toLocaleString());

    Charts.renderPromotedVsOrganic('promoChart', data);
  }

  // ─── Trending ──────────────────────────────────────────────────────────────

  function renderTrendingSection() {
    const { trendingUp, trendingDown, getChange } = Analyzer.computeTrending(allListings);

    renderTrendList('trending-up-list', trendingUp, getChange, 'up');
    renderTrendList('trending-down-list', trendingDown, getChange, 'down');

    Charts.renderTrendingChart('trendUpChart', trendingUp.slice(0, 8), getChange, 'up');
    Charts.renderTrendingChart('trendDownChart', trendingDown.slice(0, 8), getChange, 'down');
  }

  function renderTrendList(elId, listings, getChange, dir) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    if (!listings.length) {
      el.innerHTML = '<li class="no-data">No data</li>';
      return;
    }
    listings.slice(0, 8).forEach(l => {
      const pct = getChange(l).toFixed(1);
      const li = document.createElement('li');
      li.innerHTML = `<span class="trend-title">${esc(truncate(l.title, 45))}</span><span class="trend-pct trend-${dir}">${dir === 'up' ? '+' : ''}${pct}%</span>`;
      el.appendChild(li);
    });
  }

  // ─── Sport Section ─────────────────────────────────────────────────────────

  function renderSportSection() {
    const breakdown = Analyzer.computeSportBreakdown(allListings);

    const tbody = document.getElementById('sport-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      Object.entries(breakdown)
        .sort((a, b) => b[1].totalImpressions - a[1].totalImpressions)
        .forEach(([sport, stats]) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><span class="sport-badge sport-${sport.toLowerCase()}">${esc(sport)}</span></td>
            <td>${stats.count}</td>
            <td>${stats.totalImpressions.toLocaleString()}</td>
            <td>${stats.totalSold}</td>
            <td>${stats.count ? Math.round(stats.totalImpressions / stats.count).toLocaleString() : '0'}</td>
          `;
          tbody.appendChild(tr);
        });
    }

    Charts.renderSportBreakdown('sportDoughnutChart', breakdown);
    Charts.renderSportBar('sportBarChart', breakdown);
  }

  // ─── Full Listing Table ────────────────────────────────────────────────────

  function renderFullTable() {
    const tbody = document.getElementById('full-tbody');
    if (!tbody) return;

    const sorted = sortListings(filteredListings);
    tbody.innerHTML = '';

    const cogsSettings = typeof COGS !== 'undefined' ? COGS.load() : null;
    const shipThreshold = cogsSettings ? cogsSettings.shipping.threshold : 20;

    sorted.forEach(l => {
      const scoreColor = l.healthBadge === 'green' ? '#4caf50' : l.healthBadge === 'yellow' ? '#ffc107' : '#f44336';
      const tr = document.createElement('tr');
      tr.className = 'listing-row';
      tr.dataset.itemId = l.itemId;

      // Get cached prediction for badge (if available)
      const pred = predictionCache.get(l.itemId);
      const perfBadgeHtml = buildPerfBadgeHtml(l, pred);

      // Determine shipping method for this listing
      const autoShip = l.price > shipThreshold ? 'ga' : 'ese';
      const shipMethod = l.shippingOverride || autoShip;
      const shipLabel = shipMethod === 'ga' ? '📦 GA' : '📬 ESE';
      const shipCell = l.price > 0
        ? `<td><button class="btn-sm cogs-ship-toggle ${shipMethod === 'ga' ? 'ship-ga' : 'ship-ese'}" data-item-id="${esc(l.itemId || l.title)}" data-method="${shipMethod}" title="Click to toggle shipping method">${shipLabel}</button></td>`
        : `<td><span style="color:var(--text-muted)">—</span></td>`;

      tr.innerHTML = `
        <td class="title-cell">
          <a href="https://www.ebay.com/itm/${esc(l.itemId)}" target="_blank" rel="noopener" class="ebay-link" title="${esc(l.title)}">${esc(truncate(l.title, 50))}</a>
        </td>
        <td>${l.price > 0 ? '$' + l.price.toFixed(2) : '—'}</td>
        <td>${(l.totalImpressions || 0).toLocaleString()}</td>
        <td>${fmtPct(l.ctr)}</td>
        <td>${l.totalPageViews || 0}</td>
        <td>${l.quantitySold || 0}</td>
        <td><span class="promo-badge ${l.isPromoted ? 'promo-yes' : 'promo-no'}">${l.isPromoted ? '✓ Promoted' : 'Organic'}</span></td>
        <td>${fmtPct(l.top20Pct)}</td>
        <td><span class="health-score" style="color:${scoreColor}">${l.healthScore ?? '-'}</span></td>
        ${shipCell}
        <td><span class="sport-badge sport-${(l.sport || 'other').toLowerCase()}">${esc(l.sport || '?')}</span></td>
        <td class="perf-cell" data-item-id="${esc(l.itemId)}">${perfBadgeHtml}</td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        if (e.target.classList.contains('perf-info-btn') || e.target.closest('.perf-info-btn')) return;
        if (e.target.classList.contains('cogs-ship-toggle') || e.target.closest('.cogs-ship-toggle')) return;
        toggleDetailRow(tr, l);
      });

      // Wire info button after inserting row
      const infoBtn = tr.querySelector('.perf-info-btn');
      if (infoBtn) {
        infoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openPerfModal(l);
        });
      }

      tbody.appendChild(tr);
    });

    // Wire up shipping toggle buttons
    document.querySelectorAll('.cogs-ship-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const itemId = btn.dataset.itemId;
        const currentMethod = btn.dataset.method;
        const newMethod = currentMethod === 'ga' ? 'ese' : 'ga';
        const listing = allListings.find(l => (l.itemId || l.title) === itemId);
        if (listing) {
          listing.shippingOverride = newMethod;
          btn.dataset.method = newMethod;
          btn.textContent = newMethod === 'ga' ? '📦 GA' : '📬 ESE';
          btn.className = `btn-sm cogs-ship-toggle ${newMethod === 'ga' ? 'ship-ga' : 'ship-ese'}`;
          renderCOGSKPIs();
        }
      });
    });

    setupTableSort();

    // Re-apply eBay columns if a sync has been done
    if (typeof eBayUI !== 'undefined' && typeof eBayUI.reDecorateTable === 'function') {
      eBayUI.reDecorateTable();
    }
  }

  function toggleDetailRow(tr, listing) {
    if (activeDetailRow && activeDetailRow !== tr) {
      const existing = document.getElementById('detail-row-' + activeDetailRow.dataset.itemId);
      if (existing) existing.remove();
      activeDetailRow.classList.remove('active-row');
    }

    const existingDetail = document.getElementById('detail-row-' + listing.itemId);
    if (existingDetail) {
      existingDetail.remove();
      tr.classList.remove('active-row');
      activeDetailRow = null;
      return;
    }

    activeDetailRow = tr;
    tr.classList.add('active-row');

    const detailTr = document.createElement('tr');
    detailTr.id = 'detail-row-' + listing.itemId;
    detailTr.className = 'detail-row';
    detailTr.innerHTML = `
      <td colspan="12">
        <div class="detail-panel">
          <div class="detail-grid">
            <div class="detail-item"><label>eBay ID</label><span><a href="https://www.ebay.com/itm/${esc(listing.itemId)}" target="_blank" rel="noopener">${esc(listing.itemId)}</a></span></div>
            <div class="detail-item"><label>Listed</label><span>${esc(listing.startDate)}</span></div>
            <div class="detail-item"><label>Sport</label><span>${esc(listing.sport)}</span></div>
            <div class="detail-item"><label>Status</label><span>${esc(listing.promotedStatus)}</span></div>
            <div class="detail-item"><label>Qty Available</label><span>${listing.quantityAvailable ?? '-'}</span></div>
            <div class="detail-item"><label>Total Impressions</label><span>${(listing.totalImpressions || 0).toLocaleString()}</span></div>
            <div class="detail-item"><label>Promoted Impr.</label><span>${(listing.totalPromotedImpressions || 0).toLocaleString()}</span></div>
            <div class="detail-item"><label>Organic Impr.</label><span>${(listing.totalOrganicImpressions || 0).toLocaleString()}</span></div>
            <div class="detail-item"><label>CTR</label><span>${fmtPct(listing.ctr)}</span></div>
            <div class="detail-item"><label>Top 20 %</label><span>${fmtPct(listing.top20Pct)}</span></div>
            <div class="detail-item"><label>Page Views</label><span>${listing.totalPageViews ?? 0}</span></div>
            <div class="detail-item"><label>Qty Sold</label><span>${listing.quantitySold ?? 0}</span></div>
            <div class="detail-item"><label>Health Score</label><span style="color:${listing.healthBadge === 'green' ? '#4caf50' : listing.healthBadge === 'yellow' ? '#ffc107' : '#f44336'}">${listing.healthScore}/100</span></div>
            <div class="detail-item detail-full"><label>Recommendation</label><span class="rec-text">${esc(listing.recommendation?.text || '-')}</span></div>
          </div>
          <div class="detail-actions">
            <button class="btn-sm btn-primary btn-optimize-title">🤖 Optimize Title</button>
            <button class="btn-sm btn-secondary btn-view-performance">📊 Performance Prediction</button>
          </div>
          <div class="ebay-detail-comparison" id="ebay-detail-${esc(listing.itemId)}"></div>
        </div>
      </td>
    `;
    tr.after(detailTr);

    const optimizeBtn = detailTr.querySelector('.btn-optimize-title');
    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', () => openTitleOptimizer(listing.itemId));
    }
    const perfBtn = detailTr.querySelector('.btn-view-performance');
    if (perfBtn) {
      perfBtn.addEventListener('click', () => openPerfModal(listing));
    }

    // Inject eBay comparison widget if the integration is loaded
    if (typeof eBayUI !== 'undefined') {
      const comparisonEl = detailTr.querySelector(`#ebay-detail-${listing.itemId}`);
      if (comparisonEl) {
        const listingMap = eBaySync.getListingMap();
        const ebayItemID = listingMap[listing.itemId] || null;
        comparisonEl.innerHTML = eBayUI.buildComparisonWidget(listing, '', ebayItemID);
      }
    }
  }

  function sortListings(listings) {
    return [...listings].sort((a, b) => {
      let va = a[sortColumn];
      let vb = b[sortColumn];
      // Special case: saleProbability comes from prediction cache
      if (sortColumn === 'saleProbability') {
        va = predictionCache.get(a.itemId)?.saleProbability ?? null;
        vb = predictionCache.get(b.itemId)?.saleProbability ?? null;
      }
      if (va === null || va === undefined) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function setupTableSort() {
    document.querySelectorAll('#full-table th[data-col]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.col;
        if (sortColumn === col) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDir = 'desc';
        }
        document.querySelectorAll('#full-table th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        renderFullTable();
      };
    });
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────


  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '-';
  }

  function fmtPct(val) {
    if (val === null || val === undefined) return '-';
    return val.toFixed(1) + '%';
  }

  function fmtChg(pct) {
    if (pct === null || pct === undefined) return '<span class="chg-na">N/A</span>';
    const sign = pct >= 0 ? '+' : '';
    const cls = Math.abs(pct) < 0.1 ? 'chg-neutral' : pct > 0 ? 'chg-up' : 'chg-down';
    return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>`;
  }

  function fmtChgAbs(delta) {
    if (delta === null || delta === undefined) return '<span class="chg-na">N/A</span>';
    const sign = delta >= 0 ? '+' : '';
    const cls = delta > 0 ? 'chg-up' : delta < 0 ? 'chg-down' : 'chg-neutral';
    return `<span class="${cls}">${sign}${delta}</span>`;
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(str, len) {
    return str && str.length > len ? str.substring(0, len) + '…' : (str || '');
  }

  function setStatus(msg, type) {
    const el = document.getElementById('status-bar');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-bar status-' + type;
    el.style.display = 'block';
  }

  // ─── Performance Predictor ────────────────────────────────────────────────

  function getPerfLevel(probability) {
    if (probability >= 80) return 'high';
    if (probability >= 50) return 'moderate';
    return 'low';
  }

  function buildPerfBadgeHtml(listing, prediction) {
    if (!prediction) {
      return `<span class="perf-badge perf-badge-loading" title="Calculating…">…</span>`;
    }
    const level = getPerfLevel(prediction.saleProbability);
    const label = prediction.saleProbability + '%';
    const dot = level === 'high' ? '🟢' : level === 'moderate' ? '🟡' : '🔴';
    return `
      <span class="perf-badge perf-badge-${level}" title="Sale probability: ${label}">${dot} ${label}</span>
      <button class="perf-info-btn" title="View prediction details" aria-label="View performance prediction">ℹ</button>
    `;
  }

  function setupPerformancePredictor() {
    if (!window.PerformancePredictor) return;

    // Performance filter select
    const perfFilter = document.getElementById('perf-filter-select');
    if (perfFilter) {
      perfFilter.addEventListener('change', () => {
        perfFilterLevel = perfFilter.value;
        applyFilters();
      });
    }

    // Widget risk-card click filters
    const riskCardMap = {
      'perf-risk-high': 'low',      // "High Risk" card → listings with LOW probability
      'perf-risk-mod':  'moderate',
      'perf-risk-low':  'high',     // "Low Risk" card  → listings with HIGH probability
    };
    Object.entries(riskCardMap).forEach(([id, filterVal]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', () => {
        perfFilterLevel = filterVal;
        const sel = document.getElementById('perf-filter-select');
        if (sel) sel.value = filterVal;
        applyFilters();
        const tableSection = document.querySelector('.full-table-section');
        if (tableSection) tableSection.scrollIntoView({ behavior: 'smooth' });
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') el.click(); });
    });

    // Widget refresh button
    const refreshBtn = document.getElementById('perf-widget-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (window.PerformancePredictor) window.PerformancePredictor.clearCache();
        predictionCache.clear();
        renderPerformanceWidget();
        refreshPerformanceBadges();
      });
    }

    // Prediction modal close
    const closeBtn = document.getElementById('perf-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closePerfModal);
    const modal = document.getElementById('perf-modal');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) closePerfModal(); });
  }

  function renderPerformanceWidget() {
    if (!window.PerformancePredictor || !allListings.length) return;
    const widget = document.getElementById('perf-widget');
    if (widget) widget.style.display = '';
    runPredictionsInBackground(allListings);
  }

  async function runPredictionsInBackground(listings) {
    if (!window.PerformancePredictor) return;
    const predictor = window.PerformancePredictor;

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      if (predictionCache.has(listing.itemId)) continue;

      try {
        const catStats = predictor.calculateCategoryStats(listings, listing.sport);
        const prediction = await predictor.predictPerformance(listing, catStats);
        predictionCache.set(listing.itemId, prediction);
        updatePerfBadgeInRow(listing.itemId, listing, prediction);
        updateWidgetCounts();
      } catch (err) {
        console.warn('Prediction failed for', listing.itemId, err.message);
      }

      // Small delay between AI calls to avoid rate limits
      if (i < listings.length - 1 && predictor._getToken()) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  function updatePerfBadgeInRow(itemId, listing, prediction) {
    const cell = document.querySelector(`.perf-cell[data-item-id="${CSS.escape(itemId)}"]`);
    if (!cell) return;
    cell.innerHTML = buildPerfBadgeHtml(listing, prediction);
    const infoBtn = cell.querySelector('.perf-info-btn');
    if (infoBtn) {
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPerfModal(listing);
      });
    }
  }

  function updateWidgetCounts() {
    // "High Risk" widget = listings with LOW probability; "Low Risk" widget = HIGH probability
    let atRiskCount = 0, modCount = 0, performingCount = 0;
    predictionCache.forEach(pred => {
      const level = getPerfLevel(pred.saleProbability);
      if (level === 'high') performingCount++;
      else if (level === 'moderate') modCount++;
      else atRiskCount++;
    });
    const elHigh = document.getElementById('perf-count-high');
    const elMod  = document.getElementById('perf-count-mod');
    const elLow  = document.getElementById('perf-count-low');
    if (elHigh) elHigh.textContent = atRiskCount;
    if (elMod)  elMod.textContent  = modCount;
    if (elLow)  elLow.textContent  = performingCount;
  }

  function refreshPerformanceBadges() {
    document.querySelectorAll('.perf-cell[data-item-id]').forEach(cell => {
      const itemId = cell.dataset.itemId;
      const listing = allListings.find(l => l.itemId === itemId);
      if (!listing) return;
      const pred = predictionCache.get(itemId);
      cell.innerHTML = buildPerfBadgeHtml(listing, pred);
      const infoBtn = cell.querySelector('.perf-info-btn');
      if (infoBtn) {
        infoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openPerfModal(listing);
        });
      }
    });
  }

  async function openPerfModal(listing) {
    const modal = document.getElementById('perf-modal');
    const body  = document.getElementById('perf-modal-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div class="perf-modal-loading">
        <div class="perf-modal-spinner"></div>
        <p>Analysing listing performance…</p>
      </div>
    `;
    modal.classList.add('visible');

    try {
      const predictor = window.PerformancePredictor;
      const catStats = predictor.calculateCategoryStats(allListings, listing.sport);
      const pred = await predictor.predictPerformance(listing, catStats);
      predictionCache.set(listing.itemId, pred);
      updatePerfBadgeInRow(listing.itemId, listing, pred);
      updateWidgetCounts();
      renderPerfModalBody(body, listing, pred);
    } catch (err) {
      body.innerHTML = `<div style="padding:2rem;text-align:center;color:#f44336"><h3>❌ Prediction failed</h3><p style="margin-top:1rem;color:#ccc">${esc(err.message)}</p></div>`;
    }
  }

  function closePerfModal() {
    const modal = document.getElementById('perf-modal');
    if (modal) modal.classList.remove('visible');
  }

  function renderPerfModalBody(body, listing, pred) {
    const level = getPerfLevel(pred.saleProbability);
    const levelClass = 'prob-' + level;
    const dot = level === 'high' ? '🟢' : level === 'moderate' ? '🟡' : '🔴';
    const riskLabel = { high: 'Low Risk', moderate: 'Moderate Risk', low: 'High Risk' }[level] || '';

    const factorsHtml = pred.factors.map(f => {
      const icon = f.status === 'good' ? '✅' : f.status === 'warning' ? '⚠️' : '❌';
      const scoreVal = typeof f.score === 'number' ? f.score + '/100' : '';
      return `
        <div class="perf-factor factor-${esc(f.status)}">
          <span class="perf-factor-icon">${icon}</span>
          <div class="perf-factor-body">
            <div class="perf-factor-name">${esc(f.name)}</div>
            <div class="perf-factor-explanation">${esc(f.explanation || '')}</div>
          </div>
          ${scoreVal ? `<span class="perf-factor-score">${scoreVal}</span>` : ''}
        </div>
      `;
    }).join('');

    const recsHtml = pred.recommendations.length ? pred.recommendations.map((r, idx) => `
      <div class="perf-rec">
        <div class="perf-rec-priority">${r.priority || idx + 1}</div>
        <div class="perf-rec-body">
          <div class="perf-rec-action">${esc(r.action || '')}</div>
          <div class="perf-rec-details">${esc(r.details || '')}</div>
        </div>
        ${r.expectedImpact ? `<div class="perf-rec-impact">${esc(r.expectedImpact)}</div>` : ''}
      </div>
    `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem">No specific recommendations — listing is performing well!</p>';

    const impactSection = pred.predictedImpactWithChanges > pred.saleProbability
      ? `<div class="perf-impact-section">
          <span class="perf-impact-label">📈 Predicted probability after improvements</span>
          <span class="perf-impact-value">${pred.predictedImpactWithChanges}%</span>
        </div>`
      : '';

    // eBay push action — shown when eBay is configured
    const ebayPushSection = (typeof eBayUI !== 'undefined' && eBayConfig.isConfigured())
      ? (() => {
          const listingMap = eBaySync.getListingMap();
          const ebayItemID = listingMap[listing.itemId] || null;
          if (!ebayItemID) return '';
          const improvement = pred.predictedImpactWithChanges - pred.saleProbability;
          return `
            <div class="perf-ebay-push-section">
              <p>Current Performance: <strong>${pred.saleProbability}%</strong></p>
              ${improvement > 0 ? `<p>After Pushing Optimized Title: <strong>${pred.predictedImpactWithChanges}% (+${improvement}%)</strong></p>` : ''}
              <button class="ebay-btn ebay-btn-primary ebay-perf-push-btn" style="margin-top:8px"
                data-ebay-id="${esc(ebayItemID)}">
                📤 Push to eBay and Improve Performance
              </button>
            </div>`;
        })()
      : '';

    // TODO: future — "Apply Suggestions" button for automated improvement
    // TODO: future — historical prediction accuracy tracking
    // TODO: future — integration with Title Optimizer (show predicted impact of title changes)

    body.innerHTML = `
      <div class="perf-prob-section">
        <div class="perf-prob-title">Predicted Sale Probability</div>
        <div class="perf-prob-value ${levelClass}">${pred.saleProbability}%</div>
        <div class="perf-progress-wrap">
          <div class="perf-progress-bar ${levelClass}" style="width:${pred.saleProbability}%"></div>
        </div>
        <div class="perf-prob-subtitle">${dot} ${riskLabel} &nbsp;•&nbsp; Confidence: ${pred.confidence}%</div>
      </div>
      <div class="perf-modal-listing-title" title="${esc(listing.title)}">${esc(listing.title)}</div>
      ${pred.factors.length ? `<div class="perf-factors-section"><h3>Analysis Factors</h3>${factorsHtml}</div>` : ''}
      ${pred.recommendations.length ? `<div class="perf-recs-section" style="margin-top:16px"><h3>Recommendations</h3>${recsHtml}</div>` : ''}
      ${impactSection}
      ${ebayPushSection}
    `;
  }

  // ─── Title Optimizer ───────────────────────────────────────────────────────

  function setupTitleOptimizer() {
    const hasToken = TitleOptimizer.hasValidToken();
    const setupPanel = document.getElementById('ai-setup-panel');
    const controls = document.getElementById('ai-controls');

    if (hasToken) {
      if (setupPanel) setupPanel.style.display = 'none';
      if (controls) controls.style.display = 'block';
    }

    const saveBtn = document.getElementById('btn-save-token');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const tokenInput = document.getElementById('github-token-input');
        const token = tokenInput ? tokenInput.value.trim() : '';

        if (!token) {
          setStatus('Please enter a GitHub token', 'error');
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Validating…';

        try {
          const validation = await TitleOptimizer.validateToken(token);

          if (validation.valid) {
            TitleOptimizer.saveToken(token);
            setStatus(`Token validated for user: ${validation.user}`, 'success');
            if (setupPanel) setupPanel.style.display = 'none';
            if (controls) controls.style.display = 'block';
            if (tokenInput) tokenInput.value = '';
          } else {
            throw new Error(validation.error || 'Token validation failed');
          }
        } catch (error) {
          setStatus('Token validation failed: ' + error.message, 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Token';
        }
      });
    }

    const clearBtn = document.getElementById('btn-clear-token');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        TitleOptimizer.clearToken();
        if (setupPanel) setupPanel.style.display = 'block';
        if (controls) controls.style.display = 'none';
        const tokenInput = document.getElementById('github-token-input');
        if (tokenInput) tokenInput.value = '';
        setStatus('GitHub token cleared', 'info');
      });
    }

    const bulkBtn = document.getElementById('btn-bulk-optimize');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', runBulkOptimization);
    }

    // Modal close button
    const closeBtn = document.getElementById('btn-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeTitleOptimizer);
    }

    // Close modal on backdrop click
    const modal = document.getElementById('title-optimizer-modal');
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) closeTitleOptimizer();
      });
    }
  }

  function openTitleOptimizer(itemId) {
    const listing = allListings.find(l => l.itemId === itemId);
    if (!listing) return;

    if (!TitleOptimizer.hasValidToken()) {
      setStatus('Please save your GitHub token in the AI Title Optimizer section first', 'warning');
      const section = document.querySelector('.ai-optimizer-section');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const modal = document.getElementById('title-optimizer-modal');
    if (modal) modal.classList.add('visible');

    // Populate current title info
    setText('current-title-text', listing.title);
    const lenEl = document.getElementById('current-title-length');
    if (lenEl) lenEl.textContent = `${listing.title.length}/80`;

    // Analyze and display score
    const analysis = TitleOptimizer.analyzeTitleQuality(listing, allListings);
    renderTitleAnalysis(analysis);

    // Context performance
    setText('ctx-impressions', (listing.totalImpressions || 0).toLocaleString());
    setText('ctx-ctr', fmtPct(listing.ctr));
    setText('ctx-health', (listing.healthScore || 0) + '/100');

    // Clear old suggestions
    const suggestionsEl = document.getElementById('suggestions-list');
    if (suggestionsEl) suggestionsEl.innerHTML = '';

    // Wire up generate button
    const generateBtn = document.getElementById('btn-generate-titles');
    if (generateBtn) {
      // Clone to remove old listeners
      const fresh = generateBtn.cloneNode(true);
      generateBtn.parentNode.replaceChild(fresh, generateBtn);
      fresh.addEventListener('click', () => generateAndShowSuggestions(listing));
    }

    // Track titles analyzed count
    const analyzedEl = document.getElementById('titles-analyzed');
    if (analyzedEl) {
      analyzedEl.textContent = parseInt(analyzedEl.textContent || '0', 10) + 1;
    }
  }

  function closeTitleOptimizer() {
    const modal = document.getElementById('title-optimizer-modal');
    if (modal) modal.classList.remove('visible');
  }

  function renderTitleAnalysis(analysis) {
    const fill = document.getElementById('current-score-fill');
    if (fill) fill.style.width = `${analysis.total}%`;
    setText('current-score-value', `${analysis.total}/100`);

    const bd = analysis.breakdown;
    setText('score-keywords', `${bd.keywords}/30`);
    setText('score-length', `${bd.length}/20`);
    setText('score-power', `${bd.powerWords}/15`);
    setText('score-specificity', `${bd.specificity}/15`);
    setText('score-readability', `${bd.readability}/10`);
    setText('score-sport', `${bd.sportMatch}/10`);
  }

  async function generateAndShowSuggestions(listing) {
    const loadingEl = document.getElementById('suggestions-loading');
    const listEl = document.getElementById('suggestions-list');
    const generateBtn = document.getElementById('btn-generate-titles');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (listEl) listEl.innerHTML = '';
    if (generateBtn) generateBtn.disabled = true;

    try {
      const suggestions = await TitleOptimizer.generateOptimizedTitles(listing, allListings);
      if (loadingEl) loadingEl.classList.add('hidden');
      if (generateBtn) generateBtn.disabled = false;
      renderSuggestions(suggestions, listing);

      // Update avg improvement stat
      if (suggestions.length > 0) {
        const avgImp = Math.round(
          suggestions.reduce((s, sg) => s + sg.estimatedCTRImprovement, 0) / suggestions.length
        );
        const avgEl = document.getElementById('avg-improvement');
        if (avgEl) avgEl.textContent = `+${avgImp}%`;
      }
    } catch (err) {
      if (loadingEl) loadingEl.classList.add('hidden');
      if (generateBtn) generateBtn.disabled = false;
      setStatus('Failed to generate suggestions: ' + err.message, 'error');

      // Show user-friendly error in the suggestions panel
      if (listEl) {
        const errDiv = document.createElement('div');
        errDiv.className = 'error-message';
        errDiv.style.cssText = 'padding:2rem;text-align:center;color:#f44336;';

        const heading = document.createElement('h3');
        heading.textContent = '❌ Failed to Generate Titles';
        errDiv.appendChild(heading);

        const msg = document.createElement('p');
        msg.style.cssText = 'margin:1rem 0;color:#ccc;';
        msg.textContent = err.message;
        errDiv.appendChild(msg);

        if (err.message.toLowerCase().includes('token')) {
          const hint = document.createElement('div');
          hint.style.cssText = 'margin-top:1.5rem;padding:1rem;background:#2a2a2a;border-radius:8px;';

          const hintTitle = document.createElement('p');
          hintTitle.style.color = '#ffc107';
          hintTitle.innerHTML = '💡 <strong>Need help?</strong>';
          hint.appendChild(hintTitle);

          const steps = [
            ['Go to ', 'https://github.com/settings/tokens', 'GitHub Token Settings'],
            'Click "Generate new token (classic)"',
            'Give it a name like "ShazbotCards AI"',
            ['Select scopes: ', null, null, 'read:user', ' and ', 'user:email'],
            'Click "Generate token"',
            'Copy the token and paste it in the AI Optimizer settings',
          ];
          const ol = document.createElement('ol');
          ol.style.cssText = 'text-align:left;margin:1rem auto;max-width:500px;color:#ccc;';
          steps.forEach(step => {
            const li = document.createElement('li');
            if (typeof step === 'string') {
              li.textContent = step;
            } else if (step[1]) {
              li.textContent = step[0];
              const a = document.createElement('a');
              a.href = step[1];
              a.target = '_blank';
              a.rel = 'noopener';
              a.style.color = '#4caf50';
              a.textContent = step[2];
              li.appendChild(a);
            } else {
              li.textContent = step[0];
              const c1 = document.createElement('code');
              c1.textContent = step[3];
              li.appendChild(c1);
              li.appendChild(document.createTextNode(step[4]));
              const c2 = document.createElement('code');
              c2.textContent = step[5];
              li.appendChild(c2);
            }
            ol.appendChild(li);
          });
          hint.appendChild(ol);
          errDiv.appendChild(hint);
        }

        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn-primary';
        retryBtn.style.marginTop = '1rem';
        retryBtn.textContent = '🔄 Try Again';
        retryBtn.addEventListener('click', () => generateAndShowSuggestions(listing));
        errDiv.appendChild(retryBtn);

        listEl.innerHTML = '';
        listEl.appendChild(errDiv);
      }
    }
  }

  function setupDebugMode() {
    if (!window.location.search.includes('debug=1')) return;

    const debugSection = document.getElementById('debug-section');
    if (debugSection) debugSection.style.display = 'block';

    const debugConsole = document.getElementById('debug-console');
    if (!debugConsole) return;

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    function appendToDebug(prefix, args) {
      debugConsole.textContent += (prefix ? prefix + ': ' : '') + args.join(' ') + '\n';
      debugConsole.scrollTop = debugConsole.scrollHeight;
    }

    console.log = function (...args) {
      originalLog.apply(console, args);
      appendToDebug('', args);
    };

    console.error = function (...args) {
      originalError.apply(console, args);
      appendToDebug('ERROR', args);
    };

    console.warn = function (...args) {
      originalWarn.apply(console, args);
      appendToDebug('WARN', args);
    };

    console.info = function (...args) {
      originalInfo.apply(console, args);
      appendToDebug('INFO', args);
    };
  }

  function toggleDebugConsole() {
    const el = document.getElementById('debug-console');
    if (el) el.classList.toggle('hidden');
  }

  function setupDebugConsoleButton() {
    const btn = document.getElementById('btn-toggle-debug-console');
    if (btn) btn.addEventListener('click', toggleDebugConsole);
  }

  function renderSuggestions(suggestions, listing) {
    const listEl = document.getElementById('suggestions-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No suggestions generated. Try again.</p>';
      return;
    }

    suggestions.forEach((sugg, idx) => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';

      const improvementBadge = sugg.estimatedCTRImprovement > 0
        ? `<span class="improvement-badge">+${sugg.estimatedCTRImprovement}% CTR</span>`
        : '';

      card.innerHTML = `
        <div class="suggestion-header">
          <span class="suggestion-rank">#${idx + 1}</span>
          ${improvementBadge}
          <span class="char-count">${sugg.title.length}/80</span>
        </div>
        <div class="suggestion-title">${esc(sugg.title)}</div>
        <div class="suggestion-score">Quality Score: <strong>${sugg.qualityScore}/100</strong></div>
        <div class="suggestion-actions">
          <button class="btn-sm btn-primary btn-copy-title">📋 Copy</button>
          <button class="btn-sm btn-secondary btn-compare-title">🔍 Compare</button>
          ${typeof eBayUI !== 'undefined' && eBayConfig.isConfigured() ? '<button class="btn-sm btn-secondary btn-push-ebay">📤 Push to eBay</button>' : ''}
        </div>
      `;

      card.dataset.suggTitle = sugg.title;
      card.querySelector('.btn-copy-title').addEventListener('click', () => copyToClipboard(sugg.title));
      card.querySelector('.btn-compare-title').addEventListener('click', () => showDiff(listing.title, sugg.title, card));

      const pushBtn = card.querySelector('.btn-push-ebay');
      if (pushBtn) {
        pushBtn.addEventListener('click', () => {
          const listingMap = eBaySync.getListingMap();
          const ebayItemID = listingMap[listing.itemId] || null;
          eBayUI.openPushModal(ebayItemID || listing.itemId, listing.title, sugg.title);
        });
      }

      listEl.appendChild(card);
    });
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setStatus('Title copied to clipboard!', 'success');
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      setStatus('Title copied to clipboard!', 'success');
    } catch (e) {
      setStatus('Could not copy — please copy manually: ' + text, 'info');
    }
    ta.remove();
  }

  function showDiff(original, suggestion, card) {
    const origWords = original.split(/\s+/);
    const suggWords = suggestion.split(/\s+/);

    const diffHtml = suggWords.map(word => {
      const isNew = !origWords.some(ow => ow.toLowerCase() === word.toLowerCase());
      return isNew
        ? `<mark class="diff-new">${esc(word)}</mark>`
        : esc(word);
    }).join(' ');

    const existing = card.querySelector('.diff-view');
    if (existing) {
      existing.remove();
      return;
    }

    const diffDiv = document.createElement('div');
    diffDiv.className = 'diff-view';
    diffDiv.innerHTML = `<strong>Changes vs original:</strong><br>${diffHtml}`;
    card.querySelector('.suggestion-actions').before(diffDiv);
  }

  async function runBulkOptimization() {
    if (!TitleOptimizer.hasValidToken()) {
      setStatus('Please save your GitHub token first', 'warning');
      return;
    }

    const targetListings = allListings
      .filter(l => l.healthBadge === 'red' || l.healthBadge === 'yellow')
      .slice(0, 20);

    if (targetListings.length === 0) {
      setStatus('No listings need optimization!', 'info');
      return;
    }

    const progressBar = document.getElementById('bulk-progress-bar');
    const statusEl = document.getElementById('bulk-status');
    const progressWrapper = document.getElementById('bulk-progress');
    const bulkBtn = document.getElementById('btn-bulk-optimize');

    if (progressWrapper) progressWrapper.style.display = 'block';
    if (bulkBtn) bulkBtn.disabled = true;

    let results = [];

    try {
      results = await TitleOptimizer.optimizeBulkListings(
        targetListings,
        allListings,
        (i, total, listing) => {
          if (progressBar) progressBar.value = Math.round(((i + 1) / total) * 100);
          if (statusEl) statusEl.textContent = `Optimizing ${i + 1} of ${total}: ${truncate(listing.title, 40)}`;
        }
      );
    } catch (err) {
      setStatus('Bulk optimization stopped: ' + err.message, 'error');
    }

    if (progressWrapper) progressWrapper.style.display = 'none';
    if (bulkBtn) bulkBtn.disabled = false;

    if (results.length > 0) {
      exportOptimizedTitles(results);
      setStatus(`Optimized ${results.length} listing(s)! CSV downloaded.`, 'success');

      // Update avg improvement stat
      const avgImp = Math.round(
        results.reduce((s, r) => s + (r.improvement || 0), 0) / results.length
      );
      const avgEl = document.getElementById('avg-improvement');
      if (avgEl) avgEl.textContent = `+${avgImp}%`;
    } else {
      setStatus('No titles were optimized. Check your token and try again.', 'warning');
    }
  }

  function exportOptimizedTitles(results) {
    const headers = ['eBay Item ID', 'Current Title', 'Optimized Title', 'Est. CTR Improvement'];
    const rows = results.map(r => [
      r.itemId,
      `"${(r.oldTitle || '').replace(/"/g, '""')}"`,
      `"${(r.newTitle || '').replace(/"/g, '""')}"`,
      (r.improvement || 0) + '%',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    downloadText(csv, 'optimized-titles.csv', 'text/csv');
  }

  // ─── Connected Mode UI ────────────────────────────────────────────────────

  function applyConnectedModeUI() {
    const isConnected = !!localStorage.getItem('ebay-access-token');
    const uploadSection = document.getElementById('upload-section');
    const historyPanel = document.getElementById('history-panel');
    const modeToggleBar = document.getElementById('mode-toggle-bar');

    if (isConnected) {
      if (uploadSection) uploadSection.style.display = 'none';
      if (historyPanel) historyPanel.style.display = 'none';
      if (modeToggleBar) {
        const trendsBtn = document.getElementById('btn-mode-trends');
        const compareBtn = document.getElementById('btn-mode-compare');
        if (trendsBtn) trendsBtn.style.display = 'none';
        if (compareBtn) compareBtn.style.display = 'none';
      }
    }
  }

  function setupHeaderActions() {
    const headerActions = document.getElementById('header-actions');
    const headerSyncBtn = document.getElementById('header-sync-btn');
    const headerStatus = document.getElementById('header-connection-status');
    const isConnected = !!localStorage.getItem('ebay-access-token');

    if (isConnected && headerActions) {
      headerActions.style.display = 'flex';
      const username = localStorage.getItem('ebay-username') || '';
      if (headerStatus && username) headerStatus.textContent = `✅ ${username}`;

      if (headerSyncBtn) {
        headerSyncBtn.addEventListener('click', () => {
          if (typeof eBayUI !== 'undefined' && eBayUI.startSyncDown) {
            eBayUI.startSyncDown();
          }
        });
      }
    }
  }

  // ─── COGS Section ─────────────────────────────────────────────────────────

  function setupCOGSSection() {
    if (typeof COGS === 'undefined') return;

    const settings = COGS.load();

    // Toggle expand/collapse
    const toggleBtn = document.getElementById('btn-cogs-toggle');
    const cogsBody  = document.getElementById('cogs-body');
    const cogsHeader = document.getElementById('cogs-header');

    function toggleCOGS() {
      const isOpen = cogsBody.style.display !== 'none';
      cogsBody.style.display = isOpen ? 'none' : 'block';
      if (toggleBtn) toggleBtn.textContent = isOpen ? '▼ Expand' : '▲ Collapse';
    }
    if (toggleBtn) toggleBtn.addEventListener('click', e => { e.stopPropagation(); toggleCOGS(); });
    if (cogsHeader) cogsHeader.addEventListener('click', toggleCOGS);

    // Render materials table
    renderCOGSMaterials(settings);

    // Render previews
    renderCOGSPreviews(settings);

    // Add material button
    const addBtn = document.getElementById('btn-add-material');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const s = COGS.load();
        s.materials.push({
          id: 'mat_' + Date.now(),
          name: 'New Material',
          packCount: 100,
          packPrice: 10.00,
          unitCost: 0.10,
          includePerSale: false,
        });
        COGS.save(s);
        renderCOGSMaterials(s);
        renderCOGSPreviews(s);
        renderCOGSKPIs();
      });
    }
  }

  function renderCOGSMaterials(settings) {
    const tbody = document.getElementById('cogs-materials-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    settings.materials.forEach((mat, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="cogs-input" type="text" value="${esc(mat.name)}" data-field="name" data-idx="${idx}" /></td>
        <td><input class="cogs-input cogs-num" type="number" min="1" value="${mat.packCount}" data-field="packCount" data-idx="${idx}" /></td>
        <td><input class="cogs-input cogs-num" type="number" min="0" step="0.01" value="${mat.packPrice.toFixed(2)}" data-field="packPrice" data-idx="${idx}" /></td>
        <td class="cogs-unit-cost" id="cogs-unit-${idx}">$${mat.unitCost.toFixed(4)}</td>
        <td><input type="checkbox" class="cogs-checkbox" data-field="includePerSale" data-idx="${idx}" ${mat.includePerSale ? 'checked' : ''} /></td>
        <td><button class="btn-sm btn-danger cogs-delete-btn" data-idx="${idx}">🗑</button></td>
      `;
      tbody.appendChild(tr);
    });

    // Wire up inputs
    tbody.querySelectorAll('.cogs-input, .cogs-checkbox').forEach(el => {
      el.addEventListener('change', () => {
        const s = COGS.load();
        const idx = parseInt(el.dataset.idx, 10);
        const field = el.dataset.field;
        if (el.type === 'checkbox') {
          s.materials[idx][field] = el.checked;
        } else if (field === 'packCount' || field === 'packPrice') {
          s.materials[idx][field] = parseFloat(el.value) || 0;
          // Recalculate unit cost
          const m = s.materials[idx];
          m.unitCost = m.packCount > 0 ? m.packPrice / m.packCount : 0;
          const unitEl = document.getElementById('cogs-unit-' + idx);
          if (unitEl) unitEl.textContent = '$' + m.unitCost.toFixed(4);
        } else {
          s.materials[idx][field] = el.value;
        }
        COGS.save(s);
        renderCOGSPreviews(s);
        renderCOGSKPIs();
      });
    });

    // Wire up delete buttons
    tbody.querySelectorAll('.cogs-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = COGS.load();
        const idx = parseInt(btn.dataset.idx, 10);
        s.materials.splice(idx, 1);
        COGS.save(s);
        renderCOGSMaterials(s);
        renderCOGSPreviews(s);
        renderCOGSKPIs();
      });
    });
  }

  function renderCOGSPreviews(settings) {
    // ESE preview using $5.00 example card
    const eseExample = COGS.calcListing({ price: 5.00, quantity: 1 }, settings);
    const eseEl = document.getElementById('cogs-preview-ese');
    if (eseEl) {
      eseEl.innerHTML = `
        <div class="cogs-line">Sale Price: <strong>$5.00</strong></div>
        <div class="cogs-line cogs-minus">eBay Fee (${(settings.ebayFeeRate*100).toFixed(2)}%): −$${eseExample.ebayFee.toFixed(2)}</div>
        <div class="cogs-line cogs-minus">Materials: −$${eseExample.materialCost.toFixed(2)}</div>
        <div class="cogs-line cogs-minus">Shipping (ESE): −$${eseExample.shippingCost.toFixed(2)}</div>
        <div class="cogs-line cogs-total ${eseExample.netProfit >= 0 ? 'cogs-profit' : 'cogs-loss'}">
          Net Profit: <strong>$${eseExample.netProfit.toFixed(2)}</strong> (${eseExample.margin.toFixed(1)}%)
        </div>
      `;
    }

    // GA preview using $25.00 example card
    const gaExample = COGS.calcListing({ price: 25.00, quantity: 1, shippingOverride: 'ga' }, settings);
    const gaEl = document.getElementById('cogs-preview-ga');
    if (gaEl) {
      gaEl.innerHTML = `
        <div class="cogs-line">Sale Price: <strong>$25.00</strong></div>
        <div class="cogs-line cogs-minus">eBay Fee (${(settings.ebayFeeRate*100).toFixed(2)}%): −$${gaExample.ebayFee.toFixed(2)}</div>
        <div class="cogs-line cogs-minus">Materials: −$${gaExample.materialCost.toFixed(2)}</div>
        <div class="cogs-line cogs-minus">Shipping (GA): −$${gaExample.shippingCost.toFixed(2)}</div>
        <div class="cogs-line cogs-total ${gaExample.netProfit >= 0 ? 'cogs-profit' : 'cogs-loss'}">
          Net Profit: <strong>$${gaExample.netProfit.toFixed(2)}</strong> (${gaExample.margin.toFixed(1)}%)
        </div>
      `;
    }
  }

  // ─── Live eBay Analytics ───────────────────────────────────────────────────

  function setupLiveAnalytics() {
    if (typeof eBayAnalytics === 'undefined') return;

    const liveSection = document.getElementById('live-analytics-section');
    if (!liveSection) return;

    // Show panel only when OAuth connected
    if (localStorage.getItem('ebay-access-token')) {
      liveSection.style.display = 'block';
    }

    // Listen for eBay sync completion — feed synced listings into allListings
    window.addEventListener('ebaySyncComplete', (e) => {
      applyConnectedModeUI();
      const { items } = e.detail;
      if (!items || !items.length) return;

      // Map synced eBay Trading API items to the ShazbotCards listing shape
      const mapped = items.map(item => ({
        itemId:                    item.itemId   || '',
        title:                    item.title    || '',
        totalImpressions:         0,
        totalPageViews:           0,
        ctr:                      0,
        quantitySold:             item.quantitySold || 0,
        top20Pct:                 0,
        isPromoted:               false,
        promotedStatus:           'Organic',
        sport:                    Analyzer.detectSport(item.title || ''),
        startDate:                null,
        quantityAvailable:        item.quantity || null,
        totalImpressionsPrev:     0,
        totalPromotedImpressions: 0,
        totalOrganicImpressions:  0,
        nonSearchOrganicChangePct: null,
        price:                    item.price    || 0,
        watchers:                 item.watchers || 0,
        listingType:              item.listingType || '',
        listingUrl:               item.listingUrl || `https://www.ebay.com/itm/${item.itemId}`,
        _source:                  'ebay-sync',
      }));

      // If we already have analytics data loaded, preserve it
      const existingAnalyticsMap = {};
      if (allListings.length > 0) {
        allListings.forEach(l => {
          if (l.totalImpressions > 0 || l.ctr > 0 || l.totalPageViews > 0 || l.quantitySold > 0 || l.top20Pct > 0) {
            existingAnalyticsMap[l.itemId] = l;
          }
        });
      }

      const withAnalytics = mapped.map(l => {
        const existing = existingAnalyticsMap[l.itemId];
        if (!existing) return l;
        return {
          ...l,
          totalImpressions: existing.totalImpressions || 0,
          totalPageViews:   existing.totalPageViews   || 0,
          ctr:              existing.ctr              || 0,
          top20Pct:         existing.top20Pct         || 0,
        };
      });

      // Enrich with health scores using the existing Analyzer
      const enriched = (typeof Analyzer !== 'undefined' && Analyzer.enrichWithScores)
        ? Analyzer.enrichWithScores(withAnalytics)
        : withAnalytics;

      allListings = enriched;
      filteredListings = [...allListings];

      try {
        renderAll();
      } catch (err) {
        console.error('renderAll after eBay sync error:', err);
      }

      setStatus(`Loaded ${enriched.length} live listings from eBay sync`, 'success');
    });

    // Period picker
    let selectedPeriod = 'LAST_7_DAYS';
    liveSection.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        liveSection.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPeriod = btn.dataset.period;
      });
    });

    // Load Live Data button
    const loadBtn = document.getElementById('btn-load-live-data');
    const statusEl = document.getElementById('live-analytics-status');
    const statusText = document.getElementById('live-analytics-status-text');

    if (!loadBtn) return;

    loadBtn.addEventListener('click', async () => {
      loadBtn.disabled = true;
      if (statusEl) statusEl.style.display = 'block';
      if (statusText) statusText.textContent = 'Connecting to eBay Analytics…';

      try {
        const result = await eBayAnalytics.fetchTraffic(selectedPeriod, ({ status }) => {
          if (statusText) statusText.textContent = status;
        });

        // Also use last synced full items if eBayUI has them
        const fullSyncedItems = (typeof eBayUI !== 'undefined' && eBayUI.getLastSyncedItems)
          ? eBayUI.getLastSyncedItems()
          : [];

        const listings = eBayAnalytics.mapToListingShape(result.listings, fullSyncedItems);

        if (!listings.length) {
          // Analytics returned empty — eBay data lag is common (24-72h delay)
          // Don't replace allListings — just show a helpful message
          if (statusText) statusText.textContent = '⚠️ No analytics data yet for this period (eBay has a 24-72h data lag). Your listings are loaded — check back tomorrow for impressions/CTR data.';
          loadBtn.disabled = false;
          return;
        }

        // Merge analytics data ON TOP of existing allListings (which has titles from sync)
        // Analytics data wins for impressions/CTR/sales fields
        // Sync data wins for title/price/quantity fields
        const analyticsMap = {};
        listings.forEach(l => { analyticsMap[l.itemId] = l; });

        let merged;
        const hasSyncedListings = allListings.length > 0 && allListings.some(l => l._source === 'ebay-sync');
        if (hasSyncedListings) {
          // We have synced listings — merge analytics data into them
          merged = allListings.map(syncedListing => {
            const analytics = analyticsMap[syncedListing.itemId];
            if (!analytics) return syncedListing; // no analytics for this listing yet
            return {
              ...syncedListing,
              // Override with real analytics data
              totalImpressions:         analytics.totalImpressions || 0,
              totalPageViews:           analytics.totalPageViews   || 0,
              ctr:                      analytics.ctr              || 0,
              quantitySold:             analytics.quantitySold     || 0,
              top20Pct:                 analytics.top20Pct         || 0,
            };
          });
          // Also add any analytics listings not in the synced set
          const mergedIds = new Set(merged.map(m => m.itemId));
          listings.forEach(l => {
            if (!mergedIds.has(l.itemId)) {
              merged.push(l);
            }
          });
        } else {
          // No synced listings — use analytics data as-is
          merged = listings;
        }

        // Enrich with health scores
        const enriched = (typeof Analyzer !== 'undefined' && Analyzer.enrichWithScores)
          ? Analyzer.enrichWithScores(merged)
          : merged;

        allListings = enriched;
        filteredListings = [...allListings];
        renderAll();

        const periodLabels = { TODAY: 'Today', LAST_7_DAYS: 'Last 7 Days', LAST_30_DAYS: 'Last 30 Days', LAST_90_DAYS: 'Last 90 Days' };
        if (statusText) statusText.textContent = `✅ Loaded ${enriched.length} listings — ${periodLabels[selectedPeriod]}`;
        setStatus(`Live data loaded: ${enriched.length} listings (${periodLabels[selectedPeriod]})`, 'success');
        const lastLoadedEl = document.getElementById('live-analytics-last-loaded');
        if (lastLoadedEl) {
          const now = new Date();
          lastLoadedEl.textContent = `Last loaded: ${now.toLocaleTimeString()}`;
        }

      } catch (err) {
        if (statusText) statusText.textContent = `❌ ${err.message}`;
        setStatus(`Live data failed: ${err.message}`, 'error');
      } finally {
        loadBtn.disabled = false;
      }
    });
  }

})();
