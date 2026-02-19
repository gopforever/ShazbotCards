/**
 * analyzer.js — Data analysis & scoring engine for eBay listing data
 */

const Analyzer = (() => {

  // ─── Sport detection ───────────────────────────────────────────────────────

  const SPORT_PATTERNS = {
    Football: [
      /\bnfl\b/i, /\bfootball\b/i, /\bqb\b/i, /\brb\b/i, /\bwr\b/i,
      /\bpatriots\b/i, /\bchiefs\b/i, /\beagles\b/i, /\bcowboys\b/i,
      /\braiders\b/i, /\bjets\b/i, /\bcolts\b/i, /\btigers\b/i,
      /\bbears\b/i, /\bpackers\b/i, /\bsteelers\b/i, /\bcommanders\b/i,
      /\btitans\b/i, /\brams\b/i, /\bbengals\b/i,
      // Player names strongly associated with football
      /\bmahomes\b/i, /\bdaniel[s]?\b/i, /\bmanning\b/i, /\bbarkley\b/i,
      /\bpurdy\b/i, /\bcam ward\b/i, /\bjaxson dart\b/i,
      /\bdarnold\b/i, /\bhunter\b/i, /\bloveland\b/i, /\bwilliams.*bears\b/i,
      /\bharvey.*rc\b/i, /\bfergusson\b/i, /\bskattebo\b/i,
      /\bdrake maye\b/i, /\bgarrett wilson\b/i, /\bkyren\b/i,
      /\btetairoa\b/i, /\bfergu?son\b/i, /\bcolston\b/i,
      /\bmatthew golden\b/i, /\btreveyon\b/i,
    ],
    Baseball: [
      /\bmlb\b/i, /\bbaseball\b/i, /\brc\b.*\btopps\b/i, /\btopps\b.*\brc\b/i,
      /\bbowman\b/i, /\bprospect\b/i, /\bpirates\b/i, /\bdodgers\b/i,
      /\bcubs\b/i, /\broyals\b/i, /\bastros\b/i, /\bmariners\b/i,
      /\borioles\b/i, /\brays\b/i, /\bredSox\b/i, /\bred sox\b/i,
      /\bangels\b/i, /\bpadres\b/i, /\bphillies\b/i, /\bbraves\b/i,
      /\bmets\b/i, /\bnationals\b/i, /\bcardinals\b/i, /\brangers\b/i,
      /\bdiamondbacks\b/i, /\bblue jays\b/i, /\byankees\b/i,
      /\bohtani\b/i, /\bjudge\b/i, /\bskenes\b/i, /\btrout\b/i,
      /\bryan\b/i, /\braleigh\b/i, /\bwoo\b/i, /\banthony.*red sox\b/i,
      /\bjackson.*topps\b/i, /\bbo jackson\b/i, /\btatis\b/i,
      /\bacuna\b/i, /\bharper\b/i, /\bseager\b/i, /\bcarroll\b/i,
      /\bbowers.*pirates\b/i, /\bcrow.armstrong\b/i, /\bmelton.*astros\b/i,
      /\bwetherholt\b/i, /\bcaglianone\b/i, /\bcaminero\b/i,
      /\bcrawford.*phillies\b/i, /\bde paula\b/i, /\bwagner.*orioles\b/i,
      /\bjobe\b/i, /\bbremner\b/i, /\bmcadoo\b/i, /\bavina\b/i,
    ],
    Basketball: [
      /\bnba\b/i, /\bbasketball\b/i, /\bbulls\b/i, /\blakers\b/i,
      /\bjordan\b/i, /\bshaquille\b/i, /\bshaq\b/i, /\bhoops\b/i,
    ],
  };

  function detectSport(title) {
    const t = title || '';
    for (const [sport, patterns] of Object.entries(SPORT_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(t)) return sport;
      }
    }
    return 'Other';
  }

  // ─── Listing Health Score (0–100) ──────────────────────────────────────────

  /**
   * Composite score weights:
   *  - Impressions (log-normalised, 40 pts max)
   *  - CTR (30 pts max)
   *  - Top-20 % (15 pts max)
   *  - Trend direction (15 pts max)
   */
  function calcHealthScore(listing, allListings) {
    const maxImpressions = Math.max(...allListings.map(l => l.totalImpressions || 0));
    const impressions = listing.totalImpressions || 0;

    // Impression score (0-40): logarithmic scale
    let impressionScore = 0;
    if (maxImpressions > 0 && impressions > 0) {
      impressionScore = (Math.log(impressions + 1) / Math.log(maxImpressions + 1)) * 40;
    }

    // CTR score (0-30): CTR of 2%+ → full marks
    const ctr = listing.ctr || 0;
    const ctrScore = Math.min(ctr / 2.0, 1) * 30;

    // Top-20 % score (0-15)
    const top20 = listing.top20Pct || 0;
    const top20Score = Math.min(top20 / 100, 1) * 15;

    // Trend score (0-15): based on organic impression change
    let trendScore = 7.5; // neutral
    const organicChange = listing.nonSearchOrganicChangePct;
    if (organicChange !== null) {
      if (organicChange > 0) {
        trendScore = 7.5 + Math.min(organicChange / 200, 1) * 7.5;
      } else {
        trendScore = 7.5 + Math.max(organicChange / 200, -1) * 7.5;
      }
    }

    const total = impressionScore + ctrScore + top20Score + trendScore;
    return Math.round(Math.min(100, Math.max(0, total)));
  }

  function healthBadge(score) {
    if (score >= 60) return 'green';
    if (score >= 30) return 'yellow';
    return 'red';
  }

  // ─── Actionable recommendation ─────────────────────────────────────────────

  function getRecommendation(listing) {
    const imp = listing.totalImpressions || 0;
    const ctr = listing.ctr || 0;
    const views = listing.totalPageViews || 0;
    const sold = listing.quantitySold || 0;

    if (imp === 0) return { text: 'No impressions — check listing visibility & categories', priority: 'low' };
    if (imp > 50 && ctr === 0) return { text: 'High visibility but no clicks — review photos & title', priority: 'high' };
    if (imp > 20 && ctr === 0) return { text: 'Getting seen but no clicks — improve title keywords & photos', priority: 'high' };
    if (views > 0 && sold === 0 && ctr > 0) return { text: 'Getting clicks but no sales — review pricing & description', priority: 'medium' };
    if (sold > 0) return { text: 'Selling well — maintain strategy', priority: 'good' };
    if (ctr === 0) return { text: 'Low visibility — consider promoted listings or better keywords', priority: 'medium' };
    return { text: 'Monitor performance — not enough data yet', priority: 'low' };
  }

  // ─── KPI aggregates ────────────────────────────────────────────────────────

  function computeKPIs(listings) {
    const total = listings.length;
    const totalImpressions = listings.reduce((s, l) => s + (l.totalImpressions || 0), 0);
    const totalSold = listings.reduce((s, l) => s + (l.quantitySold || 0), 0);

    const ctrs = listings.map(l => l.ctr).filter(c => c !== null);
    const avgCTR = ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : 0;

    const deadListings = listings.filter(l => (l.totalPageViews || 0) === 0).length;

    return { total, totalImpressions, totalSold, avgCTR, deadListings };
  }

  // ─── Promoted vs Organic ───────────────────────────────────────────────────

  function computePromotedVsOrganic(listings) {
    const promoted = listings.filter(l => l.isPromoted);
    const organic = listings.filter(l => !l.isPromoted);

    const sumImpressions = arr => arr.reduce((s, l) => s + (l.totalImpressions || 0), 0);
    const avgCTR = arr => {
      const vals = arr.map(l => l.ctr).filter(c => c !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    return {
      promotedCount: promoted.length,
      organicCount: organic.length,
      promotedImpressions: sumImpressions(promoted),
      organicImpressions: sumImpressions(organic),
      promotedCTR: avgCTR(promoted),
      organicCTR: avgCTR(organic),
      promotedPageViews: promoted.reduce((s, l) => s + (l.totalPageViews || 0), 0),
      organicPageViews: organic.reduce((s, l) => s + (l.totalPageViews || 0), 0),
    };
  }

  // ─── Trending ──────────────────────────────────────────────────────────────

  function computeTrending(listings) {
    const withChange = listings.filter(l => l.nonSearchOrganicChangePct !== null || l.top20OrganicChangePct !== null);

    const getChange = l => {
      // Average the two change columns we have, preferring total organic
      const vals = [l.nonSearchOrganicChangePct, l.top20OrganicChangePct].filter(v => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const sorted = [...withChange].sort((a, b) => getChange(b) - getChange(a));

    return {
      trendingUp: sorted.slice(0, 10).filter(l => getChange(l) > 0),
      trendingDown: sorted.slice(-10).filter(l => getChange(l) < 0).reverse(),
      getChange,
    };
  }

  // ─── Sport breakdown ───────────────────────────────────────────────────────

  function computeSportBreakdown(listings) {
    const breakdown = {};
    listings.forEach(l => {
      const sport = detectSport(l.title);
      if (!breakdown[sport]) {
        breakdown[sport] = { count: 0, totalImpressions: 0, totalSold: 0 };
      }
      breakdown[sport].count++;
      breakdown[sport].totalImpressions += l.totalImpressions || 0;
      breakdown[sport].totalSold += l.quantitySold || 0;
    });
    return breakdown;
  }

  // ─── Priority table ────────────────────────────────────────────────────────

  function computePriorityList(listings) {
    return listings
      .map(l => ({ ...l, _rec: getRecommendation(l) }))
      .sort((a, b) => {
        // Sort: high impressions first, then by priority
        const prioOrder = { high: 0, medium: 1, low: 2, good: 3 };
        const pa = prioOrder[a._rec.priority] ?? 4;
        const pb = prioOrder[b._rec.priority] ?? 4;
        if (pa !== pb) return pa - pb;
        return (b.totalImpressions || 0) - (a.totalImpressions || 0);
      });
  }

  // ─── Full enrichment ───────────────────────────────────────────────────────

  function enrich(listings) {
    return listings.map(l => ({
      ...l,
      sport: detectSport(l.title),
      recommendation: getRecommendation(l),
    }));
  }

  function enrichWithScores(listings) {
    const enriched = enrich(listings);
    return enriched.map(l => ({
      ...l,
      healthScore: calcHealthScore(l, listings),
      healthBadge: healthBadge(calcHealthScore(l, listings)),
    }));
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    detectSport,
    calcHealthScore,
    healthBadge,
    getRecommendation,
    computeKPIs,
    computePromotedVsOrganic,
    computeTrending,
    computeSportBreakdown,
    computePriorityList,
    enrich,
    enrichWithScores,
  };
})();
