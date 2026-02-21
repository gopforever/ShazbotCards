/**
 * cogs.js — COGS (Cost of Goods Sold) calculator for ShazbotCards
 * Handles materials management, shipping rules, and profitability calculations.
 */

const COGS = (() => {
  'use strict';

  const STORAGE_KEY = 'shazbot-cogs-settings';
  const SETTINGS_VERSION = 3; // bump this whenever DEFAULTS.materials structure changes

  // ─── Default Settings ──────────────────────────────────────────────────────

  const DEFAULTS = {
    ebayFeeRate: 0.1325,
    shipping: {
      ese: { label: 'eBay Std Envelope', postage: 1.03 },
      ga:  { label: 'Ground Advantage',  postage: 5.08 },
      threshold: 20.00, // listings > $20 auto-assign GA
    },
    materials: [
      { id: 'sleeve',  name: 'Ultra Pro Penny Sleeves',         packCount: 500, packPrice:  8.58, unitCost: 0.02, includePerSale: true,  methods: ['ese','ga'] },
      { id: 'topldr',  name: 'Ultra Pro 3x4 Top Loader',        packCount: 200, packPrice: 33.98, unitCost: 0.17, includePerSale: true,  methods: ['ese','ga'] },
      { id: 'teambag', name: 'Team Bags 3x4 (35pt) - DEDC',     packCount: 100, packPrice:  5.25, unitCost: 0.05, includePerSale: true,  methods: ['ese','ga'] },
      { id: 'env',     name: 'Ding Defend Shipping Envelopes',  packCount: 110, packPrice: 24.97, unitCost: 0.23, includePerSale: true,  methods: ['ese'] },       // ESE only
      { id: 'bubble',  name: 'Bubble Mailers 4x7 Poly Padded',  packCount:  50, packPrice:  9.88, unitCost: 0.20, includePerSale: true,  methods: ['ga']  },       // GA only
      { id: 'hobb',    name: 'Hobby Armor 3.5x4.5',             packCount:  50, packPrice:  8.56, unitCost: 0.17, includePerSale: false, methods: ['ese','ga'] },
      { id: 'graded',  name: 'Graded Card Sleeves Resealable',  packCount: 300, packPrice:  7.99, unitCost: 0.03, includePerSale: false, methods: ['ese','ga'] },
    ],
  };

  // ─── Persistence ──────────────────────────────────────────────────────────

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));

      const saved = JSON.parse(raw);

      // If version mismatch, reset materials to DEFAULTS but keep user's non-material prefs
      if (!saved._version || saved._version < SETTINGS_VERSION) {
        const fresh = JSON.parse(JSON.stringify(DEFAULTS));
        fresh._version = SETTINGS_VERSION;
        // Preserve user's ebayFeeRate if they customized it
        if (saved.ebayFeeRate !== undefined) fresh.ebayFeeRate = saved.ebayFeeRate;
        // Save the fresh version so next load is clean
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch(e) {}
        return fresh;
      }

      return saved;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  function save(settings) {
    try {
      settings._version = SETTINGS_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) { /* ignore */ }
  }

  // ─── Calculation ──────────────────────────────────────────────────────────

  /**
   * Calculate COGS and profit for a single listing.
   * @param {object} listing - local listing object with price, quantity, shippingOverride
   * @param {object} settings - COGS settings
   * @returns {object} { shippingMethod, shippingCost, ebayFee, materialCost, cogs, netProfit, margin }
   */
  function calcListing(listing, settings) {
    const price = listing.price || 0;
    const qty = listing.quantity || 1;
    settings = settings || load();

    // Determine shipping method
    const autoMethod = price > settings.shipping.threshold ? 'ga' : 'ese';
    const method = listing.shippingOverride || autoMethod;
    const ship = settings.shipping[method];

    const ebayFee = price * settings.ebayFeeRate;

    // Sum materials that are includePerSale AND apply to this shipping method
    const materialCost = settings.materials
      .filter(m => {
        if (!m.includePerSale) return false;
        if (m.methods && m.methods.length > 0) {
          return m.methods.includes(method);
        }
        return true;
      })
      .reduce((sum, m) => sum + (m.unitCost || 0), 0);

    // Postage only (material already counted above)
    const postage = ship.postage || 0;

    const cogs = ebayFee + materialCost + postage;
    const netProfit = price - cogs;
    const margin = price > 0 ? (netProfit / price) * 100 : 0;

    return {
      shippingMethod: method,
      shippingLabel: ship.label,
      shippingCost: postage,
      ebayFee: parseFloat(ebayFee.toFixed(4)),
      materialCost: parseFloat(materialCost.toFixed(4)),
      cogs: parseFloat(cogs.toFixed(4)),
      netProfit: parseFloat(netProfit.toFixed(4)),
      margin: parseFloat(margin.toFixed(2)),
      qty,
      totalNetProfit: parseFloat((netProfit * qty).toFixed(4)),
      totalCogs: parseFloat((cogs * qty).toFixed(4)),
    };
  }

  /**
   * Calculate portfolio-level COGS summary across all listings.
   * @param {Array} listings
   * @param {object} settings
   */
  function calcPortfolio(listings, settings) {
    settings = settings || load();
    let totalValue = 0;
    let totalCogs = 0;
    let totalNetProfit = 0;
    let totalQty = 0;

    listings.forEach(l => {
      const price = l.price || 0;
      const qty = l.quantity || 1;
      const result = calcListing(l, settings);
      totalValue += price * qty;
      totalCogs += result.cogs * qty;
      totalNetProfit += result.netProfit * qty;
      totalQty += qty;
    });

    const avgMargin = totalValue > 0 ? (totalNetProfit / totalValue) * 100 : 0;

    return {
      totalValue:     parseFloat(totalValue.toFixed(2)),
      totalCogs:      parseFloat(totalCogs.toFixed(2)),
      totalNetProfit: parseFloat(totalNetProfit.toFixed(2)),
      avgMargin:      parseFloat(avgMargin.toFixed(2)),
      totalQty,
      listingCount:   listings.length,
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return { load, save, calcListing, calcPortfolio, DEFAULTS };
})();
