#!/bin/sh

sudo apt-get update
sudo apt-get install wget
wget -q https://raw.githubusercontent.com/chromium/chromium/main/third_party/dpkg-shlibdeps/dpkg-shlibdeps.pl -O dpkg-shlibdeps.pl
