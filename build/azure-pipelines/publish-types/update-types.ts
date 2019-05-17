/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';

let tag = '';
try {
	tag = cp
		.execSync('git describe --tags `git rev-list --tags --max-count=1`')
		.toString()
		.trim();

	if (isValidTag(tag)) {
		throw Error(`Invalid tag ${tag}`);
	}

	const dtsUri = `https://raw.githubusercontent.com/microsoft/vscode/${tag}/src/vs/vscode.d.ts`;
	const outPath = path.resolve(process.cwd(), 'vscode-DefinitelyTyped/types/vscode/index.d.ts');
	cp.execSync(`curl ${dtsUri} -O ${outPath}`);

	updateDTSFile(outPath, tag);

	console.log(`Done updating vscode.d.ts at ${outPath}`);
} catch (err) {
	console.error(err);
	console.error('Failed to update types');
	process.exit(1);
}

function isValidTag(t: string) {
	if (t.split('.').length !== 3) {
		return false;
	}

	const [major, minor, bug] = t.split('.');

	// Only release for tags like 1.34.0
	if (bug !== '0') {
		return false;
	}

	if (parseInt(major, 10) === NaN || parseInt(minor, 10) === NaN) {
		return false;
	}

	return true;
}

function updateDTSFile(outPath: string, tag: string) {
	const oldContent = fs.readFileSync(outPath, 'utf-8');
	const newContent = getNewFileContent(oldContent, tag);

	fs.writeFileSync(outPath, newContent);
}

function getNewFileContent(content: string, tag: string) {
	const oldheader = `/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
`;

	return getNewFileHeader(tag) + content.slice(oldheader.length + 2);
}

function getNewFileHeader(tag: string) {
  const header = `// Type definitions for Visual Studio Code ${tag}
// Project: https://github.com/microsoft/vscode
// Definitions by: Visual Studio Code Team, Microsoft <https://github.com/Microsoft>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *  See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type Definition for Visual Studio Code ${tag} Extension API
 * See https://code.visualstudio.com/api for more information
 */`;

 return header;
}
