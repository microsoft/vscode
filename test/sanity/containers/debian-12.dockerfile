ARG MIRROR
ARG BASE_IMAGE=debian:bookworm
FROM ${MIRROR}${BASE_IMAGE}

# Node.js, Chromium, X11, DBus
RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl ca-certificates \
	&& curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
	&& apt-get install -y --no-install-recommends \
		nodejs \
		chromium \
		dbus \
		dbus-x11 \
		xvfb \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p /run/dbus

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
