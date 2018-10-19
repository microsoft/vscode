/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import * as extfs from 'vs/base/node/extfs';
import { IFileMatch, IProgress, ITextQuery, ITextSearchStats } from 'vs/platform/search/common/search';
import { RipgrepTextSearchEngine } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';
import { TextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';
import { ISerializedFileMatch, ISerializedSearchSuccess } from './search';

export class TextSearchEngineAdapter {

	constructor(private query: ITextQuery) {
	}

	// TODO@Rob - make promise-based once the old search is gone, and I don't need them to have matching interfaces anymore
	search(token: CancellationToken, onResult: (matches: ISerializedFileMatch[]) => void, onMessage: (message: IProgress) => void, done: (error: Error, complete: ISerializedSearchSuccess) => void): void {
		if (!this.query.folderQueries.length && !this.query.extraFileResources.length) {
			done(null, {
				type: 'success',
				limitHit: false,
				stats: <ITextSearchStats>{
					type: 'searchProcess'
				}
			});
			return;
		}

		const pretendOutputChannel = {
			appendLine(msg) {
				onMessage({ message: msg });
			}
		};
		const textSearchManager = new TextSearchManager(this.query, new RipgrepTextSearchEngine(pretendOutputChannel), extfs);
		textSearchManager
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