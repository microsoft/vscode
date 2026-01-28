ARG BASE_IMAGE=quay.io/centos/centos:stream9
FROM ${BASE_IMAGE}

# Node.js, Chromium, X11, DBus, VS Code dependencies
RUN dnf module enable -y nodejs:22 \
	&& dnf install -y epel-release \
	&& dnf install -y --setopt=install_weak_deps=False \
		nodejs \
		chromium \
		dbus-x11 \
		xorg-x11-server-Xvfb \
		ca-certificates \
		xdg-utils \
	&& dnf clean all \
	&& rm -rf /var/cache/dnf \
	&& mkdir -p /run/dbus

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
