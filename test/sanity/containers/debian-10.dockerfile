ARG BASE_IMAGE=debian:10
FROM ${BASE_IMAGE}

# Update to archive repos since Debian 10 is EOL
RUN sed -i 's|http://deb.debian.org|http://archive.debian.org|g' /etc/apt/sources.list && \
	sed -i 's|http://security.debian.org|http://archive.debian.org|g' /etc/apt/sources.list && \
	sed -i '/buster-updates/d' /etc/apt/sources.list

# Utilities
RUN apt-get update && \
	apt-get install -y curl

# Node.js 22.21.1
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
	apt-get install -y nodejs

# Google Chrome
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
	echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
	apt-get update && \
	apt-get install -y google-chrome-stable

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Desktop Bus
RUN apt-get install -y dbus-x11 && \
    mkdir -p /run/dbus

# X11 Server
RUN apt-get install -y xvfb
ENV DISPLAY=:99

# VS Code dependencies
# Install newer libxkbfile1 from Debian 11 since Debian 10 version is too old
RUN echo "deb http://archive.debian.org/debian bullseye main" >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y -t bullseye libxkbfile1

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
