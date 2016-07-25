/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');

import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

import {PPromise} from 'vs/base/common/winjs.base';
import {MAX_FILE_SIZE} from 'vs/platform/files/common/files';
import {FileWalker, Engine as FileSearchEngine} from 'vs/workbench/services/search/node/fileSearch';
import {Engine as TextSearchEngine} from 'vs/workbench/services/search/node/textSearch';
import {IRawSearchService, IRawSearch, ISerializedSearchProgressItem, ISerializedSearchComplete, ISearchEngine} from './search';

export class SearchService implements IRawSearchService {

	private static BATCH_SIZE = 500;

	public fileSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		let engine = new FileSearchEngine(config);

		return this.doSearch(engine, SearchService.BATCH_SIZE);
	}

	public textSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		let engine = new TextSearchEngine(config, new FileWalker({
			rootFolders: config.rootFolders,
			extraFiles: config.extraFiles,
			includePattern: config.includePattern,
			excludePattern: config.excludePattern,
			filePattern: config.filePattern,
			maxFilesize: MAX_FILE_SIZE
		}));

		return this.doSearch(engine, SearchService.BATCH_SIZE);
	}

	public doSearch(engine: ISearchEngine, batchSize?: number): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
			let batch = [];
			engine.search((match) => {
				if (match) {
					if (batchSize) {
						batch.push(match);
						if (batchSize > 0 && batch.length >= batchSize) {
							p(batch);
							batch = [];
						}
					} else {
						p(match);
					}
				}
			}, (progress) => {
				p(progress);
			}, (error, stats) => {
				if (batch.length) {
					p(batch);
				}
				if (error) {
					e(error);
				} else {
					c(stats);
				}
			});
		}, () => engine.cancel());
	}
}