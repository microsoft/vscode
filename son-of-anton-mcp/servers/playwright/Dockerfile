# Son of Anton — Playwright Browser Automation MCP Server

FROM node:20-slim

# Install dependencies for Playwright browsers
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

# Install Playwright Chromium browser
RUN npx playwright install chromium

COPY src/ ./src/
RUN npx tsc

EXPOSE 3105

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:3105/health || exit 1

CMD ["node", "dist/index.js"]
