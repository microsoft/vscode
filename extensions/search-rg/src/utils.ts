/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as vscode from 'vscode';

export function fixDriveC(_path: string): string {
	const root = path.parse(_path).root;
	return root.toLowerCase() === 'c:/' ?
		_path.replace(/^c:[/\\]/i, '/') :
		_path;
}

export function anchorGlob(glob: string): string {
	return glob.startsWith('**') || glob.startsWith('/') ? glob : `/${glob}`;
}

export function joinPath(resource: vscode.Uri, pathFragment: string): vscode.Uri {
	const joinedPath = path.join(resource.fsPath || '/', pathFragment);
	return vscode.Uri.file(joinedPath);
}
