const express = require("express");
const router = express.Router();
const ai = require("../services/aiService");
const cf = require("../utils/cfApi");

// POST /api/ai/analyze/:handle
// Returns AI coaching analysis of a user's CF profile
router.post("/analyze/:handle", async (req, res) => {
  try {
    const result = await ai.analyzeProfile(req.params.handle);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/ai/hint
// Body: { contestId, problemIndex, problemName, tags, rating, level }
// Progressive hint system — level 1, 2, or 3
router.post("/hint", async (req, res) => {
  const { contestId, problemIndex, problemName, tags = [], rating, level = 1 } = req.body;
  if (!contestId || !problemIndex) {
    return res.status(400).json({ error: "contestId and problemIndex are required." });
  }
  if (![1, 2, 3].includes(parseInt(level))) {
    return res.status(400).json({ error: "level must be 1, 2, or 3." });
  }
  try {
    const result = await ai.getProblemHint(
      contestId, problemIndex, problemName || "Unknown", tags, rating, parseInt(level)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/practice-set
// Body: { cfHandle, tags[], count, mode }
// Generates a personalized practice set or virtual contest
router.post("/practice-set", async (req, res) => {
  const { cfHandle, tags = [], count = 5, mode = "practice" } = req.body;
  if (!cfHandle) return res.status(400).json({ error: "cfHandle is required." });
  if (!["practice", "contest"].includes(mode)) {
    return res.status(400).json({ error: "mode must be 'practice' or 'contest'." });
  }
  const problemCount = Math.min(Math.max(parseInt(count) || 5, 2), 10);

  try {
    const allProblems = await cf.getProblemset();
    const result = await ai.generatePracticeSet(cfHandle, tags, problemCount, mode, allProblems);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/ai/practice-sets/:handle
// Get all saved practice sets for a user
router.get("/practice-sets/:handle", async (req, res) => {
  try {
    const sets = await ai.getUserPracticeSets(req.params.handle);
    res.json(sets);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/ai/practice-set/:id
// Get a specific practice set
router.get("/practice-set/:id", async (req, res) => {
  try {
    const set = await ai.getPracticeSet(req.params.id);
    res.json(set);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/ai/practice-set/:id/start
router.post("/practice-set/:id/start", async (req, res) => {
  try {
    await ai.startPracticeSet(req.params.id);
    res.json({ message: "Practice set started." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/ai/practice-set/:id/complete
router.post("/practice-set/:id/complete", async (req, res) => {
  try {
    await ai.completePracticeSet(req.params.id);
    res.json({ message: "Practice set completed." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
