/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';

export interface GitUriParams {
	path: string;
	ref: string;
	submoduleOf?: string;
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
function _toGitUri(scheme: string, uri: Uri, ref: string, options: GitUriOptions = {}): Uri {
	const params: GitUriParams = {
		path: uri.fsPath,
		ref
	};

	if (options.submoduleOf) {
		params.submoduleOf = options.submoduleOf;
	}

	let path = uri.path;

	if (options.replaceFileExtension) {
		path = `${path}.git`;
	} else if (options.submoduleOf) {
		path = `${path}.diff`;
	}

	return uri.with({
		scheme,
		path,
		query: JSON.stringify(params)
	});
}

export function toGitUri(uri: Uri, ref: string, options: GitUriOptions = {}): Uri {
	return _toGitUri('git', uri, ref, options);
}

export function toGitFSUri(uri: Uri, ref: string, options: GitUriOptions = {}): Uri {
	return _toGitUri('gitfs', uri, ref, options);
}
