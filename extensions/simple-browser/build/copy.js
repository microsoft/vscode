/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const fs = require('fs');
const path = require('path');

fs.copyFileSync(
	path.join('node_modules', 'vscode-codicons', 'dist', 'codicon.css'),
	path.join('media', 'codicon.css'));

fs.copyFileSync(
	path.join('node_modules', 'vscode-codicons', 'dist', 'codicon.ttf'),
	path.join('media', 'codicon.ttf'));
