FROM mcr.microsoft.com/devcontainers/typescript-node:18-bookworm

ADD install-vscode.sh /root/
RUN /root/install-vscode.sh

RUN git config --system codespaces-theme.hide-status 1

USER node
RUN YARN_CACHE="$(yarn cache dir)" && rm -rf "$YARN_CACHE" && ln -s /vscode-dev/yarn-cache "$YARN_CACHE"

USER root
CMD chown node:node /vscode-dev && sudo -u node mkdir -p /vscode-dev/yarn-cache && sleep inf
