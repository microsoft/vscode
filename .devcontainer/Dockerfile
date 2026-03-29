# ===== 第一阶段：基础镜像配置和 apt 更新 =====
FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm AS stage-apt

# 配置 apt 使用中国镜像源
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's/security.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources

# 配置 npm 使用中国镜像源
RUN npm config set registry https://registry.npmmirror.com

# apt update 和基础工具安装
RUN apt update && \
    apt install -y wget gpg

# ===== 第二阶段：VS Code 安装 =====
FROM stage-apt AS stage-vscode

ADD install-vscode.sh /root/
RUN /root/install-vscode.sh

RUN git config --system codespaces-theme.hide-status 1

# ===== 第三阶段：npm 全局包安装（最终阶段）=====
FROM stage-vscode AS final

USER node
RUN npm config set registry https://registry.npmmirror.com

RUN npm install -g node-gyp

RUN NPM_CACHE="$(npm config get cache)" && rm -rf "$NPM_CACHE" && ln -s /vscode-dev/npm-cache "$NPM_CACHE"
RUN echo 'export DISPLAY="${DISPLAY:-:1}"' | tee -a ~/.bashrc >> ~/.zshrc

USER root
CMD chown node:node /vscode-dev && sudo -u node mkdir -p /vscode-dev/npm-cache && sleep inf
