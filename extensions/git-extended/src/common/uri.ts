/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri } from 'vscode';

export interface GitUriParams {
	path: string;
	ref?: string;
	commit?: string;
}

export function fromGitUri(uri: Uri): GitUriParams {
	return JSON.parse(uri.query);
}

export interface GitUriOptions {
	replaceFileExtension?: boolean;
	submoduleOf?: string;
}

// As a mitigation for extensions like ESLint showing warnings and errors
// for git URIs, let's change the file extension of these uris to .git,
// when `replaceFileExtension` is true.
export function toGitUri(uri: Uri, ref: string, commit: string, options: GitUriOptions = {}): Uri {
	const params: GitUriParams = {
		path: uri.path,
		ref,
		commit: commit
	};

	let path = uri.path;

	if (options.replaceFileExtension) {
		path = `${path}.git`;
	}

	return uri.with({
		scheme: 'review',
		path,
		query: JSON.stringify(params)
	});
}