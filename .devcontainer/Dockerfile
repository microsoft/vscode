FROM mcr.microsoft.com/devcontainers/typescript-node:20-bookworm

ADD install-vscode.sh /root/
RUN /root/install-vscode.sh

RUN git config --system codespaces-theme.hide-status 1

USER node
RUN npm install -g node-gyp
RUN NPM_CACHE="$(npm config get cache)" && rm -rf "$NPM_CACHE" && ln -s /vscode-dev/npm-cache "$NPM_CACHE"
RUN echo 'export DISPLAY="${DISPLAY:-:1}"' | tee -a ~/.bashrc >> ~/.zshrc

USER root
CMD chown node:node /vscode-dev && sudo -u node mkdir -p /vscode-dev/npm-cache && sleep inf

# Add a new command to open VSCode in the devcontainer
RUN code-insiders --install-extension ms-vscode-remote.remote-containers

# Add a new command to use the `./.devcontainer/post-create.sh` script
RUN chmod +x /vscode/.devcontainer/post-create.sh
