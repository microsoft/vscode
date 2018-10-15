/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import * as extfs from 'vs/base/node/extfs';
import { IFolderQuery, IProgress, ISearchQuery, ITextSearchStats, QueryType, IFileMatch } from 'vs/platform/search/common/search';
import { RipgrepTextSearchEngine } from 'vs/workbench/services/search/node/ripgrepTextSearchEH';
import { TextSearchEngine } from 'vs/workbench/services/search/node/textSearchEngine';
import { IRawSearch, ISerializedFileMatch, ISerializedSearchSuccess } from './search';

export class TextSearchEngineAdapter {

	constructor(private config: IRawSearch) {
	}

	// TODO@Rob - make promise-based once the old search is gone, and I don't need them to have matching interfaces anymore
	search(token: CancellationToken, onResult: (matches: ISerializedFileMatch[]) => void, onMessage: (message: IProgress) => void, done: (error: Error, complete: ISerializedSearchSuccess) => void): void {
		if (!this.config.folderQueries.length && !this.config.extraFiles.length) {
			done(null, {
				type: 'success',
				limitHit: false,
				stats: <ITextSearchStats>{
					type: 'searchProcess'
				}
			});
			return;
		}

		const query: ISearchQuery = {
			type: QueryType.Text,
			cacheKey: this.config.cacheKey,
			contentPattern: this.config.contentPattern,

			excludePattern: this.config.excludePattern,
			includePattern: this.config.includePattern,
			extraFileResources: this.config.extraFiles && this.config.extraFiles.map(f => URI.file(f)),
			fileEncoding: this.config.folderQueries[0].fileEncoding, // ?
			maxResults: this.config.maxResults,
			exists: this.config.exists,
			sortByScore: this.config.sortByScore,
			disregardIgnoreFiles: this.config.disregardIgnoreFiles,
			disregardGlobalIgnoreFiles: this.config.disregardGlobalIgnoreFiles,
			ignoreSymlinks: this.config.ignoreSymlinks,
			maxFileSize: this.config.maxFilesize,
			previewOptions: this.config.previewOptions
		};
		query.folderQueries = this.config.folderQueries.map(fq => <IFolderQuery>{
			disregardGlobalIgnoreFiles: fq.disregardGlobalIgnoreFiles,
			disregardIgnoreFiles: fq.disregardIgnoreFiles,
			excludePattern: fq.excludePattern,
			fileEncoding: fq.fileEncoding,
			folder: URI.file(fq.folder),
			includePattern: fq.includePattern
		});

		const pretendOutputChannel = {
			appendLine(msg) {
				onMessage({ message: msg });
			}
		};
		const textSearchEngine = new TextSearchEngine(this.config.contentPattern, query, new RipgrepTextSearchEngine(pretendOutputChannel), extfs);
		textSearchEngine
			.search(
				matches => {
					onResult(matches.map(fileMatchToSerialized));
				},
				token)
			.then(() => done(null, { limitHit: false, stats: null, type: 'success' }));
	}
}

function fileMatchToSerialized(match: IFileMatch): ISerializedFileMatch {
	return {
		path: match.resource.fsPath,
		matches: match.matches,
		numMatches: match.matches.length
	};
}