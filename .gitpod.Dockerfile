FROM gitpod/workspace-full:latest

FROM gitpod/workspace-full:latest

RUN bash -c ". .nvm/nvm.sh \
    && nvm install 12.14.1 \
    && nvm use 12.14.1 \
    && nvm alias default 12.14.1"

RUN echo "nvm use default &>/dev/null" >> ~/.bashrc.d/51-nvm-fix

# Install dependencies
RUN sudo apt-get update \
    && sudo apt-get install -y --no-install-recommends \
        xvfb x11vnc fluxbox dbus-x11 x11-utils x11-xserver-utils xdg-utils \
        fbautostart xterm eterm gnome-terminal gnome-keyring seahorse nautilus \
        libx11-dev libxkbfile-dev libsecret-1-dev libnotify4 libnss3 libxss1 \
        libasound2 libgbm1 xfonts-base xfonts-terminus fonts-noto fonts-wqy-microhei \
        fonts-droid-fallback vim-tiny nano libgconf2-dev libgtk-3-dev twm \
    && sudo apt-get clean && sudo rm -rf /var/cache/apt/* && sudo rm -rf /var/lib/apt/lists/* && sudo rm -rf /tmp/*
