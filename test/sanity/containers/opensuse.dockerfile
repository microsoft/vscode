ARG BASE_IMAGE=opensuse/leap:16.0
FROM ${BASE_IMAGE}

# Node.js 22
RUN zypper install -y --no-recommends nodejs22

# Google Chrome (amd64 only)
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "amd64" ]; then \
	zypper install -y --no-recommends curl && \
	curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | rpm --import - && \
	zypper ar http://dl.google.com/linux/chrome/rpm/stable/x86_64 Google-Chrome && \
	zypper install -y --no-recommends google-chrome-stable; \
	fi

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# X11 Server
RUN zypper install -y --no-recommends xorg-x11-server-Xvfb
ENV DISPLAY=:99

# Desktop Bus
RUN zypper install -y --no-recommends dbus-1-daemon && \
	mkdir -p /run/dbus

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
