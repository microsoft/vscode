/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { Repository } from './typings/git.d.ts';
import { getRepositoryFromUrl } from './linkRepository.js';

// `getRepositoryFromUrl` and `repositoryHasGitHubRemote` now live in
// `linkRepository.js` (which has no `vscode` dependency) and are re-exported
// here for existing importers.
export { getRepositoryFromUrl, repositoryHasGitHubRemote } from './linkRepository.js';

export class DisposableStore {

	private disposables = new Set<vscode.Disposable>();
	private isDisposed = false;

	add(disposable: vscode.Disposable): void {
		if (this.isDisposed) {
			// The store was already disposed, so nothing would ever dispose this.
			disposable.dispose();
			return;
		}

		this.disposables.add(disposable);
	}

	dispose(): void {
		this.isDisposed = true;

		for (const disposable of this.disposables) {
			disposable.dispose();
		}

		this.disposables.clear();
	}
}

function decorate(decorator: (fn: Function, key: string) => Function): Function {
	return (_target: any, key: string, descriptor: PropertyDescriptor): void => {
		if (typeof descriptor.value === 'function') {
			descriptor.value = decorator(descriptor.value, key);
		} else if (typeof descriptor.get === 'function') {
			descriptor.get = decorator(descriptor.get, key) as () => any;
		} else {
			throw new Error('not supported');
		}
	};
}

function _sequentialize(fn: Function, key: string): Function {
	const currentKey = `__$sequence$${key}`;

	return function (this: any, ...args: any[]) {
		const currentPromise = this[currentKey] as Promise<any> || Promise.resolve(null);
		const run = async () => await fn.apply(this, args);
		this[currentKey] = currentPromise.then(run, run);
		return this[currentKey];
	};
}

export const sequentialize = decorate(_sequentialize);

export function groupBy<T>(data: ReadonlyArray<T>, compare: (a: T, b: T) => number): T[][] {
	const result: T[][] = [];
	let currentGroup: T[] | undefined = undefined;
	for (const element of data.slice(0).sort(compare)) {
		if (!currentGroup || compare(currentGroup[0], element) !== 0) {
			currentGroup = [element];
			result.push(currentGroup);
		} else {
			currentGroup.push(element);
		}
	}
	return result;
}

export function getRepositoryFromQuery(query: string): { owner: string; repo: string } | undefined {
	const match = /^([^/]+)\/([^/]+)$/i.exec(query);
	return match ? { owner: match[1], repo: match[2] } : undefined;
}

export function getRepositoryDefaultRemoteUrl(repository: Repository, order: string[]): string | undefined {
	const remotes = repository.state.remotes
		.filter(remote => remote.fetchUrl && getRepositoryFromUrl(remote.fetchUrl));

	if (remotes.length === 0) {
		return undefined;
	}

	for (const name of order) {
		const remote = remotes
			.find(remote => remote.name === name);

		if (remote) {
			return remote.fetchUrl;
		}
	}

	// Fallback to first remote
	return remotes[0].fetchUrl;
}

export function getRepositoryDefaultRemote(repository: Repository, order: string[]): { owner: string; repo: string } | undefined {
	const fetchUrl = getRepositoryDefaultRemoteUrl(repository, order);
	return fetchUrl ? getRepositoryFromUrl(fetchUrl) : undefined;
}
