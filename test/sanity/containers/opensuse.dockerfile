ARG BASE_IMAGE=opensuse/leap:16.0
FROM ${BASE_IMAGE}

# Utilities
RUN zypper install -y curl

# Node.js 22.21.1
RUN zypper install -y nodejs22

# Google Chrome (amd64 only)
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "amd64" ]; then \
	curl -fsSL https://dl.google.com/linux/linux_signing_key.pub -o /tmp/google.pub && \
	rpm --import /tmp/google.pub && \
	zypper ar http://dl.google.com/linux/chrome/rpm/stable/x86_64 Google-Chrome && \
	zypper install -y google-chrome-stable; \
	fi

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# X11 Server
RUN zypper install -y xorg-x11-server-Xvfb
ENV DISPLAY=:99

# Desktop Bus
RUN zypper install -y dbus-1-daemon && \
	mkdir -p /run/dbus

# VS Code dependencies
RUN zypper install -y libglib-2_0-0

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
