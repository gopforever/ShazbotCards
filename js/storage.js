/**
 * storage.js — localStorage persistence layer for ShazbotCards Analytics
 * Handles saving, retrieving, and deleting historical CSV reports.
 * Schema version: 1
 */

const Storage = (() => {
  'use strict';

  const STORAGE_KEY = 'shazbotcards_reports';
  const SCHEMA_VERSION = 1;
  const MAX_REPORTS = 12;

  // ─── Internal helpers ───────────────────────────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: SCHEMA_VERSION, reports: [] };
      const store = JSON.parse(raw);
      // Validate schema
      if (!store || typeof store !== 'object' || !Array.isArray(store.reports)) {
        console.warn('Storage: corrupted data, resetting.');
        return { version: SCHEMA_VERSION, reports: [] };
      }
      return store;
    } catch (e) {
      console.warn('Storage: failed to load from localStorage:', e);
      return { version: SCHEMA_VERSION, reports: [] };
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22 /* legacy webkit */) {
        // Auto-cleanup: remove oldest reports until it fits
        if (store.reports.length > 1) {
          store.reports.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
          store.reports.shift();
          return saveStore(store);
        }
      }
      console.error('Storage: failed to save to localStorage:', e);
      return false;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Save a new report. Returns the saved report object (with id) or null on failure.
   * @param {string} filename
   * @param {Array} data  - enriched listing array
   * @param {Object} [reportPeriod] - { start, end } date strings extracted from CSV
   */
  function saveReport(filename, data, reportPeriod) {
    const store = loadStore();

    // Enforce max 12 reports: remove oldest first
    store.reports.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
    while (store.reports.length >= MAX_REPORTS) {
      store.reports.shift();
    }

    const report = {
      id: generateId(),
      uploadedAt: new Date().toISOString(),
      reportPeriod: reportPeriod || null,
      filename: filename || 'report.csv',
      listingCount: Array.isArray(data) ? data.length : 0,
      data: Array.isArray(data) ? data : [],
    };

    store.reports.push(report);
    const ok = saveStore(store);
    return ok ? report : null;
  }

  /**
   * Get all saved reports (metadata only — without full data array for performance).
   * Sorted newest first.
   */
  function getReportList() {
    const store = loadStore();
    return store.reports
      .map(r => ({
        id: r.id,
        uploadedAt: r.uploadedAt,
        reportPeriod: r.reportPeriod,
        filename: r.filename,
        listingCount: r.listingCount,
      }))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  /**
   * Get a single report including full data by id.
   */
  function getReport(id) {
    const store = loadStore();
    return store.reports.find(r => r.id === id) || null;
  }

  /**
   * Get all reports including full data, sorted oldest first (for trend analysis).
   */
  function getAllReports() {
    const store = loadStore();
    return [...store.reports].sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
  }

  /**
   * Delete a single report by id.
   */
  function deleteReport(id) {
    const store = loadStore();
    const before = store.reports.length;
    store.reports = store.reports.filter(r => r.id !== id);
    if (store.reports.length === before) return false;
    return saveStore(store);
  }

  /**
   * Delete all saved reports.
   */
  function deleteAllReports() {
    const store = { version: SCHEMA_VERSION, reports: [] };
    return saveStore(store);
  }

  /**
   * Export all historical data as a JSON string.
   */
  function exportAll() {
    const store = loadStore();
    return JSON.stringify(store, null, 2);
  }

  /**
   * Import historical data from a previously exported JSON string.
   * Merges with existing reports (deduplicates by id).
   * Returns number of imported reports or -1 on error.
   */
  function importAll(jsonString) {
    try {
      const incoming = JSON.parse(jsonString);
      if (!incoming || !Array.isArray(incoming.reports)) return -1;
      const store = loadStore();
      const existingIds = new Set(store.reports.map(r => r.id));
      let count = 0;
      incoming.reports.forEach(r => {
        if (!r.id || existingIds.has(r.id)) return;
        store.reports.push(r);
        count++;
      });
      // Enforce max
      store.reports.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      if (store.reports.length > MAX_REPORTS) {
        store.reports = store.reports.slice(store.reports.length - MAX_REPORTS);
      }
      saveStore(store);
      return count;
    } catch (e) {
      console.error('Storage: import failed:', e);
      return -1;
    }
  }

  /**
   * Returns { used, max } report counts for the quota indicator.
   */
  function getQuota() {
    const store = loadStore();
    return { used: store.reports.length, max: MAX_REPORTS };
  }

  /**
   * Returns true if localStorage is available.
   */
  function isAvailable() {
    try {
      const test = '__sc_test__';
      localStorage.setItem(test, '1');
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    saveReport,
    getReportList,
    getReport,
    getAllReports,
    deleteReport,
    deleteAllReports,
    exportAll,
    importAll,
    getQuota,
    isAvailable,
  };
})();
