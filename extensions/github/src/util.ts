/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Repository } from './typings/git';

export class DisposableStore {

	private disposables = new Set<vscode.Disposable>();

	add(disposable: vscode.Disposable): void {
		this.disposables.add(disposable);
	}

	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}

		this.disposables.clear();
	}
}

export function getRepositoryFromUrl(url: string): { owner: string; repo: string } | undefined {
	const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/i.exec(url)
		|| /^git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/i.exec(url);
	return match ? { owner: match[1], repo: match[2] } : undefined;
}

export function getRepositoryFromQuery(query: string): { owner: string; repo: string } | undefined {
	const match = /^([^/]+)\/([^/]+)$/i.exec(query);
	return match ? { owner: match[1], repo: match[2] } : undefined;
}

export function repositoryHasGitHubRemote(repository: Repository) {
	return !!repository.state.remotes.find(remote => remote.fetchUrl ? getRepositoryFromUrl(remote.fetchUrl) : undefined);
}
