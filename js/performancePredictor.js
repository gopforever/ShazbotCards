/**
 * performancePredictor.js — AI-powered eBay listing performance predictor
 * Predicts sale probability and identifies at-risk listings using GitHub Models API.
 * Falls back to rules-based prediction when AI is unavailable.
 */

class PerformancePredictor {
  constructor() {
    this._cache = new Map();
    this._API_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';
    this._MODEL = 'gpt-4o-mini';
    this._STORAGE_KEY = 'shazbotcards_github_token';
    this._rateLimitHit = false;       // session-wide flag: if true, skip AI and use fallback for all remaining listings
    this._requestQueue = Promise.resolve(); // serializes AI calls to avoid simultaneous requests
  }

  // ─── Token helpers ──────────────────────────────────────────────────────────

  _getToken() {
    try { return localStorage.getItem(this._STORAGE_KEY) || null; } catch (e) { return null; }
  }

  // ─── Category statistics ────────────────────────────────────────────────────

  /**
   * Calculate benchmark statistics for a sport/category.
   * @param {object[]} listings   Full listing dataset
   * @param {string}   category  Sport category name
   * @returns {object}  { avgPrice, avgViewsPerDay, avgDaysToSell, sellThroughRate, count }
   */
  calculateCategoryStats(listings, category) {
    const peers = listings.filter(l => l.sport === category);
    if (!peers.length) return { avgPrice: 0, avgViewsPerDay: 0, avgDaysToSell: 30, sellThroughRate: 0, count: 0 };

    const avgViewsPerDay = peers.reduce((s, l) => {
      const days = Math.max(1, this.calculateDaysListed(l.startDate));
      return s + (l.totalPageViews || 0) / days;
    }, 0) / peers.length;

    const sold = peers.filter(l => (l.quantitySold || 0) > 0).length;
    const sellThroughRate = peers.length > 0 ? (sold / peers.length) * 100 : 0;

    return {
      avgPrice: 0,         // price not available in CSV data
      avgViewsPerDay,
      avgDaysToSell: 30,   // placeholder — not tracked in current data
      sellThroughRate,
      count: peers.length,
    };
  }

  /**
   * Number of days since listing start date.
   * @param {string} startDate
   * @returns {number}
   */
  calculateDaysListed(startDate) {
    if (!startDate) return 0;
    try {
      const start = new Date(startDate);
      const now = new Date();
      const diffMs = now - start;
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    } catch (e) {
      return 0;
    }
  }

  // ─── Cache ──────────────────────────────────────────────────────────────────

  getCacheKey(listing) {
    return `${listing.itemId}_${listing.totalPageViews}_${listing.totalImpressions}`;
  }

  clearCache() {
    this._cache.clear();
    this._rateLimitHit = false; // allow AI calls again after cache clear
  }

  // ─── Main prediction entry point ────────────────────────────────────────────

  /**
   * Predict sale probability for a listing.
   * Uses AI if token available; falls back to rules-based engine.
   * @param {object} listing        Enriched listing object
   * @param {object} categoryStats  Output of calculateCategoryStats()
   * @returns {Promise<object>}  Structured prediction data
   */
  async predictPerformance(listing, categoryStats) {
    const key = this.getCacheKey(listing);
    if (this._cache.has(key)) return this._cache.get(key);

    const token = this._getToken();

    // If no token or rate limited this session, go straight to fallback
    if (!token || this._rateLimitHit) {
      const prediction = this.validatePrediction(this.getFallbackPrediction(listing, categoryStats));
      this._cache.set(key, prediction);
      return prediction;
    }

    // Serialize AI calls with a 500ms gap between each to avoid simultaneous requests
    const result = await new Promise((resolve) => {
      this._requestQueue = this._requestQueue.then(async () => {
        await new Promise(r => setTimeout(r, 500));
        try {
          const prediction = await this.callAI(listing, categoryStats);
          resolve(this.validatePrediction(prediction));
        } catch (err) {
          if (err.message === 'Rate limit exceeded') {
            this._rateLimitHit = true; // stop all future AI calls this session
          }
          console.warn('AI prediction failed, using fallback:', err.message);
          resolve(this.validatePrediction(this.getFallbackPrediction(listing, categoryStats)));
        }
      });
    });

    this._cache.set(key, result);
    return result;
  }

  // ─── AI prediction ──────────────────────────────────────────────────────────

  /**
   * Call GitHub Models API for prediction.
   * @param {object} listing
   * @param {object} categoryStats
   * @returns {Promise<object>}
   */
  async callAI(listing, categoryStats) {
    const token = this._getToken();
    if (!token) throw new Error('No token available');

    const prompt = this.buildPrompt(listing, categoryStats);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch(this._API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: this._MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 800,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) throw new Error('Invalid GitHub token');
    if (response.status === 429) throw new Error('Rate limit exceeded');
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;
  }

