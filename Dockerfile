# TTS Voice Studio - Multi-stage Dockerfile for Hugging Face Spaces
#
# Target: gubernac/tts-anything-byok (Docker SDK)
#
# Stage 1 (builder): Installs ALL deps (including dev) so the TypeScript + Vite + esbuild build succeeds.
# Stage 2 (runtime): Lean image containing only production dependencies + built artifacts.
#
# IMPORTANT:
# - The server (server.ts) reads process.env.PORT (we set 7860 for HF).
# - Static files + bundled server are served from dist/ by dist/server.cjs.
# - HF Spaces automatically rebuilds on every push to the linked repo.
# - package-lock.json is committed → we use `npm ci` for reproducible, fast, exact builds.

FROM node:20-slim AS builder

WORKDIR /app

# Install exact deps from lockfile (dev + prod) — required for build tools (vite, esbuild, tsx, tsc).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build (Vite for frontend SPA + esbuild for the Express server bundle → dist/server.cjs)
COPY . .
RUN npm run build

# ============================================
# Runtime stage — this is what actually runs on HF Spaces
# ============================================
FROM node:20-slim AS runtime

WORKDIR /app

# Install ONLY production dependencies (smaller image, faster cold starts, fewer attack surface).
# Uses the lockfile for exact versions.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force \
  && apt-get update && apt-get install -y --no-install-recommends curl git \
  && rm -rf /var/lib/apt/lists/*

# Bring in the production build output (React static assets + bundled server.cjs)
COPY --from=builder /app/dist ./dist

# Hugging Face Spaces requirements
# HF Docker Spaces force port 7860. Our server honors process.env.PORT.
ENV PORT=7860
ENV NODE_ENV=production

# Expose the port (documentation + some orchestrators / health systems use this)
EXPOSE 7860

# Basic healthcheck so HF knows when the app is ready to serve traffic.
# Adjust the path if you ever add an explicit /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:7860/ || exit 1

# Run the bundled production server (serves the React SPA + all /api/tts/* proxy routes)
CMD ["node", "dist/server.cjs"]
