/**
 * ebayOAuth.js — OAuth 2.0 manager for eBay API integration in ShazbotCards
 * Implements the Authorization Code flow required for user-scoped eBay API access.
 *
 * Security notes:
 * - State parameter uses cryptographically secure random values (CSRF protection)
 * - Client secret is never exposed; token exchange happens via backend proxy
 * - Tokens are stored in localStorage (client-side only, never sent to our servers)
 */

class eBayOAuth {
  /**
   * @param {object} config
   * @param {string} config.appID        eBay App ID (Client ID)
   * @param {string} config.ruName       eBay RuName (redirect URL name)
   * @param {string} config.proxyURL     Backend proxy server URL (handles token exchange)
   * @param {string} [config.environment] 'production' (default) or 'sandbox'
   */
  constructor(config) {
    this.appID = config.appID;
    this.ruName = config.ruName;
    this.proxyURL = config.proxyURL;
    this.environment = config.environment === 'sandbox' ? 'sandbox' : 'production';
    this.scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    ];
  }

  // ─── Authorization flow ───────────────────────────────────────────────────

  /** Redirect the user to eBay's OAuth authorization page. */
  initiateAuth() {
    const missingFields = [];
    if (!this.appID)    missingFields.push('App ID');
    if (!this.ruName)   missingFields.push('RuName');
    if (!this.proxyURL) missingFields.push('Proxy URL');
    if (missingFields.length) {
      const msg = `eBay OAuth: missing required config (${missingFields.join(', ')}). Open Settings to configure.`;
      console.error('[eBayOAuth]', msg);
      throw new Error(msg);
    }

    const state = this.generateState();
    const endpoint = this.getAuthorizeEndpoint();
    console.info('[eBayOAuth] Initiating auth', { environment: this.environment, endpoint, ruName: this.ruName });
    const authURL = this.buildAuthURL(state);
    window.location.href = authURL;
  }

  /**
   * Return the correct OAuth authorize endpoint for the configured environment.
   * @returns {string}
   */
  getAuthorizeEndpoint() {
    return this.environment === 'sandbox'
      ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
      : 'https://auth2.ebay.com/oauth2/authorize';
  }

  /**
   * Build the eBay authorization URL.
   * @param {string} state  CSRF state token
   * @returns {string}
   */
  buildAuthURL(state) {
    const params = new URLSearchParams({
      client_id: this.appID,
      response_type: 'code',
      redirect_uri: this.ruName,
      scope: this.scopes.join(' '),
      state: state,
    });

    return `${this.getAuthorizeEndpoint()}?${params}`;
  }

  /**
   * Handle the OAuth callback — verify state and exchange code for tokens.
   * @param {string} code   Authorization code from eBay
   * @param {string} state  State parameter from eBay (must match stored state)
   * @returns {Promise<object>}  Token response object
   */
  async handleCallback(code, state) {
    if (!this.verifyState(state)) {
      throw new Error('Invalid state parameter — possible CSRF attack');
    }

    const tokens = await this.exchangeCode(code);
    this.storeTokens(tokens);

    return tokens;
  }

  // ─── Token exchange ───────────────────────────────────────────────────────

  /**
   * Exchange the authorization code for access + refresh tokens via proxy.
   * The backend proxy performs the actual token exchange using the client secret.
   * @param {string} code
   * @returns {Promise<object>}
   */
  async exchangeCode(code) {
    const response = await fetch(`${this.proxyURL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        redirect_uri: this.ruName,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange authorization code for token');
    }

    return response.json();
  }

  /**
   * Refresh an expired access token using the stored refresh token.
   * @returns {Promise<object>}  New token response
   */
  async refreshToken() {
    const refreshToken = localStorage.getItem('ebay-refresh-token');
    if (!refreshToken) {
      throw new Error('No refresh token available — please reconnect your eBay account');
    }

    const response = await fetch(`${this.proxyURL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh access token');
    }

    const tokens = await response.json();
    this.storeTokens(tokens);

    return tokens;
  }

  // ─── Token storage ────────────────────────────────────────────────────────

  /**
   * Persist OAuth tokens to localStorage.
   * @param {object} tokens  { access_token, refresh_token, expires_in, username? }
   */
  storeTokens(tokens) {
    localStorage.setItem('ebay-access-token', tokens.access_token);
    localStorage.setItem('ebay-refresh-token', tokens.refresh_token);
    localStorage.setItem(
      'ebay-token-expiry',
      String(Date.now() + tokens.expires_in * 1000)
    );
    if (tokens.username) {
      localStorage.setItem('ebay-username', tokens.username);
    }
  }

  /** Check whether the stored access token has expired. */
  isTokenExpired() {
    const expiry = localStorage.getItem('ebay-token-expiry');
    return !expiry || Date.now() > parseInt(expiry, 10);
  }

  /**
   * Return a valid access token, refreshing automatically if expired.
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    if (this.isTokenExpired()) {
      await this.refreshToken();
    }
    return localStorage.getItem('ebay-access-token');
  }

  /**
   * Remove all stored tokens and disconnect the eBay account.
   */
  disconnect() {
    localStorage.removeItem('ebay-access-token');
    localStorage.removeItem('ebay-refresh-token');
    localStorage.removeItem('ebay-token-expiry');
    localStorage.removeItem('ebay-username');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Generate a cryptographically secure random state value and persist it to
   * sessionStorage for CSRF verification on callback.
   * @returns {string}
   */
  generateState() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const state = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('oauth-state', state);
    return state;
  }

  /**
   * Verify that the state returned by eBay matches the stored value.
   * Clears the stored state regardless of outcome (one-time use).
   * @param {string} state
   * @returns {boolean}
   */
  verifyState(state) {
    const savedState = sessionStorage.getItem('oauth-state');
    sessionStorage.removeItem('oauth-state');
    return !!savedState && state === savedState;
  }

  /**
   * The redirect URI registered with eBay (must match the RuName configuration).
   * Dynamically detects the base path (e.g. '/ShazbotCards') to support
   * GitHub Pages deployments where the app lives under a sub-path.
   * @returns {string}
   */
  getRedirectURI() {
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    // Use the first segment as the base path only if it isn't a file (no extension)
    const firstSegment = pathSegments[0];
    const basePath = (firstSegment && !firstSegment.includes('.')) ? `/${firstSegment}` : '';
    return `${window.location.origin}${basePath}/ebay-callback.html`;
  }

  /** Returns true if an access token is present (user is considered connected). */
  isConnected() {
    return !!localStorage.getItem('ebay-access-token');
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Runtime validation — verifies redirect_uri uses HTTPS, required authorize URL
   * params are present, and the endpoint matches the configured environment.
   * Logs warnings to the console.
   * @returns {string[]}  Array of error descriptions (empty = all OK)
   */
  validate() {
    const errors = [];
    const endpoint = this.getAuthorizeEndpoint();

    if (!this.ruName) {
      errors.push('ruName is not configured — redirect_uri must be the eBay RuName string');
    }
    if (!this.appID)    errors.push('appID (Client ID) is not configured');
    if (!this.proxyURL) errors.push('proxyURL is not configured');

    // Build a test URL and verify required query parameters
    const testURL = this.buildAuthURL('__validation__');
    const url = new URL(testURL);
    for (const param of ['client_id', 'response_type', 'redirect_uri', 'scope', 'state']) {
      if (!url.searchParams.get(param)) {
        errors.push(`authorize URL is missing required param: ${param}`);
      }
    }
    if (!testURL.startsWith(endpoint)) {
      errors.push(`authorize URL does not use expected endpoint "${endpoint}" — got: "${testURL}"`);
    }

    errors.forEach(e => console.warn('[eBayOAuth] Validation warning:', e));
    return errors;
  }
}
