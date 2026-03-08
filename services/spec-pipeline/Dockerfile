# Son of Anton — Spec Pipeline Service
# Parses EARS requirements, generates specs, and produces property-based tests.

FROM node:20-slim

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

# Copy source and build
COPY src/ ./src/
RUN npx tsc

EXPOSE 8090

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:8090/health || exit 1

CMD ["node", "dist/index.js"]
