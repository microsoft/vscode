/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';
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

export interface RevisionUriParams {
	path: string;
	ref: string;
	message: string;
	date: number;
}

export function isRevisionUri(uri: Uri): boolean {
	return /^revision$/.test(uri.scheme);
}

export function fromRevisionUri(uri: Uri): RevisionUriParams {
	return JSON.parse(uri.query);
}

export function toRevisionUri(path: string, commit: Commit): Uri {
	const index = commit.message.indexOf('\n');
	const message = index !== -1 ? `${commit.message.substring(0, index)} \u2026` : commit.message;
	const shortSha = commit.hash.substr(0, 8);

	let info: RevisionUriParams = {
		path: path,
		ref: commit.hash,
		message: message,
		date: commit.commitDate?.getTime() ?? commit.authorDate?.getTime() ?? Date.now()
	};
	return Uri.parse(`revision://${shortSha}/?${JSON.stringify(info)}`);
}
