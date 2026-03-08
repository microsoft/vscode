# Son of Anton — Tree-sitter Indexer
# Parses source code via Tree-sitter grammars and writes nodes/edges
# to FalkorDB and embeddings to Qdrant.

FROM node:20-slim

WORKDIR /app

# Install build tools for native tree-sitter bindings and curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

# Copy source and build
COPY src/ ./src/
RUN npx tsc

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
