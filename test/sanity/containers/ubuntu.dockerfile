ARG MIRROR
ARG BASE_IMAGE=ubuntu:22.04
FROM ${MIRROR}${BASE_IMAGE}

# Use Azure package mirrors
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "amd64" ]; then \
		if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
			sed -i 's|http://archive.ubuntu.com|http://azure.archive.ubuntu.com|g' /etc/apt/sources.list.d/ubuntu.sources; \
		else \
			sed -i 's|http://archive.ubuntu.com|http://azure.archive.ubuntu.com|g' /etc/apt/sources.list; \
		fi; \
	else \
		if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
			sed -i 's|http://ports.ubuntu.com|http://azure.ports.ubuntu.com|g' /etc/apt/sources.list.d/ubuntu.sources; \
		else \
			sed -i 's|http://ports.ubuntu.com|http://azure.ports.ubuntu.com|g' /etc/apt/sources.list; \
		fi; \
	fi

# Utilities
RUN apt-get update && \
	apt-get install -y curl iproute2

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
	apt-get install -y nodejs

# No UI on arm32 on Ubuntu 24.04
ARG BASE_IMAGE
ARG TARGETARCH
RUN if [ "$TARGETARCH" != "arm" ] || [ "$BASE_IMAGE" != "ubuntu:24.04" ]; then \
		# X11 Server \
		apt-get install -y xvfb && \
		# Desktop Bus \
		apt-get install -y dbus-x11 && \
		mkdir -p /run/dbus; \
	fi

# VS Code dependencies
RUN apt-get install -y libasound2 || apt-get install -y libasound2t64 && \
	apt-get install -y libgtk-3-0 || apt-get install -y libgtk-3-0t64 && \
	apt-get install -y libcurl4 || apt-get install -y libcurl4t64 && \
	apt-get install -y \
		libgbm1 \
		libnss3 \
		xdg-utils
