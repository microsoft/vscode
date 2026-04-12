/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { createCancelablePromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { flakySuite } from '../../../../../base/test/node/testUtils.js';
import { isSerializedSearchComplete, isSerializedSearchSuccess } from '../../common/search.js';
import { SearchService as RawSearchService } from '../../node/rawSearchService.js';
const TEST_FOLDER_QUERIES = [
    { folder: URI.file(path.normalize('/some/where')) }
];
const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const MULTIROOT_QUERIES = [
    { folder: URI.file(path.join(TEST_FIXTURES, 'examples')) },
    { folder: URI.file(path.join(TEST_FIXTURES, 'more')) }
];
const stats = {
    fileWalkTime: 0,
    cmdTime: 1,
    directoriesWalked: 2,
    filesWalked: 3
};
class TestSearchEngine {
    constructor(result, config) {
        this.result = result;
        this.config = config;
        this.isCanceled = false;
        TestSearchEngine.last = this;
    }
    search(onResult, onProgress, done) {
        const self = this;
        (function next() {
            process.nextTick(() => {
                if (self.isCanceled) {
                    done(null, {
                        limitHit: false,
                        stats: stats,
                        messages: [],
                    });
                    return;
                }
                const result = self.result();
                if (!result) {
                    done(null, {
                        limitHit: false,
                        stats: stats,
                        messages: [],
                    });
                }
                else {
                    onResult(result);
                    next();
                }
            });
        })();
    }
    cancel() {
        this.isCanceled = true;
    }
}
flakySuite('RawSearchService', () => {
    const rawSearch = {
        type: 1 /* QueryType.File */,
        folderQueries: TEST_FOLDER_QUERIES,
        filePattern: 'a'
    };
    const rawMatch = {
        base: path.normalize('/some'),
        relativePath: 'where',
        searchPath: undefined
    };
    const match = {
        path: path.normalize('/some/where')
    };
    test('Individual results', async function () {
        let i = 5;
        const Engine = TestSearchEngine.bind(null, () => i-- ? rawMatch : null);
        const service = new RawSearchService();
        let results = 0;
        const cb = value => {
            if (!!value.message) {
                return;
            }
            if (!Array.isArray(value)) {
                assert.deepStrictEqual(value, match);
                results++;
            }
            else {
                assert.fail(JSON.stringify(value));
            }
        };
        await service.doFileSearchWithEngine(Engine, rawSearch, cb, null, 0);
        return assert.strictEqual(results, 5);
    });
    test('Batch results', async function () {
        let i = 25;
        const Engine = TestSearchEngine.bind(null, () => i-- ? rawMatch : null);
        const service = new RawSearchService();
        const results = [];
        const cb = value => {
            if (!!value.message) {
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(m => {
                    assert.deepStrictEqual(m, match);
                });
                results.push(value.length);
            }
            else {
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
        function fileSearch(config, batchSize) {
            let promise;
            const emitter = new Emitter({
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
        const query = {
            type: 1 /* QueryType.File */,
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
        const query = {
            type: 1 /* QueryType.File */,
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
        const query = {
            type: 1 /* QueryType.File */,
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
        const matches = paths.map(relativePath => ({
            base: path.normalize('/some/where'),
            relativePath,
            basename: relativePath,
            size: 3,
            searchPath: undefined
        }));
        const Engine = TestSearchEngine.bind(null, () => matches.shift());
        const service = new RawSearchService();
        const results = [];
        const cb = value => {
            if (!!value.message) {
                return;
            }
            if (Array.isArray(value)) {
                results.push(...value.map(v => v.path));
            }
            else {
                assert.fail(JSON.stringify(value));
            }
        };
        await service.doFileSearchWithEngine(Engine, {
            type: 1 /* QueryType.File */,
            folderQueries: TEST_FOLDER_QUERIES,
            filePattern: 'bb',
            sortByScore: true,
            maxResults: 2
        }, cb, undefined, 1);
        assert.notStrictEqual(typeof TestSearchEngine.last.config.maxResults, 'number');
        assert.deepStrictEqual(results, [path.normalize('/some/where/bbc'), path.normalize('/some/where/bab')]);
    });
    test('Sorted result batches', async function () {
        let i = 25;
        const Engine = TestSearchEngine.bind(null, () => i-- ? rawMatch : null);
        const service = new RawSearchService();
        const results = [];
        const cb = value => {
            if (!!value.message) {
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(m => {
                    assert.deepStrictEqual(m, match);
                });
                results.push(value.length);
            }
            else {
                assert.fail(JSON.stringify(value));
            }
        };
        await service.doFileSearchWithEngine(Engine, {
            type: 1 /* QueryType.File */,
            folderQueries: TEST_FOLDER_QUERIES,
            filePattern: 'a',
            sortByScore: true,
            maxResults: 23
        }, cb, undefined, 10);
        assert.deepStrictEqual(results, [10, 10, 3]);
    });
    test('Cached results', function () {
        const paths = ['bcb', 'bbc', 'aab'];
        const matches = paths.map(relativePath => ({
            base: path.normalize('/some/where'),
            relativePath,
            basename: relativePath,
            size: 3,
            searchPath: undefined
        }));
        const Engine = TestSearchEngine.bind(null, () => matches.shift());
        const service = new RawSearchService();
        const results = [];
        const cb = value => {
            if (!!value.message) {
                return;
            }
            if (Array.isArray(value)) {
                results.push(...value.map(v => v.path));
            }
            else {
                assert.fail(JSON.stringify(value));
            }
        };
        return service.doFileSearchWithEngine(Engine, {
            type: 1 /* QueryType.File */,
            folderQueries: TEST_FOLDER_QUERIES,
            filePattern: 'b',
            sortByScore: true,
            cacheKey: 'x'
        }, cb, undefined, -1).then(complete => {
            assert.strictEqual(complete.stats.fromCache, false);
            assert.deepStrictEqual(results, [path.normalize('/some/where/bcb'), path.normalize('/some/where/bbc'), path.normalize('/some/where/aab')]);
        }).then(async () => {
            const results = [];
            const cb = value => {
                if (Array.isArray(value)) {
                    results.push(...value.map(v => v.path));
                }
                else {
                    assert.fail(JSON.stringify(value));
                }
            };
            try {
                const complete = await service.doFileSearchWithEngine(Engine, {
                    type: 1 /* QueryType.File */,
                    folderQueries: TEST_FOLDER_QUERIES,
                    filePattern: 'bc',
                    sortByScore: true,
                    cacheKey: 'x'
                }, cb, undefined, -1);
                assert.ok(complete.stats.fromCache);
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
            const results = [];
            const cb = value => {
                if (!!value.message) {
                    return;
                }
                if (Array.isArray(value)) {
                    results.push(...value.map(v => v.path));
                }
                else {
                    assert.fail(JSON.stringify(value));
                }
            };
            const complete = await service.doFileSearchWithEngine(Engine, {
                type: 1 /* QueryType.File */,
                folderQueries: TEST_FOLDER_QUERIES,
                filePattern: 'bc',
                sortByScore: true,
                cacheKey: 'x'
            }, cb, undefined, -1);
            assert.strictEqual(complete.stats.fromCache, false);
            assert.deepStrictEqual(results, [path.normalize('/some/where/bc')]);
        });
    });
});
function collectResultsFromEvent(event) {
    const files = [];
    let listener;
    return new Promise((c, e) => {
        listener = event(ev => {
            if (isSerializedSearchComplete(ev)) {
                if (isSerializedSearchSuccess(ev)) {
                    c({ files, limitHit: ev.limitHit });
                }
                else {
                    e(ev.error);
                }
                listener.dispose();
            }
            else if (Array.isArray(ev)) {
                files.push(...ev);
            }
            else if (ev.path) {
                files.push(ev);
            }
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF3U2VhcmNoU2VydmljZS5pbnRlZ3JhdGlvblRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS9yYXdTZWFyY2hTZXJ2aWNlLmludGVncmF0aW9uVGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkUsT0FBTyxLQUFLLElBQUksTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBa1AsMEJBQTBCLEVBQUUseUJBQXlCLEVBQWEsTUFBTSx3QkFBd0IsQ0FBQztBQUMxVixPQUFPLEVBQXFCLGFBQWEsSUFBSSxnQkFBZ0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXRHLE1BQU0sbUJBQW1CLEdBQUc7SUFDM0IsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUU7Q0FDbkQsQ0FBQztBQUVGLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3JILE1BQU0saUJBQWlCLEdBQW1CO0lBQ3pDLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FB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