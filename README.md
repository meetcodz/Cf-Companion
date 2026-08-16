# CFCompanion

<div align="center">

[![Build Status](https://img.shields.io/github/actions/workflow/status/meetcodz/Cf-Companion/ci.yml?branch=main&style=for-the-badge)](https://github.com/meetcodz/Cf-Companion/actions)
[![License](https://img.shields.io/github/license/meetcodz/Cf-Companion?style=for-the-badge)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18-green?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Database](https://img.shields.io/badge/database-PostgreSQL%20%7C%20SQLite-blue?style=for-the-badge&logo=postgresql)](https://prisma.io)
[![AI Engine](https://img.shields.io/badge/AI-OpenRouter%20%2F%20Gemini-orange?style=for-the-badge&logo=google-gemini)](https://openrouter.ai)

**Your personal AI-powered competitive programming command center.**

[Features](#features) • [Tech Stack](#tech-stack) • [System Architecture](#system-architecture) • [Local Setup](#local-setup) • [API Reference](#api-reference) • [Deployment](#deployment-guide)

</div>

---

CFCompanion is a full-stack, neomorphic competitive programming companion app integrated with the **Codeforces API** and **AI Large Language Models (via OpenRouter/Gemini)**. It is built to turn raw performance data into actionable growth, offering smart problem-solving hints, custom practice ladders, and community-driven forums.

---

## Features

### 🧠 AI Coach Profile Analyzer
Analyze your Codeforces handle and receive a tailored coaching report. The AI examines your strong/weak tags, difficulty distribution, and rating trajectory to generate:
- Direct, fluff-free analysis of strengths and weak points.
- A customized **30-day improvement plan** with actionable goals.
- Cached reports (6h TTL) to conserve tokens.

### 🪜 Progressive Hint System
Stuck on a problem but don't want to spoil the solution? Request hints step-by-step:
1. **Level 1 (Subtle Nudge):** Whispers a directional idea or what invariants to notice.
2. **Level 2 (Key Observation):** Explains the core insights needed to formulate the solution.
3. **Level 3 (Approach Outline):** Breaks down the algorithms and complexity details without writing code.

### 📋 AI Practice Sets & Virtual Contests
Personalize your practice runs based on your skill level and target tags:
- **Practice Mode:** A randomly selected mix of unsolved problems suited to your rating band.
- **Contest Mode:** Timed virtual contests with a structured difficulty ladder (easy to hard).
- Includes AI rationale for why each problem was picked and what specific skill it trains.

### 💬 Discussion Forums & Problem Threads
A community-driven board structured for competitive programmers:
- Thread listings filterable by tags (e.g., `greedy`, `dp`) or specific Codeforces problems.
- Upvote/discussion system restricted to verified handles to keep discourse high-quality.
- Pinned threads for official announcements and guides.

### 🏆 Leaderboard & Sync
Register your handle on a global leaderboard to compare ratings with peers. Rating histories are synced daily in the background via automated scheduler jobs.

### ⏰ Email Contest Reminders
Get reminders for upcoming contests. Subscribe to specific contests and receive automated email warnings when a contest is about to start.

---

## Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | HTML5, Vanilla JavaScript, CSS3 | Custom Neomorphic UI, responsive layouts, client-side caching. |
| **Backend** | Node.js, Express.js | REST API, background cron schedulers, rate limiters, email dispatchers. |
| **Database** | PostgreSQL / SQLite | Handled via **Prisma ORM**. PostgreSQL is recommended for production. |
| **AI Layer** | OpenRouter (Gemini Flash) | Handles profile coaching, progressive hints, and practice rationales. |
| **Utilities** | NodeCache, NodeCron, Nodemailer | Throttling Codeforces API calls, scheduling daily user sync, mailing reminders. |

---

## System Architecture

```text
cfcompanion/
├── .github/                     # GitHub Workflows & Action files
│   ├── ISSUE_TEMPLATE/          # Structured templates for Bug/Features
│   └── workflows/ci.yml         # CI workflow for ESLint, Prettier, Prisma
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Prisma Database Schema (PostgreSQL/SQLite)
│   │   └── dev.db               # Local database (SQLite)
│   ├── src/
│   │   ├── index.js             # Express Entry Point
│   │   ├── middleware/          # Rate Limit & Global Error Handlers
│   │   ├── routes/              # Express Router API routes
│   │   ├── services/            # Main logic services (AI, User Sync)
│   │   └── utils/               # Prisma client, Cron scheduler, Mailers
│   └── package.json             # Backend dependencies
├── frontend/                    # Client static assets (Served by backend)
│   ├── css/                     # Styling stylesheets
│   ├── js/                      # App configuration & script files
│   └── pages/                   # Feature HTML pages (AI Coach, Forums, etc.)
├── .eslintrc.json               # Code Linting rules
├── .prettierrc                  # Formatting standards
├── package.json                 # Root script shortcuts for dev workspace
└── README.md                    # Core Documentation
```

---

## Local Setup

### 1. Prerequisites
- **Node.js** v18+ installed on your system.
- **npm** (comes with Node) or **yarn**.

### 2. Clone and Install Dependencies
Install everything with a single command from the root folder:
```bash
# Clone the repository
git clone https://github.com/meetcodz/Cf-Companion.git
cd Cf-Companion

# Install root developer tools & backend dependencies
npm install
npm run install:all
```

### 3. Environment Variables
Copy `.env.example` in the backend folder to `.env`:
```bash
cd backend
cp .env.example .env
```
Fill in the configuration details:
```env
# Database Configuration (PostgreSQL Neon/Supabase or local file)
DATABASE_URL="postgresql://user:password@host:port/dbname"

# AI Key (OpenRouter API Key)
OPENROUTER_API_KEY="your_openrouter_api_key_here"

# Email Configuration (for reminders - use Gmail App Passwords)
EMAIL_USER="your_gmail@gmail.com"
EMAIL_PASS="your_16_char_app_password"
EMAIL_FROM="CFCompanion <your_gmail@gmail.com>"
```

### 4. Database Initialization
Deploy database tables using Prisma:
```bash
# Push schema to database
npm run db:push
```

### 5. Running the Application
Start the development server from the root directory:
```bash
npm run dev
```
The server will start on **`http://localhost:30011`** (or your specified `PORT` in `.env`), serving the static frontend files and backend API.

---

## API Reference

### Users (`/api/users`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/register` | Register a new Codeforces handle (and optional email). |
| `GET` | `/:handle/profile` | Get stored profile details, stats breakdown, and history. |
| `POST` | `/:handle/sync` | Force a manual synchronization of user data from Codeforces. |

**Register Request Body:**
```json
{
  "cfHandle": "tourist",
  "email": "optional_email@example.com"
}
```

### AI Agent (`/api/ai`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/analyze/:handle` | Generates detailed AI coach analysis for a handle. |
| `POST` | `/hint` | Requests progressive hints (level 1-3) for a problem. |
| `POST` | `/practice-set` | Generates custom AI practice sets or virtual contests. |

**Hint Request Body:**
```json
{
  "contestId": 1800,
  "problemIndex": "A",
  "problemName": "Subsequence Addition",
  "tags": ["greedy", "dp"],
  "rating": 1200,
  "level": 2
}
```

### Forums (`/api/forum`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/threads` | Get all discussions. Filterable by `tag` or `problemId`. |
| `POST` | `/threads` | Creates a new discussion thread and the first comment. |
| `POST` | `/threads/:id/posts` | Replies to a specific thread or post. |
| `POST` | `/posts/:id/upvote` | Upvotes a reply (requires verified handle). |

### Contests (`/api/contests`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/upcoming` | Returns list of upcoming Codeforces contests. |
| `POST` | `/remind` | Subscribe to email notifications for a contest. |

---

## Deployment Guide

### Unified Single-Service Deployment (Recommended)
Since the Express backend serves the static frontend statically, you can deploy the entire application to **Render** or **Railway** as a single service.

#### Render Deployment Steps:
1. Log in to [Render](https://render.com) and click **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Set the following settings:
   - **Runtime:** `Node`
   - **Build Command:** `npm run install:all`
   - **Start Command:** `npm start`
4. In the **Environment** tab, add your environment variables:
   - `DATABASE_URL` = Your Neon/Supabase PostgreSQL URL.
   - `OPENROUTER_API_KEY` = Your OpenRouter key.
   - `NODE_ENV` = `production`
   - `PORT` = `30011` (or leave default, Render sets `PORT` automatically).
5. Click **Deploy Web Service**.

#### Database Provisioning:
Create a free database on **[Neon.tech](https://neon.tech)** or **[Supabase](https://supabase.com)** to get a persistent PostgreSQL database connection string, paste it as `DATABASE_URL` in the environment variables, and run `npx prisma db push` locally to initialize it.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
