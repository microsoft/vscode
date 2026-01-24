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

# On Ubuntu 24.04 armhf, libasound2t64 breaks ABI compatibility (time_t transition).
# We need libasound2 from Ubuntu 22.04 for the ALSA_0.9 versioned symbols.
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm" ] && echo "${BASE_IMAGE}" | grep -q "24.04"; then \
	echo "deb [arch=armhf] http://ports.ubuntu.com/ubuntu-ports jammy main" > /etc/apt/sources.list.d/jammy.list && \
	apt-get update && \
	apt-get install -y libasound2=1.2.6.1-1ubuntu1; \
else \
	apt-get install -y libasound2 || apt-get install -y libasound2t64; \
fi

RUN apt-get install -y libgtk-3-0 || apt-get install -y libgtk-3-0t64 && \
	apt-get install -y libcurl4 || apt-get install -y libcurl4t64 && \
	apt-get install -y libatk-bridge2.0-0 || apt-get install -y libatk-bridge2.0-0t64 && \
	apt-get install -y libatk1.0-0 || apt-get install -y libatk1.0-0t64 && \
	apt-get install -y \
		libgbm1 \
		libnss3 \
		xdg-utils

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
