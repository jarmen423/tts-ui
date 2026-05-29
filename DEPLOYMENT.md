# Deployment Guide for TTS Voice Studio

## Important Security Note

This application is designed as **strict BYOK** (Bring Your Own Key) for **all providers**, including Gemini.

- Server environment variables for API keys are deliberately ignored.
- This makes public deployments (HF Spaces, Cloudflare, etc.) safe — users cannot accidentally consume the deployer's keys.

## 1. Hugging Face Spaces (Recommended for demos)

### Recommended Approach: Docker Space + GitHub Action Sync

Your Space is already created at: **gubernac/tts-anything-byok** (Docker SDK).

#### One-time setup

1. Create a Hugging Face access token with **Write** permission:
   - https://huggingface.co/settings/tokens (fine-grained token scoped to the Space is best)

2. In your GitHub repo, add it as a secret:
   - **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `HF_TOKEN`
   - Value: the token from step 1

3. The following files are already present for Docker deployment:
   - `Dockerfile` (multi-stage, listens on 7860, healthcheck)
   - `.dockerignore`
   - `.github/workflows/sync-to-hf.yml` (watches the `deploy/hf-spaces` branch)

#### How deployment works

- Every push to the `deploy/hf-spaces` branch (or manual "Run workflow") triggers the GitHub Action.
- It mirrors the repo contents to `gubernac/tts-anything-byok` using the official `huggingface/hub-sync` action.
- The HF Space automatically rebuilds and restarts using the `Dockerfile`.
- The production server respects `PORT` (HF forces 7860) and serves both the React frontend and all `/api/tts/*` routes from a single container.

#### Optional Space settings

In the HF Space **Settings** tab you can add:
- `APP_URL` — the public Space URL (used for some OpenRouter attribution headers)

All TTS provider keys are **intentionally ignored** on the server (strict BYOK design).

### Notes for HF Spaces
- The app is publicly accessible.
- Every user must paste their own API keys in the UI (Gemini included).
- The two niche providers "omnivoice" and "voxcpm" (HF Gradio backends) are disabled in this deployment unless you also add `server/hf-spaces.ts`. The rest of the app works fully.

## 2. Cloudflare Pages + Custom Subdomain

You want to deploy to `tts-anything.agentmemorylabs.com`.

### Current Architecture Limitation
The current backend is a traditional Express server. Cloudflare Pages is **static-only**.

You have two good options:

### Option A — Hybrid (Recommended for speed)

- **Frontend**: Deploy to Cloudflare Pages (`tts-anything.agentmemorylabs.com`)
- **Backend**: Deploy the Express server to one of these:
  - Railway
  - Render
  - Fly.io
  - Cloudflare Workers (see Option B)
  - VPS

**Steps:**

1. Build the frontend only:
   ```bash
   npm run build
   ```
   (The `dist/` folder contains the static site)

2. Deploy the `dist/` folder to Cloudflare Pages.

3. Set a custom domain in Cloudflare Pages:
   - Go to your Pages project → Custom domains
   - Add `tts-anything.agentmemorylabs.com`

4. Deploy the backend (`dist/server.cjs`) to Railway/Render/Fly.io etc.

5. Update the frontend to point API calls to your backend URL:
   - This requires a small change in the frontend (or use environment variables at build time).

### Option B — Full Cloudflare (More work, fully on Cloudflare)

Convert the backend API routes to Cloudflare Workers.

This is more involved but gives you:
- Everything running on Cloudflare's edge
- No extra hosting costs for the backend
- Native integration with your domain

Recommended stack:
- **Frontend**: Cloudflare Pages
- **Backend**: Cloudflare Workers (using [Hono](https://hono.dev/) is the easiest migration path from Express)

Would you like me to create a Hono-based version of the backend?

## Environment Variables

| Variable     | Purpose                          | Required?          |
|--------------|----------------------------------|--------------------|
| `PORT`       | Port the server listens on       | No (defaults to 3000) |
| `APP_URL`    | Public URL (for OpenRouter headers) | Recommended     |

All TTS provider keys are **ignored** on the server for security.

## Production Build

```bash
npm run build
node dist/server.cjs
```

---

Let me know which deployment path you want to pursue first and I can generate the exact files/configs you need.
