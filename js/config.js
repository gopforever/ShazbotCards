/**
 * config.js — Centralized configuration for ShazbotCards
 * Proxy URL points to the deployed Vercel backend at shazbotcards-ebay-proxy.vercel.app.
 */

const CONFIG = {
  ebay: {
    environment: 'production', // 'production' | 'sandbox'
    appID:    'ScottPie-cardsapp-PRD-b63bb60a4-b9840da3',
    ruName:   'Scott_Pierce-ScottPie-cardsa-dnvvch',
    proxyURL: 'https://shazbotcards-ebay-proxy.vercel.app',
    redirectURI: 'https://gopforever.github.io/ShazbotCards/ebay-callback.html', // reference only; actual value computed dynamically in ebayOAuth.js
    scopes: [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    ],
  },
  github: {
    modelsURL: 'https://models.inference.ai.azure.com/chat/completions',
  },
};
