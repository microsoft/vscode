# Son of Anton — LSIF/SCIP Generator
# Generates LSIF/SCIP index data and writes cross-reference information
# to FalkorDB for precise go-to-definition and find-references.

FROM node:20-slim

WORKDIR /app

# Install curl for health checks and git for LSIF tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

# Copy source and build
COPY src/ ./src/
RUN npx tsc

# Create directories for LSIF output and snapshots
RUN mkdir -p /tmp/soa-lsif /data/lsif-snapshots

EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:8081/health || exit 1

CMD ["node", "dist/index.js"]
