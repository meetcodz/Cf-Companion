const express = require("express");
const router = express.Router();
const userService = require("../services/userService");

// GET /api/leaderboard?limit=50
router.get("/", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const leaderboard = await userService.getLeaderboard(limit);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
