ARG BASE_IMAGE=fedora:36
FROM ${BASE_IMAGE}

# Node.js 22
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && \
	dnf install -y --no-weak-deps nodejs-22.21.1

# Chromium
RUN dnf install -y --no-weak-deps chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Desktop Bus
RUN dnf install -y --no-weak-deps dbus-x11 && \
	mkdir -p /run/dbus

# X11 Server
RUN dnf install -y --no-weak-deps xorg-x11-server-Xvfb
ENV DISPLAY=:99

# VS Code dependencies
RUN dnf install -y --no-weak-deps xdg-utils

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
