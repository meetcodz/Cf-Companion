require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const errorHandler = require("./middleware/errorHandler");
const { startAllJobs } = require("./utils/scheduler");

// Routes
const userRoutes = require("./routes/users");
const problemRoutes = require("./routes/problems");
const contestRoutes = require("./routes/contests");
const leaderboardRoutes = require("./routes/leaderboard");
const aiRoutes = require("./routes/ai");
const forumRoutes = require("./routes/forum");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow multiple origins: local dev + deployed frontend
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3001",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "DELETE"],
  credentials: true,
}));

app.use(express.json());

// Rate limit: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});
app.use("/api", limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/api", (req, res) => {
  res.json({
    name: "CFCompanion API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      users: "/api/users",
      problems: "/api/problems",
      contests: "/api/contests",
      leaderboard: "/api/leaderboard",
    },
  });
});

// Health check — Railway pings this to verify the app is alive
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
});

app.use("/api/users", userRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/contests", contestRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/forum", forumRoutes);

// ─── Serve Frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../../frontend")));

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
  } else {
    res.status(404).sendFile(path.join(__dirname, "../../frontend/index.html"));
  }
});

// Global error handler
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 CFCompanion API running on http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || "development"}`);
  console.log(`   DB:  ${process.env.DATABASE_URL ? "Connected" : "⚠️  DATABASE_URL not set"}\n`);

  // Start background jobs
  startAllJobs();
});

// Graceful shutdown — Railway sends SIGTERM before killing the process
const prisma = require("./utils/prisma");
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
