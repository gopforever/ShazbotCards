/**
 * config.js — Centralized configuration for ShazbotCards
 * Update PROXY_URL_PLACEHOLDER with the actual proxy URL after deployment.
 */

const CONFIG = {
  ebay: {
    appID:    'ScottPie-cardsapp-PRD-b63bb60a4-b9840da3',
    ruName:   'Scott_Pierce-ScottPie-cardsa-dnvvch',
    proxyURL: 'PROXY_URL_PLACEHOLDER', // Replace after proxy deployment
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
