ARG BASE_IMAGE=registry.opensuse.org/opensuse/bci/nodejs:22
FROM ${BASE_IMAGE}

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

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
