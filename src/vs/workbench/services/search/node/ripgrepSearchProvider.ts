/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { OutputChannel } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { RipgrepTextSearchEngine } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';
import { TextSearchProvider, TextSearchComplete, TextSearchResult, TextSearchQuery, TextSearchOptions } from 'vs/workbench/services/search/common/searchExtTypes';
import { Progress } from 'vs/platform/progress/common/progress';
import { Schemas } from 'vs/base/common/network';

export class RipgrepSearchProvider implements TextSearchProvider {
	private inProgress: Set<CancellationTokenSource> = new Set();

	constructor(private outputChannel: OutputChannel) {
		process.once('exit', () => this.dispose());
	}

	provideTextSearchResults(query: TextSearchQuery, options: TextSearchOptions, progress: Progress<TextSearchResult>, token: CancellationToken): Promise<TextSearchComplete> {
		const engine = new RipgrepTextSearchEngine(this.outputChannel);
		if (options.folder.scheme === Schemas.userData) {
			// Ripgrep search engine can only provide file-scheme results, but we want to use it to search some schemes that are backed by the filesystem, but with some other provider as the frontend,
			// case in point vscode-userdata. In these cases we translate the query to a file, and translate the results back to the frontend scheme.
			const translatedOptions = { ...options, folder: options.folder.with({ scheme: Schemas.file }) };
			const progressTranslator = new Progress<TextSearchResult>(data => progress.report({ ...data, uri: data.uri.with({ scheme: options.folder.scheme }) }));
			return this.withToken(token, token => engine.provideTextSearchResults(query, translatedOptions, progressTranslator, token));
		} else {
			return this.withToken(token, token => engine.provideTextSearchResults(query, options, progress, token));
		}
	}

	private async withToken<T>(token: CancellationToken, fn: (token: CancellationToken) => Promise<T>): Promise<T> {
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

function mergedTokenSource(token: CancellationToken): CancellationTokenSource {
	const tokenSource = new CancellationTokenSource();
	token.onCancellationRequested(() => tokenSource.cancel());

	return tokenSource;
}
