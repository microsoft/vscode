# Son of Anton — Build DAG
# Extracts build system dependency graphs and answers operational questions
# about how to build, test, and run projects.

FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npx tsc

EXPOSE 3301

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:3301/health || exit 1

CMD ["node", "dist/index.js"]
