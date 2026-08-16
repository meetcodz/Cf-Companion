/* ── Config ─────────────────────────────────────────────────── */
const API = window.CF_API_URL || "http://localhost:3000";

/* ── State ──────────────────────────────────────────────────── */
let currentHandle = null;

/* ── DOM refs ───────────────────────────────────────────────── */
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const dashboard = document.getElementById("dashboard");
const emptyState = document.getElementById("emptyState");

/* ── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = "info") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3500);
}

/* ── Rating → color class ───────────────────────────────────── */
function ratingClass(r) {
  if (!r) return "rating-800";
  const band = Math.floor(r / 100) * 100;
  return `rating-${Math.min(Math.max(band, 800), 2000)}`;
}

/* ── Rating → CF color ──────────────────────────────────────── */
function ratingColor(r) {
  if (!r || r < 1200) return "#94a3b8";
  if (r < 1400) return "#4ade80";
  if (r < 1600) return "#60a5fa";
  if (r < 1900) return "#c084fc";
  if (r < 2100) return "#f87171";
  if (r < 2300) return "#fb923c";
  return "#fbbf24";
}

/* ── Format numbers ─────────────────────────────────────────── */
function fmt(n) {
  return n?.toLocaleString() ?? "—";
}

/* ── Fetch helpers ──────────────────────────────────────────── */
async function apiFetch(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

/* ── Load dashboard for a handle ───────────────────────────── */
async function loadDashboard(handle) {
  currentHandle = handle;
  searchBtn.disabled = true;
  searchBtn.textContent = "Loading...";
  dashboard.style.display = "none";

  try {
    let profile;
    try {
      profile = await apiFetch(`/api/users/${handle}/profile`);
    } catch (err) {
      if (err.message.includes("not found")) {
        toast(`First time searching! Registering and syncing ${handle}...`, "info");
        const regRes = await fetch(`${API}/api/users/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cfHandle: handle }),
        });
        if (!regRes.ok) {
          const errData = await regRes.json();
          throw new Error(errData.error || "Failed to register user");
        }
        profile = await apiFetch(`/api/users/${handle}/profile`);
      } else {
        throw err;
      }
    }

    const recommendations = await apiFetch(`/api/problems/recommend/${handle}?count=8`).catch(
      () => null
    );

    renderProfile(profile);
    renderStats(profile.stats);
    renderRatingChart(profile.stats?.ratingHistory || []);
    renderTagBreakdown(profile.stats?.tagBreakdown || {});
    renderRatingDist(profile.stats?.ratingBreakdown || {});
    renderWeakTags(recommendations?.weakTags || []);
    renderRecommendations(recommendations?.recommendations || []);

    dashboard.style.display = "block";
    emptyState.style.display = "none";

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set("handle", handle);
    window.history.pushState({}, "", url);
  } catch (err) {
    toast(err.message, "error");
    console.error(err);
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = "Analyze →";
  }
}

/* ── Render: profile header ─────────────────────────────────── */
function renderProfile(profile) {
  const { cfHandle, lastSyncedAt, stats } = profile;

  document.getElementById("ph-handle").textContent = cfHandle;
  document.getElementById("ph-rank").textContent = (stats?.rank || "unrated").toUpperCase();
  document.getElementById("ph-rating").textContent = stats?.currentRating || "—";
  document.getElementById("ph-rating").style.color = ratingColor(stats?.currentRating);

  const synced = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "never";
  document.getElementById("ph-synced").innerHTML = `Last synced: <strong>${synced}</strong>`;
  document.getElementById("ph-maxrating").innerHTML =
    `Peak: <strong>${stats?.maxRating || "—"}</strong>`;
}

/* ── Render: stat cards ─────────────────────────────────────── */
function renderStats(stats) {
  if (!stats) return;
  const tagBreakdown = stats.tagBreakdown || {};
  const uniqueTags = Object.keys(tagBreakdown).length;
  const topTag = Object.entries(tagBreakdown).sort((a, b) => b[1] - a[1])[0];

  document.getElementById("s-solved").textContent = fmt(stats.solvedCount);
  document.getElementById("s-rating").textContent = fmt(stats.currentRating);
  document.getElementById("s-tags").textContent = uniqueTags;
  document.getElementById("s-toptag").textContent = topTag ? topTag[0] : "—";
  document.getElementById("s-toptag-count").textContent = topTag ? `${topTag[1]} solved` : "";
}

/* ── Render: rating history chart ───────────────────────────── */
function renderRatingChart(history) {
  const canvas = document.getElementById("ratingChart");
  const ctx = canvas.getContext("2d");

  if (window._ratingChartInstance) {
    window._ratingChartInstance.destroy();
    window._ratingChartInstance = null;
  }

  if (!history.length) {
    canvas.parentElement.innerHTML = `<div class="empty-state"><div class="empty-icon">📉</div>
       <div class="empty-text">No contest history</div></div>`;
    return;
  }

  const labels = history.map((h) =>
    new Date(h.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
  );
  const data = history.map((h) => h.rating);
  const maxR = Math.max(...data);
  const minR = Math.min(...data);

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, "rgba(59,130,246,0.3)");
  gradient.addColorStop(1, "rgba(59,130,246,0)");

  window._ratingChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: "#3b82f6",
          borderWidth: 2,
          fill: true,
          backgroundColor: gradient,
          pointRadius: history.length > 30 ? 0 : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#3b82f6",
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0a1628",
          borderColor: "rgba(59,130,246,0.4)",
          borderWidth: 1,
          titleFont: { family: "'Space Mono', monospace", size: 11 },
          bodyFont: { family: "'Space Mono', monospace", size: 12 },
          callbacks: {
            title: (items) =>
              history[items[0].dataIndex]?.contestName || labels[items[0].dataIndex],
            label: (item) => ` Rating: ${item.raw}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(59,130,246,0.05)" },
          ticks: {
            color: "#475569",
            font: { family: "'Space Mono', monospace", size: 10 },
            maxTicksLimit: 8,
          },
        },
        y: {
          grid: { color: "rgba(59,130,246,0.05)" },
          ticks: {
            color: "#475569",
            font: { family: "'Space Mono', monospace", size: 10 },
          },
          suggestedMin: Math.max(0, minR - 100),
          suggestedMax: maxR + 100,
        },
      },
    },
  });
}

