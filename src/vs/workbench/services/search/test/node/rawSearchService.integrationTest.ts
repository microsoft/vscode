/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancelablePromise, createCancelablePromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { flakySuite } from '../../../../../base/test/node/testUtils.js';
import { IFileQuery, IFileSearchStats, IFolderQuery, IProgressMessage, IRawFileMatch, ISearchEngine, ISearchEngineStats, ISearchEngineSuccess, ISerializedFileMatch, ISerializedSearchComplete, ISerializedSearchProgressItem, ISerializedSearchSuccess, isSerializedSearchComplete, isSerializedSearchSuccess, QueryType } from '../../common/search.js';
import { IProgressCallback, SearchService as RawSearchService } from '../../node/rawSearchService.js';

const TEST_FOLDER_QUERIES = [
	{ folder: URI.file(path.normalize('/some/where')) }
];

const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const MULTIROOT_QUERIES: IFolderQuery[] = [
	{ folder: URI.file(path.join(TEST_FIXTURES, 'examples')) },
	{ folder: URI.file(path.join(TEST_FIXTURES, 'more')) }
];

const stats: ISearchEngineStats = {
	fileWalkTime: 0,
	cmdTime: 1,
	directoriesWalked: 2,
	filesWalked: 3
};

class TestSearchEngine implements ISearchEngine<IRawFileMatch> {

	static last: TestSearchEngine;

	private isCanceled = false;

	constructor(private result: () => IRawFileMatch | null, public config?: IFileQuery) {
		TestSearchEngine.last = this;
	}

	search(onResult: (match: IRawFileMatch) => void, onProgress: (progress: IProgressMessage) => void, done: (error: Error, complete: ISearchEngineSuccess) => void): void {
		const self = this;
		(function next() {
			process.nextTick(() => {
				if (self.isCanceled) {
					done(null!, {
						limitHit: false,
						stats: stats,
						messages: [],
					});
					return;
				}
				const result = self.result();
				if (!result) {
					done(null!, {
						limitHit: false,
						stats: stats,
						messages: [],
					});
				} else {
					onResult(result);
					next();
				}
			});
		})();
	}

	cancel(): void {
		this.isCanceled = true;
	}
}

