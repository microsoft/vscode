/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var cp = require('child_process');

var extensions = ['vscode-api-tests', 'vscode-colorize-tests', 'json', 'typescript', 'php', 'javascript'];

extensions.forEach(function (extension) {
	cp.execSync('npm --prefix extensions/' + extension + '/ install extensions/' + extension + '/');
});