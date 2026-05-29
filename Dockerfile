# TTS Voice Studio - Multi-stage Dockerfile for Hugging Face Spaces
#
# Target: gubernac/tts-anything-byok (Docker SDK)
#
# Stage 1 (builder): Installs ALL deps so the TypeScript + Vite + esbuild build succeeds.
# Stage 2 (runtime): Lean image containing only production dependencies + built artifacts.
#
# IMPORTANT:
# - The server (server.ts) must respect process.env.PORT (we fixed it to default to 7860 on HF).
# - Static files are served from dist/ by the bundled dist/server.cjs.
# - HF Spaces automatically rebuilds on every push to the linked repo.

FROM node:20-slim AS builder

WORKDIR /app

# Install ALL dependencies (dev + prod) — required for the build step.
# Using `npm install` instead of `npm ci` because this repo does not currently
# commit a package-lock.json (common for some Vite + agent workflows).
COPY package*.json ./
RUN npm install

# Copy source and build (Vite for frontend + esbuild for the Express server bundle)
COPY . .
RUN npm run build

# ============================================
# Runtime stage — this is what actually runs on HF Spaces
# ============================================
FROM node:20-slim AS runtime

WORKDIR /app

# Install ONLY production dependencies (smaller image, faster cold starts).
# Using `npm install --omit=dev` because there is no committed package-lock.json.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force \
  && apt-get update && apt-get install -y --no-install-recommends curl git \
  && rm -rf /var/lib/apt/lists/*

# Bring in the production build output
COPY --from=builder /app/dist ./dist

# Hugging Face Spaces requirements
# HF forces port 7860 for Docker Spaces. Our server now reads process.env.PORT.
ENV PORT=7860
ENV NODE_ENV=production

# Expose the port (documentation + some orchestrators use this)
EXPOSE 7860

# Optional but recommended: basic healthcheck so HF knows when the app is ready
# Adjust the path if you ever add an explicit /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:7860/ || exit 1

# Run the bundled production server (serves the React SPA + all /api/tts/* routes)
CMD ["node", "dist/server.cjs"]
