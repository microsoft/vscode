# Multi-stage build
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM nginx:alpine
EXPOSE 80
HEALTHCHECK --interval=30s CMD curl -f http://localhost
ENV NODE_ENV=production
COPY --from=builder /app/dist /usr/share/nginx/html
CMD ["nginx", "-g", "daemon off;"]
