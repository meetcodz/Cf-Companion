# CFCompanion

A full-stack competitive programming companion app built on the Codeforces public API.

## Features (Phases)
- [x] **Phase 1** — Backend foundation (this)
- [x] **Phase 2** — Profile analyzer dashboard
- [x] **Phase 3** — Smart problem recommender
- [x] **Phase 4** — Leaderboard
- [x] **Phase 5** — Contest reminders via email

---

## Project Structure

```
cfcompanion/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          ← DB schema
│   ├── src/
│   │   ├── index.js               ← Entry point
│   │   ├── middleware/
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── users.js
│   │   │   ├── problems.js
│   │   │   ├── contests.js
│   │   │   └── leaderboard.js
│   │   ├── services/
│   │   │   └── userService.js     ← Registration + sync logic
│   │   └── utils/
│   │       ├── cfApi.js           ← CF API wrapper + cache
│   │       ├── prisma.js          ← DB client singleton
│   │       └── scheduler.js       ← Cron jobs
│   ├── .env.example
│   └── package.json
└── frontend/                      ← Integrated and served by backend
```

---

## Local Setup

### 1. Prerequisites
- Node.js 18+
- PostgreSQL running locally (or use Railway/Supabase)

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Fill in DATABASE_URL and other values
```

### 4. Set up the database
```bash
npx prisma db push        # Creates tables from schema
npx prisma generate       # Generates Prisma client
npx prisma studio         # Optional: visual DB browser
```

### 5. Run the server
```bash
npm run dev               # Development (nodemon, auto-restart)
npm start                 # Production
```

---

## API Reference

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/register` | Register a CF handle |
| GET | `/api/users/:handle/profile` | Get profile + stats |
| POST | `/api/users/:handle/sync` | Force re-sync from CF |

**Register body:**
```json
{ "cfHandle": "tourist", "email": "optional@email.com" }
```

### Problems
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/problems/random` | Random problem picker |
| GET | `/api/problems/recommend/:handle` | Smart recommendations |

**Random params:** `?rating=1200&tags=greedy,math`  
**Recommend params:** `?count=5&ratingOffset=100`

### Contests
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contests/upcoming` | List upcoming contests |
| POST | `/api/contests/remind` | Subscribe to reminder |
| DELETE | `/api/contests/remind` | Remove reminder |
| GET | `/api/contests/reminders/:handle` | User's active reminders |

### Leaderboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaderboard` | Full leaderboard |

**Params:** `?limit=50`

---

## Deployment (Railway)

1. Push to GitHub
2. Create new Railway project → Deploy from GitHub repo
3. Add a PostgreSQL plugin
4. Set environment variables (copy from `.env.example`)
5. Railway auto-detects Node and runs `npm start`

---

## CF API Notes
- Rate limit: ~1 req/2s globally (we throttle to 1 req/500ms to be safe)
- All responses are cached for 5 minutes (configurable via `CF_CACHE_TTL`)
- Daily sync runs at 3:00 AM UTC, staggered 2s per user
