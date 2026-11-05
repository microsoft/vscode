/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileQuery, IProgressMessage, IRawFileMatch, ISearchEngine, ISearchEngineSuccess, QueryType } from '../../common/search.js';
import { SearchService } from '../../node/rawSearchService.js';

suite('RawSearchService listener disposal', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a completed cached search releases its progress and cancellation listeners', async () => {
		class Engine implements ISearchEngine<IRawFileMatch> {
			search(_onResult: (match: IRawFileMatch) => void, _onProgress: (progress: IProgressMessage) => void, done: (error: Error | null, complete: ISearchEngineSuccess) => void): void {
				done(null, { limitHit: false, stats: { fileWalkTime: 0, cmdTime: 0, directoriesWalked: 0, filesWalked: 0 }, messages: [] });
			}
			cancel(): void { }
		}

		const service = new SearchService();
		const tokenSource = new CancellationTokenSource();
		const query: IFileQuery = {
			type: QueryType.File,
			folderQueries: [{ folder: URI.file('/workspace') }],
			cacheKey: 'completed-search',
			sortByScore: true,
			filePattern: ''
		};
		try {
			await service.doFileSearchWithEngine(Engine, query, () => { }, CancellationToken.None);
			const result = await service.doFileSearchWithEngine(Engine, query, () => { }, tokenSource.token);
			assert.ok(result.stats && hasKey(result.stats, { fromCache: true }));
			assert.strictEqual(result.stats.fromCache, true);
		} finally {
			tokenSource.dispose();
			await service.clearCache(query.cacheKey!);
		}
	});

	test('canceling a completed search does not cancel its engine', async () => {
		let cancellations = 0;
		class Engine implements ISearchEngine<IRawFileMatch> {
			search(_onResult: (match: IRawFileMatch) => void, _onProgress: (progress: IProgressMessage) => void, done: (error: Error | null, complete: ISearchEngineSuccess) => void): void {
				done(null, { limitHit: false, stats: { fileWalkTime: 0, cmdTime: 0, directoriesWalked: 0, filesWalked: 0 }, messages: [] });
			}
			cancel(): void {
				cancellations++;
			}
		}

		const service = new SearchService();
		const tokenSource = new CancellationTokenSource();
		try {
			await service.doFileSearchWithEngine(Engine, { type: QueryType.File, folderQueries: [] }, () => { }, tokenSource.token);
			tokenSource.cancel();
			assert.strictEqual(cancellations, 0);
		} finally {
			tokenSource.dispose();
		}
	});
});
