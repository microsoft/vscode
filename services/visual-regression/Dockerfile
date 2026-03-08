# Son of Anton — Visual Regression Testing Service

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npx tsc

EXPOSE 8094

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:8094/health || exit 1

CMD ["node", "dist/index.js"]
