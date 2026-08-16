# CFCompanion Deployment Guide

This guide details how to take the restructured, professional-grade **CFCompanion** application from local files to a live production server.

---

## Deployment Architecture Options

| Option | Services | DB Hosting | Setup Complexity | Costs | Pros |
|---|---|---|---|---|---|
| **Option A: Unified (Recommended)** | Render (Web Service) | Neon / Supabase | Low (One Service) | Free | Zero CORS issues, single service dashboard, simpler env management |
| **Option B: Split** | Vercel (Frontend) + Render (API Backend) | Neon / Supabase | Medium | Free | Marginally faster frontend page loading via Vercel Edge |

---

## Database Provisioning (Prerequisites)

Because Render's free tier uses ephemeral storage (which resets on every build/reboot), a persistent external database is required.

### Set up a Free PostgreSQL Database

#### Option 1: Neon (Recommended)
1. Go to **[Neon.tech](https://neon.tech)** and register a free account.
2. Create a new project named `cf-companion`.
3. Under the **Dashboard**, locate your connection string (marked as `DATABASE_URL`).
4. Copy the connection string. It will look like:
   `postgresql://alex:password@ep-cool-butterfly-12345.us-east-2.aws.neon.tech/neondb?sslmode=require`

#### Option 2: Supabase
1. Go to **[Supabase.com](https://supabase.com)** and create a new project.
2. In Project Settings -> **Database**, locate your connection string.
3. Switch connection mode to **Transaction** (port 6543) or **Session** (port 5432).
4. Copy the URL. It will look like:
   `postgresql://postgres:password@db.yourprojectid.supabase.co:5432/postgres`

---

## Option A: Unified Deployment on Render (Recommended)

In this setup, your Render Web Service runs the Express server, which hosts both the API and serves the static frontend pages.

### Step 1: Push Code to GitHub
Ensure all your local changes are committed and pushed to your remote repository:
```bash
git add .
git commit -m "chore: restructure project and configure postgresql"
git push origin main
```

### Step 2: Deploy Web Service on Render
1. Go to **[Render.com](https://render.com)** and sign in.
2. Click **New +** -> **Blueprint**. (This reads the `render.yaml` configuration file).
3. Connect your GitHub repository.
4. Render will automatically read `render.yaml` and configure the service parameters.
5. Provide values for the required environment variables:
   - `DATABASE_URL`: Paste the PostgreSQL connection string from Neon/Supabase.
   - `OPENROUTER_API_KEY`: Your OpenRouter/Gemini API key.
   - `EMAIL_USER`: Your Gmail email address.
   - `EMAIL_PASS`: Gmail 16-character App Password (Security -> 2-Step Verification -> App Passwords).
   - `EMAIL_FROM`: Mail display name (e.g. `CFCompanion <your_email@gmail.com>`).
6. Click **Approve**. Render will build and deploy the application.

### Step 3: Run Database Migrations
To push tables to the new database, run this once locally from your project directory pointing to the production database:
```bash
# Temporarily set your local shell environment variable to the production DB
# In PowerShell:
$env:DATABASE_URL="YOUR_NEON_OR_SUPABASE_PRODUCTION_DB_URL"
npx prisma db push --schema=backend/prisma/schema.prisma
```

### Step 4: Verify Deployment
Render will assign you a domain like `https://cf-companion.onrender.com`. Open it, register your handle, test the progressive hint system, and review the forums.

---

## Option B: Split Deployment (Vercel + Render Backend)

### Step 1: Deploy API Backend on Render
1. Go to **Render.com** -> **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Configure the following:
   - **Name:** `cfcompanion-api`
   - **Runtime:** `Node`
   - **Build Command:** `npm run install:all`
   - **Start Command:** `npm start`
4. Add the required Environment Variables in the Settings tab (`DATABASE_URL`, `OPENROUTER_API_KEY`, etc.).
5. Render will deploy the API backend and generate a URL (e.g., `https://cfcompanion-api.onrender.com`).

### Step 2: Configure Frontend Configuration
1. Open `frontend/js/config.js`.
2. Replace `BACKEND_URL` with your newly deployed Render API URL:
   ```javascript
   const BACKEND_URL = "https://cfcompanion-api.onrender.com";
   ```
3. Commit and push this change to GitHub:
   ```bash
   git add frontend/js/config.js
   git commit -m "config: point to production backend API URL"
   git push origin main
   ```

### Step 3: Deploy Frontend on Vercel
1. Go to **[Vercel.com](https://vercel.com)** and sign in.
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. Set the **Root Directory** to `frontend`.
5. Under Framework Preset, select **Other**.
6. Click **Deploy**.
7. Vercel will deploy the frontend and give you a URL (e.g., `https://cfcompanion.vercel.app`).

### Step 4: Update CORS Settings on Render
To allow your frontend to communicate with the API:
1. Go to your Render Web Service dashboard -> **Environment** tab.
2. Add/update the following environment variable:
   - `FRONTEND_URL` = `https://cfcompanion.vercel.app` (your Vercel domain, no trailing slash).
3. Save changes. Render will auto-redeploy.
