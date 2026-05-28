# Deployment Guide for TTS Voice Studio

## Important Security Note

This application is designed as **strict BYOK** (Bring Your Own Key) for **all providers**, including Gemini.

- Server environment variables for API keys are deliberately ignored.
- This makes public deployments (HF Spaces, Cloudflare, etc.) safe — users cannot accidentally consume the deployer's keys.

## 1. Hugging Face Spaces (Recommended for demos)

### Recommended Approach: Docker Space

1. Create a new Space on Hugging Face:
   - Go to [huggingface.co/spaces](https://huggingface.co/spaces)
   - Click **"Create new Space"**
   - Choose **Docker** as the SDK
   - Connect your GitHub repo (or use the built-in git)

2. Add these files to your repo (already included in this project):
   - `Dockerfile`
   - `.dockerignore`

3. (Optional) Set environment variables in Space settings:
   - `APP_URL` — Your Space URL (used for OpenRouter attribution headers)
   - You can leave all TTS API keys empty (they are ignored anyway)

4. The Space will automatically build using the `Dockerfile` and run on port 7860.

### Notes for HF Spaces
- The app will be publicly accessible.
- All users must provide their own API keys in the UI.
- Gemini also requires the user to paste their own key.

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
