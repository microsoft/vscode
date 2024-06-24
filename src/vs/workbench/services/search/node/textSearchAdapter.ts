/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import * as pfs from 'vs/base/node/pfs';
import { IFileMatch, IProgressMessage, ITextQuery, ITextSearchMatch, ISerializedFileMatch, ISerializedSearchSuccess } from 'vs/workbench/services/search/common/search';
import { RipgrepTextSearchEngine } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';
import { NativeTextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';

export class TextSearchEngineAdapter {

	constructor(private query: ITextQuery, private numThreads?: number) { }

	search(token: CancellationToken, onResult: (matches: ISerializedFileMatch[]) => void, onMessage: (message: IProgressMessage) => void): Promise<ISerializedSearchSuccess> {
		if ((!this.query.folderQueries || !this.query.folderQueries.length) && (!this.query.extraFileResources || !this.query.extraFileResources.length)) {
			return Promise.resolve({
				type: 'success',
				limitHit: false,
				stats: {
					type: 'searchProcess'
				},
				messages: []
			});
		}

		const pretendOutputChannel = {
			appendLine(msg: string) {
				onMessage({ message: msg });
			}
		};
		const textSearchManager = new NativeTextSearchManager(this.query, new RipgrepTextSearchEngine(pretendOutputChannel, this.numThreads), pfs);
		return new Promise((resolve, reject) => {
			return textSearchManager
				.search(
					matches => {
						onResult(matches.map(fileMatchToSerialized));
					},
					token)
				.then(
					c => resolve({ limitHit: c.limitHit ?? false, type: 'success', stats: c.stats, messages: [] }),
					reject);
		});
	}
}

function fileMatchToSerialized(match: IFileMatch): ISerializedFileMatch {
	return {
		path: match.resource && match.resource.fsPath,
		results: match.results,
		numMatches: (match.results || []).reduce((sum, r) => {
			if (!!(<ITextSearchMatch>r).ranges) {
				const m = <ITextSearchMatch>r;
				return sum + (Array.isArray(m.ranges) ? m.ranges.length : 1);
			} else {
				return sum + 1;
			}
		}, 0)
	};
}
