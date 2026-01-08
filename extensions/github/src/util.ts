/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Repository } from './typings/git.js';

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

function decorate(decorator: (fn: Function, key: string) => Function): Function {
	return function (original: any, context: ClassMethodDecoratorContext) {
		if (context.kind === 'method' || context.kind === 'getter' || context.kind === 'setter') {
			return decorator(original, context.name.toString());
		}
		throw new Error('not supported');
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
