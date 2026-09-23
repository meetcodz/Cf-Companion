/**
 * CFCompanion Instant SaaS Navigation Engine
 * - Zero-latency in-memory pre-caching of all routes
 * - Silky smooth 180ms micro-fade & slide transitions
 * - Persistent navbar that never blinks or shifts
 * - Isolated script execution (no global identifier collisions)
 * - Dynamic stylesheet synchronization across pages
 * - Full browser history (popstate) support
 */

(function () {
  if (window._cfNavEngineInitialized) return;
  window._cfNavEngineInitialized = true;

  // In-memory HTML cache
  const cache = new Map();

  // Known app routes to warm into cache immediately on load
  const APP_ROUTES = [
    "/index.html",
    "/pages/dashboard.html",
    "/pages/leaderboard.html",
    "/pages/contests.html",
    "/pages/ai-coach.html",
    "/pages/forum.html",
    "/pages/practice.html",
  ];

  // Helper: normalize URLs for consistent cache keys
  function getCleanPath(url) {
    try {
      const u = new URL(url, window.location.origin);
      let p = u.pathname.toLowerCase();
      if (p === "" || p === "/") p = "/index.html";
      return p;
    } catch (_) {
      return url;
    }
  }

  // Fetch and store page in cache
  async function cachePage(url) {
    const key = getCleanPath(url);
    if (cache.has(key)) return cache.get(key);
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (res.ok) {
        const text = await res.text();
        cache.set(key, text);
        return text;
      }
    } catch (_) {}
    return null;
  }

  // Pre-warm cache on initial idle time
  function prewarmAllRoutes() {
    APP_ROUTES.forEach((route) => {
      const resolved = new URL(route, window.location.origin).href;
      cachePage(resolved);
    });
  }

  if (document.readyState === "complete") {
    setTimeout(prewarmAllRoutes, 200);
  } else {
    window.addEventListener("load", () => setTimeout(prewarmAllRoutes, 200));
  }

  // Find content container on document or parsed doc
  function getContentElement(doc) {
    return (
      doc.querySelector("#app-content") ||
      doc.querySelector("main.main") ||
      doc.querySelector(".page") ||
      doc.querySelector("main")
    );
  }

  // Normalize links inside navbar so they are absolute root paths
  function normalizeNav(nav, baseOrigin) {
    if (!nav) return;
    nav.querySelectorAll("a").forEach((a) => {
      const raw = a.getAttribute("href");
      if (
        !raw ||
        raw.startsWith("javascript:") ||
        raw.startsWith("mailto:") ||
        raw.startsWith("tel:") ||
        a.target === "_blank"
      ) {
        return;
      }
      try {
        const resolved = new URL(raw, baseOrigin);
        if (resolved.origin === window.location.origin) {
          a.setAttribute("href", resolved.pathname + resolved.search + resolved.hash);
        }
      } catch (_) {}
    });
  }

  // Update active state on existing navbar links in-place (zero DOM replacement or jiggle)
  function updateNavActiveState(targetUrl) {
    const currentNav = document.querySelector("nav.nav");
    if (!currentNav) return;
    const targetPath = getCleanPath(targetUrl);

    currentNav.querySelectorAll(".nav-link").forEach((link) => {
      const rawHref = link.getAttribute("href") || "";
      if (rawHref.includes("#")) {
        link.classList.remove("active");
        return;
      }
      try {
        const linkPath = getCleanPath(new URL(rawHref, window.location.origin).pathname);
        let isActive = false;
        if (targetPath !== "/index.html" && linkPath === targetPath) {
          isActive = true;
        } else if (targetPath.includes("forum") && linkPath.includes("forum.html")) {
          isActive = true;
        } else if (targetPath.includes("practice") && linkPath.includes("ai-coach.html")) {
          isActive = true;
        }

        if (isActive) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      } catch (_) {}
    });
  }

  // Update navbar links and active tab state
  function updateNavbar(newDoc, targetUrl) {
    const currentNav = document.querySelector("nav.nav");
    const newNav = newDoc.querySelector("nav.nav");
    if (!currentNav || !newNav) return;

    // Synchronize nav modifier classes (e.g. nav-dark)
    currentNav.className = newNav.className;

    // Update active class on existing nav links in-place (ZERO DOM REFLOW)
    updateNavActiveState(targetUrl);

    // If new page has specialized CTA buttons (e.g. Back button), update only CTA container
    const currentCta = currentNav.querySelector(".nav-cta");
    const newCta = newNav.querySelector(".nav-cta");
    if (currentCta && newCta && currentCta.innerHTML.trim() !== newCta.innerHTML.trim()) {
      normalizeNav(newNav, targetUrl);
      currentCta.innerHTML = newCta.innerHTML;
    }
  }

  // Synchronize page-specific styles in <head>
  function updateStyles(newDoc) {
    // Find page style block
    const newStyle = newDoc.querySelector("style:not(#global-styles)");
    if (!newStyle) return;

    let currentStyle = document.querySelector("style#page-styles");
    if (!currentStyle) {
      currentStyle = document.createElement("style");
      currentStyle.id = "page-styles";
      document.head.appendChild(currentStyle);
    }
    currentStyle.textContent = newStyle.textContent;

    // Check if new external stylesheet is required (e.g. Chart.js or specialized CSS)
    const newLinks = Array.from(newDoc.querySelectorAll("head link[rel='stylesheet']"));
    newLinks.forEach((l) => {
      const href = l.getAttribute("href");
      if (!href || href.includes("transitions.css")) return;
      const resolved = new URL(href, window.location.origin).href;
      if (!document.querySelector(`head link[href='${resolved}'], head link[href='${href}']`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }
    });
  }

  // Safely execute page scripts in an isolated lexical scope (prevents identifier collision)
  function executeScripts(newDoc) {
    const scripts = Array.from(newDoc.querySelectorAll("body script"));
    scripts.forEach((s) => {
      const src = s.getAttribute("src") || "";
      if (src.includes("navigation.js") || src.includes("config.js")) return;

      if (src) {
        // External script (e.g. Chart.js, dashboard.js)
        const scriptEl = document.createElement("script");
        scriptEl.src = src;
        document.body.appendChild(scriptEl);
      } else if (s.textContent.trim()) {
        // Execute inline script inside an isolated scope to avoid "already declared" errors
        try {
          const fn = new Function(s.textContent);
          fn();
        } catch (e) {
          console.error("Page script execution error:", e);
        }
      }
    });

    window.dispatchEvent(
      new CustomEvent("cf:page-loaded", { detail: { url: window.location.href } })
    );
  }

  // Core instant transition handler
  async function transitionTo(url, { updateHistory = true } = {}) {
    const targetUrl = new URL(url, window.location.href);
    const targetPath = getCleanPath(targetUrl.href);
    const currentPath = getCleanPath(window.location.href);

    // If anchor click on same page, scroll smoothly
    if (targetPath === currentPath && targetUrl.search === window.location.search) {
      if (targetUrl.hash) {
        const el = document.querySelector(targetUrl.hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
          if (updateHistory) history.pushState(null, "", targetUrl.href);
          return;
        }
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    // Retrieve from in-memory cache or fetch
    let html = cache.get(targetPath);
    if (!html) {
      html = await cachePage(targetUrl.href);
    }

    // Fallback if network fails
    if (!html) {
      window.location.href = targetUrl.href;
      return;
    }

    const parser = new DOMParser();
    const newDoc = parser.parseFromString(html, "text/html");

    const currentContent = getContentElement(document);
    const newContent = getContentElement(newDoc);

    if (!currentContent || !newContent) {
      window.location.href = targetUrl.href;
      return;
    }

    // 1. Cleanup hook for previous page (e.g. timers, charts)
    if (typeof window._cleanupPage === "function") {
      try {
        window._cleanupPage();
      } catch (_) {}
    }

    // 2. Outgoing animation (smooth 120ms fade & subtle slide)
    currentContent.style.transition =
      "opacity 120ms cubic-bezier(0.4, 0, 1, 1), transform 120ms cubic-bezier(0.4, 0, 1, 1)";
    currentContent.style.opacity = "0";
    currentContent.style.transform = "translateY(-4px)";

    await new Promise((r) => setTimeout(r, 120));

    // 3. Swap styles, title, and navbar
    updateStyles(newDoc);
    document.title = newDoc.title || document.title;
    updateNavbar(newDoc, targetUrl.href);

    // 4. Prepare incoming content
    newContent.style.opacity = "0";
    newContent.style.transform = "translateY(6px)";
    newContent.style.transition =
      "opacity 160ms cubic-bezier(0.16, 1, 0.3, 1), transform 160ms cubic-bezier(0.16, 1, 0.3, 1)";

    currentContent.replaceWith(newContent);

    // If coming from or going to index.html, handle footer if present
    const currentFooter = document.querySelector("footer.footer");
    const newFooter = newDoc.querySelector("footer.footer");
    if (newFooter && !currentFooter) {
      document.body.appendChild(newFooter);
    } else if (!newFooter && currentFooter) {
      currentFooter.remove();
    }

    // 5. Update history
    if (updateHistory) {
      history.pushState(null, "", targetUrl.href);
    }

    // Force layout reflow
    void newContent.offsetHeight;

    // 6. Incoming animation (160ms entrance)
    newContent.style.opacity = "1";
    newContent.style.transform = "translateY(0)";

    // Scroll to anchor or top
    if (targetUrl.hash) {
      const el = document.querySelector(targetUrl.hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
      else window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }

    // 7. Execute page scripts
    executeScripts(newDoc);
  }

  // Intercept clicks on internal links
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;

    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const href = a.getAttribute("href");
    if (
      !href ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      a.target === "_blank" ||
      a.hasAttribute("download")
    ) {
      return;
    }

    // Check same origin
    const targetUrl = new URL(a.href, window.location.href);
    if (targetUrl.origin !== window.location.origin) return;

    e.preventDefault();
    transitionTo(targetUrl.href);
  });

  // Pre-fetch on hover (instant caching)
  document.addEventListener("mouseover", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || a.target === "_blank")
      return;

    try {
      const targetUrl = new URL(a.href, window.location.href);
      if (targetUrl.origin === window.location.origin) {
        cachePage(targetUrl.href);
      }
    } catch (_) {}
  });

  // Handle browser Back / Forward buttons
  window.addEventListener("popstate", () => {
    transitionTo(window.location.href, { updateHistory: false });
  });

  // Normalize current navbar on page load and ensure correct active link
  normalizeNav(document.querySelector("nav.nav"), window.location.href);
  updateNavActiveState(window.location.href);

  // Expose global navigation function
  window.cfNavigate = transitionTo;
})();