  /**
   * Build the AI prompt for a listing.
   * @param {object} listing
   * @param {object} categoryStats
   * @returns {string}
   */
  buildPrompt(listing, categoryStats) {
    const daysListed = this.calculateDaysListed(listing.startDate);
    const viewsPerDay = daysListed > 0
      ? ((listing.totalPageViews || 0) / daysListed).toFixed(2)
      : 0;

    return `You are an eBay sales analytics expert for sports trading cards.
Analyze this eBay listing and predict its sale probability.

Listing Data:
- Title: ${listing.title || 'Unknown'}
- Days Listed: ${daysListed}
- Total Impressions: ${listing.totalImpressions || 0}
- Page Views: ${listing.totalPageViews || 0}
- Views/Day: ${viewsPerDay}
- CTR: ${(listing.ctr || 0).toFixed(2)}%
- Quantity Sold: ${listing.quantitySold || 0}
- Sport Category: ${listing.sport || 'Unknown'}
- Health Score: ${listing.healthScore || 0}/100
- Promoted: ${listing.isPromoted ? 'Yes' : 'No'}

Category Benchmarks (${listing.sport || 'All'}):
- Avg Views/Day: ${(categoryStats.avgViewsPerDay || 0).toFixed(2)}
- Sell-Through Rate: ${(categoryStats.sellThroughRate || 0).toFixed(1)}%

Return ONLY valid JSON (no markdown, no extra text) with this exact structure:
{
  "saleProbability": <integer 0-100>,
  "riskLevel": "<high|moderate|low>",
  "confidence": <integer 0-100>,
  "factors": [
    { "name": "<factor name>", "status": "<good|warning|poor>", "score": <0-100>, "explanation": "<brief explanation>" }
  ],
  "recommendations": [
    { "priority": <1-5>, "action": "<short action>", "details": "<specific details>", "expectedImpact": "<impact string>" }
  ],
  "predictedImpactWithChanges": <integer 0-100>
}`;
  }

  // ─── Fallback (rules-based) prediction ─────────────────────────────────────

