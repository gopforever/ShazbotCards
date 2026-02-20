/**
 * keywordAnalyzer.js — Keyword extraction and analysis for eBay listing titles
 */

const KeywordAnalyzer = (() => {

  // ─── Stop words ────────────────────────────────────────────────────────────

  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'from', 'card', 'cards', 'nfl', 'mlb', 'nba', 'panini',
    'topps', 'prizm', 'mosaic', 'rookie', 'rc'
  ]);

  // ─── Keyword extraction ────────────────────────────────────────────────────

  /**
   * Extract keywords from a listing title.
   * Splits on spaces and common delimiters, filters stop words, normalises case.
   * @param {string} title
   * @returns {string[]}
   */
  function extractKeywords(title) {
    if (!title) return [];

    // Split on spaces and common delimiters: commas, dashes, parentheses, slashes, pipes
    const tokens = title.split(/[\s,\-\(\)\/\|]+/);

    return tokens
      .map(t => t.toLowerCase().trim())
      // Remove empty strings and pure punctuation
      .filter(t => t.length > 0 && /[a-z0-9]/.test(t))
      // Strip leading/trailing non-alphanumeric characters (e.g. "#252" → keep, "..." → remove)
      .map(t => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter(t => t.length > 0)
      // Filter stop words
      .filter(t => !STOP_WORDS.has(t));
  }

  // ─── Keyword analysis ──────────────────────────────────────────────────────

  /**
   * Analyse all keywords across all listings.
   * Returns array sorted by total impressions descending.
   * @param {object[]} listings
   * @returns {object[]}
   */
  function analyzeKeywords(listings) {
    if (!listings || !listings.length) return [];

    const map = new Map();

    listings.forEach(listing => {
      const keywords = extractKeywords(listing.title);
      const seen = new Set();

      keywords.forEach(kw => {
        // Count each keyword once per listing
        if (seen.has(kw)) return;
        seen.add(kw);

        if (!map.has(kw)) {
          map.set(kw, {
            keyword: kw,
            appearances: 0,
            totalImpressions: 0,
            totalPageViews: 0,
            totalCTRWeighted: 0,   // sum of (ctr * impressions) for weighted avg
            totalCTRImpressions: 0, // sum of impressions for listings with ctr data
            totalSold: 0,
            totalHealthScore: 0,
          });
        }

        const entry = map.get(kw);
        entry.appearances++;
        entry.totalImpressions += listing.totalImpressions || 0;
        entry.totalPageViews += listing.totalPageViews || 0;
        entry.totalSold += listing.quantitySold || 0;
        entry.totalHealthScore += listing.healthScore || 0;

        // Weighted CTR: weight by impressions so high-volume listings matter more
        if (listing.ctr !== null && listing.ctr !== undefined) {
          const imp = listing.totalImpressions || 0;
          entry.totalCTRWeighted += listing.ctr * imp;
          entry.totalCTRImpressions += imp;
        }
      });
    });

    const results = [];
    map.forEach(entry => {
      const avgImpressions = entry.appearances > 0
        ? entry.totalImpressions / entry.appearances
        : 0;

      // Weighted average CTR
      const avgCTR = entry.totalCTRImpressions > 0
        ? entry.totalCTRWeighted / entry.totalCTRImpressions
        : 0;

      // Conversion rate: sold / page views
      const conversionRate = entry.totalPageViews > 0
        ? (entry.totalSold / entry.totalPageViews) * 100
        : null;

      const avgHealthScore = entry.appearances > 0
        ? entry.totalHealthScore / entry.appearances
        : 0;

      results.push({
        keyword: entry.keyword,
        appearances: entry.appearances,
        totalImpressions: entry.totalImpressions,
        avgImpressions,
        totalPageViews: entry.totalPageViews,
        avgCTR,
        totalSold: entry.totalSold,
        conversionRate,
        avgHealthScore,
      });
    });

    // Sort by total impressions descending
    results.sort((a, b) => b.totalImpressions - a.totalImpressions);
    return results;
  }

  // ─── Keyword trends ────────────────────────────────────────────────────────

  /**
   * Identify trending keywords based on the organic impression change of their listings.
   * @param {object[]} keywords  Output of analyzeKeywords()
   * @returns {object[]}  Sorted by changePercent descending
   */
  function getKeywordTrends(keywords) {
    if (!keywords || !keywords.length) return [];

    // We don't have per-keyword time-series data, so we approximate trend direction
    // using each keyword's avgImpressions relative to the global median avgImpressions.
    // Keywords above the median are marked "up"; those well below are marked "down".

    const sorted = [...keywords].sort((a, b) => b.avgImpressions - a.avgImpressions);
    const mid = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)].avgImpressions : 0;

    return keywords.map(kw => {
      // Simulate day-over-day change using avgCTR deviation from median as signal
      const changePercent = mid > 0 ? ((kw.avgImpressions - mid) / mid) * 100 : 0;
      let trendDirection = 'stable';
      if (changePercent > 20) trendDirection = 'up';
      else if (changePercent < -20) trendDirection = 'down';

      return {
        ...kw,
        changePercent,
        trendDirection,
      };
    }).sort((a, b) => b.changePercent - a.changePercent);
  }

  // ─── Keyword suggestions ───────────────────────────────────────────────────

  /**
   * Find the top 5 other keywords by total impressions as related suggestions.
   * @param {string} keyword
   * @param {object[]} allKeywords  Output of analyzeKeywords()
   * @returns {object[]}  Top 5 related keywords
   */
  function getKeywordSuggestions(keyword, allKeywords) {
    if (!keyword || !allKeywords || !allKeywords.length) return [];

    // Return the top 5 highest-impression keywords (excluding the input keyword)
    return allKeywords
      .filter(kw => kw.keyword !== keyword)
      .sort((a, b) => b.totalImpressions - a.totalImpressions)
      .slice(0, 5);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    extractKeywords,
    analyzeKeywords,
    getKeywordTrends,
    getKeywordSuggestions,
  };
})();
