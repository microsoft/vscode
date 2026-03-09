# Son of Anton — Context Sanitiser
# Prompt injection detection and context sanitisation service.
# Scans content for known injection patterns, applies trust-level-based
# sanitisation, and reviews MCP tool descriptions for suspicious content.

FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npx tsc

EXPOSE 3302

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:3302/health || exit 1

CMD ["node", "dist/index.js"]
