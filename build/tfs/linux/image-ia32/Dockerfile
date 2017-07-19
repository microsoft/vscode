FROM i386/ubuntu:17.04

RUN apt-get update
RUN apt-get install -y build-essential python wget
RUN apt-get install -y libsecret-1-dev

WORKDIR /build

RUN wget https://nodejs.org/dist/v7.10.0/node-v7.10.0-linux-x86.tar.gz

RUN tar xfz node-v7.10.0-linux-x86.tar.gz

RUN chown -R root:root node-v7.10.0-linux-x86

ENV PATH="/build/node-v7.10.0-linux-x86/bin:${PATH}"

RUN npm install -g node-gyp
