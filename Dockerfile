# TTS Voice Studio - Docker image for Hugging Face Spaces / self-hosting
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Hugging Face Spaces expects the app to listen on port 7860
ENV PORT=7860
ENV NODE_ENV=production

# Expose the port
EXPOSE 7860

# Start the production server
CMD ["node", "dist/server.cjs"]
