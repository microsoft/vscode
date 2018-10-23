/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { OutputChannel } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { RipgrepTextSearchEngine } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';
import * as vscode from 'vscode';

export class RipgrepSearchProvider implements vscode.TextSearchProvider {
	private inProgress: Set<vscode.CancellationTokenSource> = new Set();

	constructor(private outputChannel: OutputChannel) {
		process.once('exit', () => this.dispose());
	}

	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
		const engine = new RipgrepTextSearchEngine(this.outputChannel);
		return this.withToken(token, token => engine.provideTextSearchResults(query, options, progress, token));
	}

	private async withToken<T>(token: vscode.CancellationToken, fn: (token: vscode.CancellationToken) => Thenable<T>): Promise<T> {
		const merged = mergedTokenSource(token);
		this.inProgress.add(merged);
		const result = await fn(merged.token);
		this.inProgress.delete(merged);

		return result;
	}

	private dispose() {
		this.inProgress.forEach(engine => engine.cancel());
	}
}

function mergedTokenSource(token: vscode.CancellationToken): vscode.CancellationTokenSource {
	const tokenSource = new CancellationTokenSource();
	token.onCancellationRequested(() => tokenSource.cancel());

	return tokenSource;
}