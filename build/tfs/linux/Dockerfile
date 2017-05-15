FROM microsoft/vsts-agent:ubuntu-16.04-standard
MAINTAINER Joao Moreno <joao.moreno@microsoft.com>

RUN dpkg --add-architecture i386
RUN apt-get update
RUN apt-get install -y build-essential
RUN apt-get install -y gcc-multilib g++-multilib
RUN apt-get install -y zip
RUN apt-get install -y rpm
RUN apt-get install -y createrepo
RUN apt-get install -y python-gtk2
RUN apt-get install -y jq
RUN apt-get install -y xvfb
RUN apt-get install -y fakeroot
RUN apt-get install -y libgtk2.0-0 libgtk2.0-0:i386
RUN apt-get install -y libgconf-2-4 libgconf-2-4:i386
RUN apt-get install -y libnss3 libnss3:i386
RUN apt-get install -y libasound2
RUN apt-get install -y libxtst6 libxtst6:i386
RUN apt-get install -y libfuse2
RUN apt-get install -y libnotify-bin
RUN apt-get install -y libnotify4:i386
RUN apt-get install -y libx11-dev libx11-dev:i386
RUN apt-get install -y libxkbfile-dev:i386
RUN apt-get install -y libxss1 libxss1:i386
RUN apt-get install -y libx11-xcb-dev libx11-xcb-dev:i386
RUN apt-get install -y libxkbfile-dev