flakySuite('RawSearchService', () => {

	const rawSearch: IFileQuery = {
		type: QueryType.File,
		folderQueries: TEST_FOLDER_QUERIES,
		filePattern: 'a'
	};

	const rawMatch: IRawFileMatch = {
		base: path.normalize('/some'),
		relativePath: 'where',
		searchPath: undefined
	};

	const match: ISerializedFileMatch = {
		path: path.normalize('/some/where')
	};

	test('Individual results', async function () {
		let i = 5;
		const Engine = TestSearchEngine.bind(null, () => i-- ? rawMatch : null);
		const service = new RawSearchService();

		let results = 0;
		const cb: (p: ISerializedSearchProgressItem) => void = value => {
			if (!!(<IProgressMessage>value).message) {
				return;
			}
			if (!Array.isArray(value)) {
				assert.deepStrictEqual(value, match);
				results++;
			} else {
				assert.fail(JSON.stringify(value));
			}
		};

		await service.doFileSearchWithEngine(Engine, rawSearch, cb, null!, 0);
		return assert.strictEqual(results, 5);
	});

	test('Batch results', async function () {
		let i = 25;
		const Engine = TestSearchEngine.bind(null, () => i-- ? rawMatch : null);
		const service = new RawSearchService();

		const results: number[] = [];
		const cb: (p: ISerializedSearchProgressItem) => void = value => {
			if (!!(<IProgressMessage>value).message) {
				return;
			}
			if (Array.isArray(value)) {
				value.forEach(m => {
					assert.deepStrictEqual(m, match);
				});
				results.push(value.length);
			} else {
				assert.fail(JSON.stringify(value));
			}
		};

		await service.doFileSearchWithEngine(Engine, rawSearch, cb, undefined, 10);
		assert.deepStrictEqual(results, [10, 10, 5]);
	});

	test('Collect batched results', async function () {
		const uriPath = '/some/where';
		let i = 25;
		const Engine = TestSearchEngine.bind(null, () => i-- ? rawMatch : null);
		const service = new RawSearchService();

		function fileSearch(config: IFileQuery, batchSize: number): Event<ISerializedSearchProgressItem | ISerializedSearchComplete> {
			let promise: CancelablePromise<ISerializedSearchSuccess | void>;

			const emitter = new Emitter<ISerializedSearchProgressItem | ISerializedSearchComplete>({
				onWillAddFirstListener: () => {
					promise = createCancelablePromise(token => service.doFileSearchWithEngine(Engine, config, p => emitter.fire(p), token, batchSize)
						.then(c => emitter.fire(c), err => emitter.fire({ type: 'error', error: err })));
				},
				onDidRemoveLastListener: () => {
					promise.cancel();
				}
			});

			return emitter.event;
		}

		const result = await collectResultsFromEvent(fileSearch(rawSearch, 10));
		result.files.forEach(f => {
			assert.strictEqual(f.path.replace(/\\/g, '/'), uriPath);
		});
		assert.strictEqual(result.files.length, 25, 'Result');
	});

	test('Multi-root with include pattern and maxResults', async function () {
		const service = new RawSearchService();

		const query: IFileQuery = {
			type: QueryType.File,
			folderQueries: MULTIROOT_QUERIES,
			maxResults: 1,
			includePattern: {
				'*.txt': true,
				'*.js': true
			},
		};

		const result = await collectResultsFromEvent(service.fileSearch(query));
		assert.strictEqual(result.files.length, 1, 'Result');
	});

	test('Handles maxResults=0 correctly', async function () {
		const service = new RawSearchService();

		const query: IFileQuery = {
			type: QueryType.File,
			folderQueries: MULTIROOT_QUERIES,
			maxResults: 0,
			sortByScore: true,
			includePattern: {
				'*.txt': true,
				'*.js': true
			},
		};

		const result = await collectResultsFromEvent(service.fileSearch(query));
		assert.strictEqual(result.files.length, 0, 'Result');
	});

	test('Multi-root with include pattern and exists', async function () {
		const service = new RawSearchService();

		const query: IFileQuery = {
			type: QueryType.File,
			folderQueries: MULTIROOT_QUERIES,
			exists: true,
			includePattern: {
				'*.txt': true,
				'*.js': true
			},
		};

		const result = await collectResultsFromEvent(service.fileSearch(query));
		assert.strictEqual(result.files.length, 0, 'Result');
		assert.ok(result.limitHit);
	});

	test('Sorted results', async function () {
		const paths = ['bab', 'bbc', 'abb'];
		const matches: IRawFileMatch[] = paths.map(relativePath => ({
			base: path.normalize('/some/where'),
			relativePath,
			basename: relativePath,
			size: 3,
			searchPath: undefined
		}));
		const Engine = TestSearchEngine.bind(null, () => matches.shift()!);
		const service = new RawSearchService();

		const results: any[] = [];
		const cb: IProgressCallback = value => {
			if (!!(<IProgressMessage>value).message) {
				return;
			}
			if (Array.isArray(value)) {
				results.push(...value.map(v => v.path));
			} else {
				assert.fail(JSON.stringify(value));
			}
		};

		await service.doFileSearchWithEngine(Engine, {
			type: QueryType.File,
			folderQueries: TEST_FOLDER_QUERIES,
			filePattern: 'bb',
			sortByScore: true,
			maxResults: 2
		}, cb, undefined, 1);
		assert.notStrictEqual(typeof TestSearchEngine.last.config!.maxResults, 'number');
		assert.deepStrictEqual(results, [path.normalize('/some/where/bbc'), path.normalize('/some/where/bab')]);
	});

	test('Sorted result batches', async function () {
		let i = 25;
		const Engine = TestSearchEngine.bind(null, () => i-- ? rawMatch : null);
		const service = new RawSearchService();

		const results: number[] = [];
		const cb: IProgressCallback = value => {
			if (!!(<IProgressMessage>value).message) {
				return;
			}
			if (Array.isArray(value)) {
				value.forEach(m => {
					assert.deepStrictEqual(m, match);
				});
				results.push(value.length);
			} else {
				assert.fail(JSON.stringify(value));
			}
		};
		await service.doFileSearchWithEngine(Engine, {
			type: QueryType.File,
			folderQueries: TEST_FOLDER_QUERIES,
			filePattern: 'a',
			sortByScore: true,
			maxResults: 23
		}, cb, undefined, 10);
		assert.deepStrictEqual(results, [10, 10, 3]);
	});

	test('Cached results', function () {
		const paths = ['bcb', 'bbc', 'aab'];
		const matches: IRawFileMatch[] = paths.map(relativePath => ({
			base: path.normalize('/some/where'),
			relativePath,
			basename: relativePath,
			size: 3,
			searchPath: undefined
		}));
		const Engine = TestSearchEngine.bind(null, () => matches.shift()!);
		const service = new RawSearchService();

		const results: any[] = [];
		const cb: IProgressCallback = value => {
			if (!!(<IProgressMessage>value).message) {
				return;
			}
			if (Array.isArray(value)) {
				results.push(...value.map(v => v.path));
			} else {
				assert.fail(JSON.stringify(value));
			}
		};
		return service.doFileSearchWithEngine(Engine, {
			type: QueryType.File,
			folderQueries: TEST_FOLDER_QUERIES,
			filePattern: 'b',
			sortByScore: true,
			cacheKey: 'x'
		}, cb, undefined, -1).then(complete => {
			assert.strictEqual((<IFileSearchStats>complete.stats).fromCache, false);
			assert.deepStrictEqual(results, [path.normalize('/some/where/bcb'), path.normalize('/some/where/bbc'), path.normalize('/some/where/aab')]);
		}).then(async () => {
			const results: any[] = [];
			const cb: IProgressCallback = value => {
				if (Array.isArray(value)) {
					results.push(...value.map(v => v.path));
				} else {
					assert.fail(JSON.stringify(value));
				}
			};
			try {
				const complete = await service.doFileSearchWithEngine(Engine, {
					type: QueryType.File,
					folderQueries: TEST_FOLDER_QUERIES,
					filePattern: 'bc',
					sortByScore: true,
					cacheKey: 'x'
				}, cb, undefined, -1);
				assert.ok((<IFileSearchStats>complete.stats).fromCache);
				assert.deepStrictEqual(results, [path.normalize('/some/where/bcb'), path.normalize('/some/where/bbc')]);
			}
			catch (e) { }
		}).then(() => {
			return service.clearCache('x');
		}).then(async () => {
			matches.push({
				base: path.normalize('/some/where'),
				relativePath: 'bc',
				searchPath: undefined
			});
			const results: any[] = [];
			const cb: IProgressCallback = value => {
				if (!!(<IProgressMessage>value).message) {
					return;
				}
				if (Array.isArray(value)) {
					results.push(...value.map(v => v.path));
				} else {
					assert.fail(JSON.stringify(value));
				}
			};
			const complete = await service.doFileSearchWithEngine(Engine, {
				type: QueryType.File,
				folderQueries: TEST_FOLDER_QUERIES,
				filePattern: 'bc',
				sortByScore: true,
				cacheKey: 'x'
			}, cb, undefined, -1);
			assert.strictEqual((<IFileSearchStats>complete.stats).fromCache, false);
			assert.deepStrictEqual(results, [path.normalize('/some/where/bc')]);
		});
	});
});

function collectResultsFromEvent(event: Event<ISerializedSearchProgressItem | ISerializedSearchComplete>): Promise<{ files: ISerializedFileMatch[]; limitHit: boolean }> {
	const files: ISerializedFileMatch[] = [];

	let listener: IDisposable;
	return new Promise((c, e) => {
		listener = event(ev => {
			if (isSerializedSearchComplete(ev)) {
				if (isSerializedSearchSuccess(ev)) {
					c({ files, limitHit: ev.limitHit });
				} else {
					e(ev.error);
				}

				listener.dispose();
			} else if (Array.isArray(ev)) {
				files.push(...ev);
			} else if ((<ISerializedFileMatch>ev).path) {
				files.push(ev as ISerializedFileMatch);
			}
		});
	});
}
