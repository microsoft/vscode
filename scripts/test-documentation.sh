#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
	vscodeuserdatadir=$(mktemp -d -t 'myuserdatadir')
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
	vscodeuserdatadir=$(mktemp -d 2>/dev/null)
fi

cd "$root" || exit

echo "Runs tests against the current documentation in https://github.com/microsoft/vscode-docs/tree/vnext"

# Tests in AMD
./scripts/test.sh --runGlob ./**/*.releaseTest.js "$@"


rm -r "$vscodeuserdatadir"
