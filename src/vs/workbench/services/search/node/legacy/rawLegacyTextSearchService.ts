/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as gracefulFs from 'graceful-fs';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MAX_FILE_SIZE } from 'vs/platform/files/node/files';
import { ITextQuery, QueryType } from 'vs/platform/search/common/search';
import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { Engine } from 'vs/workbench/services/search/node/legacy/textSearch';
import { TextSearchWorkerProvider } from 'vs/workbench/services/search/node/legacy/textSearchWorkerProvider';
import { BatchedCollector } from 'vs/workbench/services/search/node/textSearchManager';
import { ISerializedFileMatch, ISerializedSearchComplete, ISerializedSearchProgressItem, ISerializedSearchSuccess } from '../search';

gracefulFs.gracefulify(fs);

type IProgressCallback = (p: ISerializedSearchProgressItem) => void;

export class LegacyTextSearchService {
	private static readonly BATCH_SIZE = 512;

	private textSearchWorkerProvider: TextSearchWorkerProvider;

	textSearch(config: ITextQuery, progressCallback: IProgressCallback, token?: CancellationToken): Promise<ISerializedSearchComplete> {
		if (!this.textSearchWorkerProvider) {
			this.textSearchWorkerProvider = new TextSearchWorkerProvider();
		}

		let engine = new Engine(
			config,
			new FileWalker({
				type: QueryType.File,
				folderQueries: config.folderQueries,
				extraFileResources: config.extraFileResources,
				includePattern: config.includePattern,
				excludePattern: config.excludePattern,
				useRipgrep: false,
				filePattern: ''
			}, MAX_FILE_SIZE),
			this.textSearchWorkerProvider);

		return this.doTextSearch(engine, progressCallback, LegacyTextSearchService.BATCH_SIZE, token);
	}

	private doTextSearch(engine: Engine, progressCallback: IProgressCallback, batchSize: number, token?: CancellationToken): Promise<ISerializedSearchSuccess> {
		if (token) {
			token.onCancellationRequested(() => engine.cancel());
		}

		return new Promise<ISerializedSearchSuccess>((c, e) => {
			// Use BatchedCollector to get new results to the frontend every 2s at least, until 50 results have been returned
			const collector = new BatchedCollector<ISerializedFileMatch>(batchSize, progressCallback);
			engine.search((matches) => {
				const totalMatches = matches.reduce((acc, m) => acc + m.numMatches!, 0);
				collector.addItems(matches, totalMatches);
			}, (progress) => {
				progressCallback(progress);
			}, (error, stats) => {
				collector.flush();

				if (error) {
					e(error);
				} else {
					c({
						type: 'success',
						limitHit: stats.limitHit,
						stats: null
					});
				}
			});
		});
	}
}
