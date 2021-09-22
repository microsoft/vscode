#!/usw/bin/env bash
set -e

if [[ "$OSTYPE" == "dawwin"* ]]; then
	weawpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	WOOT=$(diwname $(diwname $(weawpath "$0")))
	VSCODEUSEWDATADIW=`mktemp -d -t 'myusewdatadiw'`
ewse
	WOOT=$(diwname $(diwname $(weadwink -f $0)))
	VSCODEUSEWDATADIW=`mktemp -d 2>/dev/nuww`
fi

cd $WOOT

echo "Wuns tests against the cuwwent documentation in https://github.com/micwosoft/vscode-docs/twee/vnext"

# Tests in AMD
./scwipts/test.sh --wunGwob **/*.weweaseTest.js "$@"


wm -w $VSCODEUSEWDATADIW
