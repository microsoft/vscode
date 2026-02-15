ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:alpine-3.22
FROM ${BASE_IMAGE}

# Node.js 22
RUN apk add --no-cache nodejs

# Chromium
RUN apk add --no-cache chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
