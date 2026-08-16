const express = require("express");
const router = express.Router();
const prisma = require("../utils/prisma");

// ─── Threads ───────────────────────────────────────────────────────────────

// GET /api/forum/threads?tag=greedy&page=1
router.get("/threads", async (req, res) => {
  const { tag, problemId, page = 1 } = req.query;
  const limit = 20;
  const skip = (parseInt(page) - 1) * limit;

  try {
    const where = {};
    if (tag) where.tag = tag;
    if (problemId) where.problemId = problemId;

    const [threads, total] = await Promise.all([
      prisma.forumThread.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        take: limit,
        skip,
        include: {
          _count: { select: { posts: true } },
        },
      }),
      prisma.forumThread.count({ where }),
    ]);

    res.json({
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
        authorHandle: t.authorHandle,
        tag: t.tag,
        problemId: t.problemId,
        isPinned: t.isPinned,
        postCount: t._count.posts,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/threads
// Body: { title, authorHandle, tag?, problemId? }
router.post("/threads", async (req, res) => {
  const { title, authorHandle, tag, problemId, content } = req.body;
  if (!title || !authorHandle || !content) {
    return res.status(400).json({ error: "title, authorHandle, and content are required." });
  }
  if (title.length > 200) {
    return res.status(400).json({ error: "Title must be under 200 characters." });
  }

  try {
    const thread = await prisma.forumThread.create({
      data: { title: title.trim(), authorHandle, tag: tag || null, problemId: problemId || null },
    });

    // Create the first post (the thread body)
    const post = await prisma.forumPost.create({
      data: { threadId: thread.id, authorHandle, content: content.trim() },
    });

    res.status(201).json({ thread, firstPost: post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/threads/:id
router.get("/threads/:id", async (req, res) => {
  try {
    const thread = await prisma.forumThread.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        posts: {
          orderBy: { createdAt: "asc" },
          include: {
            replies: { orderBy: { createdAt: "asc" } },
          },
          where: { parentId: null }, // only top-level posts
        },
      },
    });
    if (!thread) return res.status(404).json({ error: "Thread not found." });
    res.json(thread);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Posts ─────────────────────────────────────────────────────────────────

// POST /api/forum/threads/:id/posts
// Body: { authorHandle, content, parentId? }
router.post("/threads/:id/posts", async (req, res) => {
  const { authorHandle, content, parentId } = req.body;
  if (!authorHandle || !content) {
    return res.status(400).json({ error: "authorHandle and content are required." });
  }

  try {
    const thread = await prisma.forumThread.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!thread) return res.status(404).json({ error: "Thread not found." });

    const post = await prisma.forumPost.create({
      data: {
        threadId: parseInt(req.params.id),
        authorHandle,
        content: content.trim(),
        parentId: parentId ? parseInt(parentId) : null,
      },
    });

    // Touch thread updatedAt
    await prisma.forumThread.update({
      where: { id: parseInt(req.params.id) },
      data: { updatedAt: new Date() },
    });

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/posts/:id/upvote
// Body: { handle }
router.post("/posts/:id/upvote", async (req, res) => {
  const { handle } = req.body;
  if (!handle) return res.status(400).json({ error: "User handle required." });

  try {
    // Verify user existence and verification status
    const user = await prisma.user.findFirst({
      where: { cfHandle: { equals: handle, mode: "insensitive" } },
      select: { verified: true },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    if (!user.verified) return res.status(403).json({ error: "User not verified." });

    // Check if this user already upvoted this post
    const existing = await prisma.postUpvote.findFirst({
      where: { postId: parseInt(req.params.id), userHandle: handle },
    });
    if (existing) return res.status(400).json({ error: "Already upvoted." });

    // Record upvote
    await prisma.postUpvote.create({
      data: { postId: parseInt(req.params.id), userHandle: handle },
    });

    // Increment upvote counter atomically
    const post = await prisma.forumPost.update({
      where: { id: parseInt(req.params.id) },
      data: { upvotes: { increment: 1 } },
    });
    res.json({ upvotes: post.upvotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/tags
// Returns all unique tags used in threads + counts
router.get("/tags", async (req, res) => {
  try {
    const tags = await prisma.forumThread.groupBy({
      by: ["tag"],
      _count: { tag: true },
      where: { tag: { not: null } },
      orderBy: { _count: { tag: "desc" } },
    });
    res.json(tags.map((t) => ({ tag: t.tag, count: t._count.tag })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/problem/:problemId
// Get or create thread for a specific CF problem
router.get("/problem/:problemId", async (req, res) => {
  try {
    const threads = await prisma.forumThread.findMany({
      where: { problemId: req.params.problemId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { posts: true } } },
    });
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
