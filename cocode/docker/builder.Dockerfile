FROM ubuntu:24.04

# Install build tools
RUN apt-get update && apt-get install -y \
	build-essential \
	clang \
	cmake \
	gdb \
	python3 \
	python3-pip \
	git \
	pkg-config \
	nodejs \
	npm \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY services/builder/package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy source
COPY services/builder/tsconfig.json ./
COPY services/builder/src ./src

# Build TypeScript
RUN npm install -g typescript
RUN tsc

# Cleanup - remove devDependencies after build
RUN npm prune --production

# Create workspace mount point
RUN mkdir -p /workspaces

EXPOSE 7070

CMD ["node", "dist/server.js"]
