/**
 * ebaySync.js — Sync engine for ShazbotCards ↔ eBay Trading API
 * Manages fetching listings from eBay, detecting differences, and pushing updates.
 *
 * TODO (future): Scheduled auto-sync every 15 minutes using setInterval + idle detection.
 * TODO (future): Change history tracking with undo support.
 */

const eBaySync = (() => {
  'use strict';

  const SYNC_STATUS_KEY = 'ebay-sync-status';
  const LISTING_MAP_KEY = 'ebay-listing-map';

  // ─── Sync status constants ────────────────────────────────────────────────

  const STATUS = {
    IN_SYNC:      'in-sync',      // ✅ Local and eBay match
    LOCAL_CHANGE: 'local-change', // ⚠️ Optimized locally, not pushed
    SYNCING:      'syncing',      // 🔄 Currently updating
    SYNC_FAILED:  'sync-failed',  // ❌ Error occurred
    NEVER_SYNCED: 'never-synced', // 📡 New local data
  };

  // ─── Persistent state helpers ─────────────────────────────────────────────

  function loadSyncStatus() {
    try {
      const raw = localStorage.getItem(SYNC_STATUS_KEY);
      return raw ? JSON.parse(raw) : {
        lastSyncTime: null,
        listingCount: 0,
        pendingUpdates: 0,
        failedItems: [],
      };
    } catch (e) {
      return { lastSyncTime: null, listingCount: 0, pendingUpdates: 0, failedItems: [] };
    }
  }

  function saveSyncStatus(status) {
    try {
      localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
    } catch (e) { /* ignore quota issues */ }
  }

  /** Map of localItemId → eBayItemID */
  function loadListingMap() {
    try {
      const raw = localStorage.getItem(LISTING_MAP_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveListingMap(map) {
    try {
      localStorage.setItem(LISTING_MAP_KEY, JSON.stringify(map));
    } catch (e) { /* ignore */ }
  }

  // ─── Data mapping: eBay → local ──────────────────────────────────────────

  /**
   * Map an eBay item object (from Trading API) to a local listing shape.
   * @param {object} ebayItem
   * @returns {object}
   */
  function mapEbayToLocal(ebayItem) {
    const startPrice = ebayItem.StartPrice;
    const price = typeof startPrice === 'object'
      ? parseFloat(startPrice['#text'] || startPrice._ || '0')
      : parseFloat(startPrice || '0');

    return {
      itemId:      String(ebayItem.ItemID || ''),
      title:       String(ebayItem.Title || ''),
      price:       isNaN(price) ? 0 : price,
      quantity:    parseInt(ebayItem.Quantity || '1', 10),
      quantitySold: parseInt(ebayItem.QuantitySold || '0', 10),
      watchers:    parseInt(ebayItem.WatchCount || '0', 10),
      views:       parseInt(ebayItem.HitCount || '0', 10),
      listingType: String(ebayItem.ListingType || ''),
      timeLeft:    String(ebayItem.TimeLeft || ''),
      listingUrl:  ebayItem.ListingDetails
        ? String(ebayItem.ListingDetails.ViewItemURL || '')
        : `https://www.ebay.com/itm/${ebayItem.ItemID}`,
      // Preserve raw eBay object for comparison
      _ebayRaw: ebayItem,
    };
  }

  // ─── Diff detection ───────────────────────────────────────────────────────

  /**
   * Compare a local listing to the corresponding eBay listing.
   * Returns an object describing which fields differ.
   *
   * @param {object} local    Local listing
   * @param {object} ebayItem Raw eBay item object
   * @returns {{ hasDiff: boolean, diffs: object[] }}
   */
  function detectDiff(local, ebayItem) {
    const diffs = [];
    const mapped = mapEbayToLocal(ebayItem);

    // Title comparison
    if (local.title && mapped.title && local.title !== mapped.title) {
      diffs.push({
        field: 'title',
        label: 'Title',
        local: local.title,
        ebay: mapped.title,
      });
    }

    return { hasDiff: diffs.length > 0, diffs };
  }

  // ─── Sync down (eBay → local) ─────────────────────────────────────────────

  /**
   * Fetch all active listings from eBay and return them as mapped local objects.
   * Does NOT modify existing local listings — returns raw eBay data.
   *
   * @param {Function} [onProgress]  Called with ({ page, totalPages, count })
   * @returns {Promise<{ items: object[], count: number }>}
   */
  async function syncDown(onProgress) {
    if (!eBayConfig.isConfigured()) {
      throw new Error('eBay is not configured. Please add your credentials in Settings.');
    }

    const api = eBayAPIFactory.get();
    const items = await api.getAllActiveListings((page, totalPages) => {
      if (typeof onProgress === 'function') {
        onProgress({ page, totalPages, count: 0 });
      }
    });

    const mapped = items.map(mapEbayToLocal);

    // Build/update listing map (itemId → ebayItemId — same here since eBay is source)
    const listingMap = loadListingMap();
    mapped.forEach(m => { listingMap[m.itemId] = m.itemId; });
    saveListingMap(listingMap);

    // Update sync status
    const status = loadSyncStatus();
    status.lastSyncTime = Date.now();
    status.listingCount = mapped.length;
    saveSyncStatus(status);

    return { items: mapped, count: mapped.length };
  }

  // ─── Sync up (local → eBay) ───────────────────────────────────────────────

  /**
   * Push a single listing update to eBay (title and/or price).
   *
   * @param {string} ebayItemID
   * @param {object} updates   { title?, price? }
   * @returns {Promise<{ success: boolean, itemID: string, error?: string }>}
   */
  async function pushItem(ebayItemID, updates) {
    if (!eBayConfig.isConfigured()) {
      throw new Error('eBay is not configured.');
    }
    const api = eBayAPIFactory.get();
    try {
      await api.reviseItem(ebayItemID, updates);
      return { success: true, itemID: ebayItemID };
    } catch (err) {
      return { success: false, itemID: ebayItemID, error: err.message };
    }
  }

  /**
   * Batch push multiple listing updates to eBay with rate limiting and progress.
   *
   * @param {Array<{ ebayItemID: string, updates: object }>} batch
   * @param {Function} [onProgress]  Called with ({ done, total, failed, current })
   * @returns {Promise<{ succeeded: number, failed: number, errors: object[] }>}
   */
  async function pushBatch(batch, onProgress) {
    if (!eBayConfig.isConfigured()) {
      throw new Error('eBay is not configured.');
    }

    const api = eBayAPIFactory.get();
    let succeeded = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < batch.length; i++) {
      const { ebayItemID, updates } = batch[i];

      if (typeof onProgress === 'function') {
        onProgress({ done: i, total: batch.length, failed, current: ebayItemID });
      }

      try {
        await api.reviseItem(ebayItemID, updates);
        succeeded++;
      } catch (err) {
        failed++;
        errors.push({ itemID: ebayItemID, error: err.message });
        // Stop on auth/token errors — no point continuing
        if (err.message.includes('token')) throw err;
      }

      // Rate limiting between calls
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    }

    if (typeof onProgress === 'function') {
      onProgress({ done: batch.length, total: batch.length, failed, current: null });
    }

    // Persist failed items to sync status
    const status = loadSyncStatus();
    status.failedItems = errors.map(e => e.itemID);
    status.pendingUpdates = Math.max(0, (status.pendingUpdates || 0) - succeeded);
    saveSyncStatus(status);

    return { succeeded, failed, errors };
  }

  // ─── Connection test ──────────────────────────────────────────────────────

  /**
   * Test connectivity by calling GetUser and returning user info.
   * @returns {Promise<{ success: boolean, username?: string, error?: string }>}
   */
  async function testConnection() {
    if (!eBayConfig.isConfigured()) {
      return { success: false, error: 'eBay credentials not configured.' };
    }
    try {
      const api = eBayAPIFactory.get();
      const user = await api.getUser();
      const username = user.UserID || user.Email || 'unknown';
      return { success: true, username };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Status helpers ───────────────────────────────────────────────────────

  function getSyncStatus() {
    return loadSyncStatus();
  }

  function getListingMap() {
    return loadListingMap();
  }

  /**
   * Human-readable "last synced" label, e.g. "2 min ago".
   */
  function getLastSyncLabel() {
    const status = loadSyncStatus();
    if (!status.lastSyncTime) return 'Never';
    const diff = Date.now() - status.lastSyncTime;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    STATUS,
    syncDown,
    pushItem,
    pushBatch,
    testConnection,
    detectDiff,
    mapEbayToLocal,
    getSyncStatus,
    getListingMap,
    getLastSyncLabel,
    loadSyncStatus,
    saveSyncStatus,
  };
})();
