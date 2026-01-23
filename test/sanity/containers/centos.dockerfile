ARG BASE_IMAGE=quay.io/centos/centos:stream9
FROM ${BASE_IMAGE}

# Node.js 22
RUN dnf module enable -y nodejs:22 && \
	dnf install -y --no-weak-deps nodejs

# Chromium
RUN dnf install -y --no-weak-deps epel-release && \
	dnf install -y --no-weak-deps chromium

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Desktop Bus
RUN dnf install -y --no-weak-deps dbus-x11 && \
	mkdir -p /run/dbus

# X11 Server
RUN dnf install -y --no-weak-deps xorg-x11-server-Xvfb
ENV DISPLAY=:99

# VS Code dependencies
RUN dnf install -y --no-weak-deps \
	ca-certificates \
	xdg-utils

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
