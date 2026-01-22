ARG BASE_IMAGE=ubuntu:22.04
FROM ${BASE_IMAGE}

# Utilities
RUN apt-get update && \
	apt-get install -y curl

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
	apt-get install -y nodejs

# Desktop Bus
RUN apt-get install -y dbus-x11 && \
	mkdir -p /run/dbus

# X11 Server
RUN apt-get install -y xvfb
ENV DISPLAY=:99

# VS Code dependencies (arm32)
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm" ]; then \
	apt-get install -y libgtk-3-0 || true; \
	apt-get install -y libcurl4 || true; \
	apt-get install -y \
		libasound2 \
		libgbm1 \
		libnss3 \
		libxkbcommon0 \
		xdg-utils; \
	fi

# VS Code dependencies (arm64)
RUN if [ "$TARGETARCH" = "arm64" ]; then \
	apt-get install -y \
		libgbm1 \
		libnss3 \
		libxkbcommon0 \
		xdg-utils; \
	fi

# VS Code dependencies (amd64)
RUN if [ "$TARGETARCH" = "amd64" ]; then \
	apt-get install libasound2 -y || apt-get install libasound2t64 -y; \
	apt-get install -y \
		libgbm1 \
		libgtk-3-0 \
		libnss3 \
		xdg-utils; \
	fi

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
