# Son of Anton — Code Graph indexer
# v1 stub: stays alive and emits a heartbeat. Future iterations will parse the
# workspace via tree-sitter and push nodes/edges into FalkorDB and embeddings
# into Qdrant. The IDE-launched stdio MCP server is the read-side API.
FROM node:22-alpine

WORKDIR /app

# Install only the indexer's package manifest (the v1 stub has no runtime deps,
# but we keep the COPY in place so future deps require only a layer rebuild).
COPY indexer/package.json ./indexer/package.json
WORKDIR /app/indexer
RUN if [ -f package.json ]; then npm install --omit=dev --no-audit --no-fund; fi

COPY indexer/ /app/indexer/

CMD ["node", "/app/indexer/index.js"]
