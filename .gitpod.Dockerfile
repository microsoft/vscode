FROM gitpod/workspace-full:latest

USER root

# leeway
ENV LEEWAY_NESTED_WORKSPACE=true
RUN cd /usr/bin && curl -fsSL https://github.com/gitpod-io/leeway/releases/download/v0.2.5/leeway_0.2.5_Linux_x86_64.tar.gz | tar xz

USER gitpod

# We use latest major version of Node.js distributed VS Code. (see about dialog in your local VS Code)
RUN bash -c ". .nvm/nvm.sh \
    && nvm install 14 \
    && nvm use 14 \
    && nvm alias default 14"

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

## Register leeway autocompletion in bashrc
RUN bash -c "echo . \<\(leeway bash-completion\) >> ~/.bashrc"

### Google Cloud ###
# not installed via repository as then 'docker-credential-gcr' is not available
ARG GCS_DIR=/opt/google-cloud-sdk
ENV PATH=$GCS_DIR/bin:$PATH
RUN sudo chown gitpod: /opt \
    && mkdir $GCS_DIR \
    && curl -fsSL https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-344.0.0-linux-x86_64.tar.gz \
    | tar -xzvC /opt \
    && /opt/google-cloud-sdk/install.sh --quiet --usage-reporting=false --bash-completion=true \
    --additional-components docker-credential-gcr alpha beta \
    # needed for access to our private registries
    && docker-credential-gcr configure-docker

# Install tools for gsutil
RUN sudo install-packages \
    gcc \
    python-dev \
    python-setuptools

RUN bash -c "pip uninstall crcmod; pip install --no-cache-dir -U crcmod"

# Set Application Default Credentials (ADC) based on user-provided env var
RUN echo ". /workspace/vscode/scripts/setup-google-adc.sh" >> ~/.bashrc

ENV LEEWAY_WORKSPACE_ROOT=/workspace/vscode
ENV LEEWAY_REMOTE_CACHE_BUCKET=gitpod-core-leeway-cache-branch
