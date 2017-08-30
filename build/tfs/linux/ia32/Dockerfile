FROM microsoft/vsts-agent:ubuntu-14.04-standard
MAINTAINER Joao Moreno <joao.moreno@microsoft.com>

ARG DEBIAN_FRONTEND=noninteractive
RUN dpkg --add-architecture i386
RUN apt-get update

# Dependencies
RUN apt-get install -y build-essential
RUN apt-get install -y gcc-multilib g++-multilib
RUN apt-get install -y git
RUN apt-get install -y zip
RUN apt-get install -y rpm
RUN apt-get install -y createrepo
RUN apt-get install -y python-gtk2
RUN apt-get install -y jq
RUN apt-get install -y xvfb
RUN apt-get install -y fakeroot
RUN apt-get install -y libgtk2.0-0:i386
RUN apt-get install -y libgconf-2-4:i386
RUN apt-get install -y libnss3:i386
RUN apt-get install -y libasound2:i386
RUN apt-get install -y libxtst6:i386
RUN apt-get install -y libfuse2
RUN apt-get install -y libnotify-bin
RUN apt-get install -y libnotify4:i386
RUN apt-get install -y libx11-dev:i386
RUN apt-get install -y libxkbfile-dev:i386
RUN apt-get install -y libxss1:i386
RUN apt-get install -y libx11-xcb-dev:i386
RUN apt-get install -y libgl1-mesa-glx:i386 libgl1-mesa-dri:i386
RUN apt-get install -y libxkbfile-dev
RUN apt-get install -y bc bsdmainutils
RUN apt-get install -y libgirepository-1.0-1:i386 gir1.2-glib-2.0:i386 gir1.2-secret-1:i386 libsecret-1-dev:i386
RUN apt-get install -y dpkg-dev:i386

# Xvfb
# Thanks https://medium.com/@griggheo/running-headless-selenium-webdriver-tests-in-docker-containers-342fdbabf756
ADD xvfb.init /etc/init.d/xvfb
RUN chmod +x /etc/init.d/xvfb
RUN update-rc.d xvfb defaults

# nvm
ENV NVM_DIR /usr/local/nvm
RUN curl https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash

# for libsecret
ENV PKG_CONFIG_PATH /usr/lib/i386-linux-gnu/pkgconfig

CMD (service xvfb start; export DISPLAY=:10; ./start.sh)