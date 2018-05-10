/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RipgrepTextSearchEngine } from './ripgrepTextSearch';
import { RipgrepFileSearchEngine } from './ripgrepFileSearch';

export function activate(): void {
	const provider = new RipgrepSearchProvider();
	vscode.workspace.registerSearchProvider('file', provider);
}

class RipgrepSearchProvider implements vscode.SearchProvider {
	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<void> {
		const engine = new RipgrepTextSearchEngine();
		return engine.provideTextSearchResults(query, options, progress, token);
	}

	provideFileSearchResults(options: vscode.SearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
		const engine = new RipgrepFileSearchEngine();
		return engine.provideFileSearchResults(options, progress, token);
	}
}