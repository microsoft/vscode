ARG BASE_IMAGE=quay.io/centos/centos:stream9
FROM --platform=amd64 ${BASE_IMAGE}

# Node.js 22
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && \
	dnf install -y nodejs

# Chromium
RUN dnf install -y epel-release && \
	dnf install -y chromium

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Desktop Bus
RUN dnf install -y dbus-x11 && \
	mkdir -p /run/dbus

# X11 Server
RUN dnf install -y xorg-x11-server-Xvfb
ENV DISPLAY=:99

# VS Code dependencies
RUN dnf install -y \
	ca-certificates \
	xdg-utils

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
