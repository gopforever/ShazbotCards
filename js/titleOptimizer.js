/**
 * titleOptimizer.js — AI-powered eBay listing title optimizer
 * Uses GitHub Models API (free tier) to generate optimized title suggestions.
 */

const TitleOptimizer = (() => {
  'use strict';

  const STORAGE_KEY = 'shazbotcards_github_token';
  const API_ENDPOINT = 'https://models.inference.ai.azure.com';
  const PREFERRED_MODELS = ['gpt-4o-mini', 'Phi-4'];

  // ─── Power words scored for eBay sports cards ──────────────────────────────

  const POWER_WORDS = [
    'rookie', 'rc', 'auto', 'autograph', 'psa', 'bgs', 'sgc', 'graded',
    'prizm', 'select', 'certified', 'numbered', 'refractor', 'chrome',
    'parallel', 'gold', 'silver', 'holo', 'sp', 'ssp', 'variation',
    'patch', 'rpa', 'lot', 'rare', 'short print', 'optic', 'mosaic',
    'bowman', 'topps', 'panini', 'donruss', 'fleer', 'upper deck',
  ];

  // ─── Token management ─────────────────────────────────────────────────────

  function saveToken(token) {
    if (!token || typeof token !== 'string' || token.trim().length < 10) return false;
    try {
      localStorage.setItem(STORAGE_KEY, token.trim());
      return true;
    } catch (e) {
      return false;
    }
  }

  function getToken() {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  function hasValidToken() {
    const token = getToken();
    return token !== null && token.length >= 10;
  }

  /**
   * Validate a GitHub token by calling the GitHub API.
   * @param {string} token  GitHub personal access token
   * @returns {Promise<{valid: boolean, user?: string, error?: string}>}
   */
  async function validateToken(token) {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
        },
      });

      if (response.ok) {
        const user = await response.json();
        console.log('Token validated for user:', user.login);
        return { valid: true, user: user.login };
      } else {
        console.error('Token validation failed:', response.status);
        return { valid: false, error: 'Invalid token' };
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false, error: error.message };
    }
  }

  // ─── Title quality analysis ───────────────────────────────────────────────

  /**
   * Score a listing title on a 0-100 scale across multiple dimensions.
   * @param {object} listing  Enriched listing object
   * @param {object[]} allListings  Full dataset (for keyword context)
   * @returns {object}  { total, breakdown: { keywords, length, powerWords, specificity, readability, sportMatch } }
   */
  function analyzeTitleQuality(listing, allListings) {
    const title = listing.title || '';
    const titleLower = title.toLowerCase();

    // --- Keyword Density (30 pts) ---
    let keywordsScore = 0;
    if (allListings && allListings.length > 0) {
      const kwData = KeywordAnalyzer.analyzeKeywords(allListings);
      // Take top 20 keywords by impressions as "high-performing"
      const topKws = kwData.slice(0, 20).map(k => k.keyword);
      const matchCount = topKws.filter(kw => titleLower.includes(kw)).length;
      keywordsScore = Math.min(30, Math.round((matchCount / Math.max(topKws.length, 1)) * 30 * 3));
    }

    // --- Length Optimization (20 pts) ---
    // Optimal: 70-80 chars; good: 60-69 or exactly 80; ok: 50-59; poor: <50 or >80
    let lengthScore = 0;
    const len = title.length;
    if (len >= 70 && len <= 80) {
      lengthScore = 20;
    } else if (len >= 60 && len < 70) {
      lengthScore = 15;
    } else if (len >= 50 && len < 60) {
      lengthScore = 10;
    } else if (len > 80) {
      // Over limit — penalise proportionally
      lengthScore = Math.max(0, 20 - Math.round((len - 80) * 2));
    } else {
      // Under 50
      lengthScore = Math.max(0, Math.round((len / 50) * 8));
    }

    // --- Power Words (15 pts) ---
    const powerMatches = POWER_WORDS.filter(pw => titleLower.includes(pw)).length;
    const powerWordsScore = Math.min(15, powerMatches * 5);

    // --- Specificity (15 pts): year, player, card number, parallel ─────────
    let specificityScore = 0;
    if (/\b(19|20)\d{2}\b/.test(title)) specificityScore += 4; // year
    if (/\b#?\d{1,4}\b/.test(title)) specificityScore += 3;    // card number
    if (/\b(football|baseball|basketball|nfl|mlb|nba)\b/i.test(title)) specificityScore += 2;
    // Contains slash or hyphen-separated detail (e.g. "PSA 9" or "RC Auto")
    if (/\b(psa|bgs|sgc)\s*\d/i.test(title)) specificityScore += 3;
    if (title.split(/\s+/).length >= 6) specificityScore += 3; // reasonably detailed
    specificityScore = Math.min(15, specificityScore);

    // --- Readability (10 pts) ---
    let readabilityScore = 10;
    // Deduct for excessive punctuation
    const punctCount = (title.match(/[!?*#@$%^&]/g) || []).length;
    readabilityScore -= Math.min(5, punctCount * 2);
    // Deduct for ALL CAPS words (more than 3)
    const allCapsWords = (title.match(/\b[A-Z]{3,}\b/g) || []).length;
    if (allCapsWords > 4) readabilityScore -= Math.min(5, (allCapsWords - 4) * 1);
    readabilityScore = Math.max(0, readabilityScore);

    // --- Sport Category Match (10 pts) ---
    const detectedSport = listing.sport || 'Other';
    let sportMatchScore = 0;
    if (detectedSport !== 'Other') {
      const sportKeywords = {
        Football: ['football', 'nfl', 'quarterback', 'qb', 'rb', 'wr'],
        Baseball: ['baseball', 'mlb', 'pitcher', 'bowman', 'prospect'],
        Basketball: ['basketball', 'nba', 'hoops'],
      };
      const sportKws = sportKeywords[detectedSport] || [];
      const hasSportKw = sportKws.some(kw => titleLower.includes(kw));
      sportMatchScore = hasSportKw ? 10 : 5;
    } else {
      sportMatchScore = 5; // neutral for unknown sport
    }

    const total = keywordsScore + lengthScore + powerWordsScore + specificityScore + readabilityScore + sportMatchScore;

    return {
      total: Math.min(100, total),
      breakdown: {
        keywords: keywordsScore,
        length: lengthScore,
        powerWords: powerWordsScore,
        specificity: specificityScore,
        readability: readabilityScore,
        sportMatch: sportMatchScore,
      },
    };
  }

  // ─── AI Title Generator ──────────────────────────────────────────────────

  /**
   * Call GitHub Models API to generate optimized titles.
   * @param {object} listing  Enriched listing object
   * @param {object[]} allListings  Full dataset
   * @returns {Promise<object[]>}  Array of { title, qualityScore, estimatedCTRImprovement }
   */
  async function generateOptimizedTitles(listing, allListings) {
    const token = getToken();
    if (!token) throw new Error('No GitHub token stored. Please add your token first.');

    const kwData = KeywordAnalyzer.analyzeKeywords(allListings);
    const topKeywords = kwData.slice(0, 10).map(k => k.keyword).join(', ');

    const prompt = `You are an eBay listing optimization expert specializing in sports cards.
Generate 3-5 optimized eBay listing titles for better Click-Through Rate (CTR).

Current Title: ${listing.title}
Sport: ${listing.sport || 'Unknown'}
Current CTR: ${(listing.ctr || 0).toFixed(2)}%
Top Keywords: ${topKeywords}

Requirements:
- Maximum 80 characters per title
- Include high-performing keywords from the list above where accurate
- Front-load the most important terms (player name, year, card type)
- Use power words where accurate (RC, Auto, PSA, Prizm, Numbered, etc.)
- Be specific about card details (year, brand, player, team, card number, parallel)
- Maintain accuracy — do not add false information
- Improve upon the current title meaningfully

Return ONLY a valid JSON array of objects. Each object must have a "title" string field.
Example format: [{"title":"2024 Prizm Patrick Mahomes Chiefs RC Auto #/99 PSA 10"},{"title":"..."}]`;

    let lastError = null;

    for (const model of PREFERRED_MODELS) {
      try {
        const response = await fetchWithTimeout(`${API_ENDPOINT}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 500,
          }),
        }, 30000);

        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (response.status === 401) {
          throw new Error('Invalid GitHub token. Please check your token and try again.');
        }
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const titles = parseAITitles(content);

        if (titles.length === 0) {
          throw new Error('AI returned no valid titles. Please try again.');
        }

        // Score each suggestion and estimate CTR improvement
        const currentAnalysis = analyzeTitleQuality(listing, allListings);
        return titles.map(t => {
          const fakeListing = { ...listing, title: t.title };
          const analysis = analyzeTitleQuality(fakeListing, allListings);
          const scoreDiff = analysis.total - currentAnalysis.total;
          // Rough heuristic: each quality score point ≈ 0.2% CTR improvement.
          // This is a placeholder coefficient; calibrate against real performance data.
          const estimatedCTRImprovement = Math.max(0, Math.round(scoreDiff * 0.2));
          return {
            title: t.title,
            qualityScore: analysis.total,
            estimatedCTRImprovement,
          };
        });

      } catch (err) {
        lastError = err;
        // Only retry with next model for non-auth/rate-limit errors
        if (err.message.includes('Rate limit') || err.message.includes('Invalid GitHub token')) {
          throw err;
        }
        // Detect CSP/network block — no point retrying other models
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          throw new Error(
            'Network request blocked. This may be a Content Security Policy issue. ' +
            'Make sure the site is deployed to Netlify, or run locally with a local server.'
          );
        }
        // Continue to next model
      }
    }

    throw lastError || new Error('All models failed. Please try again later.');
  }

  /**
   * Parse AI response content into an array of title objects.
   * Handles JSON embedded in prose text.
   */
  function parseAITitles(content) {
    // Try to extract JSON array from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(item => item && typeof item.title === 'string' && item.title.trim().length > 0)
        .map(item => ({ title: item.title.trim().substring(0, 80) }))
        .slice(0, 5);
    } catch (e) {
      return [];
    }
  }

  // ─── Bulk optimization ───────────────────────────────────────────────────

  /**
   * Optimize multiple listings in sequence with rate limiting and progress callbacks.
   * @param {object[]} listings  Listings to optimize (red/yellow health)
   * @param {object[]} allListings  Full dataset for keyword context
   * @param {Function} onProgress  Called with (current, total, listing) on each step
   * @returns {Promise<object[]>}  Array of { itemId, oldTitle, newTitle, improvement }
   */
  async function optimizeBulkListings(listings, allListings, onProgress) {
    const results = [];

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];

      if (typeof onProgress === 'function') {
        onProgress(i, listings.length, listing);
      }

      try {
        const suggestions = await generateOptimizedTitles(listing, allListings);
        if (suggestions.length > 0) {
          results.push({
            itemId: listing.itemId,
            oldTitle: listing.title,
            newTitle: suggestions[0].title,
            improvement: suggestions[0].estimatedCTRImprovement,
          });
        }
      } catch (err) {
        console.warn('Failed to optimize listing:', listing.itemId, err.message);
        // Re-throw rate-limit and auth errors to stop bulk processing
        if (err.message.includes('Rate limit') || err.message.includes('Invalid GitHub token')) {
          throw err;
        }
      }

      // Rate limiting: 2-second delay between requests
      if (i < listings.length - 1) {
        await sleep(2000);
      }
    }

    return results;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    saveToken,
    getToken,
    clearToken,
    hasValidToken,
    validateToken,
    analyzeTitleQuality,
    generateOptimizedTitles,
    optimizeBulkListings,
  };
})();
