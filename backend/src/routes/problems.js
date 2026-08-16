const express = require("express");
const router = express.Router();
const cf = require("../utils/cfApi");
const prisma = require("../utils/prisma");

// GET /api/problems/random?rating=1200&tags=greedy,math
// Enhanced version of your original problem picker
router.get("/random", async (req, res) => {
  const { rating, tags } = req.query;
  const selectedTags = tags ? tags.split(",").map((t) => t.trim()) : [];

  try {
    const problems = await cf.getProblemset();

    const filtered = problems.filter((p) => {
      if (rating && p.rating !== parseInt(rating)) return false;
      if (selectedTags.length > 0) {
        return selectedTags.every((t) => p.tags.includes(t));
      }
      return true;
    });

    if (filtered.length === 0) {
      return res.status(404).json({ error: "No problems found for this selection." });
    }

    const problem = filtered[Math.floor(Math.random() * filtered.length)];
    res.json({
      name: problem.name,
      rating: problem.rating,
      tags: problem.tags,
      contestId: problem.contestId,
      index: problem.index,
      url: `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/problems/recommend/:handle
// Smart recommender — picks problems the user hasn't solved, targeting weak tags
// Query params: count (default 5), ratingOffset (default +100 above current)
router.get("/recommend/:handle", async (req, res) => {
  const { handle } = req.params;
  const count = parseInt(req.query.count) || 5;
  const ratingOffset = parseInt(req.query.ratingOffset) || 100;

  try {
    // Get user from DB (case-insensitively)
    const user = await prisma.user.findFirst({
      where: { cfHandle: { equals: handle, mode: "insensitive" } },
      include: { stats: true, solvedProblems: true },
    });

    if (!user) {
      return res.status(404).json({ error: `User "${handle}" not registered. Register first.` });
    }

    const currentRating = user.stats?.currentRating || 1200;
    const tagBreakdown = JSON.parse(user.stats?.tagBreakdown || "{}");

    // Build solved set for fast lookup
    const solvedSet = new Set(user.solvedProblems.map((p) => `${p.contestId}-${p.problemIndex}`));

    // Determine weak tags (bottom 5 by solve count, minimum 2 solves to be considered)
    const weakTags = Object.entries(tagBreakdown)
      .filter(([, count]) => count >= 1)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 5)
      .map(([tag]) => tag);

    // Fetch full problemset
    const allProblems = await cf.getProblemset();

    // Target rating band: current ± offset
    const minRating = currentRating;
    const maxRating = currentRating + ratingOffset * 2;

    // Filter: not solved, in rating band, has at least one weak tag
    const candidates = allProblems.filter((p) => {
      if (!p.rating) return false;
      if (p.rating < minRating || p.rating > maxRating) return false;
      if (solvedSet.has(`${p.contestId}-${p.index}`)) return false;
      if (weakTags.length > 0 && !p.tags.some((t) => weakTags.includes(t))) return false;
      return true;
    });

    // Shuffle and take `count`
    const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, count);

    res.json({
      handle,
      currentRating,
      weakTags,
      recommendations: shuffled.map((p) => ({
        name: p.name,
        rating: p.rating,
        tags: p.tags,
        contestId: p.contestId,
        index: p.index,
        url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
