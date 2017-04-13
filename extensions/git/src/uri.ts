/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri } from 'vscode';

export function fromGitUri(uri: Uri): { path: string; ref: string; } {
	return JSON.parse(uri.query);
}

// As a mitigation for extensions like ESLint showing warnings and errors
// for git URIs, let's change the file extension of these uris to .git,
// when `replaceFileExtension` is true.
export function toGitUri(uri: Uri, ref: string, replaceFileExtension = false): Uri {
	return uri.with({
		scheme: 'git',
		path: replaceFileExtension ? `${uri.path}.git` : uri.path,
		query: JSON.stringify({
			path: uri.fsPath,
			ref
		})
	});
}