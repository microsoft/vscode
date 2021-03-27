/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';
import * as qs from 'querystring';

export interface GitUriParams {
	path: string;
	ref: string;
	submoduleOf?: string;
}

export function isGitUri(uri: Uri): boolean {
	return /^git(fs)?$/.test(uri.scheme);
}

export function fromGitUri(uri: Uri): GitUriParams {
	const result = qs.parse(uri.query) as any;

	if (!result) {
		throw new Error('Invalid git URI: empty query');
	}

	if (typeof result.path !== 'string') {
		throw new Error('Invalid git URI: missing path');
	}

	if (typeof result.ref !== 'string') {
		throw new Error('Invalid git URI: missing ref');
	}

	return result;
}

export interface GitUriOptions {
	replaceFileExtension?: boolean;
	submoduleOf?: string;
}

// As a mitigation for extensions like ESLint showing warnings and errors
// for git URIs, let's change the file extension of these uris to .git,
// when `replaceFileExtension` is true.
export function toGitUri(uri: Uri, ref: string, options: GitUriOptions = {}): Uri {
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
		scheme: 'gitfs',
		path,
		query: qs.stringify(params as any)
	});
}
