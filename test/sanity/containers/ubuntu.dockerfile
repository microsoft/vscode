ARG BASE_IMAGE=ubuntu:22.04
FROM ${BASE_IMAGE}

# Utilities
RUN apt-get update && \
	apt-get install -y curl

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
	apt-get install -y nodejs

# X11 and Desktop Bus except for arm32 on Ubuntu 24.04
RUN if [ "$TARGETARCH" != "arm" ] || [ "${BASE_IMAGE}" != "ubuntu:24.04" ]; then \
		apt-get install -y xvfb dbus-x11; \
		mkdir -p /run/dbus; \
	fi

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
