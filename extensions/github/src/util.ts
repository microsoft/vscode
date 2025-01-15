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

export const ISSUE_EXPRESSION = /(([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+))?(#|GH-)([1-9][0-9]*)($|\b)/;

export async function findAndModifyString(text: string, find: RegExp, transformer: (match: RegExpMatchArray) => Promise<string | undefined>): Promise<string> {
	let searchResult = text.search(find);
	let position = 0;
	while (searchResult >= 0 && searchResult < text.length) {
		let newBodyFirstPart: string | undefined;
		if (searchResult === 0 || text.charAt(searchResult - 1) !== '&') {
			const match = text.substring(searchResult).match(find)!;
			if (match) {
				const transformed = await transformer(match);
				if (transformed) {
					newBodyFirstPart = text.slice(0, searchResult) + transformed;
					text = newBodyFirstPart + text.slice(searchResult + match[0].length);
				}
			}
		}
		position = newBodyFirstPart ? newBodyFirstPart.length : searchResult + 1;
		const newSearchResult = text.substring(position).search(find);
		searchResult = newSearchResult > 0 ? position + newSearchResult : newSearchResult;
	}
	return text;
}

export function parseIssueExpression(match: RegExpMatchArray | null): { owner?: string; repo?: string; number: number } | undefined {
	if (!match) {
		return undefined;
	}
	switch (match.length) {
		case 7:
			return {
				owner: match[2],
				repo: match[3],
				number: parseInt(match[5]),
			};
		case 16:
			return {
				owner: match[3] || match[11],
				repo: match[4] || match[12],
				number: parseInt(match[7] || match[14]),
			};
		default:
			return undefined;
	}
}
