ARG MIRROR
ARG BASE_IMAGE=debian:10
ARG TARGETARCH
FROM ${MIRROR}${BASE_IMAGE}

# Update to archive repos since Debian 10 is EOL
RUN sed -i 's|http://deb.debian.org|http://archive.debian.org|g' /etc/apt/sources.list && \
	sed -i 's|http://security.debian.org|http://archive.debian.org|g' /etc/apt/sources.list && \
	sed -i '/buster-updates/d' /etc/apt/sources.list && \
	echo "deb http://archive.debian.org/debian bullseye main" >> /etc/apt/sources.list

# Utilities
RUN apt-get update && \
	apt-get install -y curl

# Upgrade libstdc++6 from bullseye (required by Node.js 22)
RUN apt-get install -y -t bullseye libstdc++6

# Node.js (arm32/arm64 use official builds, others use NodeSource)
RUN if [ "$TARGETARCH" = "arm" ]; then \
		curl -fsSL https://nodejs.org/dist/v20.18.3/node-v20.18.3-linux-armv7l.tar.gz | tar -xz -C /usr/local --strip-components=1; \
	elif [ "$TARGETARCH" = "arm64" ]; then \
		curl -fsSL https://nodejs.org/dist/v22.21.1/node-v22.21.1-linux-arm64.tar.gz | tar -xz -C /usr/local --strip-components=1; \
	else \
		curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
		apt-get install -y nodejs; \
	fi

# Chromium
RUN apt-get install -y chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Desktop Bus
RUN apt-get install -y dbus-x11 && \
    mkdir -p /run/dbus

# X11 Server
RUN apt-get install -y xvfb

# Install newer libxkbfile1 from Debian 11 since Debian 10 version is too old
RUN apt-get install -y -t bullseye libxkbfile1
