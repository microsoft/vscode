#!/bin/sh


# Apparently this isn't the right path for the code - oss app, I am not sure
# where to get that.
# Also, we cannot rely on the app being in the applications folder.  It
# can be moved/relocated.  Not sure how to find the installation
# directory.
sudo mkdir -p /usr/local/bin && ln -sf \
"/Applications/Code - OSS.app/Contents/Resources/app/bin/code" \
"/usr/local/bin/code-oss"
