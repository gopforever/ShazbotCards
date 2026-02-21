/**
 * ebayAnalytics.js — Live eBay traffic data fetcher for ShazbotCards
 * Fetches per-listing impressions, CTR, page views, top 20% and sales
 * from the proxy's /analytics/traffic endpoint for Today/7/30/90 day windows.
 */

const eBayAnalytics = (() => {
  'use strict';

  const PERIODS = {
    TODAY:       { label: 'Today',      value: 'TODAY' },
    LAST_7_DAYS: { label: 'Last 7 Days', value: 'LAST_7_DAYS' },
    LAST_30_DAYS:{ label: 'Last 30 Days',value: 'LAST_30_DAYS' },
    LAST_90_DAYS:{ label: 'Last 90 Days',value: 'LAST_90_DAYS' },
  };

  let _currentPeriod = 'LAST_7_DAYS';

  function getProxyURL() {
    return (typeof CONFIG !== 'undefined' && CONFIG.ebay && CONFIG.ebay.proxyURL)
      ? CONFIG.ebay.proxyURL
      : 'https://shazbotcards-ebay-proxy.vercel.app';
  }

  function getToken() {
    try { return localStorage.getItem('ebay-access-token') || null; } catch (e) { return null; }
  }

  /**
   * Fetch traffic data for the given period from the proxy.
   * @param {string} period  One of: TODAY, LAST_7_DAYS, LAST_30_DAYS, LAST_90_DAYS
   * @param {Function} [onProgress]  Optional progress callback
   * @returns {Promise<{ period: string, listings: object[], count: number }>}
   */
  async function fetchTraffic(period, onProgress) {
    const token = getToken();
    if (!token) throw new Error('Not connected to eBay. Please connect your account first.');

    _currentPeriod = period;

    if (typeof onProgress === 'function') onProgress({ status: 'Connecting to eBay Analytics…' });

    const response = await fetch(`${getProxyURL()}/analytics/traffic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ period }),
    });

    if (!response.ok) {
      let msg = `Analytics API error: ${response.status}`;
      try {
        const err = await response.json();
        if (err.error || err.message) msg = err.error || err.message;
      } catch (e) { /* ignore */ }
      throw new Error(msg);
    }

    const data = await response.json();
    if (typeof onProgress === 'function') onProgress({ status: `Loaded ${data.count} listings` });

    return data;
  }

  /**
   * Map proxy analytics response listings to the ShazbotCards listing shape
   * used by Analyzer, renderAll(), etc.
   * Merges with existing eBay sync data (title, listingType) when available.
   *
   * @param {object[]} analyticsListings  From proxy /analytics/traffic response
   * @param {object[]} [syncedItems]      From eBaySync.syncDown() — provides titles etc.
   * @returns {object[]}  Listings in ShazbotCards format
   */
  function mapToListingShape(analyticsListings, syncedItems = []) {
    const syncMap = {};
    syncedItems.forEach(item => { syncMap[item.itemId] = item; });

    return analyticsListings.map(item => {
      const synced = syncMap[item.itemId] || {};
      const impressions = item.impressions || 0;
      const pageViews = item.pageViews || 0;
      const ctr = item.ctr || 0;
      const top20Pct = item.top20Pct || 0;
      const quantitySold = item.transactions || 0;

      // Compute a health score matching the existing CSV-based logic
      let healthScore = 0;
      if (impressions > 0) healthScore += 20;
      if (ctr >= 2.0) healthScore += 30;
      else if (ctr >= 1.0) healthScore += 15;
      if (pageViews > 0) healthScore += 20;
      if (top20Pct >= 20) healthScore += 20;
      else if (top20Pct >= 5) healthScore += 10;
      if (quantitySold > 0) healthScore += 10;
      healthScore = Math.min(100, healthScore);

      const healthBadge = healthScore >= 60 ? 'green' : healthScore >= 30 ? 'yellow' : 'red';

      return {
        itemId:               item.itemId,
        title:                synced.title || `eBay Item ${item.itemId}`,
        totalImpressions:     impressions,
        totalPageViews:       pageViews,
        ctr:                  ctr,
        top20Pct:             top20Pct,
        quantitySold:         quantitySold,
        isPromoted:           false,
        promotedStatus:       'Organic',
        sport:                synced.sport || 'Unknown',
        startDate:            synced.startDate || null,
        quantityAvailable:    synced.quantity || null,
        totalImpressionsPrev: 0,
        totalPromotedImpressions: 0,
        totalOrganicImpressions:  impressions,
        healthScore,
        healthBadge,
        recommendation:       { text: healthScore < 30 ? 'Low visibility — review title and pricing' : healthScore < 60 ? 'Moderate performance' : 'Good performance', priority: healthScore < 30 ? 'red' : healthScore < 60 ? 'yellow' : 'green' },
        _source:              'live',
        _period:              _currentPeriod,
      };
    });
  }

  function getCurrentPeriod() { return _currentPeriod; }
  function getPeriods() { return PERIODS; }

  return {
    fetchTraffic,
    mapToListingShape,
    getCurrentPeriod,
    getPeriods,
    PERIODS,
  };
})();
