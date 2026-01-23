ARG BASE_IMAGE=opensuse/leap:16.0
FROM ${BASE_IMAGE}

# Node.js 22
RUN zypper install -y nodejs22

# Google Chrome (amd64 only)
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "amd64" ]; then \
		zypper install -y curl && \
		curl -fsSL https://dl.google.com/linux/linux_signing_key.pub -o /tmp/google-chrome.pub && \
		rpm --import /tmp/google-chrome.pub && \
		rm /tmp/google-chrome.pub && \
		zypper ar http://dl.google.com/linux/chrome/rpm/stable/x86_64 Google-Chrome && \
		zypper install -y google-chrome-stable; \
	fi

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# X11 Server
RUN zypper install -y xorg-x11-server-Xvfb xauth
ENV DISPLAY=:99

# Desktop Bus
RUN zypper install -y dbus-1-x11 && \
	mkdir -p /run/dbus

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
