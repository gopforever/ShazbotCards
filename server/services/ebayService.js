const db = require('../db');

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function getEbayConfig() {
  return {
    clientId: getSetting('ebay_client_id') || process.env.EBAY_CLIENT_ID || '',
    clientSecret: getSetting('ebay_client_secret') || process.env.EBAY_CLIENT_SECRET || '',
    redirectUri: getSetting('ebay_redirect_uri') || process.env.EBAY_REDIRECT_URI || 'http://localhost:3001/api/ebay/callback',
    env: getSetting('ebay_env') || process.env.EBAY_ENV || 'sandbox',
    accessToken: getSetting('ebay_access_token') || '',
    refreshToken: getSetting('ebay_refresh_token') || '',
    tokenExpiry: getSetting('ebay_token_expiry') || ''
  };
}

function getBaseUrl(env) {
  // Strict allowlist to prevent SSRF - only two known eBay API endpoints
  if (env === 'production') return 'https://api.ebay.com';
  return 'https://api.sandbox.ebay.com';
}

function getFindingApiUrl(env) {
  // Strict allowlist for eBay Finding API endpoint
  if (env === 'production') return 'https://svcs.ebay.com/services/search/FindingService/v1';
  return 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1';
}

async function getAccessToken() {
  const config = getEbayConfig();
  const baseUrl = getBaseUrl(config.env);

  // Check if current token is still valid
  if (config.accessToken && config.tokenExpiry) {
    const expiry = new Date(config.tokenExpiry);
    if (expiry > new Date(Date.now() + 60000)) {
      return config.accessToken;
    }
  }

  // Refresh token
  if (!config.refreshToken) throw new Error('eBay not authenticated. Please connect your eBay account in Settings.');
  if (!config.clientId || !config.clientSecret) throw new Error('eBay credentials not configured. Please set them in Settings.');

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetch(`${baseUrl}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/buy.browse'
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`eBay token refresh failed: ${err}`);
  }

  const data = await response.json();
  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ebay_access_token', ?, datetime('now'))").run(data.access_token);
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ebay_token_expiry', ?, datetime('now'))").run(expiry);

  return data.access_token;
}

function getAuthUrl() {
  const config = getEbayConfig();
  if (!config.clientId) throw new Error('eBay Client ID not configured');
  const baseUrl = config.env === 'production' ? 'https://auth.ebay.com' : 'https://auth.sandbox.ebay.com';
  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/buy.browse'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes,
    prompt: 'login'
  });

  return `${baseUrl}/oauth2/authorize?${params}`;
}

async function exchangeCodeForTokens(code) {
  const config = getEbayConfig();
  const baseUrl = getBaseUrl(config.env);
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(`${baseUrl}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`eBay token exchange failed: ${err}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString()
  };
}

async function createInventoryItem(sku, cardData, imageUrls) {
  const config = getEbayConfig();
  const token = await getAccessToken();
  const baseUrl = getBaseUrl(config.env);

  const title = cardData.player_name
    ? `${cardData.year || ''} ${cardData.manufacturer || ''} ${cardData.player_name} ${cardData.name} ${cardData.condition || ''}`.trim()
    : cardData.name;

  const body = {
    availability: {
      shipToLocationAvailability: {
        quantity: cardData.quantity || 1
      }
    },
    condition: mapConditionToEbay(cardData.condition),
    description: cardData.description || cardData.notes || `${cardData.type} card: ${cardData.name}`,
    imageUrls: imageUrls.slice(0, 12),
    title: title.substring(0, 80)
  };

  const response = await fetch(`${baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.text();
    throw new Error(`eBay createInventoryItem failed: ${err}`);
  }

  return { sku };
}

async function createOffer(sku, price, categoryId) {
  const config = getEbayConfig();
  const token = await getAccessToken();
  const baseUrl = getBaseUrl(config.env);

  const body = {
    sku,
    marketplaceId: 'EBAY_US',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId,
    listingDescription: `ShazbotCards inventory item`,
    listingPolicies: {
      fulfillmentPolicyId: getSetting('ebay_fulfillment_policy_id') || '',
      paymentPolicyId: getSetting('ebay_payment_policy_id') || '',
      returnPolicyId: getSetting('ebay_return_policy_id') || ''
    },
    pricingSummary: {
      price: {
        currency: 'USD',
        value: price.toFixed(2)
      }
    }
  };

  const response = await fetch(`${baseUrl}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`eBay createOffer failed: ${err}`);
  }

  return response.json();
}

async function publishOffer(offerId) {
  const config = getEbayConfig();
  const token = await getAccessToken();
  const baseUrl = getBaseUrl(config.env);

  const response = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`eBay publishOffer failed: ${err}`);
  }

  const data = await response.json();
  const listingId = data.listingId;
  const env = config.env;
  const listingUrl = env === 'production'
    ? `https://www.ebay.com/itm/${listingId}`
    : `https://www.sandbox.ebay.com/itm/${listingId}`;

  return { listingId, listingUrl };
}

async function getActiveListings() {
  const config = getEbayConfig();
  const token = await getAccessToken();
  const baseUrl = getBaseUrl(config.env);

  const response = await fetch(`${baseUrl}/sell/inventory/v1/offer?marketplace_id=EBAY_US&limit=200`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`eBay getActiveListings failed: ${err}`);
  }

  return response.json();
}

async function endListing(itemId) {
  const config = getEbayConfig();
  const token = await getAccessToken();
  const baseUrl = getBaseUrl(config.env);

  // Find the offer for this listing and withdraw it
  const response = await fetch(`${baseUrl}/sell/inventory/v1/offer/${itemId}/withdraw`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`eBay endListing failed: ${err}`);
  }

  return { success: true };
}

async function findSoldItems(query) {
  const config = getEbayConfig();
  const findingApiUrl = getFindingApiUrl(config.env);

  const appId = config.clientId;
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': query,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '10'
  });

  const response = await fetch(`${findingApiUrl}?${params}`);
  if (!response.ok) {
    throw new Error(`eBay Finding API failed: ${response.statusText}`);
  }

  const data = await response.json();
  const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
  return items.map(item => ({
    title: item.title?.[0],
    price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 0),
    currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'],
    sold_date: item.listingInfo?.[0]?.endTime?.[0],
    item_url: item.viewItemURL?.[0],
    image_url: item.galleryURL?.[0]
  }));
}

async function getOrders() {
  const config = getEbayConfig();
  const token = await getAccessToken();
  const baseUrl = getBaseUrl(config.env);

  const response = await fetch(`${baseUrl}/sell/fulfillment/v1/order?limit=50&orderFulfillmentStatus=NOT_STARTED,IN_PROGRESS`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`eBay getOrders failed: ${err}`);
  }

  return response.json();
}

function mapConditionToEbay(condition) {
  if (!condition) return 'UNGRADED';
  if (condition.startsWith('PSA 10') || condition.startsWith('BGS 10')) return 'GRADED';
  if (condition.startsWith('PSA') || condition.startsWith('BGS')) return 'GRADED';
  if (condition.includes('NM/M') || condition === 'Raw NM') return 'NEAR_MINT_OR_BETTER';
  if (condition.includes('EX')) return 'EXCELLENT';
  if (condition.includes('VG')) return 'VERY_GOOD';
  return 'UNGRADED';
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getAccessToken,
  createInventoryItem,
  createOffer,
  publishOffer,
  getActiveListings,
  endListing,
  findSoldItems,
  getOrders
};
