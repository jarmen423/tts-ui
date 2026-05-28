# Deployment Handoff — TTS Voice Studio

**Owner**: Deployment Agent  
**Branch**: `deploy/hf-spaces`  
**Worktree**: `D:\code\tts-ui\.worktrees\deploy-hf-spaces`  
**Last Updated**: 2026-05 (initial)

This is the living source of truth for all deployment and infrastructure work on the TTS Voice Studio project. Feature work stays on `main` (or feature branches). Deployment iteration happens here.

---

## 1. Current Environment & Git Setup

- Main development checkout: `D:\code\tts-ui` on branch `main`
- Dedicated deployment worktree: `D:\code\tts-ui\.worktrees\deploy-hf-spaces` on branch `deploy/hf-spaces`
- Other worktree exists for feature work (`new-features`)
- Remote: `https://github.com/jarmen423/tts-ui.git`
- Policy: **Main at `D:\code\tts-ui` must stay clean.** Do not commit deployment artifacts, Docker files, or handoff docs directly on main.

**Git worktree note** (answered directly):  
Git does **not** commit the contents of a worktree directory into the repository history when you create the worktree. The files at `.worktrees/deploy-hf-spaces/` are a separate working copy. However, the parent directory (`.worktrees/`) will appear as untracked noise in `git status` on the main checkout unless it is ignored. We therefore add `.worktrees/` to `.gitignore` on this branch (and it will be merged to main later). The registration metadata lives safely inside the main repo's `.git/worktrees/` (already ignored by Git itself).

---

## 2. Primary Goals

### Short-term (Current Focus)
1. Get the full application (Vite React frontend + Express backend) running cleanly on Hugging Face Spaces using a Docker Space.
2. Configure the custom subdomain `tts-anything.agentmemorylabs.com` to point at the HF Space via HF custom domains + Cloudflare DNS.
3. Keep `main` pristine.

### Medium-term Preparation
- Make it easy to later split the frontend to Cloudflare Pages (or similar) while keeping the backend on HF Spaces (or Railway/Render/Fly/etc.).
- Add proper `VITE_API_BASE_URL` support in the frontend so relative `/api` calls can be pointed at a remote backend origin.
- Keep the strict BYOK security model intact during any split.

---

## 3. Critical Architectural Constraints

- **Strict BYOK for every provider** (including Gemini). Server-side API keys in the environment are deliberately detected and ignored at startup. This is a security feature, not a bug.
- The app is a **monolithic full-stack** Express server that serves both the API routes and the built React frontend from `dist/`.
- `server.ts` uses Vite middleware in dev and `express.static('dist')` + SPA fallback in production.
- Port is configurable via `PORT` env var (Dockerfile sets 7860 for HF Spaces).
- All frontend `fetch()` calls currently use relative paths (`/api/tts/...`).

---

## 4. Current Deployment Surface Assessment (as of creation)

**Files present:**
- `Dockerfile` (basic single-stage)
- `.dockerignore`
- `DEPLOYMENT.md` (public-facing, somewhat outdated)
- `package.json` build script uses `esbuild` to produce `dist/server.cjs`

**Major Issues Discovered (at branch creation):**
- **Dockerfile was broken**: `npm ci --only=production` followed by `npm run build`. `esbuild` lives only in devDependencies → build would fail on HF.
- `package.json` has frontend build tools (`vite`, React plugins, Tailwind Vite plugin) incorrectly listed under `dependencies` instead of `devDependencies`. This massively bloats production images.
- No `VITE_API_BASE_URL` wiring exists in `src/App.tsx` yet (all calls are relative).
- Production static serving in `server.ts` is basic but functional once the build succeeds.
- Good security posture already exists (startup key detection + warnings).

**Fixed in this branch:**
- [x] Dockerfile converted to proper multi-stage build (builder stage has full deps, runtime stage is lean). Committed as `619627a`.

---

## 5. Known Blockers & Tradeoffs

**HF Spaces (Docker) Tradeoffs:**
- Cold starts can be 15–40+ seconds for a Node + React + heavy TTS client bundle.
- Free tier has real resource and timeout limits.
- No persistent disk (anything written at runtime is ephemeral).
- Good for demos and sharing the full experience.

**Custom Domain (`tts-anything.agentmemorylabs.com`):**
- HF Docker Spaces support custom domains.
- Requires Cloudflare DNS CNAME pointing to the HF target.
- Once the Space is healthy, the subdomain step is mostly DNS + HF UI configuration.

**Future Split (Cloudflare Pages + Remote Backend):**
- Will require `VITE_API_BASE_URL` + proper CORS handling on the Express side.
- Two deployment surfaces to maintain.
- More operational complexity.

---

## 6. Git & Branch Policy (Strict)

- Never commit deployment work directly to `main` at `D:\code\tts-ui`.
- All Dockerfile changes, handoff docs, deployment scripts, and infrastructure work live on `deploy/hf-spaces`.
- The `.worktrees/` directory must stay in `.gitignore`.
- When something is ready, we can propose a clean merge or cherry-pick of specific commits into main.

---

## 7. Hugging Face Spaces Deployment Plan

1. Fix Dockerfile (multi-stage build strongly preferred).
2. Tighten `.dockerignore`.
3. Ensure `npm run build` succeeds and produces a working `dist/server.cjs`.
4. Add `APP_URL` and any other safe env vars in HF Space settings.
5. Create the Space as **Docker** SDK.
6. Connect the `deploy/hf-spaces` branch (or push a clean tag).
7. Verify the app loads, voices load, and synthesis works with user-provided keys only.
8. Add health / startup logging improvements if needed.

---

## 8. Custom Subdomain Plan

1. Get the HF Space stable and publicly accessible.
2. In HF Space settings → Custom domains, add `tts-anything.agentmemorylabs.com`.
3. In Cloudflare (for agentmemorylabs.com), create a CNAME record:
   - Name: `tts-anything`
   - Target: the value provided by HF (usually `<username>-<spacename>.hf.space`)
4. Wait for DNS propagation + HF domain validation.
5. Update any absolute URLs / attribution headers if needed.

---

## 9. Immediate Next Steps / Checklist

- [x] Create deployment worktree at `.worktrees/deploy-hf-spaces`
- [x] Add `.worktrees/` to `.gitignore` on this branch
- [x] Write initial version of this handoff document
- [x] Repair Dockerfile (multi-stage build so `npm run build` succeeds on HF)
- [ ] Test `docker build` locally (when Docker Desktop is running)
- [ ] Add `VITE_API_BASE_URL` support in frontend (small isolated change)
- [ ] Update public `DEPLOYMENT.md` to point at the new reality
- [ ] Create HF Space and validate end-to-end
- [ ] Configure custom subdomain DNS (`tts-anything.agentmemorylabs.com`)

---

## 10. Useful Commands (for this worktree)

```powershell
# From inside the deployment worktree
cd D:\code\tts-ui\.worktrees\deploy-hf-spaces

# Build the project (same as HF will do)
npm run build

# Local production test
PORT=7860 npm start

# Docker testing (once daemon is running)
docker build -t tts-ui .
docker run -p 7860:7860 --env PORT=7860 tts-ui
```

---

## Notes for Future Agents / Humans

- The app is intentionally a teaching surface. Keep changes readable.
- Strict BYOK is non-negotiable. Never introduce server-side key fallbacks.
- When in doubt, prefer explicit over clever in deployment configuration.
- This handoff document should be updated after every meaningful deployment change.

---

*This file lives only on the `deploy/hf-spaces` branch and in the dedicated worktree.*
