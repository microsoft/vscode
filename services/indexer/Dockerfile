# Son of Anton — Tree-sitter Indexer
# Parses source code via Tree-sitter grammars and writes nodes/edges
# to FalkorDB and embeddings to Qdrant.
#
# This is a stub — full implementation is built in Phase 0, instruction 03.

FROM node:20-slim

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --production 2>/dev/null || npm init -y

COPY . .

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:8080/health || exit 1

CMD ["node", "index.js"]
