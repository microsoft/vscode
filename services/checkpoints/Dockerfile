# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# Runtime stage
FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/dist/src/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/
COPY package.json ./

EXPOSE 3201

USER node

CMD ["node", "dist/index.js"]
