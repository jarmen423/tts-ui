# TTS Voice Studio - Multi-stage Dockerfile for Hugging Face Spaces
# 
# Stage 1 (builder): Full dependency install so `npm run build` succeeds
#   (esbuild + Vite + TypeScript etc. are required at build time)
# Stage 2 (runtime): Minimal production image with only built artifacts + prod deps
#
# This fixes the previous broken single-stage version that did
# `npm ci --only=production` before `npm run build`.

FROM node:20-slim AS builder

WORKDIR /app

# Install ALL dependencies (dev + prod) — required for the build step
COPY package*.json ./
RUN npm ci

# Copy the rest of the source and run the build
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runtime

WORKDIR /app

# Install ONLY production dependencies for the smallest final image
COPY package*.json ./
RUN npm ci --only=production

# Bring in the built output from the builder stage
COPY --from=builder /app/dist ./dist

# Hugging Face Spaces requirements
ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860

# Start the production Express server (serves both API + static frontend)
CMD ["node", "dist/server.cjs"]
