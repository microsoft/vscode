/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API as GitAPI, Repository } from './typings/git';
import { getRepositoryFromUrl } from './util';

export function isFileInRepo(repository: Repository, file: vscode.Uri): boolean {
	return file.path.toLowerCase() === repository.rootUri.path.toLowerCase() ||
		(file.path.toLowerCase().startsWith(repository.rootUri.path.toLowerCase()) &&
			file.path.substring(repository.rootUri.path.length).startsWith('/'));
}

export function getRepositoryForFile(gitAPI: GitAPI, file: vscode.Uri): Repository | undefined {
	for (const repository of gitAPI.repositories) {
		if (isFileInRepo(repository, file)) {
			return repository;
		}
	}
	return undefined;
}

function getFileAndPosition(): { uri: vscode.Uri | undefined; range: vscode.Range | undefined } {
	let uri: vscode.Uri | undefined;
	let range: vscode.Range | undefined;
	if (vscode.window.activeTextEditor) {
		uri = vscode.window.activeTextEditor.document.uri;
		range = vscode.window.activeTextEditor.selection;
	}
	return { uri, range };
}

function rangeString(range: vscode.Range | undefined) {
	if (!range) {
		return '';
	}
	let hash = `#L${range.start.line + 1}`;
	if (range.start.line !== range.end.line) {
		hash += `-L${range.end.line + 1}`;
	}
	return hash;
}

export function getPermalink(gitAPI: GitAPI, useSelection: boolean, hostPrefix?: string): string | undefined {
	hostPrefix = hostPrefix ?? 'https://github.com';
	const { uri, range } = getFileAndPosition();
	// Use the first repo if we cannot determine a repo from the uri.
	const gitRepo = (uri ? getRepositoryForFile(gitAPI, uri) : gitAPI.repositories[0]) ?? gitAPI.repositories[0];
	if (!gitRepo) {
		return;
	}
	let repo: { owner: string; repo: string } | undefined;
	gitRepo.state.remotes.find(remote => {
		if (remote.fetchUrl) {
			const foundRepo = getRepositoryFromUrl(remote.fetchUrl);
			if (foundRepo && (remote.name === gitRepo.state.HEAD?.upstream?.remote)) {
				repo = foundRepo;
				return;
			} else if (foundRepo && !repo) {
				repo = foundRepo;
			}
		}
		return;
	});
	if (!repo) {
		return;
	}

	const commitHash = gitRepo.state.HEAD?.commit;
	const fileSegments = (useSelection && uri) ? `${uri.path.substring(gitRepo.rootUri.path.length)}${rangeString(range)}` : '';

	return `${hostPrefix}/${repo.owner}/${repo.repo}/blob/${commitHash
		}${fileSegments}`;
}
