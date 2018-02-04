FROM microsoft/vsts-agent:ubuntu-16.04-standard
MAINTAINER Joao Moreno <joao.moreno@microsoft.com>

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update

# Dependencies
RUN apt-get install -y build-essential
RUN apt-get install -y gcc-multilib g++-multilib
RUN apt-get install -y git
RUN apt-get install -y dpkg-dev
RUN apt-get install -y zip
RUN apt-get install -y rpm
RUN apt-get install -y createrepo
RUN apt-get install -y python-gtk2
RUN apt-get install -y jq
RUN apt-get install -y xvfb
RUN apt-get install -y fakeroot
RUN apt-get install -y libgtk2.0-0
RUN apt-get install -y libgconf-2-4
RUN apt-get install -y libnss3
RUN apt-get install -y libasound2
RUN apt-get install -y libxtst6
RUN apt-get install -y libfuse2
RUN apt-get install -y libnotify-bin
RUN apt-get install -y libx11-dev
RUN apt-get install -y libxss1
RUN apt-get install -y libx11-xcb-dev
RUN apt-get install -y libxkbfile-dev
RUN apt-get install -y bc bsdmainutils
RUN apt-get install -y libsecret-1-dev

# Xvfb
# Thanks https://medium.com/@griggheo/running-headless-selenium-webdriver-tests-in-docker-containers-342fdbabf756
ADD xvfb.init /etc/init.d/xvfb
RUN chmod +x /etc/init.d/xvfb
RUN update-rc.d xvfb defaults

# dbus
RUN ln -sf /bin/dbus-daemon /usr/bin/dbus-daemon

# nvm
ENV NVM_DIR /usr/local/nvm
RUN curl https://raw.githubusercontent.com/creationix/nvm/v0.33.8/install.sh | bash

RUN apt-get update && \
  apt-get dist-upgrade --yes && \
  apt-get install --yes \
  curl sudo squashfs-tools && \
  curl -L $(curl -H 'X-Ubuntu-Series: 16' 'https://api.snapcraft.io/api/v1/snaps/details/core' | jq '.download_url' -r) --output core.snap && \
  mkdir -p /snap/core && unsquashfs -d /snap/core/current core.snap && rm core.snap && \
  curl -L $(curl -H 'X-Ubuntu-Series: 16' 'https://api.snapcraft.io/api/v1/snaps/details/snapcraft?channel=beta' | jq '.download_url' -r) --output snapcraft.snap && \
  mkdir -p /snap/snapcraft && unsquashfs -d /snap/snapcraft/current snapcraft.snap && rm snapcraft.snap && \
  mkdir -p /snap/bin && \
  echo "#!/bin/sh" > /snap/bin/snapcraft && \
  echo 'exec $SNAP/usr/bin/python3 $SNAP/bin/snapcraft "$@"' >> /snap/bin/snapcraft && \
  chmod a+x /snap/bin/snapcraft && \
  apt-get autoclean --yes && \
  apt-get clean --yes

ENV SNAP=/snap/snapcraft/current
ENV SNAP_NAME=snapcraft
ENV SNAP_VERSION=beta
ENV PATH=/snap/bin:$PATH
# Required by click.
ENV LC_ALL C.UTF-8

CMD (service xvfb start; service dbus start; export DISPLAY=:10; ./start.sh "16.04")