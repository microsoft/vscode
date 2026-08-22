FROM --platform=linux/arm64 mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# Set environment variables for ARM64 architecture
ENV BUILDARCH=arm64 \
    TARGETARCH=arm64 \
    PLATFORM=linux/arm64 \
    DEBIAN_FRONTEND=noninteractive

# Install additional development tools optimized for ARM64
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    python3-dev \
    libx11-dev \
    libxkbfile-dev \
    libsecret-1-dev \
    libkrb5-dev \
    git \
    git-lfs \
    curl \
    wget \
    jq \
    vim \
    nano \
    tmux \
    htop \
    rsync \
    openssh-client \
    libssl-dev \
    libasound2-dev \
    libgconf-2-4 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Add install-vscode.sh
ADD install-vscode.sh /root/
RUN /root/install-vscode.sh

# Configure Git
RUN git config --system codespaces-theme.hide-status 1 && \
    git config --system core.longpaths true

# Setup Node user environment
USER node
RUN npm install -g node-gyp && \
    npm install -g yarn && \
    npm install -g pnpm

# Setup npm cache volume
RUN NPM_CACHE="$(npm config get cache)" && \
    rm -rf "$NPM_CACHE" && \
    ln -s /vscode-dev/npm-cache "$NPM_CACHE"

# Configure display for GUI support
RUN echo 'export DISPLAY="${DISPLAY:-:1}"' | tee -a ~/.bashrc >> ~/.zshrc

# Add cross-compilation support scripts
USER root
RUN mkdir -p /opt/cross-compile && \
    echo '#!/bin/bash' > /opt/cross-compile/arm64-setup.sh && \
    echo 'export BUILDARCH=arm64' >> /opt/cross-compile/arm64-setup.sh && \
    echo 'export TARGETARCH=arm64' >> /opt/cross-compile/arm64-setup.sh && \
    chmod +x /opt/cross-compile/arm64-setup.sh

# Set working directory
WORKDIR /workspace

# Default command
CMD chown node:node /vscode-dev && sudo -u node mkdir -p /vscode-dev/npm-cache && sleep inf
