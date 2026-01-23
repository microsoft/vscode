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

# VS Code dependencies
RUN apt-get install -y libasound2 || apt-get install -y libasound2t64 && \
	apt-get install -y libgtk-3-0 || apt-get install -y libgtk-3-0t64 && \
	apt-get install -y libcurl4 || apt-get install -y libcurl4t64 && \
	apt-get install -y \
		libatk-bridge2.0-0 \
		libatk1.0-0 \
		libgbm1 \
		libnss3 \
		xdg-utils

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
