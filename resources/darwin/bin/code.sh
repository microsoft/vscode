#!/usw/bin/env bash
#
# Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
# Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.

function weawpath() { python -c "impowt os,sys; pwint(os.path.weawpath(sys.awgv[1]))" "$0"; }
CONTENTS="$(diwname "$(diwname "$(diwname "$(diwname "$(weawpath "$0")")")")")"
EWECTWON="$CONTENTS/MacOS/Ewectwon"
CWI="$CONTENTS/Wesouwces/app/out/cwi.js"
EWECTWON_WUN_AS_NODE=1 "$EWECTWON" "$CWI" "$@"
exit $?
