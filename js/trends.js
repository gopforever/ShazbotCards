/**
 * trends.js — Cross-report trend analysis engine for ShazbotCards Analytics
 * Matches listings across reports by eBay Item ID and computes period-over-period changes.
 */

const Trends = (() => {
  'use strict';

  // ─── Shared helpers ────────────────────────────────────────────────────────

  /**
   * Compute percentage change from a to b.
   * Returns null when a is 0 (division by zero) or inputs are null/undefined.
   */
  function pctChange(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return null;
    if (a === 0 && b === 0) return 0;
    if (a === 0) return null; // Cannot compute % change from zero baseline
    return ((b - a) / Math.abs(a)) * 100;
  }

  // ─── Cross-report listing matching ─────────────────────────────────────────

  /**
   * Build a timeline of metrics for each listing across all reports.
   * Returns an object keyed by itemId with sorted period snapshots.
   *
   * @param {Array} reports - full report objects from Storage.getAllReports()
   * @returns {Object} { [itemId]: { title, snapshots: [{reportId, uploadedAt, ...metrics}] } }
   */
  function buildListingTimeline(reports) {
    const timeline = {};

    reports.forEach(report => {
      (report.data || []).forEach(listing => {
        if (!listing.itemId) return;
        if (!timeline[listing.itemId]) {
          timeline[listing.itemId] = { title: listing.title, itemId: listing.itemId, snapshots: [] };
        }
        timeline[listing.itemId].snapshots.push({
          reportId: report.id,
          uploadedAt: report.uploadedAt,
          filename: report.filename,
          reportPeriod: report.reportPeriod,
          totalImpressions: listing.totalImpressions || 0,
          ctr: listing.ctr || 0,
          totalPageViews: listing.totalPageViews || 0,
          quantitySold: listing.quantitySold || 0,
          healthScore: listing.healthScore || 0,
          healthBadge: listing.healthBadge || 'red',
          isPromoted: listing.isPromoted || false,
          sport: listing.sport || 'Other',
        });
      });
    });

    // Ensure snapshots are sorted chronologically
    Object.values(timeline).forEach(entry => {
      entry.snapshots.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
    });

    return timeline;
  }

  /**
   * Compute week-over-week (last two reports) changes for a given listing timeline entry.
   * Returns null if fewer than 2 snapshots.
   */
  function computeListingChange(timelineEntry) {
    const snaps = timelineEntry.snapshots;
    if (snaps.length < 2) return null;
    const prev = snaps[snaps.length - 2];
    const curr = snaps[snaps.length - 1];

    return {
      impressionsChange: pctChange(prev.totalImpressions, curr.totalImpressions),
      ctrChange: pctChange(prev.ctr, curr.ctr),
      pageViewsChange: pctChange(prev.totalPageViews, curr.totalPageViews),
      soldChange: pctChange(prev.quantitySold, curr.quantitySold),
      healthScoreChange: curr.healthScore - prev.healthScore,
      prevHealthBadge: prev.healthBadge,
      currHealthBadge: curr.healthBadge,
      isNewIssue: prev.healthBadge !== 'red' && curr.healthBadge === 'red',
      isDeclined: (
        (prev.healthBadge === 'green' && curr.healthBadge !== 'green') ||
        (prev.healthBadge === 'yellow' && curr.healthBadge === 'red')
      ),
      prevSnap: prev,
      currSnap: curr,
    };
  }

  // ─── Aggregate trend across reports ────────────────────────────────────────

  /**
   * Compute aggregate stats per report for time-series charting.
   * @param {Array} reports - full report objects sorted chronologically
   * @returns {Array} [{ label, uploadedAt, totalImpressions, promotedImpressions, organicImpressions, avgCTR, totalSold, listingCount, healthZones }]
   */
  function computeAggregateTrend(reports) {
    return reports.map(report => {
      const data = report.data || [];
      const totalImpressions = data.reduce((s, l) => s + (l.totalImpressions || 0), 0);
      const promotedImpressions = data.filter(l => l.isPromoted).reduce((s, l) => s + (l.totalImpressions || 0), 0);
      const organicImpressions = totalImpressions - promotedImpressions;
      const ctrs = data.map(l => l.ctr).filter(c => c !== null && c !== undefined);
      const avgCTR = ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : 0;
      const totalSold = data.reduce((s, l) => s + (l.quantitySold || 0), 0);

      const healthZones = { green: 0, yellow: 0, red: 0 };
      data.forEach(l => {
        const badge = l.healthBadge || 'red';
        healthZones[badge] = (healthZones[badge] || 0) + 1;
      });

      const label = report.filename.replace(/\.csv$/i, '').slice(0, 20) ||
        new Date(report.uploadedAt).toLocaleDateString();

      return {
        label,
        uploadedAt: report.uploadedAt,
        reportId: report.id,
        filename: report.filename,
        totalImpressions,
        promotedImpressions,
        organicImpressions,
        avgCTR: parseFloat(avgCTR.toFixed(2)),
        totalSold,
        listingCount: data.length,
        healthZones,
      };
    });
  }

  /**
   * Get top N listings by total impressions across the most recent report,
   * with their snapshots from all reports for time-series display.
   * @param {Object} timeline - from buildListingTimeline()
   * @param {number} n - number of top listings
   */
  function getTopListingTimelines(timeline, n) {
    return Object.values(timeline)
      .filter(entry => entry.snapshots.length > 0)
      .sort((a, b) => {
        const aLast = a.snapshots[a.snapshots.length - 1].totalImpressions;
        const bLast = b.snapshots[b.snapshots.length - 1].totalImpressions;
        return bLast - aLast;
      })
      .slice(0, n);
  }

  /**
   * Get listings that have declined health (for enhanced "Fix These First").
   * Returns array of { listing, change } sorted by severity.
   */
  function getDeclinedListings(timeline) {
    return Object.values(timeline)
      .map(entry => {
        const change = computeListingChange(entry);
        if (!change) return null;
        if (!change.isDeclined && !change.isNewIssue) return null;
        return { listing: entry, change };
      })
      .filter(Boolean)
      .sort((a, b) => {
        // New issues first, then by impressions desc
        if (a.change.isNewIssue !== b.change.isNewIssue) return a.change.isNewIssue ? -1 : 1;
        const aImpr = a.listing.snapshots[a.listing.snapshots.length - 1].totalImpressions;
        const bImpr = b.listing.snapshots[b.listing.snapshots.length - 1].totalImpressions;
        return bImpr - aImpr;
      });
  }

  /**
   * Compute KPI comparisons between the two most recent reports.
   * Returns { totalImpressions, avgCTR, totalSold, listingCount } each with { curr, prev, pctChange }.
   */
  function computeKPIComparison(aggregateTrend) {
    if (aggregateTrend.length < 2) return null;
    const curr = aggregateTrend[aggregateTrend.length - 1];
    const prev = aggregateTrend[aggregateTrend.length - 2];

    function diff(a, b) {
      const pct = a === 0 ? null : ((b - a) / Math.abs(a)) * 100;
      return { prev: a, curr: b, pctChange: pct };
    }

    return {
      totalImpressions: diff(prev.totalImpressions, curr.totalImpressions),
      avgCTR: diff(prev.avgCTR, curr.avgCTR),
      totalSold: diff(prev.totalSold, curr.totalSold),
      listingCount: diff(prev.listingCount, curr.listingCount),
    };
  }

  /**
   * Build side-by-side comparison between two reports (by report id).
   * Returns array of { itemId, title, r1, r2, changes } sorted by abs impressions change desc.
   */
  function buildComparison(report1, report2) {
    if (!report1 || !report2) return [];

    const map1 = {};
    (report1.data || []).forEach(l => { if (l.itemId) map1[l.itemId] = l; });

    const map2 = {};
    (report2.data || []).forEach(l => { if (l.itemId) map2[l.itemId] = l; });

    const allIds = new Set([...Object.keys(map1), ...Object.keys(map2)]);

    const rows = [];
    allIds.forEach(id => {
      const l1 = map1[id];
      const l2 = map2[id];

      const impressionsChange = pctChange(
        l1 ? (l1.totalImpressions || 0) : null,
        l2 ? (l2.totalImpressions || 0) : null
      );

      rows.push({
        itemId: id,
        title: (l2 || l1).title,
        r1: l1 ? {
          totalImpressions: l1.totalImpressions || 0,
          ctr: l1.ctr || 0,
          totalPageViews: l1.totalPageViews || 0,
          quantitySold: l1.quantitySold || 0,
          healthScore: l1.healthScore || 0,
          healthBadge: l1.healthBadge || 'red',
        } : null,
        r2: l2 ? {
          totalImpressions: l2.totalImpressions || 0,
          ctr: l2.ctr || 0,
          totalPageViews: l2.totalPageViews || 0,
          quantitySold: l2.quantitySold || 0,
          healthScore: l2.healthScore || 0,
          healthBadge: l2.healthBadge || 'red',
        } : null,
        impressionsChange,
        isNew: !l1 && !!l2,
        isDelisted: !!l1 && !l2,
      });
    });

    // Sort by absolute impressions change descending (continuous listings first)
    rows.sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
      if (a.isDelisted !== b.isDelisted) return a.isDelisted ? 1 : -1;
      const ac = Math.abs(a.impressionsChange || 0);
      const bc = Math.abs(b.impressionsChange || 0);
      return bc - ac;
    });

    return rows;
  }

  return {
    buildListingTimeline,
    computeListingChange,
    computeAggregateTrend,
    getTopListingTimelines,
    getDeclinedListings,
    computeKPIComparison,
    buildComparison,
  };
})();
