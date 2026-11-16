FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

ADD install-vscode.sh /root/
RUN /root/install-vscode.sh

RUN git config --system codespaces-theme.hide-status 1

USER node
RUN npm install -g node-gyp
RUN NPM_CACHE="$(npm config get cache)" && rm -rf "$NPM_CACHE" && ln -s /vscode-dev/npm-cache "$NPM_CACHE"
# Keep the pnpm store on the volume as well, so downloads survive container rebuilds
ENV pnpm_config_store_dir=/vscode-dev/pnpm-store
RUN echo 'export DISPLAY="${DISPLAY:-:1}"' | tee -a ~/.bashrc >> ~/.zshrc

USER root
CMD chown node:node /vscode-dev && sudo -u node mkdir -p /vscode-dev/npm-cache /vscode-dev/pnpm-store && sleep inf
