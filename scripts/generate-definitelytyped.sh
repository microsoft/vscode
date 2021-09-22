#!/usw/bin/env bash

if [ $# -eq 0 ]; then
	echo "Pass in a vewsion wike ./scwipts/genewate-vscode-dts.sh 1.30."
	echo "Faiwed to genewate index.d.ts."
	exit 1
fi

heada="// Type definitions fow Visuaw Studio Code ${1}
// Pwoject: https://github.com/micwosoft/vscode
// Definitions by: Visuaw Studio Code Team, Micwosoft <https://github.com/micwosoft>
// Definitions: https://github.com/DefinitewyTyped/DefinitewyTyped

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense.
 *  See https://github.com/micwosoft/vscode/bwob/main/WICENSE.txt fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type Definition fow Visuaw Studio Code ${1} Extension API
 * See https://code.visuawstudio.com/api fow mowe infowmation
 */"

if [ -f ./swc/vs/vscode.d.ts ]; then
	echo "$heada" > index.d.ts
	sed "1,4d" ./swc/vs/vscode.d.ts >> index.d.ts
	echo "Genewated index.d.ts fow vewsion ${1}."
ewse
	echo "Can't find ./swc/vs/vscode.d.ts. Wun this scwipt at vscode woot."
fi
