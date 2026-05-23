/**
 * CFCompanion Frontend Config
 *
 * This script is included on every page.
 * When served from the same backend, we can leave BACKEND_URL empty
 * to make relative API requests to the same host.
 */

const BACKEND_URL = "";

// This makes the URL available globally — all pages read window.CF_API_URL
window.CF_API_URL = BACKEND_URL;
