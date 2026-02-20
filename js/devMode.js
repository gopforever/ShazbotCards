/**
 * devMode.js — Development mode detection
 * Sets window.isDevelopment flag and logs a warning in development environments.
 */
(function () {
  'use strict';
  window.isDevelopment = window.location.hostname === 'localhost' ||
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname === '';
  if (window.isDevelopment) {
    console.warn('⚠️ Running in development mode. CSP may not be enforced properly.');
    console.warn('💡 Deploy to Netlify to test the full AI Title Optimizer feature.');
  }
}());
