/**
 * CFCompanion Client-Side Navigation & Seamless Page Transitions
 * Lightweight, zero-dependency router with native View Transitions API support,
 * persistent navbar state, hover prefetching, and history management.
 */

(function () {
  // Prevent duplicate execution
  if (window._cfNavInitialized) return;
  window._cfNavInitialized = true;

  // In-memory HTML cache for instantaneous prefetching
  const pageCache = new Map();

  // Progress Bar Management
  let progressBar = document.getElementById("nav-progress");
  if (!progressBar) {
    progressBar = document.createElement("div");
    progressBar.id = "nav-progress";
    document.body.prepend(progressBar);
  }

  let progressTimer = null;
  function startProgress() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      progressBar.className = "is-loading";
    }, 40);
  }

  function finishProgress() {
    clearTimeout(progressTimer);
    progressBar.className = "is-complete";
    setTimeout(() => {
      progressBar.className = "";
    }, 300);
  }

  // Pre-fetch a URL into cache
  async function prefetch(url) {
    const cleanUrl = url.split("#")[0];
    if (pageCache.has(cleanUrl) || cleanUrl === window.location.href.split("#")[0]) return;
    try {
      const res = await fetch(cleanUrl, { credentials: "same-origin" });
      if (res.ok) {
        const text = await res.text();
        pageCache.set(cleanUrl, text);
      }
    } catch (_) {}
  }

  // Find content container on a document or element
  function getContentContainer(doc) {
    return (
      doc.querySelector("main.main") ||
      doc.querySelector(".page") ||
      doc.querySelector("#content") ||
      doc.querySelector("main")
    );
  }

  // Execute scripts in a container or document
  function runScripts(newDoc, targetContainer) {
    // Run any page-specific external or inline scripts located in the new document body
    const scripts = Array.from(newDoc.querySelectorAll("body script"));
    scripts.forEach((oldScript) => {
      // Don't re-run config.js or navigation.js
      const src = oldScript.getAttribute("src") || "";
      if (src.includes("navigation.js") || src.includes("config.js")) return;

      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (!oldScript.src) {
        newScript.textContent = oldScript.textContent;
      }
      document.body.appendChild(newScript);
    });

    // Dispatch custom page-ready event
    window.dispatchEvent(
      new CustomEvent("cf:page-loaded", { detail: { url: window.location.href } })
    );
  }

  // Update navbar links and active states
  function updateNavbar(newDoc, targetUrl) {
    const currentNav = document.querySelector("nav.nav");
    const newNav = newDoc.querySelector("nav.nav");
    if (!currentNav || !newNav) return;

    // Synchronize nav-dark modifier class if present
    if (newNav.classList.contains("nav-dark")) {
      currentNav.classList.add("nav-dark");
    } else {
      currentNav.classList.remove("nav-dark");
    }

    // Update active class on nav links
    const currentLinks = currentNav.querySelectorAll(".nav-link");
    const newPath = new URL(targetUrl, window.location.href).pathname.toLowerCase();

    currentLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      const linkPath = new URL(href, targetUrl).pathname.toLowerCase();

      // Check if this link matches target path
      if (linkPath === newPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Sync action CTA if differs
    const currentCta = currentNav.querySelector(".nav-cta");
    const newCta = newNav.querySelector(".nav-cta");
    if (currentCta && newCta) {
      currentCta.innerHTML = newCta.innerHTML;
    }
  }

  // Main Navigate Function
  async function navigateTo(url, { updateHistory = true, isPopState = false } = {}) {
    const targetUrl = new URL(url, window.location.href);
    const cleanTargetUrl = targetUrl.origin + targetUrl.pathname + targetUrl.search;
    const currentCleanUrl =
      window.location.origin + window.location.pathname + window.location.search;

    // If only hash is changing on the same page, scroll smoothly
    if (cleanTargetUrl === currentCleanUrl && targetUrl.hash) {
      const targetEl = document.querySelector(targetUrl.hash);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth" });
        if (updateHistory) history.pushState(null, "", targetUrl.href);
        return;
      }
    }

    startProgress();

    let html = pageCache.get(cleanTargetUrl);
    if (!html) {
      try {
        const res = await fetch(cleanTargetUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
        pageCache.set(cleanTargetUrl, html);
      } catch (err) {
        // Fallback to traditional navigation if fetch fails
        window.location.href = targetUrl.href;
        return;
      }
    }

    const parser = new DOMParser();
    const newDoc = parser.parseFromString(html, "text/html");
    const currentContainer = getContentContainer(document);
    const newContainer = getContentContainer(newDoc);

    if (!currentContainer || !newContainer) {
      window.location.href = targetUrl.href;
      return;
    }

    // Call page cleanup hook if defined (e.g. clearIntervals or Chart destruction)
    if (typeof window._cleanupPage === "function") {
      try {
        window._cleanupPage();
      } catch (_) {}
    }

    // Update document title
    document.title = newDoc.title || document.title;

    // Update history state
    if (updateHistory) {
      history.pushState({ path: targetUrl.href }, "", targetUrl.href);
    }

    // Check if native View Transitions API is supported
    if (
      document.startViewTransition &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const transition = document.startViewTransition(() => {
        currentContainer.replaceWith(newContainer);
        updateNavbar(newDoc, targetUrl.href);
      });

      try {
        await transition.finished;
      } catch (_) {}
    } else {
      // Smooth CSS Fallback Animation
      currentContainer.classList.add("page-transition-content", "is-exiting");
      await new Promise((resolve) => setTimeout(resolve, 140));

      newContainer.classList.add("page-transition-content", "is-starting");
      currentContainer.replaceWith(newContainer);
      updateNavbar(newDoc, targetUrl.href);

      // Force layout reflow
      void newContainer.offsetWidth;

      newContainer.classList.remove("is-starting");
      newContainer.classList.add("is-entering");

      await new Promise((resolve) => setTimeout(resolve, 200));
      newContainer.classList.remove("page-transition-content", "is-entering");
    }

    // Scroll to anchor or top
    if (targetUrl.hash) {
      const targetEl = document.querySelector(targetUrl.hash);
      if (targetEl) targetEl.scrollIntoView({ behavior: "smooth" });
      else window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }

    // Run scripts for the new page
    runScripts(newDoc, newContainer);
    finishProgress();
  }

  // Intercept all link clicks across the document
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    // Ignore non-standard clicks
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const href = link.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      link.target === "_blank" ||
      link.hasAttribute("download")
    ) {
      return;
    }

    const targetUrl = new URL(href, window.location.href);
    // Ignore external origin links
    if (targetUrl.origin !== window.location.origin) return;

    e.preventDefault();
    navigateTo(targetUrl.href);
  });

  // Pre-fetch on hover (mouseenter) or touchstart for 0ms instant transition
  document.addEventListener("mouseover", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || link.target === "_blank")
      return;

    const targetUrl = new URL(href, window.location.href);
    if (targetUrl.origin === window.location.origin) {
      prefetch(targetUrl.href);
    }
  });

  // Browser Back / Forward History Handling
  window.addEventListener("popstate", () => {
    navigateTo(window.location.href, { updateHistory: false, isPopState: true });
  });

  // Expose global navigateTo for programmatic navigation
  window.cfNavigate = navigateTo;
})();
