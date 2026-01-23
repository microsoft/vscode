ARG BASE_IMAGE=debian:10
ARG TARGETARCH
FROM ${BASE_IMAGE}

# Update to archive repos since Debian 10 is EOL
RUN sed -i 's|http://deb.debian.org|http://archive.debian.org|g' /etc/apt/sources.list && \
	sed -i 's|http://security.debian.org|http://archive.debian.org|g' /etc/apt/sources.list && \
	sed -i '/buster-updates/d' /etc/apt/sources.list

# Add Debian 11 (bullseye) repo for newer packages
RUN echo "deb http://archive.debian.org/debian bullseye main" >> /etc/apt/sources.list

# Utilities
RUN apt-get update && \
	apt-get install -y --no-install-recommends curl

# Upgrade libstdc++6 from bullseye (required by Node.js 22)
RUN apt-get install -y --no-install-recommends -t bullseye libstdc++6

# Node.js (arm32/arm64 use official builds, others use NodeSource)
RUN if [ "$TARGETARCH" = "arm" ]; then \
		curl -fsSL https://nodejs.org/dist/v20.18.3/node-v20.18.3-linux-armv7l.tar.gz | tar -xz -C /usr/local --strip-components=1; \
	elif [ "$TARGETARCH" = "arm64" ]; then \
		curl -fsSL https://nodejs.org/dist/v22.21.1/node-v22.21.1-linux-arm64.tar.gz | tar -xz -C /usr/local --strip-components=1; \
	else \
		curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
		apt-get install -y --no-install-recommends nodejs; \
	fi

# Google Chrome (amd64 only)
RUN if [ "$TARGETARCH" = "amd64" ]; then \
		curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
		echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
		apt-get update && \
		apt-get install -y --no-install-recommends google-chrome-stable; \
	fi

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Desktop Bus
RUN apt-get install -y --no-install-recommends dbus-x11 && \
    mkdir -p /run/dbus

# X11 Server
RUN apt-get install -y --no-install-recommends xvfb
ENV DISPLAY=:99

# VS Code dependencies
RUN apt-get install -y --no-install-recommends \
	libatomic1 \
	libasound2 \
	libgbm1 \
	libgtk-3-0 \
	libnss3 \
	xdg-utils

# Install newer libxkbfile1 from Debian 11 since Debian 10 version is too old
RUN apt-get install -y --no-install-recommends -t bullseye libxkbfile1

COPY --chmod=755 entrypoint.sh /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
