# Son of Anton — Agent Sandbox Image
# All agent-executed code runs inside this container for isolation.

FROM node:20-slim AS base

# Install common development tools and runtimes
RUN apt-get update && apt-get install -y --no-install-recommends \
	git \
	build-essential \
	python3 \
	python3-pip \
	python3-venv \
	curl \
	wget \
	ca-certificates \
	jq \
	&& rm -rf /var/lib/apt/lists/*

# Install Semgrep for SAST scanning
RUN pip3 install --break-system-packages semgrep

# Install Trivy for dependency vulnerability scanning
RUN wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | gpg --dearmor -o /usr/share/keyrings/trivy.gpg \
	&& echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
	| tee /etc/apt/sources.list.d/trivy.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends trivy \
	&& rm -rf /var/lib/apt/lists/*

# Create a non-root user for agent execution
RUN groupadd --gid 1000 sandbox \
	&& useradd --uid 1000 --gid sandbox --shell /bin/bash --create-home sandbox

# Set up workspace directory
RUN mkdir -p /workspace && chown sandbox:sandbox /workspace

# Default working directory
WORKDIR /workspace

# Switch to non-root user
USER sandbox

# Default entrypoint: run a shell command
ENTRYPOINT ["/bin/bash", "-c"]
CMD ["echo 'Son of Anton sandbox ready.'"]
