# Son of Anton — Penetration Testing Service
# Coordinates automated security testing using OWASP ZAP and targeted test agents.

FROM node:20-slim

WORKDIR /app

# Install curl for health checks and ZAP API communication
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

EXPOSE 8092

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:8092/health || exit 1

CMD ["node", "dist/index.js"]
