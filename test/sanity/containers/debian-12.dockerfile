ARG BASE_IMAGE=node:22-bookworm
FROM ${BASE_IMAGE}

# Utilities
RUN apt-get update

# Chromium
RUN apt-get install -y chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Desktop Bus
RUN apt-get install -y dbus-x11 && \
    mkdir -p /run/dbus

# X11 Server
RUN apt-get install -y xvfb

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
