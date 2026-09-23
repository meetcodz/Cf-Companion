/**
 * CFCompanion Navigation Enhancements
 * Non-blocking hover prefetching and instant feedback helper.
 * Lets native Cross-Document View Transitions (@view-transition) handle seamless page transitions.
 */

(function () {
  const prefetchedUrls = new Set();

  function prefetch(url) {
    if (!url || prefetchedUrls.has(url)) return;
    prefetchedUrls.add(url);

    // Use native <link rel="prefetch"> when supported
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    document.head.appendChild(link);
  }

  // Pre-fetch on hover for instant navigation
  document.addEventListener("mouseover", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      a.target === "_blank"
    )
      return;

    try {
      const targetUrl = new URL(a.href);
      if (targetUrl.origin === window.location.origin) {
        prefetch(targetUrl.href);
      }
    } catch (_) {}
  });

  // Provide instant feedback on click without preventing native navigation
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;

    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const href = a.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      a.target === "_blank"
    )
      return;

    try {
      const targetUrl = new URL(a.href);
      if (targetUrl.origin === window.location.origin) {
        document.body.classList.add("is-navigating");
      }
    } catch (_) {}
  });
})();
