/**
 * CFCompanion Frontend Config
 *
 * Automatically detects runtime environment:
 * - When running on HTTP/HTTPS (e.g. Render production at https://cf-companion-fcff.onrender.com or local dev at http://localhost:30011),
 *   window.CF_API_URL dynamically resolves to window.location.origin.
 * - This prevents hardcoding localhost on production (which causes "Failed to fetch" / mixed content errors).
 * - Allows overriding via localStorage.setItem("cf_backend_url", "https://custom-backend.com") if needed.
 */

(function () {
  const savedUrl = localStorage.getItem("cf_backend_url");

  if (savedUrl) {
    window.CF_API_URL = savedUrl;
    return;
  }

  if (window.location.protocol && window.location.protocol.startsWith("http")) {
    // When served over HTTP/HTTPS (local or production), API requests go to the same origin
    window.CF_API_URL = window.location.origin;
  } else {
    // Fallback for file:// protocol (opening HTML files directly from disk)
    window.CF_API_URL = "http://localhost:30011";
  }
})();
