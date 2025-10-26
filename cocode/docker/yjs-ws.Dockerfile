FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY services/yjs-ws/package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY services/yjs-ws/tsconfig.json ./
COPY services/yjs-ws/src ./src

# Build TypeScript
RUN npm install -g typescript
RUN tsc

# Cleanup - remove devDependencies after build
RUN npm prune --production

EXPOSE 1234

CMD ["node", "dist/server.js"]
