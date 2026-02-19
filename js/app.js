/**
 * app.js — Main ShazbotCards Analytics application logic
 * Orchestrates CSV loading, analysis, and DOM rendering.
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

  // ─── Boot ──────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    setupDropzone();
    setupUploadButton();
    setupSearch();
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
      .then(text => processCSV(text, 'Demo: Feb 19 2026 Traffic Report'))
      .catch(err => setStatus('Could not load demo data. Upload your own CSV to begin.', 'warning'));
  }

  function processCSV(text, label) {
    try {
      const raw = CSVParser.parse(text);
      if (!raw.length) throw new Error('No listings found in CSV');
      allListings = Analyzer.enrichWithScores(raw);
      filteredListings = [...allListings];
      setStatus(`Loaded ${allListings.length} listings — ${label}`, 'success');
      renderAll();
    } catch (err) {
      setStatus('Error parsing CSV: ' + err.message, 'error');
      console.error(err);
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
    reader.onload = e => processCSV(e.target.result, file.name);
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

  // ─── Render All ────────────────────────────────────────────────────────────

  function renderAll() {
    renderKPIs();
    renderPriorityTable();
    renderPromotedSection();
    renderTrendingSection();
    renderSportSection();
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
        // Don't trigger expand if clicking the eBay link
        if (e.target.tagName === 'A') return;
        toggleDetailRow(tr, l);
      });

      tbody.appendChild(tr);
    });

    setupTableSort();
  }

  function toggleDetailRow(tr, listing) {
    // Close any existing detail row
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

  // ─── Utilities ─────────────────────────────────────────────────────────────

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '-';
  }

  function fmtPct(val) {
    if (val === null || val === undefined) return '-';
    return val.toFixed(1) + '%';
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

})();
