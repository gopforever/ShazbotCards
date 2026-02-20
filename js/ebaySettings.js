/**
 * ebaySettings.js — Settings modal for eBay API credentials
 * Allows the user to configure App ID, Dev ID, Cert ID, token, and environment.
 *
 * TODO (future): Add OAuth flow for multi-user support.
 */

const eBaySettings = (() => {
  'use strict';

  // ─── Modal HTML ───────────────────────────────────────────────────────────

  function _createModalHTML() {
    const cfg = eBayConfig.getConfig();
    const expiryLabel = eBayConfig.getTokenExpiryLabel();

    return `
<div class="ebay-settings-modal" id="ebay-settings-modal" role="dialog" aria-modal="true" aria-label="eBay API Settings">
  <div class="ebay-settings-content">
    <div class="ebay-settings-header">
      <h3>⚙️ eBay API Settings</h3>
      <button class="ebay-settings-close" id="ebay-settings-close" aria-label="Close settings">&times;</button>
    </div>
    <div class="ebay-settings-body">

      <div class="ebay-form-group">
        <label>Environment:</label>
        <div class="ebay-radio-group">
          <label><input type="radio" name="ebay-env" value="production" ${cfg.environment === 'production' ? 'checked' : ''}> Production</label>
          <label><input type="radio" name="ebay-env" value="sandbox" ${cfg.environment === 'sandbox' ? 'checked' : ''}> Sandbox</label>
        </div>
      </div>

      <div class="ebay-form-group">
        <label for="ebay-settings-appid">App ID (Client ID):</label>
        <input type="text" id="ebay-settings-appid" placeholder="ScottPie-cardsapp-PRD-..." value="${_escape(cfg.appID)}" />
      </div>

      <div class="ebay-form-group">
        <label for="ebay-settings-devid">Dev ID:</label>
        <input type="text" id="ebay-settings-devid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${_escape(cfg.devID)}" />
      </div>

      <div class="ebay-form-group">
        <label for="ebay-settings-certid">Cert ID (Client Secret):</label>
        <input type="text" id="ebay-settings-certid" placeholder="PRD-..." value="${_escape(cfg.certID)}" />
      </div>

      <div class="ebay-form-group">
        <label for="ebay-settings-username">eBay Username:</label>
        <input type="text" id="ebay-settings-username" placeholder="shazbotcards2025" value="${_escape(cfg.username)}" />
      </div>

      <div class="ebay-form-group">
        <label for="ebay-settings-token">User Token (Auth'n'Auth):</label>
        <div class="ebay-token-row">
          <input type="password" id="ebay-settings-token" placeholder="v^1.H#*..." value="${_escape(cfg.token)}" autocomplete="off" />
          <button class="ebay-btn-sm ebay-btn-secondary" id="ebay-toggle-token" title="Toggle visibility">👁️</button>
        </div>
        <p class="ebay-field-note">Your token is stored locally in your browser only. It is never sent to our servers.</p>
      </div>

      <div class="ebay-form-group">
        <label for="ebay-settings-expiry">Token Expiry:</label>
        <input type="text" id="ebay-settings-expiry" placeholder="2027-08-14" value="${_escape(cfg.tokenExpiry)}" />
        <p class="ebay-field-note">Currently: ${_escape(expiryLabel)}</p>
      </div>

      <div class="ebay-settings-actions">
        <button class="ebay-btn ebay-btn-secondary" id="ebay-test-connection">🔌 Test Connection</button>
        <button class="ebay-btn ebay-btn-primary" id="ebay-save-settings">💾 Save Settings</button>
        <button class="ebay-btn ebay-btn-danger" id="ebay-clear-credentials">🗑️ Clear All Credentials</button>
      </div>

      <div id="ebay-settings-status" class="ebay-settings-status" aria-live="polite"></div>
    </div>
  </div>
</div>`;
  }

  function _escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Modal lifecycle ──────────────────────────────────────────────────────

  let _overlayEl = null;

  function open() {
    close(); // Remove any existing modal first

    const overlay = document.createElement('div');
    overlay.className = 'ebay-modal-overlay';
    overlay.id = 'ebay-settings-overlay';
    overlay.innerHTML = _createModalHTML();
    document.body.appendChild(overlay);
    _overlayEl = overlay;

    // Bind events
    overlay.querySelector('#ebay-settings-close').addEventListener('click', close);
    overlay.querySelector('#ebay-save-settings').addEventListener('click', _saveSettings);
    overlay.querySelector('#ebay-test-connection').addEventListener('click', _testConnection);
    overlay.querySelector('#ebay-clear-credentials').addEventListener('click', _clearCredentials);
    overlay.querySelector('#ebay-toggle-token').addEventListener('click', _toggleTokenVisibility);

    // Close on overlay background click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });

    // Focus the first input
    const firstInput = overlay.querySelector('input[type="text"]');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function close() {
    const existing = document.getElementById('ebay-settings-overlay');
    if (existing) existing.remove();
    _overlayEl = null;
  }

  // ─── Event handlers ───────────────────────────────────────────────────────

  function _saveSettings() {
    const env = document.querySelector('input[name="ebay-env"]:checked')?.value || 'production';
    const appID    = document.getElementById('ebay-settings-appid')?.value.trim() || '';
    const devID    = document.getElementById('ebay-settings-devid')?.value.trim() || '';
    const certID   = document.getElementById('ebay-settings-certid')?.value.trim() || '';
    const username = document.getElementById('ebay-settings-username')?.value.trim() || '';
    const token    = document.getElementById('ebay-settings-token')?.value.trim() || '';
    const expiry   = document.getElementById('ebay-settings-expiry')?.value.trim() || '';

    const ok = eBayConfig.updateConfig({ environment: env, appID, devID, certID, username, token, tokenExpiry: expiry });
    eBayAPIFactory.reset(); // Force new instance with updated config

    _setStatus(ok ? '✅ Settings saved successfully.' : '❌ Failed to save settings.', ok ? 'success' : 'error');

    // Refresh the config panel if it exists
    if (typeof eBayUI !== 'undefined') {
      eBayUI.refreshConfigPanel();
    }
  }

  async function _testConnection() {
    _setStatus('🔄 Testing connection…', 'info');
    const btn = document.getElementById('ebay-test-connection');
    if (btn) btn.disabled = true;

    // Save current form values first so the API uses them
    _saveSettings();

    try {
      const result = await eBaySync.testConnection();
      if (result.success) {
        _setStatus(`✅ Connected! Account: ${result.username}`, 'success');
      } else {
        _setStatus(`❌ Connection failed: ${result.error}`, 'error');
      }
    } catch (err) {
      _setStatus(`❌ ${err.message}`, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function _clearCredentials() {
    if (!confirm('Clear all eBay credentials? This cannot be undone.')) return;
    eBayConfig.clear();
    eBayAPIFactory.reset();
    close();
    if (typeof eBayUI !== 'undefined') {
      eBayUI.refreshConfigPanel();
    }
  }

  function _toggleTokenVisibility() {
    const input = document.getElementById('ebay-settings-token');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  function _setStatus(msg, type = 'info') {
    const el = document.getElementById('ebay-settings-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `ebay-settings-status ebay-status-${type}`;
    el.style.display = 'block';
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return { open, close };
})();
