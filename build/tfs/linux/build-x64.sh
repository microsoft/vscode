#!/bin/bash
set -e
DIRNAME=$(dirname $(readlink -f $0))
$DIRNAME/build.sh x64 "$@"