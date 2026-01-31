ARG MIRROR
ARG BASE_IMAGE=fedora:36
FROM ${MIRROR}${BASE_IMAGE}

# Node.js 22
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && \
	dnf install -y nodejs-22.21.1

# Chromium
RUN dnf install -y chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Desktop Bus
RUN dnf install -y dbus-x11 && \
	mkdir -p /run/dbus

# X11 Server
RUN dnf install -y xorg-x11-server-Xvfb

# VS Code dependencies
RUN dnf install -y xdg-utils
