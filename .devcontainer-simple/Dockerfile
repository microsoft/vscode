FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# Install system dependencies required for VS Code development
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
    # Build essentials
    build-essential \
    g++ \
    gcc \
    make \
    python3 \
    python3-pip \
    pkg-config \
    # Native module dependencies
    libsecret-1-dev \
    libxkbfile-dev \
    libkrb5-dev \
    # Runtime dependencies for Electron
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    # Useful tools
    git \
    curl \
    wget \
    vim \
    jq \
    ripgrep \
    # Clean up
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g \
    node-gyp \
    yarn \
    @vscode/vsce

# Set up Git to trust the workspace directory
RUN git config --system --add safe.directory '*'

# Configure npm cache location for better performance with volumes
USER node
RUN mkdir -p /home/node/.npm-global \
    && npm config set prefix '/home/node/.npm-global'

ENV PATH="/home/node/.npm-global/bin:${PATH}"

# Display setup info
RUN echo "\n\
╔════════════════════════════════════════════════════════════╗\n\
║  VS Code Development Container - Simple Edition           ║\n\
║                                                            ║\n\
║  Node.js: $(node --version)                                        ║\n\
║  npm: $(npm --version)                                             ║\n\
║                                                            ║\n\
║  Quick Start:                                              ║\n\
║    1. Dependencies auto-install on container create        ║\n\
║    2. Run: npm run watch                                   ║\n\
║    3. Press F5 to debug                                    ║\n\
╚════════════════════════════════════════════════════════════╝\n" > /home/node/.welcome

CMD cat /home/node/.welcome 2>/dev/null || true && bash
