const prisma = require("../utils/prisma");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Cache TTL: 6 hours for profile analysis (it's expensive), 24h for hints
const PROFILE_TTL_HOURS = 6;
const HINT_TTL_HOURS = 24;

// ─── Cache helpers ─────────────────────────────────────────────────────────

async function getCached(key) {
  const hit = await prisma.aICache.findUnique({ where: { cacheKey: key } });
  if (!hit) return null;
  if (new Date() > hit.expiresAt) {
    await prisma.aICache.delete({ where: { cacheKey: key } });
    return null;
  }
  return hit.response;
}

async function setCache(key, response, ttlHours) {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await prisma.aICache.upsert({
    where: { cacheKey: key },
    update: { response, expiresAt },
    create: { cacheKey: key, response, expiresAt },
  });
}

async function callAI(prompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not configured. Get one at https://openrouter.ai/keys");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://cfcompanion.dev",
      "X-Title": "CFCompanion",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error(`OpenRouter returned empty response. Raw data: ${JSON.stringify(data)}`);
  }
  
  return content;
}

// ─── Profile analysis ──────────────────────────────────────────────────────

/**
 * Generate a coach-style AI analysis of a user's CF profile.
 * Cached for 6 hours per handle.
 */
async function analyzeProfile(cfHandle) {
  const cacheKey = `profile:${cfHandle.toLowerCase()}`;
  const cached = await getCached(cacheKey);
  if (cached) return { analysis: cached, cached: true };

  // Fetch user from DB
  const user = await prisma.user.findFirst({
    where: { cfHandle: { equals: cfHandle, mode: "insensitive" } },
    include: { stats: true, solvedProblems: { take: 5, orderBy: { solvedAt: "desc" } } },
  });

  if (!user || !user.stats) {
    throw new Error(`User "${cfHandle}" not found or not synced yet.`);
  }

  const stats = user.stats;
  const tagBreakdown = JSON.parse(stats.tagBreakdown || "{}");
  const ratingHistory = JSON.parse(stats.ratingHistory || "[]");
  const ratingBreakdown = JSON.parse(stats.ratingBreakdown || "{}");

  // Compute trajectory
  const lastFiveContests = ratingHistory.slice(-5);
  const trajectory = lastFiveContests.length >= 2
    ? lastFiveContests[lastFiveContests.length - 1].rating - lastFiveContests[0].rating
    : 0;

  // Sort tags
  const topTags = Object.entries(tagBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => `${tag} (${count})`);

  const weakTags = Object.entries(tagBreakdown)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([tag, count]) => `${tag} (${count})`);

  const ratingDist = Object.entries(ratingBreakdown)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([r, c]) => `${r}: ${c} problems`)
    .join(", ");

  const prompt = `You are an expert competitive programming coach. Analyze this Codeforces profile and give a detailed, actionable coaching report.

Handle: ${cfHandle}
Current Rating: ${stats.currentRating} (${stats.rank})
Peak Rating: ${stats.maxRating}
Total Problems Solved: ${stats.solvedCount}
Rating trajectory (last 5 contests): ${trajectory > 0 ? "+" : ""}${trajectory} points

Strongest tags: ${topTags.join(", ")}
Weakest tags (fewest solves): ${weakTags.join(", ")}
Difficulty distribution: ${ratingDist}

Write a coaching analysis with these sections (use these exact headers):
## Strengths
## Weak Points  
## Rating Trajectory
## Priority Focus Areas
## 30-Day Improvement Plan

Be specific, direct, and use actual numbers from the data. No fluff. Write like a tough but supportive coach, not a chatbot. Max 400 words total.`;

  const analysis = await callAI(prompt);
  await setCache(cacheKey, analysis, PROFILE_TTL_HOURS);
  return { analysis, cached: false };
}

// ─── Problem hints ─────────────────────────────────────────────────────────

/**
 * Generate progressive hints for a CF problem.
 * level: 1 = directional nudge, 2 = key observation, 3 = near-full approach
 * Cached 24h per problem+level combo.
 */
async function getProblemHint(contestId, problemIndex, problemName, tags, rating, level = 1) {
  const cacheKey = `hint:${contestId}-${problemIndex}:${level}`;
  const cached = await getCached(cacheKey);
  if (cached) return { hint: cached, cached: true };

  const levelDescriptions = {
    1: "Give only a very subtle directional hint — one sentence that points toward the right approach without revealing anything. Like whispering 'think about what stays constant.'",
    2: "Give the key observation or insight needed to solve this problem. Reveal the core idea but not the implementation. 2-3 sentences max.",
    3: "Give a near-complete approach — explain the algorithm and data structures needed, time complexity, and main steps. Still don't write code. 4-5 sentences.",
  };

  const prompt = `You are a competitive programming mentor helping a student with a Codeforces problem.

Problem: ${problemName} (${contestId}${problemIndex})
Rating: ${rating || "unknown"}
Tags: ${tags.join(", ")}
Hint level requested: ${level}/3

${levelDescriptions[level]}

Do NOT reveal the full solution or write any code. Keep it encouraging. Start directly with the hint, no preamble.`;

  const hint = await callAI(prompt);
  await setCache(cacheKey, hint, HINT_TTL_HOURS);
  return { hint, level, cached: false };
}

// ─── Practice set generation ────────────────────────────────────────────────

/**
 * Generate an AI-curated practice set for a user.
 * Picks problems from CF problemset filtered by user's weak tags + rating band.
 * Returns problems + AI rationale.
 */
