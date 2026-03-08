# Son of Anton — LSIF/SCIP Generator
# Generates LSIF/SCIP index data and writes cross-reference information
# to FalkorDB for precise go-to-definition and find-references.
#
# This is a stub — full implementation is built in Phase 0, instruction 03.

FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --production 2>/dev/null || npm init -y

COPY . .

EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:8081/health || exit 1

CMD ["node", "index.js"]
