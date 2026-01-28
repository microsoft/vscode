ARG MIRROR
ARG BASE_IMAGE=fedora:36
FROM ${MIRROR}${BASE_IMAGE}

# Node.js, Chromium, X11, DBus, VS Code dependencies
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - \
	&& dnf install -y --setopt=install_weak_deps=False \
		nodejs \
		chromium \
		dbus-x11 \
		xorg-x11-server-Xvfb \
		xdg-utils \
	&& dnf clean all \
	&& rm -rf /var/cache/dnf \
	&& mkdir -p /run/dbus

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
