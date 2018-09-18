/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RipgrepFileSearchEngine } from './ripgrepFileSearch';
import { RipgrepTextSearchEngine } from './ripgrepTextSearch';

export function activate(): void {
	if (vscode.workspace.getConfiguration('searchRipgrep').get('enable')) {
		const outputChannel = vscode.window.createOutputChannel('search-rg');

		const provider = new RipgrepSearchProvider(outputChannel);
		vscode.workspace.registerFileIndexProvider('file', provider);
		vscode.workspace.registerTextSearchProvider('file', provider);
	}
}

type SearchEngine = RipgrepFileSearchEngine | RipgrepTextSearchEngine;

class RipgrepSearchProvider implements vscode.FileIndexProvider, vscode.TextSearchProvider {
	private inProgress: Set<SearchEngine> = new Set();

	constructor(private outputChannel: vscode.OutputChannel) {
		process.once('exit', () => this.dispose());
	}

	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
		const engine = new RipgrepTextSearchEngine(this.outputChannel);
		return this.withEngine(engine, () => engine.provideTextSearchResults(query, options, progress, token));
	}

	provideFileIndex(options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<vscode.Uri[]> {
		const engine = new RipgrepFileSearchEngine(this.outputChannel);

		const results: vscode.Uri[] = [];
		const onResult = relativePathMatch => {
			results.push(vscode.Uri.file(options.folder.fsPath + '/' + relativePathMatch));
		};

		return this.withEngine(engine, () => engine.provideFileSearchResults(options, { report: onResult }, token))
			.then(() => results);
	}

	private withEngine<T>(engine: SearchEngine, fn: () => Thenable<T>): Thenable<T> {
		this.inProgress.add(engine);
		return fn().then(result => {
			this.inProgress.delete(engine);

			return result;
		});
	}

	private dispose() {
		this.inProgress.forEach(engine => engine.cancel());
	}
}