ARG BASE_IMAGE=quay.io/centos/centos:stream9
FROM ${BASE_IMAGE}

# Node.js 22
RUN dnf module enable -y nodejs:22 && \
	dnf install -y nodejs

# Chromium
RUN dnf install -y epel-release && \
	dnf install -y chromium

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Desktop Bus
RUN dnf install -y dbus-x11 && \
	mkdir -p /run/dbus

# X11 Server
RUN dnf install -y xorg-x11-server-Xvfb

# VS Code dependencies
RUN dnf install -y \
	ca-certificates \
	xdg-utils
