/**
 * ebayAPI.js — eBay Trading API wrapper for ShazbotCards
 * Wraps the XML-based eBay Trading API with a clean async JS interface.
 *
 * API Reference: https://developer.ebay.com/DevZone/XML/docs/Reference/eBay/index.html
 *
 * TODO (future): Migrate to eBay REST APIs once Trading API is fully deprecated.
 * TODO (future): Add OAuth token refresh flow.
 */

class eBayTradingAPI {
  /**
   * @param {object} config  eBayConfig.getConfig() output
   */
  constructor(config) {
    this._config = config;
    // Rate-limiting: max 1 call per second (eBay allows up to 5 000/day in production)
    this._lastCallTime = 0;
    this._MIN_INTERVAL_MS = 1000;

    // In-memory cache: key → { data, timestamp }
    this._cache = new Map();
    this._CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  }

  // ─── Rate limiting ────────────────────────────────────────────────────────

  async _waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - this._lastCallTime;
    if (elapsed < this._MIN_INTERVAL_MS) {
      await this._sleep(this._MIN_INTERVAL_MS - elapsed);
    }
    this._lastCallTime = Date.now();
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────

  _cacheGet(key) {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this._CACHE_TTL_MS) {
      this._cache.delete(key);
      return null;
    }
    return entry.data;
  }

  _cacheSet(key, data) {
    this._cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this._cache.clear();
  }

  // ─── Token validation ─────────────────────────────────────────────────────

  /**
   * Validate that the token is not expired and present.
   * @throws {Error} if the token is missing or expired
   */
  validateToken() {
    if (!this._config.token) {
      throw new Error('No eBay user token configured. Please add your token in eBay Settings.');
    }
    if (this._config.tokenExpiry) {
      const expiry = new Date(this._config.tokenExpiry);
      if (expiry < new Date()) {
        throw new Error(`eBay token expired on ${expiry.toLocaleDateString()}. Please renew your token.`);
      }
    }
  }

  // ─── XML request builder ──────────────────────────────────────────────────

  /**
   * Build a complete XML Trading API request envelope.
   * @param {string} apiCall  e.g. 'GetMyeBaySelling'
   * @param {string} body     Inner XML body (inside the request element)
   * @returns {string}
   */
  buildXMLRequest(apiCall, body) {
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<${apiCall}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
        `<RequesterCredentials>` +
          `<eBayAuthToken>${this._escapeXML(this._config.token)}</eBayAuthToken>` +
        `</RequesterCredentials>` +
        (body || '') +
      `</${apiCall}Request>`
    );
  }

  /** Escape special XML characters in a value */
  _escapeXML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ─── XML response parser ──────────────────────────────────────────────────

  /**
   * Parse an eBay XML response into a plain JS object using DOMParser.
   * @param {string} xml
   * @returns {object}  Parsed representation of the XML
   */
  parseXMLResponse(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Failed to parse eBay XML response: ' + parseError.textContent);
    }

    return this._xmlNodeToObj(doc.documentElement);
  }

  /** Recursively convert a DOM node to a plain object */
  _xmlNodeToObj(node) {
    // Text-only node
    if (node.children.length === 0) {
      return node.textContent;
    }

    const obj = {};
    for (const child of node.children) {
      const key = child.localName;
      const value = this._xmlNodeToObj(child);

      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Multiple siblings with same tag → array
        if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
        obj[key].push(value);
      } else {
        obj[key] = value;
      }
    }
    return obj;
  }

  // ─── Core HTTP call ───────────────────────────────────────────────────────

  /**
   * Execute a Trading API call.
   * @param {string} apiCall  e.g. 'GetMyeBaySelling'
   * @param {string} body     XML body (inside the request element, excluding credentials)
   * @param {object} [opts]   { skipCache: bool, timeoutMs: number }
   * @returns {Promise<object>}  Parsed response object
   */
  async _call(apiCall, body, opts = {}) {
    this.validateToken();
    await this._waitForRateLimit();

    const cacheKey = `${apiCall}:${body}`;
    if (!opts.skipCache) {
      const cached = this._cacheGet(cacheKey);
      if (cached) return cached;
    }

    const endpoint = eBayConfig.getEndpoint();
    const headers = eBayConfig.buildHeaders(apiCall);
    const xmlBody = this.buildXMLRequest(apiCall, body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: xmlBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`eBay API HTTP error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const parsed = this.parseXMLResponse(text);
    const result = parsed[`${apiCall}Response`] || parsed;

    this.handleAPIError(result);

    if (!opts.skipCache) {
      this._cacheSet(cacheKey, result);
    }

    return result;
  }

  // ─── Error handling ───────────────────────────────────────────────────────

  /**
   * Check the parsed response for eBay API errors and throw if found.
   * @param {object} result
   */
  handleAPIError(result) {
    const ack = result.Ack;
    if (ack === 'Failure' || ack === 'PartialFailure') {
      const errors = result.Errors;
      if (errors) {
        const errArr = Array.isArray(errors) ? errors : [errors];
        const severe = errArr.find(e => e.SeverityCode === 'Error');
        const msg = severe
          ? `${severe.ShortMessage} — ${severe.LongMessage || ''}`.trim()
          : 'Unknown eBay API error';

        // Check for specific error codes
        const code = severe ? String(severe.ErrorCode) : '';
        if (code === '931' || code === '932' || code === '16110') {
          throw new Error('eBay token is invalid or expired. Please update your token in settings.');
        }

        throw new Error(`eBay API error: ${msg}`);
      }
      if (ack === 'Failure') {
        throw new Error('eBay API returned Failure with no error details.');
      }
    }
  }

  // ─── Listing operations ───────────────────────────────────────────────────

  /**
   * Get a single eBay listing by Item ID.
   * @param {string} itemID
   * @returns {Promise<object>}  The Item object from eBay
   */
  async getItem(itemID) {
    const body = `<ItemID>${this._escapeXML(itemID)}</ItemID>` +
      `<DetailLevel>ReturnAll</DetailLevel>`;
    const result = await this._call('GetItem', body);
    return result.Item || result;
  }

  /**
   * Fetch active listings from "My eBay Selling".
   * @param {number} [page=1]
   * @param {number} [entriesPerPage=200]
   * @returns {Promise<object>}
   */
  async getMyeBaySelling(page = 1, entriesPerPage = 200) {
    const body =
      `<ActiveList>` +
        `<Include>true</Include>` +
        `<Pagination>` +
          `<EntriesPerPage>${Math.min(200, entriesPerPage)}</EntriesPerPage>` +
          `<PageNumber>${page}</PageNumber>` +
        `</Pagination>` +
      `</ActiveList>`;
    return this._call('GetMyeBaySelling', body, { skipCache: true });
  }

  /**
   * Fetch all active listings across all pages.
   * @param {Function} [onPage]  Called with (pageNum, totalPages) for progress
   * @returns {Promise<object[]>}  Flat array of ItemArray items
   */
  async getAllActiveListings(onPage) {
    const items = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await this.getMyeBaySelling(page, 200);
      const activeList = result.ActiveList || {};
      const pagination = activeList.PaginationResult || {};

      totalPages = parseInt(pagination.TotalNumberOfPages || '1', 10) || 1;
      const itemArray = activeList.ItemArray;

      if (itemArray) {
        const rawItems = itemArray.Item;
        if (Array.isArray(rawItems)) {
          items.push(...rawItems);
        } else if (rawItems) {
          items.push(rawItems);
        }
      }

      if (typeof onPage === 'function') onPage(page, totalPages);
      page++;

      // Rate-limit between pages
      if (page <= totalPages) await this._sleep(1100);
    } while (page <= totalPages);

    return items;
  }

  /**
   * Update a listing's title and/or price.
   * @param {string} itemID
   * @param {object} updates  { title?: string, price?: string|number }
   * @returns {Promise<object>}
   */
  async reviseItem(itemID, updates) {
    let itemXML = `<Item><ItemID>${this._escapeXML(itemID)}</ItemID>`;

    if (updates.title) {
      itemXML += `<Title>${this._escapeXML(updates.title.substring(0, 80))}</Title>`;
    }
    if (updates.price != null) {
      const priceVal = parseFloat(updates.price).toFixed(2);
      itemXML += `<StartPrice>${this._escapeXML(priceVal)}</StartPrice>`;
    }
    if (updates.description) {
      itemXML += `<Description>${this._escapeXML(updates.description)}</Description>`;
    }

    itemXML += '</Item>';

    return this._call('ReviseItem', itemXML, { skipCache: true });
  }

  /**
   * End an active listing.
   * @param {string} itemID
   * @param {string} [reason='NotAvailable']  EndingReason value
   * @returns {Promise<object>}
   */
  async endItem(itemID, reason = 'NotAvailable') {
    const body =
      `<ItemID>${this._escapeXML(itemID)}</ItemID>` +
      `<EndingReason>${this._escapeXML(reason)}</EndingReason>`;
    return this._call('EndItem', body, { skipCache: true });
  }

  /**
   * Relist a previously ended item.
   * @param {string} itemID
   * @returns {Promise<object>}
   */
  async relistItem(itemID) {
    const body = `<ItemID>${this._escapeXML(itemID)}</ItemID>`;
    return this._call('RelistItem', body, { skipCache: true });
  }

  // ─── User operations ──────────────────────────────────────────────────────

  /**
   * Get account information for the authenticated user.
   * Used to validate the token.
   * @returns {Promise<object>}
   */
  async getUser() {
    const result = await this._call('GetUser', '', { skipCache: true });
    return result.User || result;
  }

  /**
   * Get seller's items with optional filters.
   * @param {object} [options]  { startTimeFrom, startTimeTo, entriesPerPage, pageNumber }
   * @returns {Promise<object>}
   */
  async getSellerList(options = {}) {
    const {
      startTimeFrom,
      startTimeTo,
      entriesPerPage = 200,
      pageNumber = 1,
    } = options;

    const now = new Date();
    const from = startTimeFrom || new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = startTimeTo || now.toISOString();

    const body =
      `<StartTimeFrom>${this._escapeXML(from)}</StartTimeFrom>` +
      `<StartTimeTo>${this._escapeXML(to)}</StartTimeTo>` +
      `<Pagination>` +
        `<EntriesPerPage>${Math.min(200, entriesPerPage)}</EntriesPerPage>` +
        `<PageNumber>${pageNumber}</PageNumber>` +
      `</Pagination>` +
      `<DetailLevel>ReturnAll</DetailLevel>`;

    return this._call('GetSellerList', body);
  }
}

// Lazy singleton — created on first access using current config
let _apiInstance = null;

/**
 * Return a (cached) eBayTradingAPI instance using the current config.
 * Call eBayAPIFactory.reset() if the config changes.
 */
const eBayAPIFactory = {
  get() {
    if (!_apiInstance) {
      _apiInstance = new eBayTradingAPI(eBayConfig.getConfig());
    }
    return _apiInstance;
  },
  reset() {
    _apiInstance = null;
  },
};

// ─── OAuth + Proxy API class ──────────────────────────────────────────────────

/**
 * eBayAPI — Makes eBay API calls via a backend proxy using OAuth 2.0 tokens.
 * Used when the user has connected their account via the OAuth flow.
 */
class eBayAPI {
  /**
   * @param {object} config
   * @param {string}    config.proxyURL   Backend proxy base URL
   * @param {eBayOAuth} config.oauth      eBayOAuth instance for token management
   * @param {string}    [config.environment='production']
   */
  constructor(config) {
    this.proxyURL    = config.proxyURL;
    this.oauth       = config.oauth;
    this.environment = config.environment || 'production';
  }

  /**
   * Make an authenticated API call via the backend proxy.
   * Automatically refreshes the token on 401 and retries once.
   * @param {string} apiCall   eBay API call name (e.g. 'GetMyeBaySelling')
   * @param {object} [body]    Request body payload
   * @returns {Promise<object>}
   */
  async makeAPICall(apiCall, body) {
    const token = await this.oauth.getAccessToken();

    const response = await fetch(`${this.proxyURL}/api/ebay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        apiCall,
        body,
        environment: this.environment,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token may have expired server-side; refresh and retry once
        await this.oauth.refreshToken();
        return this.makeAPICall(apiCall, body);
      }
      throw new Error(`eBay API call failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch active listings.
   * @param {number} [page=1]
   * @param {number} [entriesPerPage=200]
   * @returns {Promise<object>}
   */
  async getMyeBaySelling(page = 1, entriesPerPage = 200) {
    return this.makeAPICall('GetMyeBaySelling', { page, entriesPerPage });
  }

  /**
   * Get a single listing by Item ID.
   * @param {string} itemID
   * @returns {Promise<object>}
   */
  async getItem(itemID) {
    return this.makeAPICall('GetItem', { itemID });
  }

  /**
   * Update a listing's title and/or price.
   * @param {string} itemID
   * @param {object} updates  { title?, price? }
   * @returns {Promise<object>}
   */
  async reviseItem(itemID, updates) {
    return this.makeAPICall('ReviseItem', { itemID, updates });
  }
}
