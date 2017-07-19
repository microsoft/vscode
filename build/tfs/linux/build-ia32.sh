#!/bin/bash
set -e

docker build -t build-ia32 ./build/tfs/linux/image-ia32
docker run --rm -v "${WORK_MNT}:${VSTS_WORK}" -w="`pwd`" build-ia32 npm install --unsafe-perms --runtime=electron --target=1.6.6 --disturl=https://atom.io/download/atom-shell keytar

./build/tfs/linux/build.sh ia32 "$@"