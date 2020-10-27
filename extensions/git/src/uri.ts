/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SourceControlRevisionState, ThemeIcon, Uri } from 'vscode';
import { Commit } from './git';

export interface GitUriParams {
	path: string;
	ref: string;
	submoduleOf?: string;
}

export function isGitUri(uri: Uri): boolean {
	return /^git$/.test(uri.scheme);
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
		scheme: 'git',
		path,
		query: JSON.stringify(params)
	});
}

export function isRevisionUri(uri: Uri): boolean {
	return /^revision$/.test(uri.scheme);
}

export function fromRevisionUri(uri: Uri): SourceControlRevisionState {
	return JSON.parse(uri.query);
}

export function toRevisionUri(commit: Commit): Uri {
	const shortId = commit.hash.substr(0, 8);
	const revision: SourceControlRevisionState = {
		id: commit.hash,
		shortId: shortId,
		message: commit.message,
		author: commit.authorName,
		timestamp: commit.commitDate?.getTime() ?? commit.authorDate?.getTime(),
		status: 'unpublished',
		iconPath: new (ThemeIcon as any)('git-commit')
	};
	return Uri.parse(`revision://${shortId}/?${encodeURIComponent(JSON.stringify(revision))}`);
}
