/**
 * ebayUI.js — UI components for eBay integration in ShazbotCards
 * Renders the config panel, sync controls, listing comparison view,
 * push-confirmation modal, and bulk operations panel.
 *
 * TODO (future): Analytics integration — show revenue impact after pushing changes.
 * TODO (future): Cross-posting to other platforms (Whatnot, COMC).
 */

const eBayUI = (() => {
  'use strict';

  // ─── Toast notifications ──────────────────────────────────────────────────

  let _toastTimer = null;

  function showToast(message, type = 'info', duration = 4000) {
    let toast = document.getElementById('ebay-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ebay-toast';
      toast.className = 'ebay-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }

    clearTimeout(_toastTimer);
    toast.textContent = message;
    toast.className = `ebay-toast ebay-toast-${type} ebay-toast-visible`;

    _toastTimer = setTimeout(() => {
      toast.classList.remove('ebay-toast-visible');
    }, duration);
  }

  // ─── Config panel (dashboard widget) ─────────────────────────────────────

  /**
   * Inject the eBay Integration config panel into the page.
   * Inserts before the AI Title Optimizer section.
   */
  function injectConfigPanel() {
    if (document.getElementById('ebay-config-panel')) return; // already injected

    const panel = document.createElement('section');
    panel.className = 'dash-card ebay-config-panel';
    panel.id = 'ebay-config-panel';
    panel.setAttribute('aria-label', 'eBay Integration');
    panel.innerHTML = _buildConfigPanelHTML();

    // Insert before the AI Optimizer section
    const aiSection = document.querySelector('.ai-optimizer-section');
    if (aiSection) {
      aiSection.parentNode.insertBefore(panel, aiSection);
    } else {
      document.querySelector('main')?.appendChild(panel);
    }

    _bindConfigPanelEvents();
    _refreshConfigPanelState();

    // Delegated listener for comparison widget push buttons (inserted dynamically into detail rows)
    document.addEventListener('click', e => {
      const btn = e.target.closest('.ebay-push-comparison-btn');
      if (btn) {
        const ebayItemID = btn.dataset.ebayId || null;
        const oldTitle   = btn.dataset.oldTitle || null;
        const newTitle   = btn.dataset.newTitle || null;
        openPushModal(ebayItemID, oldTitle, newTitle || null);
        return;
      }
      // Performance modal push button
      const perfBtn = e.target.closest('.ebay-perf-push-btn');
      if (perfBtn) {
        const ebayItemID = perfBtn.dataset.ebayId || null;
        openPushModal(ebayItemID, null, null);
      }
    });
  }

  function _buildConfigPanelHTML() {
    return `
<h2 class="section-title"><span class="icon">🔌</span> eBay Integration</h2>

<div class="ebay-status-row" id="ebay-status-row">
  <span class="ebay-status-indicator" id="ebay-status-indicator">⚙️ Not configured</span>
  <span class="ebay-account-label" id="ebay-account-label"></span>
  <span class="ebay-expiry-label" id="ebay-expiry-label"></span>
</div>

<div class="ebay-action-row">
  <button class="ebay-btn ebay-btn-primary" id="ebay-sync-btn" disabled>🔄 Sync from eBay</button>
  <button class="ebay-btn ebay-btn-secondary" id="ebay-settings-btn">⚙️ Settings</button>
</div>

<div class="ebay-sync-stats" id="ebay-sync-stats">
  <span>Active Listings: <strong id="ebay-listing-count">—</strong></span>
  <span>Last Sync: <strong id="last-sync-time">Never</strong></span>
  <span>Pending: <strong id="pending-updates">0</strong></span>
</div>

<div class="ebay-sync-progress" id="ebay-sync-progress" style="display:none">
  <div class="ebay-progress-bar-wrap">
    <div class="ebay-progress-bar" id="ebay-progress-bar"></div>
  </div>
  <span class="ebay-progress-text" id="ebay-progress-text">Syncing…</span>
</div>

<!-- Bulk push panel — populated after sync -->
<div id="ebay-bulk-panel" style="display:none">
  <div class="ebay-bulk-actions">
    <p>Optimized titles ready to push: <strong id="ebay-bulk-count">0</strong></p>
    <div class="ebay-bulk-options">
      <label><input type="checkbox" id="ebay-bulk-titles" checked> Update titles</label>
    </div>
    <button class="ebay-btn ebay-btn-primary" id="ebay-bulk-push-btn">📤 Push All Updates to eBay</button>
    <div class="ebay-bulk-progress" id="ebay-bulk-progress" style="display:none">
      <div class="ebay-progress-bar-wrap">
        <div class="ebay-progress-bar" id="ebay-bulk-progress-bar"></div>
      </div>
      <span id="ebay-bulk-status"></span>
    </div>
  </div>
</div>`;
  }

  function _bindConfigPanelEvents() {
    document.getElementById('ebay-settings-btn')?.addEventListener('click', () => {
      eBaySettings.open();
    });

    document.getElementById('ebay-sync-btn')?.addEventListener('click', startSyncDown);

    document.getElementById('ebay-bulk-push-btn')?.addEventListener('click', startBulkPush);
  }

  function _refreshConfigPanelState() {
    const configured = eBayConfig.isConfigured();
    const cfg = eBayConfig.getConfig();
    const syncStatus = eBaySync.getSyncStatus();

    // Status indicator
    const indicator = document.getElementById('ebay-status-indicator');
    const accountLabel = document.getElementById('ebay-account-label');
    const expiryLabel = document.getElementById('ebay-expiry-label');

    if (configured) {
      const tokenValid = eBayConfig.isTokenValid();
      indicator.textContent = tokenValid ? '✅ Connected' : '⚠️ Token Expired';
      indicator.className = `ebay-status-indicator ${tokenValid ? 'ebay-connected' : 'ebay-expired'}`;
      accountLabel.textContent = cfg.username ? `Account: ${cfg.username}` : '';
      expiryLabel.textContent = cfg.tokenExpiry ? `Token expires: ${eBayConfig.getTokenExpiryLabel()}` : '';
    } else {
      indicator.textContent = '⚙️ Not configured';
      indicator.className = 'ebay-status-indicator ebay-unconfigured';
      accountLabel.textContent = '';
      expiryLabel.textContent = '';
    }

    // Sync button — enabled when manually configured OR connected via OAuth
    const syncBtn = document.getElementById('ebay-sync-btn');
    if (syncBtn) {
      const oauthConnected = !!localStorage.getItem('ebay-access-token');
      syncBtn.disabled = !configured && !oauthConnected;
    }

    // Stats
    document.getElementById('ebay-listing-count').textContent =
      syncStatus.listingCount > 0 ? syncStatus.listingCount : '—';
    document.getElementById('last-sync-time').textContent = eBaySync.getLastSyncLabel();
    document.getElementById('pending-updates').textContent = syncStatus.pendingUpdates || 0;
  }

  /** Called by ebaySettings.js after saving */
  function refreshConfigPanel() {
    _refreshConfigPanelState();
    eBayAPIFactory.reset();
  }

  // ─── Sync down ────────────────────────────────────────────────────────────

  // eBay items fetched in the last sync (in-memory)
  let _lastSyncedItems = [];

  async function startSyncDown() {
    const syncBtn = document.getElementById('ebay-sync-btn');
    const progress = document.getElementById('ebay-sync-progress');
    const bar = document.getElementById('ebay-progress-bar');
    const text = document.getElementById('ebay-progress-text');

    if (syncBtn) syncBtn.disabled = true;
    if (progress) progress.style.display = 'flex';
    if (bar) bar.style.width = '5%';
    if (text) text.textContent = 'Connecting to eBay…';

    try {
      const result = await eBaySync.syncDown(({ page, totalPages }) => {
        const pct = totalPages > 1 ? Math.round((page / totalPages) * 90) + 5 : 50;
        if (bar) bar.style.width = `${pct}%`;
        if (text) text.textContent = `Fetching page ${page} of ${totalPages}…`;
      });

      if (bar) bar.style.width = '100%';
      if (text) text.textContent = `✅ Synced ${result.count} listings`;

      _lastSyncedItems = result.items;

      // Notify app.js so it can feed synced items into allListings → renderAll()
      window.dispatchEvent(new CustomEvent('ebaySyncComplete', {
        detail: { items: result.items, count: result.count }
      }));

      _refreshConfigPanelState();
      showToast(`✅ Synced ${result.count} listings from eBay`, 'success');

      // Expose synced items for the table
      _decorateListingTable(result.items);

    } catch (err) {
      if (text) text.textContent = `❌ Sync failed: ${err.message}`;
      showToast(`❌ Sync failed: ${err.message}`, 'error', 6000);
    } finally {
      if (syncBtn) syncBtn.disabled = false;
      setTimeout(() => {
        if (progress) progress.style.display = 'none';
        if (bar) bar.style.width = '0%';
      }, 3000);
    }
  }

  // ─── Listing table decoration ──────────────────────────────────────────────

  /**
   * After a sync, add eBay status columns to the existing listing table rows.
   * @param {object[]} ebayItems  Mapped eBay listings from syncDown()
   */
  function _decorateListingTable(ebayItems) {
    // Build a lookup by itemId
    const ebayMap = {};
    ebayItems.forEach(item => { ebayMap[item.itemId] = item; });

    // Ensure header has eBay columns (add if not present)
    const thead = document.querySelector('#full-table thead tr');
    if (thead && !thead.querySelector('[data-col="ebayStatus"]')) {
      const cols = [
        { col: 'ebayStatus', label: 'eBay Status' },
        { col: 'ebayItemId', label: 'eBay Item ID' },
        { col: 'ebayActions', label: 'eBay Actions' },
      ];
      cols.forEach(({ col, label }) => {
        const th = document.createElement('th');
        th.setAttribute('data-col', col);
        th.textContent = label;
        thead.appendChild(th);
      });
    }

    // Update existing tbody rows
    const rows = document.querySelectorAll('#full-tbody tr[data-item-id]');
    rows.forEach(row => {
      const itemId = row.getAttribute('data-item-id');
      const ebayItem = ebayMap[itemId];

      // Remove old eBay cells
      row.querySelectorAll('.ebay-cell').forEach(c => c.remove());

      const statusCell = document.createElement('td');
      statusCell.className = 'ebay-cell';

      const idCell = document.createElement('td');
      idCell.className = 'ebay-cell';

      const actionsCell = document.createElement('td');
      actionsCell.className = 'ebay-cell';

      if (ebayItem) {
        statusCell.innerHTML = `<span class="ebay-sync-badge ebay-badge-synced" title="In sync">✅</span>`;
        idCell.innerHTML = `<a href="${ebayItem.listingUrl}" target="_blank" rel="noopener" class="ebay-item-link" title="View on eBay">${ebayItem.itemId}</a>`;
        actionsCell.innerHTML = _buildRowActionButtons(ebayItem.itemId, ebayItem.listingUrl);
      } else {
        statusCell.innerHTML = `<span class="ebay-sync-badge ebay-badge-never" title="Never synced">📡</span>`;
        idCell.textContent = '—';
        actionsCell.textContent = '—';
      }

      row.appendChild(statusCell);
      row.appendChild(idCell);
      row.appendChild(actionsCell);
    });

    // Bind per-row button events
    _bindRowActionEvents(ebayMap);
  }

  function _buildRowActionButtons(ebayItemID, listingUrl) {
    return `
<div class="ebay-row-actions">
  <button class="ebay-btn-icon" data-action="push" data-ebay-id="${ebayItemID}" title="Push to eBay">📤</button>
  <a href="${listingUrl}" target="_blank" rel="noopener" class="ebay-btn-icon" title="View on eBay">🔗</a>
</div>`;
  }

  function _bindRowActionEvents(ebayMap) {
    document.querySelectorAll('button[data-action="push"]').forEach(btn => {
      // Remove old listeners by cloning
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', e => {
        e.stopPropagation();
        const ebayItemID = newBtn.getAttribute('data-ebay-id');
        openPushModal(ebayItemID, null, null);
      });
    });
  }

  // ─── Push confirmation modal ──────────────────────────────────────────────

  /**
   * Open the push-confirmation modal.
   * @param {string} ebayItemID
   * @param {string|null} oldTitle   Current eBay title (or null if unknown)
   * @param {string|null} newTitle   Proposed optimized title (or null)
   */
  function openPushModal(ebayItemID, oldTitle, newTitle) {
    closePushModal();

    const overlay = document.createElement('div');
    overlay.className = 'ebay-modal-overlay';
    overlay.id = 'ebay-push-overlay';

    const hasChanges = newTitle && newTitle !== oldTitle;

    overlay.innerHTML = `
<div class="ebay-push-modal" role="dialog" aria-modal="true" aria-label="Confirm eBay Update">
  <div class="ebay-push-header">
    <h3>⚠️ Confirm eBay Update</h3>
    <button class="ebay-settings-close" id="ebay-push-close" aria-label="Close">&times;</button>
  </div>
  <div class="ebay-push-body">
    <p>You are about to update this listing on eBay:</p>
    <div class="ebay-push-item-info">
      <strong>eBay Item ID:</strong> <span>${_escapeHtml(ebayItemID)}</span>
    </div>

    ${hasChanges ? `
    <div class="ebay-push-diff">
      <h4>Changes:</h4>
      <div class="ebay-diff-line ebay-diff-removed">− ${_escapeHtml(oldTitle || '(unknown)')}}</div>
      <div class="ebay-diff-line ebay-diff-added">+ ${_escapeHtml(newTitle)}</div>
    </div>` : `
    <div class="ebay-push-no-changes">
      <p>No title change detected. Enter a new title below:</p>
      <input type="text" id="ebay-push-title-input" class="ebay-push-title-input" maxlength="80"
             placeholder="New title (max 80 chars)" value="${_escapeHtml(oldTitle || '')}" />
      <span class="ebay-char-count" id="ebay-push-char-count">${(oldTitle || '').length}/80</span>
    </div>`}

    <p class="ebay-push-warning">⚠️ This will update your live eBay listing immediately.</p>

    <div class="ebay-push-actions">
      <button class="ebay-btn ebay-btn-secondary" id="ebay-push-cancel">Cancel</button>
      <button class="ebay-btn ebay-btn-primary" id="ebay-push-confirm">✅ Confirm &amp; Push to eBay</button>
    </div>
    <div id="ebay-push-status" class="ebay-push-status" aria-live="polite"></div>
  </div>
</div>`;

    document.body.appendChild(overlay);

    // Char counter for manual title input
    const titleInput = overlay.querySelector('#ebay-push-title-input');
    const charCount = overlay.querySelector('#ebay-push-char-count');
    if (titleInput && charCount) {
      titleInput.addEventListener('input', () => {
        charCount.textContent = `${titleInput.value.length}/80`;
      });
    }

    overlay.querySelector('#ebay-push-close')?.addEventListener('click', closePushModal);
    overlay.querySelector('#ebay-push-cancel')?.addEventListener('click', closePushModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePushModal(); });

    overlay.querySelector('#ebay-push-confirm')?.addEventListener('click', async () => {
      const resolvedTitle = hasChanges
        ? newTitle
        : (overlay.querySelector('#ebay-push-title-input')?.value.trim() || '');

      if (!resolvedTitle) {
        _setPushStatus('Please enter a title.', 'error');
        return;
      }

      const confirmBtn = overlay.querySelector('#ebay-push-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      _setPushStatus('🔄 Pushing to eBay…', 'info');

      try {
        const result = await eBaySync.pushItem(ebayItemID, { title: resolvedTitle });
        if (result.success) {
          _setPushStatus('✅ Updated successfully!', 'success');
          showToast(`✅ eBay listing ${ebayItemID} updated`, 'success');
          setTimeout(closePushModal, 1500);
          _refreshConfigPanelState();
        } else {
          _setPushStatus(`❌ ${result.error}`, 'error');
          if (confirmBtn) confirmBtn.disabled = false;
        }
      } catch (err) {
        _setPushStatus(`❌ ${err.message}`, 'error');
        if (confirmBtn) confirmBtn.disabled = false;
      }
    });
  }

  function closePushModal() {
    const el = document.getElementById('ebay-push-overlay');
    if (el) el.remove();
  }

  function _setPushStatus(msg, type) {
    const el = document.getElementById('ebay-push-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `ebay-push-status ebay-status-${type}`;
    el.style.display = 'block';
  }

  // ─── Comparison view (inside detail row) ─────────────────────────────────

  /**
   * Build a comparison widget HTML string to embed in a listing detail row.
   * @param {object} localListing     Local listing object
   * @param {string} optimizedTitle   AI-suggested title (or empty string)
   * @param {string|null} ebayItemID  Mapped eBay item ID (or null)
   * @returns {string}  HTML string
   */
  function buildComparisonWidget(localListing, optimizedTitle, ebayItemID) {
    const currentTitle = localListing.title || '';
    const hasOptimized = optimizedTitle && optimizedTitle !== currentTitle;

    return `
<div class="ebay-comparison" id="ebay-comparison-${_escapeHtml(localListing.itemId)}">
  <div class="ebay-compare-grid">
    <div class="ebay-compare-col">
      <h4>📋 Local (Current)</h4>
      <div class="ebay-compare-field">
        <label>Title:</label>
        <span class="ebay-compare-value">${_escapeHtml(currentTitle)}</span>
      </div>
    </div>

    ${hasOptimized ? `
    <div class="ebay-compare-col ebay-compare-optimized">
      <h4>⭐ Optimized</h4>
      <div class="ebay-compare-field">
        <label>Title:</label>
        <span class="ebay-compare-value">${_escapeHtml(optimizedTitle)}</span>
      </div>
    </div>` : ''}
  </div>

  ${ebayItemID ? `
  <div class="ebay-compare-actions">
    <button class="ebay-btn ebay-btn-primary ebay-push-comparison-btn"
      data-ebay-id="${_escapeHtml(ebayItemID)}"
      data-old-title="${_escapeHtml(currentTitle)}"
      data-new-title="${hasOptimized ? _escapeHtml(optimizedTitle) : ''}">
      📤 Push ${hasOptimized ? 'Optimized Title' : 'Changes'} to eBay
    </button>
    <a href="https://www.ebay.com/itm/${_escapeHtml(ebayItemID)}" target="_blank" rel="noopener" class="ebay-btn ebay-btn-secondary">
      🔗 View on eBay
    </a>
  </div>` : `
  <p class="ebay-no-id-note">💡 Sync from eBay to link this listing and enable direct updates.</p>`}
</div>`;
  }

  // ─── Bulk push ─────────────────────────────────────────────────────────────

  /**
   * Show the bulk panel with optimized listings count.
   * @param {Array<{ ebayItemID: string, newTitle: string }>} pendingItems
   */
  function showBulkPanel(pendingItems) {
    const panel = document.getElementById('ebay-bulk-panel');
    const count = document.getElementById('ebay-bulk-count');
    if (!panel || !pendingItems.length) return;

    panel.style.display = 'block';
    if (count) count.textContent = pendingItems.length;

    // Store pending items for the push handler
    panel._pendingItems = pendingItems;

    // Update global pending counter
    const syncStatus = eBaySync.loadSyncStatus();
    syncStatus.pendingUpdates = pendingItems.length;
    eBaySync.saveSyncStatus(syncStatus);
    _refreshConfigPanelState();
  }

  async function startBulkPush() {
    const panel = document.getElementById('ebay-bulk-panel');
    const pendingItems = panel?._pendingItems;
    if (!pendingItems?.length) return;

    const progressEl = document.getElementById('ebay-bulk-progress');
    const bar = document.getElementById('ebay-bulk-progress-bar');
    const statusEl = document.getElementById('ebay-bulk-status');
    const pushBtn = document.getElementById('ebay-bulk-push-btn');

    if (progressEl) progressEl.style.display = 'flex';
    if (pushBtn) pushBtn.disabled = true;

    const includeTitles = document.getElementById('ebay-bulk-titles')?.checked !== false;

    const batch = pendingItems
      .filter(() => includeTitles)
      .map(item => ({ ebayItemID: item.ebayItemID, updates: { title: item.newTitle } }));

    try {
      const result = await eBaySync.pushBatch(batch, ({ done, total }) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        if (bar) bar.style.width = `${pct}%`;
        if (statusEl) statusEl.textContent = `Updated ${done} of ${total} listings…`;
      });

      if (statusEl) statusEl.textContent = `✅ Done — ${result.succeeded} updated, ${result.failed} failed`;
      showToast(`✅ Bulk push complete: ${result.succeeded} updated`, 'success');
      _refreshConfigPanelState();

    } catch (err) {
      if (statusEl) statusEl.textContent = `❌ ${err.message}`;
      showToast(`❌ Bulk push failed: ${err.message}`, 'error', 6000);
    } finally {
      if (pushBtn) pushBtn.disabled = false;
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  function _escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── OAuth connect/disconnect widget ─────────────────────────────────────

  /**
   * Render (or re-render) the eBay OAuth connection widget inside #ebay-integration.
   * Shows a connect button when disconnected and connection status when connected.
   */
  function rendereBayWidget() {
    const widget = document.getElementById('ebay-integration');
    if (!widget) return;

    const oauth = window.ebayOAuth;
    const isConnected = oauth && oauth.isConnected();

    if (!isConnected) {
      widget.innerHTML = `
<div class="ebay-not-connected">
  <h3>🔌 eBay Integration</h3>
  <p>Connect your eBay account to sync listings and push optimizations.</p>
  <button class="ebay-btn ebay-btn-primary btn-connect-ebay" onclick="connecteBay()">
    🔗 Connect eBay Account
  </button>
  <p class="ebay-field-note">🔒 Secure OAuth 2.0 authentication</p>
</div>`;
    } else {
      const username  = localStorage.getItem('ebay-username') || 'Unknown';
      const expiry    = localStorage.getItem('ebay-token-expiry');
      const expiresIn = expiry ? _getTimeUntilExpiry(parseInt(expiry, 10)) : 'Unknown';

      widget.innerHTML = `
<div class="ebay-connected">
  <h3>🔌 eBay Integration</h3>
  <div class="ebay-status-row">
    <span class="ebay-status-indicator ebay-connected">✅ Connected</span>
    <span class="ebay-account-label">Account: ${_escapeHtml(username)}</span>
    <span class="ebay-expiry-label">Token expires: ${_escapeHtml(expiresIn)}</span>
  </div>
  <div class="ebay-action-row">
    <button class="ebay-btn ebay-btn-primary" onclick="eBayUI.startSyncDown()">🔄 Sync from eBay</button>
    <button class="ebay-btn ebay-btn-secondary" onclick="disconnecteBay()">⚙️ Disconnect</button>
  </div>
</div>`;
    }
  }

  /**
   * Return a human-readable string for how long until the token expires.
   * @param {number} expiryMs  Epoch milliseconds
   * @returns {string}
   */
  function _getTimeUntilExpiry(expiryMs) {
    const diff = expiryMs - Date.now();
    if (diff <= 0) return 'Expired';
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    if (days > 0)  return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    injectConfigPanel,
    refreshConfigPanel,
    startSyncDown,
    openPushModal,
    closePushModal,
    buildComparisonWidget,
    showBulkPanel,
    showToast,
    rendereBayWidget,
    getLastSyncedItems: () => [..._lastSyncedItems],
    reDecorateTable: () => {
      if (_lastSyncedItems.length) _decorateListingTable(_lastSyncedItems);
    },
  };
})();

// ─── OAuth helpers (global scope for onclick attributes) ──────────────────────

/** Initiate the eBay OAuth flow. */
function connecteBay() {
  if (!window.ebayOAuth) return;
  try {
    window.ebayOAuth.initiateAuth();
  } catch (err) {
    eBayUI.showToast(`❌ ${err.message}`, 'error', 8000);
  }
}

/** Disconnect the eBay account after user confirmation. */
function disconnecteBay() {
  if (confirm('Are you sure you want to disconnect your eBay account?')) {
    if (window.ebayOAuth) {
      window.ebayOAuth.disconnect();
    }
    eBayUI.rendereBayWidget();
  }
}
