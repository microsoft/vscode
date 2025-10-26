FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY services/gateway/package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY services/gateway/tsconfig.json ./
COPY services/gateway/src ./src

# Build TypeScript
RUN npm install -g typescript
RUN tsc

# Cleanup - remove devDependencies after build
RUN npm prune --production

EXPOSE 8080

CMD ["node", "dist/index.js"]
