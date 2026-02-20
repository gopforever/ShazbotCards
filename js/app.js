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
  let activeDetailRow = null;
  let activeReportId = null;   // id of the report currently being viewed
  let currentMode = 'current'; // 'current' | 'trends' | 'compare'
  let compareR1Id = null;
  let compareR2Id = null;

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
    renderHistorySidebar();
    loadDefaultCSV();
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
    filteredListings = allListings.filter(l =>
      !searchQuery || l.title.toLowerCase().includes(searchQuery) || l.itemId.includes(searchQuery)
    );
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
    if (deleteAllBtn) deleteAllBtn.style.display = reports.length ? '' : 'none';
    if (exportBtn) exportBtn.style.display = reports.length ? '' : 'none';
    if (modeBar) modeBar.style.display = reports.length >= 2 ? '' : 'none';

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

    mainSections.forEach(el => el.style.display = mode === 'current' ? '' : 'none');
    if (currentView) currentView.style.display = mode === 'trends' ? '' : 'none';
    if (compareView) compareView.style.display = mode === 'compare' ? '' : 'none';

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
      exportBtn.style.display = '';
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
    renderPriorityTable();
    renderPromotedSection();
    renderTrendingSection();
    renderSportSection();
    renderKeywordAnalyzer();
    renderFullTable();
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

    sorted.forEach(l => {
      const scoreColor = l.healthBadge === 'green' ? '#4caf50' : l.healthBadge === 'yellow' ? '#ffc107' : '#f44336';
      const tr = document.createElement('tr');
      tr.className = 'listing-row';
      tr.dataset.itemId = l.itemId;

      tr.innerHTML = `
        <td class="title-cell">
          <a href="https://www.ebay.com/itm/${esc(l.itemId)}" target="_blank" rel="noopener" class="ebay-link" title="${esc(l.title)}">${esc(truncate(l.title, 50))}</a>
        </td>
        <td>${(l.totalImpressions || 0).toLocaleString()}</td>
        <td>${fmtPct(l.ctr)}</td>
        <td>${l.totalPageViews || 0}</td>
        <td>${l.quantitySold || 0}</td>
        <td><span class="promo-badge ${l.isPromoted ? 'promo-yes' : 'promo-no'}">${l.isPromoted ? '✓ Promoted' : 'Organic'}</span></td>
        <td>${fmtPct(l.top20Pct)}</td>
        <td><span class="health-score" style="color:${scoreColor}">${l.healthScore ?? '-'}</span></td>
        <td><span class="sport-badge sport-${(l.sport || 'other').toLowerCase()}">${esc(l.sport || '?')}</span></td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        toggleDetailRow(tr, l);
      });

      tbody.appendChild(tr);
    });

    setupTableSort();
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
      <td colspan="9">
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
            <button class="btn-sm btn-primary" onclick="openTitleOptimizer('${esc(listing.itemId)}')">🤖 Optimize Title</button>
          </div>
        </div>
      </td>
    `;
    tr.after(detailTr);
  }

  function sortListings(listings) {
    return [...listings].sort((a, b) => {
      let va = a[sortColumn];
      let vb = b[sortColumn];
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

  // ─── Keyword Analyzer ─────────────────────────────────────────────────────

  function renderKeywordAnalyzer() {
    if (!allListings.length) return;

    const keywordData = KeywordAnalyzer.analyzeKeywords(allListings);
    const trends = KeywordAnalyzer.getKeywordTrends(keywordData);

    // KPI cards
    setText('total-unique-keywords', keywordData.length);
    const totalAppearances = keywordData.reduce((sum, kw) => sum + kw.appearances, 0);
    setText('avg-keywords-per-listing', allListings.length > 0
      ? (totalAppearances / allListings.length).toFixed(1)
      : '-');

    if (keywordData.length > 0) {
      setText('top-keyword-name', keywordData[0].keyword);
      setText('top-keyword-impressions', keywordData[0].totalImpressions.toLocaleString());
    }

    renderKeywordsTable(keywordData);
    renderKeywordTrending(trends);
    renderKeywordOpportunities(keywordData);
    setupKeywordTabs();
    setupKeywordSearch(keywordData);
  }

  function getHealthClass(score) {
    if (score >= 60) return 'badge-good';
    if (score >= 30) return 'badge-medium';
    return 'badge-low';
  }

  function renderKeywordsTable(keywords) {
    const tbody = document.getElementById('keywords-table-body');
    if (!tbody) return;

    tbody.innerHTML = keywords.map(kw => `
      <tr class="keyword-row" data-keyword="${esc(kw.keyword)}">
        <td class="keyword-name">${esc(kw.keyword)}</td>
        <td>${kw.appearances}</td>
        <td>${kw.totalImpressions.toLocaleString()}</td>
        <td>${kw.avgImpressions.toFixed(0)}</td>
        <td>${kw.avgCTR.toFixed(2)}%</td>
        <td>${kw.totalSold}</td>
        <td>${kw.conversionRate !== null ? kw.conversionRate.toFixed(2) + '%' : '-'}</td>
        <td><span class="badge ${getHealthClass(kw.avgHealthScore)}">${kw.avgHealthScore.toFixed(0)}</span></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.keyword-row').forEach(row => {
      row.addEventListener('click', () => filterListingsByKeyword(row.dataset.keyword));
    });

    setupKeywordTableSort(keywords);
  }

  function renderKeywordTrending(trends) {
    const trendingUp = trends.filter(kw => kw.trendDirection === 'up').slice(0, 10);
    const trendingDown = trends.filter(kw => kw.trendDirection === 'down').slice(0, 10);

    const upList = document.getElementById('kw-trending-up-list');
    const downList = document.getElementById('kw-trending-down-list');

    if (upList) {
      upList.innerHTML = trendingUp.length ? trendingUp.map(kw => `
        <div class="trend-card trend-up">
          <div class="trend-keyword">${esc(kw.keyword)}</div>
          <div class="trend-change">+${kw.changePercent.toFixed(1)}%</div>
          <div class="trend-stats">${kw.totalImpressions.toLocaleString()} impressions</div>
        </div>
      `).join('') : '<p class="empty-state">No trending data available</p>';
    }

    if (downList) {
      downList.innerHTML = trendingDown.length ? trendingDown.map(kw => `
        <div class="trend-card trend-down">
          <div class="trend-keyword">${esc(kw.keyword)}</div>
          <div class="trend-change">${kw.changePercent.toFixed(1)}%</div>
          <div class="trend-stats">${kw.totalImpressions.toLocaleString()} impressions</div>
        </div>
      `).join('') : '<p class="empty-state">No trending data available</p>';
    }
  }

  function renderKeywordOpportunities(keywords) {
    const opportunities = keywords
      .filter(kw => kw.appearances >= 2 && kw.appearances <= 5 && kw.avgCTR > 1.0)
      .sort((a, b) => b.avgCTR - a.avgCTR)
      .slice(0, 10);

    const oppList = document.getElementById('opportunities-list');
    if (!oppList) return;

    oppList.innerHTML = opportunities.length ? opportunities.map(kw => `
      <div class="opportunity-card">
        <div class="opp-keyword">${esc(kw.keyword)}</div>
        <div class="opp-stats">
          <span class="stat-item">Used in ${kw.appearances} listings</span>
          <span class="stat-item">${kw.avgCTR.toFixed(2)}% CTR</span>
          <span class="stat-item">${kw.avgImpressions.toFixed(0)} avg impressions</span>
        </div>
        <div class="opp-suggestion">💡 Consider adding to more listings</div>
      </div>
    `).join('') : '<p class="empty-state">No opportunities found</p>';
  }

  function filterListingsByKeyword(keyword) {
    searchQuery = keyword;
    const input = document.getElementById('searchInput');
    if (input) input.value = keyword;
    applyFilters();
    const table = document.getElementById('full-table');
    if (table) table.scrollIntoView({ behavior: 'smooth' });
  }

  function setupKeywordTabs() {
    document.querySelectorAll('.keyword-tabs .tab-btn').forEach(btn => {
      // Remove old listeners by replacing with clone
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', () => {
        const tabId = fresh.dataset.tab;
        document.querySelectorAll('.keyword-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.keyword-section .tab-content').forEach(tc => tc.classList.remove('active'));
        fresh.classList.add('active');
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
      });
    });
  }

  function setupKeywordSearch(keywords) {
    const input = document.getElementById('keyword-search');
    if (!input) return;
    const fresh = input.cloneNode(true);
    input.parentNode.replaceChild(fresh, input);
    fresh.addEventListener('input', () => {
      const q = fresh.value.toLowerCase().trim();
      const filtered = q ? keywords.filter(kw => kw.keyword.includes(q)) : keywords;
      renderKeywordsTable(filtered);
    });
  }

  function setupKeywordTableSort(keywords) {
    let kwSortCol = 'totalImpressions';
    let kwSortDir = 'desc';

    document.querySelectorAll('#keywords-table th[data-sort]').forEach(th => {
      const fresh = th.cloneNode(true);
      th.parentNode.replaceChild(fresh, th);
      fresh.style.cursor = 'pointer';
      fresh.addEventListener('click', () => {
        const col = fresh.dataset.sort;
        if (kwSortCol === col) {
          kwSortDir = kwSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          kwSortCol = col;
          kwSortDir = col === 'keyword' ? 'asc' : 'desc';
        }
        document.querySelectorAll('#keywords-table th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        fresh.classList.add(kwSortDir === 'asc' ? 'sort-asc' : 'sort-desc');

        const sorted = [...keywords].sort((a, b) => {
          let va = a[col];
          let vb = b[col];
          // Null/undefined always sorts to the end, regardless of direction
          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;
          if (typeof va === 'string') va = va.toLowerCase();
          if (typeof vb === 'string') vb = vb.toLowerCase();
          if (va < vb) return kwSortDir === 'asc' ? -1 : 1;
          if (va > vb) return kwSortDir === 'asc' ? 1 : -1;
          return 0;
        });
        renderKeywordsTable(sorted);
      });
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

  // ─── Title Optimizer ───────────────────────────────────────────────────────

  // Expose openTitleOptimizer globally for inline onclick handlers
  window.openTitleOptimizer = openTitleOptimizer;

  function setupTitleOptimizer() {
    const hasToken = TitleOptimizer.hasValidToken();
    const setupPanel = document.getElementById('ai-setup-panel');
    const controls = document.getElementById('ai-controls');

    if (hasToken) {
      if (setupPanel) setupPanel.style.display = 'none';
      if (controls) controls.style.display = '';
    }

    const saveBtn = document.getElementById('btn-save-token');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const tokenInput = document.getElementById('github-token-input');
        const token = tokenInput ? tokenInput.value : '';
        if (TitleOptimizer.saveToken(token)) {
          setStatus('GitHub token saved successfully', 'success');
          if (setupPanel) setupPanel.style.display = 'none';
          if (controls) controls.style.display = '';
        } else {
          setStatus('Invalid token — must be at least 10 characters', 'error');
        }
      });
    }

    const clearBtn = document.getElementById('btn-clear-token');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        TitleOptimizer.clearToken();
        if (setupPanel) setupPanel.style.display = '';
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
    if (modal) modal.style.display = 'flex';

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
    if (modal) modal.style.display = 'none';
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

    if (loadingEl) loadingEl.style.display = 'block';
    if (listEl) listEl.innerHTML = '';
    if (generateBtn) generateBtn.disabled = true;

    try {
      const suggestions = await TitleOptimizer.generateOptimizedTitles(listing, allListings);
      if (loadingEl) loadingEl.style.display = 'none';
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
      if (loadingEl) loadingEl.style.display = 'none';
      if (generateBtn) generateBtn.disabled = false;
      setStatus('Failed to generate suggestions: ' + err.message, 'error');
    }
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
        </div>
      `;

      card.querySelector('.btn-copy-title').addEventListener('click', () => copyToClipboard(sugg.title));
      card.querySelector('.btn-compare-title').addEventListener('click', () => showDiff(listing.title, sugg.title));

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

  function showDiff(original, suggestion) {
    const origWords = original.split(/\s+/);
    const suggWords = suggestion.split(/\s+/);

    const diffHtml = suggWords.map(word => {
      const isNew = !origWords.some(ow => ow.toLowerCase() === word.toLowerCase());
      return isNew
        ? `<mark class="diff-new">${esc(word)}</mark>`
        : esc(word);
    }).join(' ');

    const listEl = document.getElementById('suggestions-list');
    if (!listEl) return;

    // Find the card containing this suggestion and show diff inline
    const cards = listEl.querySelectorAll('.suggestion-card');
    cards.forEach(card => {
      const titleEl = card.querySelector('.suggestion-title');
      if (titleEl && titleEl.textContent.trim() === suggestion) {
        const existing = card.querySelector('.diff-view');
        if (existing) {
          existing.remove();
        } else {
          const diffDiv = document.createElement('div');
          diffDiv.className = 'diff-view';
          diffDiv.innerHTML = `<strong>Changes vs original:</strong><br>${diffHtml}`;
          card.querySelector('.suggestion-actions').before(diffDiv);
        }
      }
    });
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

})();
