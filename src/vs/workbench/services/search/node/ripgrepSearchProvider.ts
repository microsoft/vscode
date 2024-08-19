/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { OutputChannel } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { RipgrepTextSearchEngine } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';
import { TextSearchProviderNew, TextSearchCompleteNew, TextSearchResultNew, TextSearchQueryNew, TextSearchProviderOptions, } from 'vs/workbench/services/search/common/searchExtTypes';
import { Progress } from 'vs/platform/progress/common/progress';
import { Schemas } from 'vs/base/common/network';
import type { RipgrepTextSearchOptions } from 'vs/workbench/services/search/common/searchExtTypesInternal';

export class RipgrepSearchProvider implements TextSearchProviderNew {
	private inProgress: Set<CancellationTokenSource> = new Set();

	constructor(private outputChannel: OutputChannel, private getNumThreads: () => Promise<number | undefined>) {
		process.once('exit', () => this.dispose());
	}

	async provideTextSearchResults(query: TextSearchQueryNew, options: TextSearchProviderOptions, progress: Progress<TextSearchResultNew>, token: CancellationToken): Promise<TextSearchCompleteNew> {
		const numThreads = await this.getNumThreads();
		const engine = new RipgrepTextSearchEngine(this.outputChannel, numThreads);

		return Promise.all(options.folderOptions.map(folderOption => {

			const extendedOptions: RipgrepTextSearchOptions = {
				folderOptions: folderOption,
				numThreads,
				maxResults: options.maxResults,
				previewOptions: options.previewOptions,
				maxFileSize: options.maxFileSize,
				surroundingContext: options.surroundingContext
			};
			if (folderOption.folder.scheme === Schemas.vscodeUserData) {
				// Ripgrep search engine can only provide file-scheme results, but we want to use it to search some schemes that are backed by the filesystem, but with some other provider as the frontend,
				// case in point vscode-userdata. In these cases we translate the query to a file, and translate the results back to the frontend scheme.
				const translatedOptions = { ...extendedOptions, folder: folderOption.folder.with({ scheme: Schemas.file }) };
				const progressTranslator = new Progress<TextSearchResultNew>(data => progress.report({ ...data, uri: data.uri.with({ scheme: folderOption.folder.scheme }) }));
				return this.withToken(token, token => engine.provideTextSearchResultsWithRgOptions(query, translatedOptions, progressTranslator, token));
			} else {
				return this.withToken(token, token => engine.provideTextSearchResultsWithRgOptions(query, extendedOptions, progress, token));
			}
		})).then((e => {
			const complete: TextSearchCompleteNew = {
				// todo: get this to actually check
				limitHit: e.some(complete => !!complete && complete.limitHit)
			};
			return complete;
		}));

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
