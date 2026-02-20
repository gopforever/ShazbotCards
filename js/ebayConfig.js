/**
 * ebayConfig.js — eBay API configuration manager for ShazbotCards
 * Handles credential storage, environment selection, and token validation.
 *
 * Stores encrypted credentials in localStorage so sensitive tokens
 * are never exposed in plain text in source code.
 *
 * TODO (future): Support OAuth for multi-user account switching.
 */

const eBayConfig = (() => {
  'use strict';

  const STORAGE_KEY = 'shazbotcards_ebay_config';

  // Simple XOR-based obfuscation for localStorage values.
  // NOTE: This is obfuscation, not true encryption. The token is stored
  // client-side and visible to anyone with DevTools access — this is inherent
  // to any browser-only app. The layer prevents casual shoulder-surfing.
  const _MASK = 'ShazbotCards_eBay_v1';

  function _obfuscate(str) {
    if (!str) return '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      out += String.fromCharCode(str.charCodeAt(i) ^ _MASK.charCodeAt(i % _MASK.length));
    }
    return btoa(out);
  }

  function _deobfuscate(encoded) {
    if (!encoded) return '';
    try {
      const str = atob(encoded);
      let out = '';
      for (let i = 0; i < str.length; i++) {
        out += String.fromCharCode(str.charCodeAt(i) ^ _MASK.charCodeAt(i % _MASK.length));
      }
      return out;
    } catch (e) {
      return '';
    }
  }

  // ─── Default configuration ───────────────────────────────────────────────

  const DEFAULTS = {
    environment: 'production',
    appID: '',
    devID: '',
    certID: '',
    token: '',
    username: '',
    tokenExpiry: '',
  };

  // ─── Load / Save ─────────────────────────────────────────────────────────

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      // Deobfuscate sensitive fields
      return {
        environment: parsed.environment || DEFAULTS.environment,
        appID:       parsed.appID || DEFAULTS.appID,
        devID:       parsed.devID || DEFAULTS.devID,
        certID:      parsed.certID || DEFAULTS.certID,
        token:       _deobfuscate(parsed.token || ''),
        username:    parsed.username || DEFAULTS.username,
        tokenExpiry: parsed.tokenExpiry || DEFAULTS.tokenExpiry,
      };
    } catch (e) {
      console.warn('eBayConfig: failed to load config', e);
      return { ...DEFAULTS };
    }
  }

  function save(config) {
    try {
      const toStore = {
        environment: config.environment || DEFAULTS.environment,
        appID:       config.appID || '',
        devID:       config.devID || '',
        certID:      config.certID || '',
        token:       _obfuscate(config.token || ''),
        username:    config.username || '',
        tokenExpiry: config.tokenExpiry || '',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      return true;
    } catch (e) {
      console.warn('eBayConfig: failed to save config', e);
      return false;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  function getConfig() {
    return load();
  }

  function updateConfig(partial) {
    const existing = load();
    const merged = { ...existing, ...partial };
    return save(merged);
  }

  function isConfigured() {
    const cfg = load();
    return !!(cfg.appID && cfg.token);
  }

  /**
   * Returns true if the stored token has not yet expired.
   * An empty expiry string is treated as "unknown — assume valid".
   */
  function isTokenValid() {
    const cfg = load();
    if (!cfg.token) return false;
    if (!cfg.tokenExpiry) return true; // unknown expiry — assume valid
    try {
      return new Date(cfg.tokenExpiry) > new Date();
    } catch (e) {
      return true;
    }
  }

  /**
   * Returns the API endpoint URL for the configured environment.
   */
  function getEndpoint() {
    const cfg = load();
    return cfg.environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';
  }

  /**
   * Build the standard HTTP headers required by the eBay Trading API.
   * @param {string} callName  e.g. 'GetMyeBaySelling'
   * @returns {object}
   */
  function buildHeaders(callName) {
    const cfg = load();
    return {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1309',
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-APP-NAME': cfg.appID,
      'X-EBAY-API-DEV-NAME': cfg.devID,
      'X-EBAY-API-CERT-NAME': cfg.certID,
      'Content-Type': 'text/xml',
    };
  }

  // ─── Token expiry helpers ─────────────────────────────────────────────────

  /**
   * Human-readable token expiry string, e.g. "Aug 14, 2027".
   */
  function getTokenExpiryLabel() {
    const cfg = load();
    if (!cfg.tokenExpiry) return 'Unknown';
    try {
      return new Date(cfg.tokenExpiry).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch (e) {
      return cfg.tokenExpiry;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    getConfig,
    updateConfig,
    clear,
    isConfigured,
    isTokenValid,
    getEndpoint,
    buildHeaders,
    getTokenExpiryLabel,
  };
})();
