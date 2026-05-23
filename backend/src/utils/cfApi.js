const axios = require("axios");
const NodeCache = require("node-cache");

// Cache with configurable TTL (default 5 min)
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CF_CACHE_TTL) || 300,
  checkperiod: 60,
});

const CF_BASE = process.env.CF_API_BASE || "https://codeforces.com/api";

// CF API enforces 1 req/2s globally — this queue serializes requests
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 500; // be conservative, stay under their limit

async function throttledGet(url) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return axios.get(url, { timeout: 10000 });
}

async function cfGet(endpoint, params = {}) {
  // Build cache key from endpoint + sorted params
  const paramStr = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const cacheKey = `${endpoint}?${paramStr}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const queryString = paramStr ? `?${paramStr}` : "";
  const url = `${CF_BASE}/${endpoint}${queryString}`;

  const response = await throttledGet(url);
  const data = response.data;

  if (data.status !== "OK") {
    throw new Error(data.comment || `CF API error on ${endpoint}`);
  }

  cache.set(cacheKey, data.result);
  return data.result;
}

// ─── Public API methods ───────────────────────────────────────────────────────

/**
 * Get basic user info + current rating
 * @param {string} handle
 */
async function getUserInfo(handle) {
  const results = await cfGet("user.info", { handles: handle });
  return results[0];
}

/**
 * Get full rating history for a user
 * @param {string} handle
 */
async function getUserRatingHistory(handle) {
  return cfGet("user.rating", { handle });
}

/**
 * Get all submissions for a user (default: last 10000)
 * @param {string} handle
 * @param {number} count
 */
async function getUserSubmissions(handle, count = 10000) {
  return cfGet("user.status", { handle, count });
}

/**
 * Get all problems from the problemset
 * Optionally filter by tags
 * @param {string[]} tags
 */
async function getProblemset(tags = []) {
  const params = {};
  if (tags.length > 0) params.tags = tags.join(";");
  const result = await cfGet("problemset.problems", params);
  // result has { problems, problemStatistics }
  return result.problems;
}

/**
 * Get upcoming and past contests
 * @param {boolean} gym - include gym contests
 */
async function getContests(gym = false) {
  return cfGet("contest.list", { gym: gym ? "true" : "false" });
}

/**
 * Derive stats from raw CF data
 * Returns { tagBreakdown, ratingBreakdown, solvedSet, solvedProblems }
 */
function deriveStatsFromSubmissions(submissions) {
  const seen = new Set();
  const tagBreakdown = {};
  const ratingBreakdown = {};
  const solvedProblems = [];

  for (const sub of submissions) {
    if (sub.verdict !== "OK") continue;

    const { contestId, index, name, rating, tags } = sub.problem;
    const key = `${contestId}-${index}`;
    if (seen.has(key)) continue; // count each problem once
    seen.add(key);

    // Tag breakdown
    for (const tag of tags) {
      tagBreakdown[tag] = (tagBreakdown[tag] || 0) + 1;
    }

    // Rating breakdown
    if (rating) {
      ratingBreakdown[rating] = (ratingBreakdown[rating] || 0) + 1;
    }

    solvedProblems.push({
      contestId,
      problemIndex: index,
      problemName: name,
      rating: rating || null,
      tags,
      solvedAt: new Date(sub.creationTimeSeconds * 1000),
    });
  }

  return {
    tagBreakdown,
    ratingBreakdown,
    solvedSet: seen,
    solvedProblems,
  };
}

/**
 * Invalidate cache for a specific user (call after sync)
 * @param {string} handle
 */
function invalidateUserCache(handle) {
  const keys = cache.keys().filter((k) => k.includes(handle));
  keys.forEach((k) => cache.del(k));
}

/**
 * Get cache stats (for debugging/monitoring)
 */
function getCacheStats() {
  return cache.getStats();
}

module.exports = {
  getUserInfo,
  getUserRatingHistory,
  getUserSubmissions,
  getProblemset,
  getContests,
  deriveStatsFromSubmissions,
  invalidateUserCache,
  getCacheStats,
};
