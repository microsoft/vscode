/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RipgrepTextSearchEngine } from './ripgrepTextSearch';
import { RipgrepFileSearchEngine } from './ripgrepFileSearch';
import { CachedSearchProvider } from './cachedSearchProvider';

export function activate(): void {
	if (vscode.workspace.getConfiguration('searchRipgrep').get('enable')) {
		const outputChannel = vscode.window.createOutputChannel('search-rg');
		const provider = new RipgrepSearchProvider(outputChannel);
		vscode.workspace.registerSearchProvider('file', provider);
		vscode.workspace.registerTextSearchProvider('file', provider);
	}
}

type SearchEngine = RipgrepFileSearchEngine | RipgrepTextSearchEngine;

class RipgrepSearchProvider implements vscode.SearchProvider, vscode.TextSearchProvider {
	private cachedProvider: CachedSearchProvider;
	private inProgress: Set<SearchEngine> = new Set();

	constructor(private outputChannel: vscode.OutputChannel) {
		this.cachedProvider = new CachedSearchProvider();
		process.once('exit', () => this.dispose());
	}

	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<void> {
		const engine = new RipgrepTextSearchEngine(this.outputChannel);
		return this.withEngine(engine, () => engine.provideTextSearchResults(query, options, progress, token));
	}

	provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.SearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
		const engine = new RipgrepFileSearchEngine(this.outputChannel);
		return this.withEngine(engine, () => this.cachedProvider.provideFileSearchResults(engine, query, options, progress, token));
	}

	clearCache(cacheKey: string): void {
		this.cachedProvider.clearCache(cacheKey);
	}

	private withEngine(engine: SearchEngine, fn: () => Thenable<void>): Thenable<void> {
		this.inProgress.add(engine);
		return fn().then(() => {
			this.inProgress.delete(engine);
		});
	}

	private dispose() {
		this.inProgress.forEach(engine => engine.cancel());
	}
}