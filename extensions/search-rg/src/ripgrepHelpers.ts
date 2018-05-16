/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import * as path from 'path';

export function fixDriveC(_path: string): string {
	const root = path.parse(_path).root;
	return root.toLowerCase() === 'c:/' ?
		_path.replace(/^c:[/\\]/i, '/') :
		_path;
}

function trimTrailingSlash(str: string): string {
	return str
		.replace(/\/$/, '')
		.replace(/\\$/, '');
}
