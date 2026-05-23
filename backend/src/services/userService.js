const prisma = require("../utils/prisma");
const cf = require("../utils/cfApi");

/**
 * Register a new user by CF handle.
 * Validates the handle exists on CF, then creates user + syncs initial data.
 */
async function registerUser(cfHandle, email = null) {
  // 1. Check handle exists on CF
  let cfUser;
  try {
    cfUser = await cf.getUserInfo(cfHandle);
  } catch (err) {
    throw new Error(`Codeforces handle "${cfHandle}" not found.`);
  }

  const canonicalHandle = cfUser.handle;

  // 2. Check not already registered (case-insensitively)
  const existing = await prisma.user.findFirst({
    where: { cfHandle: { equals: canonicalHandle, mode: "insensitive" } }
  });
  if (existing) {
    // Already registered: trigger a full sync to update their rating/stats immediately!
    await syncUser(existing.id, canonicalHandle);
    return prisma.user.findFirst({
      where: { cfHandle: { equals: canonicalHandle, mode: "insensitive" } },
      include: { stats: true },
    });
  }

  // 3. Create user record using canonical casing
  const user = await prisma.user.create({
    data: {
      cfHandle: canonicalHandle,
      email: email || null,
    },
  });

  // 4. Sync their data immediately
  await syncUser(user.id, canonicalHandle);

  return prisma.user.findFirst({
    where: { cfHandle: { equals: canonicalHandle, mode: "insensitive" } },
    include: { stats: true },
  });
}

/**
 * Full sync of a user's CF data.
 * Fetches info, rating history, and submissions — updates DB.
 */
async function syncUser(userId, cfHandle) {
  const [cfInfo, ratingHistory, submissions] = await Promise.all([
    cf.getUserInfo(cfHandle),
    cf.getUserRatingHistory(cfHandle),
    cf.getUserSubmissions(cfHandle),
  ]);

  const { tagBreakdown, ratingBreakdown, solvedProblems } =
    cf.deriveStatsFromSubmissions(submissions);

  // Format rating history for storage
  const formattedRatingHistory = ratingHistory.map((entry) => ({
    date: new Date(entry.ratingUpdateTimeSeconds * 1000).toISOString(),
    rating: entry.newRating,
    contestName: entry.contestName,
  }));

  // Upsert UserStats
  await prisma.userStats.upsert({
    where: { userId },
    update: {
      currentRating: cfInfo.rating || 0,
      maxRating: cfInfo.maxRating || 0,
      solvedCount: solvedProblems.length,
      rank: cfInfo.rank || "unrated",
      tagBreakdown: JSON.stringify(tagBreakdown),
      ratingHistory: JSON.stringify(formattedRatingHistory),
      ratingBreakdown: JSON.stringify(ratingBreakdown),
    },
    create: {
      userId,
      currentRating: cfInfo.rating || 0,
      maxRating: cfInfo.maxRating || 0,
      solvedCount: solvedProblems.length,
      rank: cfInfo.rank || "unrated",
      tagBreakdown: JSON.stringify(tagBreakdown),
      ratingHistory: JSON.stringify(formattedRatingHistory),
      ratingBreakdown: JSON.stringify(ratingBreakdown),
    },
  });

  // Bulk insert new solved problems to avoid slow sequential loops
  const existingSolved = await prisma.solvedProblem.findMany({
    where: { userId },
    select: { contestId: true, problemIndex: true },
  });

  const existingSet = new Set(
    existingSolved.map((p) => `${p.contestId}-${p.problemIndex}`)
  );

  const newSolved = solvedProblems.filter(
    (p) => !existingSet.has(`${p.contestId}-${p.problemIndex}`)
  );

  if (newSolved.length > 0) {
    await prisma.solvedProblem.createMany({
      data: newSolved.map((p) => ({
        userId,
        contestId: p.contestId,
        problemIndex: p.problemIndex,
        problemName: p.problemName,
        rating: p.rating,
        tags: JSON.stringify(p.tags),
        solvedAt: p.solvedAt,
      })),
      skipDuplicates: true,
    });
  }

  // Update lastSyncedAt
  await prisma.user.update({
    where: { id: userId },
    data: { lastSyncedAt: new Date() },
  });

  cf.invalidateUserCache(cfHandle);
}

/**
 * Get a user's full profile with parsed JSON fields.
 */
async function getUserProfile(cfHandle) {
  const user = await prisma.user.findFirst({
    where: { cfHandle: { equals: cfHandle, mode: "insensitive" } },
    include: { stats: true },
  });

  if (!user) throw new Error(`User "${cfHandle}" not found.`);

  // Parse JSON fields before returning
  if (user.stats) {
    user.stats.tagBreakdown = JSON.parse(user.stats.tagBreakdown);
    user.stats.ratingHistory = JSON.parse(user.stats.ratingHistory);
    user.stats.ratingBreakdown = JSON.parse(user.stats.ratingBreakdown);
  }

  return user;
}

/**
 * Get all users for the leaderboard, sorted by current rating desc.
 */
async function getLeaderboard(limit = 50) {
  const stats = await prisma.userStats.findMany({
    orderBy: { currentRating: "desc" },
    take: limit,
    include: {
      user: { select: { cfHandle: true, createdAt: true, lastSyncedAt: true } },
    },
  });

  return stats.map((s, i) => ({
    rank: i + 1,
    cfHandle: s.user.cfHandle,
    currentRating: s.currentRating,
    maxRating: s.maxRating,
    solvedCount: s.solvedCount,
    cfRank: s.rank,
    lastSyncedAt: s.user.lastSyncedAt,
  }));
}

module.exports = { registerUser, syncUser, getUserProfile, getLeaderboard };