/* ── Render: tag breakdown bars ─────────────────────────────── */
function renderTagBreakdown(tagBreakdown) {
  const container = document.getElementById("tagList");
  const entries = Object.entries(tagBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);

  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-text">No tag data</div></div>`;
    return;
  }

  const max = entries[0][1];
  container.innerHTML = entries
    .map(
      ([tag, count]) => `
    <div class="tag-row">
      <div class="tag-name">${tag}</div>
      <div class="tag-bar-wrap">
        <div class="tag-bar" data-width="${(count / max) * 100}"></div>
      </div>
      <div class="tag-count">${count}</div>
    </div>
  `
    )
    .join("");

  // Animate bars after paint
  requestAnimationFrame(() => {
    document.querySelectorAll(".tag-bar").forEach((bar) => {
      bar.style.width = bar.dataset.width + "%";
    });
  });
}

/* ── Render: rating distribution ────────────────────────────── */
function renderRatingDist(ratingBreakdown) {
  const container = document.getElementById("ratingDist");
  const entries = Object.entries(ratingBreakdown)
    .map(([r, c]) => [parseInt(r), c])
    .sort((a, b) => a[0] - b[0]);

  if (!entries.length) {
    container.innerHTML = `<div class="empty-text" style="font-family:var(--mono);font-size:12px;color:var(--text-dim)">No data</div>`;
    return;
  }

  const max = Math.max(...entries.map((e) => e[1]));
  container.innerHTML =
    `<div class="dist-bars">` +
    entries
      .map(
        ([r, c]) => `
      <div class="dist-col" title="${r}: ${c} solved">
        <div class="dist-bar" style="height:${Math.max(4, (c / max) * 70)}px"></div>
        <div class="dist-label">${r}</div>
      </div>
    `
      )
      .join("") +
    `</div>`;
}

/* ── Render: weak tags ──────────────────────────────────────── */
function renderWeakTags(weakTags) {
  const container = document.getElementById("weakTagsRow");
  if (!weakTags.length) {
    container.innerHTML = `<div class="empty-text" style="font-family:var(--mono);font-size:12px;color:var(--text-dim)">No weak tags detected — keep grinding!</div>`;
    return;
  }
  container.innerHTML = weakTags.map((t) => `<div class="weak-tag-chip">${t}</div>`).join("");
}

/* ── Render: recommendations ────────────────────────────────── */
function renderRecommendations(recs) {
  const container = document.getElementById("recList");
  if (!recs.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎯</div>
      <div class="empty-text">No recommendations available</div></div>`;
    return;
  }

  container.innerHTML = recs
    .map(
      (p) => `
    <a class="rec-item" href="${p.url}" target="_blank" rel="noopener">
      <div class="rec-left">
        <div class="rec-name">${p.name}</div>
        <div class="rec-tags">${p.tags.slice(0, 4).join(" · ")}</div>
      </div>
      <div class="rec-right">
        <div class="rec-rating ${ratingClass(p.rating)}">${p.rating}</div>
        <div class="rec-arrow">→</div>
      </div>
    </a>
  `
    )
    .join("");
}

/* ── Sync button ────────────────────────────────────────────── */
async function syncProfile() {
  if (!currentHandle) return;
  const btn = document.getElementById("syncBtn");
  btn.textContent = "Syncing...";
  btn.disabled = true;
  try {
    await fetch(`${API}/api/users/${currentHandle}/sync`, { method: "POST" });
    toast("Sync complete! Reloading data...", "success");
    await loadDashboard(currentHandle);
  } catch (err) {
    toast("Sync failed: " + err.message, "error");
  } finally {
    btn.textContent = "↻ Sync";
    btn.disabled = false;
  }
}

/* ── Events ─────────────────────────────────────────────────── */
searchBtn.addEventListener("click", () => {
  const h = searchInput.value.trim();
  if (h) loadDashboard(h);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const h = searchInput.value.trim();
    if (h) loadDashboard(h);
  }
});

/* ── Auto-load from URL param ───────────────────────────────── */
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const handle = params.get("handle");
  if (handle) {
    searchInput.value = handle;
    loadDashboard(handle);
  }
});
