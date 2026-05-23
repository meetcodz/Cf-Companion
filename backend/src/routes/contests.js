const express = require("express");
const router = express.Router();
const cf = require("../utils/cfApi");
const prisma = require("../utils/prisma");

// GET /api/contests/upcoming
// Returns upcoming CF contests sorted by start time
router.get("/upcoming", async (req, res) => {
  try {
    const all = await cf.getContests();
    const now = Date.now() / 1000;

    const upcoming = all
      .filter((c) => c.phase === "BEFORE")
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        durationSeconds: c.durationSeconds,
        startsAt: new Date(c.startTimeSeconds * 1000).toISOString(),
        startTimeSeconds: c.startTimeSeconds,
        // Time until start in seconds (for countdown)
        secondsUntilStart: c.startTimeSeconds - now,
      }))
      .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

    res.json(upcoming);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contests/remind
// Body: { cfHandle, cfContestId }
// Subscribe a user to a reminder for a contest
router.post("/remind", async (req, res) => {
  const { cfHandle, cfContestId } = req.body;
  if (!cfHandle || !cfContestId) {
    return res.status(400).json({ error: "cfHandle and cfContestId are required." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { cfHandle } });
    if (!user) {
      return res.status(404).json({ error: `User "${cfHandle}" not registered.` });
    }
    if (!user.email) {
      return res.status(400).json({ error: "User has no email set. Cannot send reminder." });
    }

    // Get contest info from CF
    const contests = await cf.getContests();
    const contest = contests.find((c) => c.id === parseInt(cfContestId));
    if (!contest) {
      return res.status(404).json({ error: "Contest not found." });
    }

    const reminder = await prisma.contestReminder.upsert({
      where: {
        userId_cfContestId: { userId: user.id, cfContestId: parseInt(cfContestId) },
      },
      update: {},
      create: {
        userId: user.id,
        cfContestId: parseInt(cfContestId),
        cfContestName: contest.name,
        startsAt: new Date(contest.startTimeSeconds * 1000),
      },
    });

    res.json({ message: "Reminder set.", reminder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contests/remind
// Body: { cfHandle, cfContestId }
router.delete("/remind", async (req, res) => {
  const { cfHandle, cfContestId } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { cfHandle } });
    if (!user) return res.status(404).json({ error: "User not found." });

    await prisma.contestReminder.deleteMany({
      where: { userId: user.id, cfContestId: parseInt(cfContestId) },
    });

    res.json({ message: "Reminder removed." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contests/reminders/:handle
// Get all active reminders for a user
router.get("/reminders/:handle", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { cfHandle: req.params.handle } });
    if (!user) return res.status(404).json({ error: "User not found." });

    const reminders = await prisma.contestReminder.findMany({
      where: { userId: user.id, reminded: false },
      orderBy: { startsAt: "asc" },
    });

    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
