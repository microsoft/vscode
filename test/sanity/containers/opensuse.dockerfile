ARG BASE_IMAGE=opensuse/leap:16.0
FROM ${BASE_IMAGE}

# Node.js 22
RUN zypper install -y nodejs22

# Chromium
RUN zypper install -y chromium pciutils Mesa-libGL1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# X11 Server
RUN zypper install -y xorg-x11-server-Xvfb

# Desktop Bus
RUN zypper install -y dbus-1-x11 && \
	mkdir -p /run/dbus

# VS Code dependencies
RUN zypper install -y \
	liberation-fonts \
	libgtk-3-0
