# CFCompanion — Deployment Guide

Everything you need to go from local files to a live public URL.

---

## Overview

| Layer    | Service  | Free tier |
|----------|----------|-----------|
| Backend  | Railway  | $5 credit/mo (enough for hobby) |
| Database | Railway Postgres | Included with backend |
| Frontend | Vercel   | Completely free |

---

## Part 1 — Backend on Railway

### Step 1: Push backend to GitHub

```bash
# From the cfcompanion/ root
git init
git add .
git commit -m "initial: cfcompanion backend + frontend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cfcompanion.git
git push -u origin main
```

### Step 2: Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo**
3. Select your `cfcompanion` repo
4. When asked for the root directory, set it to **`backend`**
5. Railway will detect Node.js automatically and start building

### Step 3: Add Postgres database

1. In your Railway project dashboard → **New** → **Database** → **PostgreSQL**
2. Click the Postgres service → **Variables** tab
3. Copy the `DATABASE_URL` value (starts with `postgresql://...`)

### Step 4: Set environment variables

In Railway → your backend service → **Variables** tab, add:

```
DATABASE_URL        = <paste from Postgres plugin>
NODE_ENV            = production
FRONTEND_URL        = https://YOUR_APP.vercel.app   ← fill in after Step 7
CF_API_BASE         = https://codeforces.com/api
CF_CACHE_TTL        = 300
EMAIL_USER          = your_gmail@gmail.com
EMAIL_PASS          = your_16char_app_password
EMAIL_FROM          = CFCompanion <your_gmail@gmail.com>
```

> **EMAIL_PASS**: Go to [myaccount.google.com](https://myaccount.google.com) →
> Security → 2-Step Verification → App Passwords → generate one for "Mail".

### Step 5: Set up the database

In Railway → your backend service → **Shell** tab (or use the Railway CLI):

```bash
npx prisma db push
```

This creates all tables from `schema.prisma`. Run this once only.

### Step 6: Get your backend URL

Railway → your backend service → **Settings** → **Domains** → **Generate Domain**.

You'll get something like:
```
https://cfcompanion-production.up.railway.app
```

Save this — you need it for the frontend.

---

## Part 2 — Frontend on Vercel

### Step 7: Set your backend URL

Open `frontend/js/config.js` and replace the placeholder:

```js
const BACKEND_URL = "https://cfcompanion-production.up.railway.app";
```

Commit and push:
```bash
git add frontend/js/config.js
git commit -m "config: set production backend URL"
git push
```

### Step 8: Deploy frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import the same GitHub repo
3. Set **Root Directory** to `frontend`
4. Framework Preset: **Other**
5. Click **Deploy**

Vercel will give you a URL like `https://cfcompanion.vercel.app`.

### Step 9: Update CORS on Railway

Go back to Railway → Variables → update:
```
FRONTEND_URL = https://cfcompanion.vercel.app
```

Railway auto-redeploys on variable changes.

---

## Part 3 — Verify everything works

Hit these URLs to confirm the deployment:

```
GET https://your-backend.up.railway.app/health
→ { "status": "ok", "uptime": 42 }

GET https://your-backend.up.railway.app/api/contests/upcoming
→ [...list of contests...]

GET https://your-backend.up.railway.app/api/leaderboard
→ []   (empty until users register)
```

Then open your Vercel URL and try:
1. Landing page loads and the problem picker works
2. Register yourself on the Leaderboard page
3. Open the Analyzer with your CF handle
4. Check the Contests page — countdowns should be ticking

---

## Local Development

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env        # fill in your local Postgres URL
npm install
npx prisma db push          # first time only
npm run dev                 # runs on localhost:3000

# Terminal 2 — frontend
cd frontend
# Open with VS Code Live Server, or:
npx serve .                 # runs on localhost:3000 or 5000
```

For local dev, `config.js` falls back to `http://localhost:3000` automatically —
you don't need to change it.

---

## Keeping data fresh

The backend runs a cron job every night at 3 AM UTC that re-syncs all
registered users from the CF API. This keeps leaderboard ratings current.

You can also manually trigger a sync for any user:
```
POST /api/users/:handle/sync
```

---

## Custom domain (optional)

Railway and Vercel both support custom domains on free/hobby plans:

- **Backend**: Railway → Settings → Domains → Add Custom Domain
- **Frontend**: Vercel → Settings → Domains → Add

After adding a custom domain, update `FRONTEND_URL` in Railway variables
and `BACKEND_URL` in `config.js`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CORS error` in browser | Make sure `FRONTEND_URL` in Railway matches your Vercel URL exactly (no trailing slash) |
| `DATABASE_URL not set` on startup | Re-check Railway Variables tab, ensure it's the Postgres plugin URL |
| Prisma client error | Run `npx prisma generate` in Railway Shell |
| CF API 503 | CF API occasionally goes down. The cache means most requests still work. |
| Emails not sending | Verify `EMAIL_PASS` is an App Password, not your Gmail login password |
| Contest reminders not firing | User must have an email set at registration time |
