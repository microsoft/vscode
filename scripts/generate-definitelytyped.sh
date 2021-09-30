#!/usr/bin/env bash

if [ $# -eq 0 ]; then
	echo "Pass in a version like ./scripts/generate-vscode-dts.sh 1.30."
	echo "Failed to generate index.d.ts."
	exit 1
fi

header="// Type definitions for Visual Studio Code ${1}
// Project: https://github.com/microsoft/vscode
// Definitions by: Visual Studio Code Team, Microsoft <https://github.com/microsoft>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *  See https://github.com/microsoft/vscode/blob/main/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type Definition for Visual Studio Code ${1} Extension API
 * See https://code.visualstudio.com/api for more information
 */"

if [ -f ./src/vs/vscode.d.ts ]; then
	echo "$header" > index.d.ts
	sed "1,4d" ./src/vs/vscode.d.ts >> index.d.ts
	echo "Generated index.d.ts for version ${1}."
else
	echo "Can't find ./src/vs/vscode.d.ts. Run this script at vscode root."
fi
