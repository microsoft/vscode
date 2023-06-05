ARG BASE_IMAGE
FROM $BASE_IMAGE

RUN rm -f /usr/local/bin/code # Avoid conflict with convenience script.

ADD install-vscode.sh /root/
RUN /root/install-vscode.sh

ARG VSCODE_DOWNLOAD_URL
RUN [ -n "$VSCODE_DOWNLOAD_URL" ] && cd / && wget "$VSCODE_DOWNLOAD_URL" && \
	case "$VSCODE_DOWNLOAD_URL" in \
		*.deb) dpkg -i "$(basename "$VSCODE_DOWNLOAD_URL")";; \
		*.rpm) dnf localinstall -y "$(basename "$VSCODE_DOWNLOAD_URL")";; \
		*.tar.gz) tar xfz "$(basename "$VSCODE_DOWNLOAD_URL")" ; sudo ln -s /VSCode-linux-*/code* /usr/local/bin;; \
		*) echo "Unknown filename extension: $VSCODE_DOWNLOAD_URL";; \
	esac

RUN getent passwd node || useradd --create-home --shell $SHELL node

RUN git config --system codespaces-theme.hide-status 1

USER node
RUN if command -v yarn >/dev/null 2>&1; then YARN_CACHE="$(yarn cache dir)" && rm -rf "$YARN_CACHE" && ln -s /vscode-dev/yarn-cache "$YARN_CACHE"; fi

USER root
CMD chown node:node /vscode-dev && sudo -u node mkdir -p /vscode-dev/yarn-cache && sleep inf
