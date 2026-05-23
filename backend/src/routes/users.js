const express = require("express");
const router = express.Router();
const userService = require("../services/userService");

// POST /api/users/register
// Body: { cfHandle, email? }
router.post("/register", async (req, res) => {
  const { cfHandle, email } = req.body;
  if (!cfHandle) return res.status(400).json({ error: "cfHandle is required." });

  try {
    const user = await userService.registerUser(cfHandle.trim(), email?.trim());
    res.status(201).json({ message: "Registered successfully.", user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/users/:handle/profile
router.get("/:handle/profile", async (req, res) => {
  try {
    const profile = await userService.getUserProfile(req.params.handle);
    res.json(profile);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/users/:handle/sync
// Manually trigger a data sync for a user
router.post("/:handle/sync", async (req, res) => {
  try {
    const user = await userService.getUserProfile(req.params.handle);
    await userService.syncUser(user.id, user.cfHandle);
    res.json({ message: `Synced ${req.params.handle} successfully.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
