ARG BASE_IMAGE=opensuse/leap:16.0
FROM ${BASE_IMAGE}

# Node.js, Chromium, X11, DBus, VS Code dependencies
RUN zypper install -y --no-recommends \
		nodejs22 \
		chromium \
		pciutils \
		Mesa-libGL1 \
		xorg-x11-server-Xvfb \
		dbus-1-x11 \
		liberation-fonts \
		libgtk-3-0 \
	&& zypper clean -a \
	&& mkdir -p /run/dbus

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
