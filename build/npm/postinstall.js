/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');

const extensions = [
	'vscode-api-tests',
	'vscode-colorize-tests',
	'json',
	'typescript',
	'php',
	'javascript'
];

extensions.forEach(extension => {
	cp.spawnSync('npm', ['install'], {
		cwd: `extensions/${ extension }`,
		stdio: 'inherit'
	});
});