async function generatePracticeSet(cfHandle, selectedTags, count, mode, allProblems) {
  // Get user data
  const user = await prisma.user.findFirst({
    where: { cfHandle: { equals: cfHandle, mode: "insensitive" } },
    include: { stats: true, solvedProblems: true },
  });

  if (!user || !user.stats) {
    throw new Error(`User "${cfHandle}" not found or not synced.`);
  }

  const currentRating = user.stats.currentRating || 1200;
  const solvedSet = new Set(
    user.solvedProblems.map((p) => `${p.contestId}-${p.problemIndex}`)
  );

  // Rating band: practice mode = current ± 200, contest = spread from -100 to +400
  const minRating = mode === "contest" ? currentRating - 100 : currentRating - 100;
  const maxRating = mode === "contest" ? currentRating + 400 : currentRating + 200;

  // Filter candidates
  let candidates = allProblems.filter((p) => {
    if (!p.rating || p.rating < minRating || p.rating > maxRating) return false;
    if (solvedSet.has(`${p.contestId}-${p.index}`)) return false;
    if (selectedTags.length > 0 && !p.tags.some((t) => selectedTags.includes(t))) return false;
    return true;
  });

  if (candidates.length === 0) {
    throw new Error("No matching unsolved problems found for your profile and tag selection.");
  }

  // For contest mode: sort by rating to build a difficulty ladder
  if (mode === "contest") {
    candidates.sort((a, b) => a.rating - b.rating);
    // Pick evenly spaced difficulties
    const step = Math.floor(candidates.length / count);
    const picked = [];
    for (let i = 0; i < count && i * step < candidates.length; i++) {
      picked.push(candidates[i * step]);
    }
    candidates = picked;
  } else {
    // Practice: shuffle and pick
    candidates = candidates.sort(() => Math.random() - 0.5).slice(0, count);
  }

  // Generate AI rationale for each problem
  const problemList = candidates.map((p, i) =>
    `${i + 1}. "${p.name}" (${p.contestId}${p.index}) — Rating: ${p.rating}, Tags: ${p.tags.slice(0, 3).join(", ")}`
  ).join("\n");

  const prompt = `You are a CP coach. A student with rating ${currentRating} wants to practice these tags: ${selectedTags.join(", ") || "general"}.

You've selected this ${mode === "contest" ? "virtual contest" : "practice"} set for them:
${problemList}

Write a brief 2-sentence rationale for WHY this set is good for their current level. Be specific. Then for each problem number, write one short sentence (max 10 words) on what skill it trains. Format:

RATIONALE: [2 sentences]
1. [skill]
2. [skill]
...`;

  let rationale = "";
  try {
    rationale = await callAI(prompt);
  } catch (_) {
    rationale = "RATIONALE: This set targets your selected tags at an appropriate difficulty level.\n" +
      candidates.map((_, i) => `${i + 1}. Practice problem targeting selected skills.`).join("\n");
  }

  // Save to DB
  const practiceSet = await prisma.practiceSet.create({
    data: {
      userId: user.id,
      title: mode === "contest"
        ? `Virtual Contest — ${selectedTags.join(", ") || "Mixed"}`
        : `Practice Set — ${selectedTags.join(", ") || "Mixed"}`,
      mode,
      tags: JSON.stringify(selectedTags),
      problems: JSON.stringify(candidates.map((p) => ({
        name: p.name,
        contestId: p.contestId,
        index: p.index,
        rating: p.rating,
        tags: p.tags,
        url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
      }))),
      durationMin: mode === "contest" ? count * 30 : null, // 30min per problem estimate
    },
  });

  return {
    setId: practiceSet.id,
    mode,
    title: practiceSet.title,
    problems: candidates.map((p) => ({
      name: p.name,
      contestId: p.contestId,
      index: p.index,
      rating: p.rating,
      tags: p.tags,
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    })),
    rationale,
    durationMin: practiceSet.durationMin,
  };
}

// ─── Get saved practice sets ───────────────────────────────────────────────

async function getUserPracticeSets(cfHandle) {
  const user = await prisma.user.findFirst({
    where: { cfHandle: { equals: cfHandle, mode: "insensitive" } },
  });
  if (!user) throw new Error("User not found.");

  const sets = await prisma.practiceSet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return sets.map((s) => ({
    id: s.id,
    title: s.title,
    mode: s.mode,
    tags: JSON.parse(s.tags),
    problems: JSON.parse(s.problems),
    durationMin: s.durationMin,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    createdAt: s.createdAt,
  }));
}

async function getPracticeSet(setId) {
  const s = await prisma.practiceSet.findUnique({ where: { id: parseInt(setId) } });
  if (!s) throw new Error("Practice set not found.");
  return {
    id: s.id,
    title: s.title,
    mode: s.mode,
    tags: JSON.parse(s.tags),
    problems: JSON.parse(s.problems),
    durationMin: s.durationMin,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    createdAt: s.createdAt,
  };
}

async function startPracticeSet(setId) {
  return prisma.practiceSet.update({
    where: { id: parseInt(setId) },
    data: { startedAt: new Date() },
  });
}

async function completePracticeSet(setId) {
  return prisma.practiceSet.update({
    where: { id: parseInt(setId) },
    data: { completedAt: new Date() },
  });
}

module.exports = {
  analyzeProfile,
  getProblemHint,
  generatePracticeSet,
  getUserPracticeSets,
  getPracticeSet,
  startPracticeSet,
  completePracticeSet,
};
