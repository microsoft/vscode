#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

if [[ "$@" == *"-"* ]]
then
  function realpath() { python -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$0"; }
  CONTENTS="$(dirname "$(dirname "$(dirname "$(dirname "$(realpath "$0")")")")")"
  ELECTRON="$CONTENTS/MacOS/Electron"
  CLI="$CONTENTS/Resources/app/out/cli.js"
  ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
else
  open -b com.microsoft.VSCode "$@"
fi
exit $?
