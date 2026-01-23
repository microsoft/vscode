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
RUN zypper install -y xorg-x11-server-Xvfb
ENV DISPLAY=:99

# Desktop Bus
RUN zypper install -y dbus-1-daemon && \
	mkdir -p /run/dbus

# VS Code Desktop dependencies (arm64 only, amd64 gets these via google-chrome-stable)
RUN if [ "$TARGETARCH" = "arm64" ]; then \
		zypper install -y \
			gtk3 \
			libsecret-1-0 \
			mozilla-nss \
			alsa-lib; \
	fi

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