  /**
   * Rules-based fallback prediction when AI is unavailable.
   * @param {object} listing
   * @param {object} categoryStats
   * @returns {object}
   */
  getFallbackPrediction(listing, categoryStats) {
    let score = 50; // baseline
    const factors = [];
    const recommendations = [];

    const daysListed = this.calculateDaysListed(listing.startDate);
    const viewsPerDay = daysListed > 0
      ? (listing.totalPageViews || 0) / daysListed
      : 0;
    const avgViewsPerDay = categoryStats.avgViewsPerDay || 1;
    const ctr = listing.ctr || 0;
    const impressions = listing.totalImpressions || 0;

    // CTR factor (±20 pts)
    if (ctr >= 2.0) {
      score += 20;
      factors.push({ name: 'Click-through rate', status: 'good', score: 90, explanation: `CTR of ${ctr.toFixed(2)}% is strong` });
    } else if (ctr >= 1.0) {
      score += 10;
      factors.push({ name: 'Click-through rate', status: 'warning', score: 60, explanation: `CTR of ${ctr.toFixed(2)}% is average` });
    } else if (ctr > 0) {
      score -= 5;
      factors.push({ name: 'Click-through rate', status: 'warning', score: 40, explanation: `CTR of ${ctr.toFixed(2)}% is below average` });
      recommendations.push({ priority: 1, action: 'Improve title & photos', details: 'Low CTR indicates the listing is not compelling enough in search results', expectedImpact: '+10-15% probability' });
    } else {
      score -= 10;
      factors.push({ name: 'Click-through rate', status: 'poor', score: 10, explanation: 'No clicks recorded — listing may have visibility issues' });
      recommendations.push({ priority: 1, action: 'Review listing visibility', details: 'Zero CTR may indicate category or keyword issues', expectedImpact: '+15-20% probability' });
    }

    // Views/day vs category average (±20 pts)
    if (avgViewsPerDay > 0) {
      const ratio = viewsPerDay / avgViewsPerDay;
      if (ratio >= 1.2) {
        score += 20;
        factors.push({ name: 'Page view traffic', status: 'good', score: 95, explanation: `${viewsPerDay.toFixed(1)} views/day — above category average` });
      } else if (ratio >= 0.7) {
        score += 10;
        factors.push({ name: 'Page view traffic', status: 'good', score: 65, explanation: `${viewsPerDay.toFixed(1)} views/day — near category average` });
      } else if (viewsPerDay > 0) {
        score -= 10;
        factors.push({ name: 'Page view traffic', status: 'warning', score: 35, explanation: `${viewsPerDay.toFixed(1)} views/day — below category average of ${avgViewsPerDay.toFixed(1)}` });
        recommendations.push({ priority: 2, action: 'Boost visibility', details: 'Consider promoted listings or better keywords to increase traffic', expectedImpact: '+10% probability' });
      } else {
        score -= 20;
        factors.push({ name: 'Page view traffic', status: 'poor', score: 5, explanation: 'No page views recorded' });
      }
    } else {
      factors.push({ name: 'Page view traffic', status: 'warning', score: 50, explanation: `${viewsPerDay.toFixed(1)} views/day` });
    }

    // Impressions factor
    if (impressions >= 500) {
      factors.push({ name: 'Search visibility', status: 'good', score: 85, explanation: `${impressions.toLocaleString()} impressions — high visibility` });
    } else if (impressions >= 100) {
      factors.push({ name: 'Search visibility', status: 'warning', score: 55, explanation: `${impressions.toLocaleString()} impressions — moderate visibility` });
    } else if (impressions > 0) {
      score -= 5;
      factors.push({ name: 'Search visibility', status: 'poor', score: 25, explanation: `Only ${impressions.toLocaleString()} impressions — low visibility` });
      recommendations.push({ priority: 2, action: 'Improve listing keywords', details: 'Low impressions suggest the listing is not appearing in searches', expectedImpact: '+8-12% probability' });
    } else {
      score -= 10;
      factors.push({ name: 'Search visibility', status: 'poor', score: 5, explanation: 'No impressions recorded' });
    }

    // Days listed penalty (>90 days: -15 pts)
    if (daysListed > 90) {
      score -= 15;
      factors.push({ name: 'Listing age', status: 'poor', score: 20, explanation: `Listed ${daysListed} days ago — stale listings sell less` });
      recommendations.push({ priority: 1, action: 'Refresh listing', details: 'End and relist to boost search ranking freshness', expectedImpact: '+12-18% probability' });
    } else if (daysListed > 30) {
      score -= 5;
      factors.push({ name: 'Listing age', status: 'warning', score: 55, explanation: `Listed ${daysListed} days ago` });
    } else if (daysListed > 0) {
      factors.push({ name: 'Listing age', status: 'good', score: 85, explanation: `Listed ${daysListed} days ago — fresh listing` });
    } else {
      factors.push({ name: 'Listing age', status: 'good', score: 80, explanation: 'Recently listed' });
    }

    // Health score factor
    const healthScore = listing.healthScore || 0;
    if (healthScore >= 60) {
      score += 5;
      factors.push({ name: 'Listing health', status: 'good', score: healthScore, explanation: `Health score ${healthScore}/100` });
    } else if (healthScore >= 30) {
      factors.push({ name: 'Listing health', status: 'warning', score: healthScore, explanation: `Health score ${healthScore}/100 — room for improvement` });
    } else {
      score -= 5;
      factors.push({ name: 'Listing health', status: 'poor', score: healthScore, explanation: `Low health score ${healthScore}/100` });
      recommendations.push({ priority: 3, action: 'Use AI Title Optimizer', details: 'Optimize your listing title to improve health score', expectedImpact: '+5-10% probability' });
    }

    // Promoted bonus
    if (listing.isPromoted) {
      score += 5;
      factors.push({ name: 'Promotion status', status: 'good', score: 80, explanation: 'Listing is promoted — extra visibility' });
    }

    // Already sold bonus
    if ((listing.quantitySold || 0) > 0) {
      score += 10;
      factors.push({ name: 'Sales history', status: 'good', score: 100, explanation: `${listing.quantitySold} unit(s) already sold` });
    }

    // Clamp score
    score = Math.min(100, Math.max(0, Math.round(score)));

    // Determine risk level
    let riskLevel = 'moderate';
    if (score >= 80) riskLevel = 'low';
    else if (score < 50) riskLevel = 'high';

    // Estimate impact after recommendations
    const improvementPotential = recommendations.length * 8;
    const predictedImpactWithChanges = Math.min(100, score + improvementPotential);

    return {
      saleProbability: score,
      riskLevel,
      confidence: 60,
      factors,
      recommendations: recommendations.sort((a, b) => a.priority - b.priority),
      predictedImpactWithChanges,
    };
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate and normalise a prediction object, filling missing fields.
   * @param {object} prediction
   * @returns {object}
   */
  validatePrediction(prediction) {
    if (!prediction || typeof prediction !== 'object') {
      return this._defaultPrediction();
    }

    const p = { ...prediction };

    // Clamp probability
    if (typeof p.saleProbability !== 'number' || isNaN(p.saleProbability)) {
      p.saleProbability = 50;
    }
    p.saleProbability = Math.min(100, Math.max(0, Math.round(p.saleProbability)));

    // Risk level
    if (!['high', 'moderate', 'low'].includes(p.riskLevel)) {
      p.riskLevel = p.saleProbability >= 80 ? 'low' : p.saleProbability >= 50 ? 'moderate' : 'high';
    }

    // Confidence
    if (typeof p.confidence !== 'number') p.confidence = 60;
    p.confidence = Math.min(100, Math.max(0, p.confidence));

    // Factors
    if (!Array.isArray(p.factors)) p.factors = [];

    // Recommendations
    if (!Array.isArray(p.recommendations)) p.recommendations = [];

    // Impact with changes
    if (typeof p.predictedImpactWithChanges !== 'number') {
      p.predictedImpactWithChanges = Math.min(100, p.saleProbability + 10);
    }
    p.predictedImpactWithChanges = Math.min(100, Math.max(0, p.predictedImpactWithChanges));

    return p;
  }

  _defaultPrediction() {
    return {
      saleProbability: 50,
      riskLevel: 'moderate',
      confidence: 0,
      factors: [],
      recommendations: [],
      predictedImpactWithChanges: 60,
    };
  }
}

// Singleton instance
window.PerformancePredictor = new PerformancePredictor();
