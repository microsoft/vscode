/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');

import {IProgress} from 'vs/platform/search/common/search';
import {ISearchEngine, ISerializedFileMatch, ISerializedSearchComplete} from 'vs/workbench/services/search/node/search';
import {SearchService as RawSearchService} from 'vs/workbench/services/search/node/rawSearchService';
import {DiskSearch} from 'vs/workbench/services/search/node/searchService';


class TestSearchEngine implements ISearchEngine {

	constructor(private result: () => ISerializedFileMatch) {
	}

	public search(onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		const self = this;
		(function next() {
			process.nextTick(() => {
				const result = self.result();
				if (!result) {
					done(null, {
						limitHit: false,
						stats: {
							fileWalkStartTime: 0,
							fileWalkResultTime: 1,
							directoriesWalked: 2,
							filesWalked: 3
						}
					});
				} else {
					onResult(result);
					next();
				}
			});
		})();
	}

	public cancel(): void {
	}
}

suite('SearchService', () => {

	test('Individual results', function () {
		const path = '/some/where';
		let i = 5;
		const engine = new TestSearchEngine(() => i-- && { path });
		const service = new RawSearchService();

		let results = 0;
		return service.doSearch(engine)
		.then(() => {
			assert.strictEqual(results, 5);
		}, null, value => {
			if (!Array.isArray(value)) {
				assert.strictEqual((<any>value).path, path);
				results++;
			} else {
				assert.fail(value);
			}
		});
	});

	test('Batch results', function () {
		const path = '/some/where';
		let i = 25;
		const engine = new TestSearchEngine(() => i-- && { path });
		const service = new RawSearchService();

		const results = [];
		return service.doSearch(engine, 10)
		.then(() => {
			assert.deepStrictEqual(results, [10, 10, 5]);
		}, null, value => {
			if (Array.isArray(value)) {
				value.forEach(match => {
					assert.strictEqual(match.path, path);
				});
				results.push(value.length);
			} else {
				assert.fail(value);
			}
		});
	});

	test('Collect batched results', function () {
		const path = '/some/where';
		let i = 25;
		const engine = new TestSearchEngine(() => i-- && { path });
		const service = new RawSearchService();
		const diskSearch = new DiskSearch(false);

		const progressResults = [];
		return DiskSearch.collectResults(service.doSearch(engine, 10))
		.then(result => {
			assert.strictEqual(result.results.length, 25, 'Result');
			assert.strictEqual(progressResults.length, 25, 'Progress');
		}, null, match => {
			assert.strictEqual(match.resource.path, path);
			progressResults.push(match);
		});
	});
});