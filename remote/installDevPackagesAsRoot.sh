#!/bin/bash
set -ex

# Install libraries and tools
apt-get update
apt-get install -y \
	curl \
	make \
	gcc \
	g++ \
	python2.7 \
	libx11-dev \
	libxkbfile-dev \
	libsecret-1-dev \
	xz-utils
rm -rf /var/lib/apt/lists/*
