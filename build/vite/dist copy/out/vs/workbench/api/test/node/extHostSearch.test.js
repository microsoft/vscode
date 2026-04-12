/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mapArrayOrNot } from '../../../../base/common/arrays.js';
import { timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { revive } from '../../../../base/common/marshalling.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainContext } from '../../common/extHost.protocol.js';
import { Range } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { NativeExtHostSearch } from '../../node/extHostSearch.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { resultIsMatch } from '../../../services/search/common/search.js';
import { NativeTextSearchManager } from '../../../services/search/node/textSearchManager.js';
let rpcProtocol;
let extHostSearch;
let mockMainThreadSearch;
class MockMainThreadSearch {
    constructor() {
        this.results = [];
        this.keywords = [];
    }
    $registerFileSearchProvider(handle, scheme) {
        this.lastHandle = handle;
    }
    $registerTextSearchProvider(handle, scheme) {
        this.lastHandle = handle;
    }
    $registerAITextSearchProvider(handle, scheme) {
        this.lastHandle = handle;
    }
    $unregisterProvider(handle) {
    }
    $handleFileMatch(handle, session, data) {
        this.results.push(...data);
    }
    $handleTextMatch(handle, session, data) {
        this.results.push(...data);
    }
    $handleKeywordResult(handle, session, data) {
        this.keywords.push(data);
    }
    $handleTelemetry(eventName, data) {
    }
    dispose() {
    }
}
let mockPFS;
function extensionResultIsMatch(data) {
    return !!data.preview;
}
suite('ExtHostSearch', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    async function registerTestTextSearchProvider(provider, scheme = 'file') {
        disposables.add(extHostSearch.registerTextSearchProviderOld(scheme, provider));
        await rpcProtocol.sync();
    }
    async function registerTestFileSearchProvider(provider, scheme = 'file') {
        disposables.add(extHostSearch.registerFileSearchProviderOld(scheme, provider));
        await rpcProtocol.sync();
    }
    async function runFileSearch(query, cancel = false) {
        let stats;
        try {
            const cancellation = new CancellationTokenSource();
            const p = extHostSearch.$provideFileSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
            if (cancel) {
                await timeout(0);
                cancellation.cancel();
            }
            stats = await p;
        }
        catch (err) {
            if (!isCancellationError(err)) {
                await rpcProtocol.sync();
                throw err;
            }
        }
        await rpcProtocol.sync();
        return {
            results: mockMainThreadSearch.results.map(r => URI.revive(r)),
            stats: stats
        };
    }
    async function runTextSearch(query) {
        let stats;
        try {
            const cancellation = new CancellationTokenSource();
            const p = extHostSearch.$provideTextSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
            stats = await p;
        }
        catch (err) {
            if (!isCancellationError(err)) {
                await rpcProtocol.sync();
                throw err;
            }
        }
        await rpcProtocol.sync();
        const results = revive(mockMainThreadSearch.results);
        return { results, stats: stats };
    }
    setup(() => {
        rpcProtocol = new TestRPCProtocol();
        mockMainThreadSearch = new MockMainThreadSearch();
        const logService = new NullLogService();
        rpcProtocol.set(MainContext.MainThreadSearch, mockMainThreadSearch);
        mockPFS = {};
        extHostSearch = disposables.add(new class extends NativeExtHostSearch {
            constructor() {
                super(rpcProtocol, new class extends mock() {
                    constructor() {
                        super(...arguments);
                        this.remote = { isRemote: false, authority: undefined, connectionData: null };
                    }
                }, new URITransformerService(null), new class extends mock() {
                    async getConfigProvider() {
                        return {
                            onDidChangeConfiguration(_listener) { },
                            getConfiguration() {
                                return {
                                    get() { },
                                    has() {
                                        return false;
                                    },
                                    inspect() {
                                        return undefined;
                                    },
                                    async update() { }
                                };
                            },
                        };
                    }
                }, logService);
                // eslint-disable-next-line local/code-no-any-casts
                this._pfs = mockPFS;
            }
            createTextSearchManager(query, provider) {
                return new NativeTextSearchManager(query, provider, this._pfs);
            }
        });
    });
    teardown(() => {
        return rpcProtocol.sync();
    });
    const rootFolderA = URI.file('/foo/bar1');
    const rootFolderB = URI.file('/foo/bar2');
    const fancyScheme = 'fancy';
    const fancySchemeFolderA = URI.from({ scheme: fancyScheme, path: '/project/folder1' });
    suite('File:', () => {
        function getSimpleQuery(filePattern = '') {
            return {
                type: 1 /* QueryType.File */,
                filePattern,
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
        }
        function compareURIs(actual, expected) {
            const sortAndStringify = (arr) => arr.sort().map(u => u.toString());
            assert.deepStrictEqual(sortAndStringify(actual), sortAndStringify(expected));
        }
        test('no results', async () => {
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    return Promise.resolve(null);
                }
            });
            const { results, stats } = await runFileSearch(getSimpleQuery());
            assert(!stats.limitHit);
            assert(!results.length);
        });
        test('simple results', async () => {
            const reportedResults = [
                joinPath(rootFolderA, 'file1.ts'),
                joinPath(rootFolderA, 'file2.ts'),
                joinPath(rootFolderA, 'subfolder/file3.ts')
            ];
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    return Promise.resolve(reportedResults);
                }
            });
            const { results, stats } = await runFileSearch(getSimpleQuery());
            assert(!stats.limitHit);
            assert.strictEqual(results.length, 3);
            compareURIs(results, reportedResults);
        });
        test('Search canceled', async () => {
            let cancelRequested = false;
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    return new Promise((resolve, reject) => {
                        function onCancel() {
                            cancelRequested = true;
                            resolve([joinPath(options.folder, 'file1.ts')]); // or reject or nothing?
                        }
                        if (token.isCancellationRequested) {
                            onCancel();
                        }
                        else {
                            disposables.add(token.onCancellationRequested(() => onCancel()));
                        }
                    });
                }
            });
            const { results } = await runFileSearch(getSimpleQuery(), true);
            assert(cancelRequested);
            assert(!results.length);
        });
        test('session cancellation should work', async () => {
            let numSessionCancelled = 0;
            const disposables = [];
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    disposables.push(options.session?.onCancellationRequested(() => {
                        numSessionCancelled++;
                    }));
                    return Promise.resolve([]);
                }
            });
            await runFileSearch({ ...getSimpleQuery(), cacheKey: '1' }, true);
            await runFileSearch({ ...getSimpleQuery(), cacheKey: '2' }, true);
            extHostSearch.$clearCache('1');
            assert.strictEqual(numSessionCancelled, 1);
            disposables.forEach(d => d?.dispose());
        });
        test('provider returns null', async () => {
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    return null;
                }
            });
            try {
                await runFileSearch(getSimpleQuery());
                assert(false, 'Expected to fail');
            }
            catch {
                // Expected to throw
            }
        });
        test('all provider calls get global include/excludes', async () => {
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    assert(options.excludes.length === 2 && options.includes.length === 2, 'Missing global include/excludes');
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                includePattern: {
                    'foo': true,
                    'bar': true
                },
                excludePattern: {
                    'something': true,
                    'else': true
                },
                folderQueries: [
                    { folder: rootFolderA },
                    { folder: rootFolderB }
                ]
            };
            await runFileSearch(query);
        });
        test('global/local include/excludes combined', async () => {
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    if (options.folder.toString() === rootFolderA.toString()) {
                        assert.deepStrictEqual(options.includes.sort(), ['*.ts', 'foo']);
                        assert.deepStrictEqual(options.excludes.sort(), ['*.js', 'bar']);
                    }
                    else {
                        assert.deepStrictEqual(options.includes.sort(), ['*.ts']);
                        assert.deepStrictEqual(options.excludes.sort(), ['*.js']);
                    }
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                includePattern: {
                    '*.ts': true
                },
                excludePattern: {
                    '*.js': true
                },
                folderQueries: [
                    {
                        folder: rootFolderA,
                        includePattern: {
                            'foo': true
                        },
                        excludePattern: [{
                                pattern: {
                                    'bar': true
                                }
                            }]
                    },
                    { folder: rootFolderB }
                ]
            };
            await runFileSearch(query);
        });
        test('include/excludes resolved correctly', async () => {
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    assert.deepStrictEqual(options.includes.sort(), ['*.jsx', '*.ts']);
                    assert.deepStrictEqual(options.excludes.sort(), []);
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                includePattern: {
                    '*.ts': true,
                    '*.jsx': false
                },
                excludePattern: {
                    '*.js': true,
                    '*.tsx': false
                },
                folderQueries: [
                    {
                        folder: rootFolderA,
                        includePattern: {
                            '*.jsx': true
                        },
                        excludePattern: [{
                                pattern: {
                                    '*.js': false
                                }
                            }]
                    }
                ]
            };
            await runFileSearch(query);
        });
        test('basic sibling exclude clause', async () => {
            const reportedResults = [
                'file1.ts',
                'file1.js',
            ];
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    return Promise.resolve(reportedResults
                        .map(relativePath => joinPath(options.folder, relativePath)));
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                excludePattern: {
                    '*.js': {
                        when: '$(basename).ts'
                    }
                },
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results } = await runFileSearch(query);
            compareURIs(results, [
                joinPath(rootFolderA, 'file1.ts')
            ]);
        });
        // https://github.com/microsoft/vscode-remotehub/issues/255
        test('include, sibling exclude, and subfolder', async () => {
            const reportedResults = [
                'foo/file1.ts',
                'foo/file1.js',
            ];
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    return Promise.resolve(reportedResults
                        .map(relativePath => joinPath(options.folder, relativePath)));
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                includePattern: { '**/*.ts': true },
                excludePattern: {
                    '*.js': {
                        when: '$(basename).ts'
                    }
                },
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results } = await runFileSearch(query);
            compareURIs(results, [
                joinPath(rootFolderA, 'foo/file1.ts')
            ]);
        });
        test('multiroot sibling exclude clause', async () => {
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    let reportedResults;
                    if (options.folder.fsPath === rootFolderA.fsPath) {
                        reportedResults = [
                            'folder/fileA.scss',
                            'folder/fileA.css',
                            'folder/file2.css'
                        ].map(relativePath => joinPath(rootFolderA, relativePath));
                    }
                    else {
                        reportedResults = [
                            'fileB.ts',
                            'fileB.js',
                            'file3.js'
                        ].map(relativePath => joinPath(rootFolderB, relativePath));
                    }
                    return Promise.resolve(reportedResults);
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                excludePattern: {
                    '*.js': {
                        when: '$(basename).ts'
                    },
                    '*.css': true
                },
                folderQueries: [
                    {
                        folder: rootFolderA,
                        excludePattern: [{
                                pattern: {
                                    'folder/*.css': {
                                        when: '$(basename).scss'
                                    }
                                }
                            }]
                    },
                    {
                        folder: rootFolderB,
                        excludePattern: [{
                                pattern: {
                                    '*.js': false
                                }
                            }]
                    }
                ]
            };
            const { results } = await runFileSearch(query);
            compareURIs(results, [
                joinPath(rootFolderA, 'folder/fileA.scss'),
                joinPath(rootFolderA, 'folder/file2.css'),
                joinPath(rootFolderB, 'fileB.ts'),
                joinPath(rootFolderB, 'fileB.js'),
                joinPath(rootFolderB, 'file3.js'),
            ]);
        });
        test('max results = 1', async () => {
            const reportedResults = [
                joinPath(rootFolderA, 'file1.ts'),
                joinPath(rootFolderA, 'file2.ts'),
                joinPath(rootFolderA, 'file3.ts'),
            ];
            let wasCanceled = false;
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    disposables.add(token.onCancellationRequested(() => wasCanceled = true));
                    return Promise.resolve(reportedResults);
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                maxResults: 1,
                folderQueries: [
                    {
                        folder: rootFolderA
                    }
                ]
            };
            const { results, stats } = await runFileSearch(query);
            assert(stats.limitHit, 'Expected to return limitHit');
            assert.strictEqual(results.length, 1);
            compareURIs(results, reportedResults.slice(0, 1));
            assert(wasCanceled, 'Expected to be canceled when hitting limit');
        });
        test('max results = 2', async () => {
            const reportedResults = [
                joinPath(rootFolderA, 'file1.ts'),
                joinPath(rootFolderA, 'file2.ts'),
                joinPath(rootFolderA, 'file3.ts'),
            ];
            let wasCanceled = false;
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    disposables.add(token.onCancellationRequested(() => wasCanceled = true));
                    return Promise.resolve(reportedResults);
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                maxResults: 2,
                folderQueries: [
                    {
                        folder: rootFolderA
                    }
                ]
            };
            const { results, stats } = await runFileSearch(query);
            assert(stats.limitHit, 'Expected to return limitHit');
            assert.strictEqual(results.length, 2);
            compareURIs(results, reportedResults.slice(0, 2));
            assert(wasCanceled, 'Expected to be canceled when hitting limit');
        });
        test('provider returns maxResults exactly', async () => {
            const reportedResults = [
                joinPath(rootFolderA, 'file1.ts'),
                joinPath(rootFolderA, 'file2.ts'),
            ];
            let wasCanceled = false;
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    disposables.add(token.onCancellationRequested(() => wasCanceled = true));
                    return Promise.resolve(reportedResults);
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                maxResults: 2,
                folderQueries: [
                    {
                        folder: rootFolderA
                    }
                ]
            };
            const { results, stats } = await runFileSearch(query);
            assert(!stats.limitHit, 'Expected not to return limitHit');
            assert.strictEqual(results.length, 2);
            compareURIs(results, reportedResults);
            assert(!wasCanceled, 'Expected not to be canceled when just reaching limit');
        });
        test('multiroot max results', async () => {
            let cancels = 0;
            await registerTestFileSearchProvider({
                async provideFileSearchResults(query, options, token) {
                    disposables.add(token.onCancellationRequested(() => cancels++));
                    // Provice results async so it has a chance to invoke every provider
                    await new Promise(r => process.nextTick(r));
                    return [
                        'file1.ts',
                        'file2.ts',
                        'file3.ts',
                    ].map(relativePath => joinPath(options.folder, relativePath));
                }
            });
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                maxResults: 2,
                folderQueries: [
                    {
                        folder: rootFolderA
                    },
                    {
                        folder: rootFolderB
                    }
                ]
            };
            const { results } = await runFileSearch(query);
            assert.strictEqual(results.length, 2); // Don't care which 2 we got
            assert.strictEqual(cancels, 2, 'Expected all invocations to be canceled when hitting limit');
        });
        test('works with non-file schemes', async () => {
            const reportedResults = [
                joinPath(fancySchemeFolderA, 'file1.ts'),
                joinPath(fancySchemeFolderA, 'file2.ts'),
                joinPath(fancySchemeFolderA, 'subfolder/file3.ts'),
            ];
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    return Promise.resolve(reportedResults);
                }
            }, fancyScheme);
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                folderQueries: [
                    {
                        folder: fancySchemeFolderA
                    }
                ]
            };
            const { results } = await runFileSearch(query);
            compareURIs(results, reportedResults);
        });
        test('if onlyFileScheme is set, do not call custom schemes', async () => {
            let fancySchemeCalled = false;
            await registerTestFileSearchProvider({
                provideFileSearchResults(query, options, token) {
                    fancySchemeCalled = true;
                    return Promise.resolve([]);
                }
            }, fancyScheme);
            const query = {
                type: 1 /* QueryType.File */,
                filePattern: '',
                folderQueries: []
            };
            await runFileSearch(query);
            assert(!fancySchemeCalled);
        });
    });
    suite('Text:', () => {
        function makePreview(text) {
            return {
                matches: [new Range(0, 0, 0, text.length)],
                text
            };
        }
        function makeTextResult(baseFolder, relativePath) {
            return {
                preview: makePreview('foo'),
                ranges: [new Range(0, 0, 0, 3)],
                uri: joinPath(baseFolder, relativePath)
            };
        }
        function getSimpleQuery(queryText) {
            return {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern(queryText),
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
        }
        function getPattern(queryText) {
            return {
                pattern: queryText
            };
        }
        function assertResults(actual, expected) {
            const actualTextSearchResults = [];
            for (const fileMatch of actual) {
                // Make relative
                for (const lineResult of fileMatch.results) {
                    if (resultIsMatch(lineResult)) {
                        actualTextSearchResults.push({
                            preview: {
                                text: lineResult.previewText,
                                matches: mapArrayOrNot(lineResult.rangeLocations.map(r => r.preview), m => new Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn))
                            },
                            ranges: mapArrayOrNot(lineResult.rangeLocations.map(r => r.source), r => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)),
                            uri: fileMatch.resource
                        });
                    }
                    else {
                        actualTextSearchResults.push({
                            text: lineResult.text,
                            lineNumber: lineResult.lineNumber,
                            uri: fileMatch.resource
                        });
                    }
                }
            }
            const rangeToString = (r) => `(${r.start.line}, ${r.start.character}), (${r.end.line}, ${r.end.character})`;
            const makeComparable = (results) => results
                .sort((a, b) => {
                const compareKeyA = a.uri.toString() + ': ' + (extensionResultIsMatch(a) ? a.preview.text : a.text);
                const compareKeyB = b.uri.toString() + ': ' + (extensionResultIsMatch(b) ? b.preview.text : b.text);
                return compareKeyB.localeCompare(compareKeyA);
            })
                .map(r => extensionResultIsMatch(r) ? {
                uri: r.uri.toString(),
                range: mapArrayOrNot(r.ranges, rangeToString),
                preview: {
                    text: r.preview.text,
                    match: null // Don't care about this right now
                }
            } : {
                uri: r.uri.toString(),
                text: r.text,
                lineNumber: r.lineNumber
            });
            return assert.deepStrictEqual(makeComparable(actualTextSearchResults), makeComparable(expected));
        }
        test('no results', async () => {
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    return Promise.resolve(null);
                }
            });
            const { results, stats } = await runTextSearch(getSimpleQuery('foo'));
            assert(!stats.limitHit);
            assert(!results.length);
        });
        test('basic results', async () => {
            const providedResults = [
                makeTextResult(rootFolderA, 'file1.ts'),
                makeTextResult(rootFolderA, 'file2.ts')
            ];
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            });
            const { results, stats } = await runTextSearch(getSimpleQuery('foo'));
            assert(!stats.limitHit);
            assertResults(results, providedResults);
        });
        test('all provider calls get global include/excludes', async () => {
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    assert.strictEqual(options.includes.length, 1);
                    assert.strictEqual(options.excludes.length, 1);
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                includePattern: {
                    '*.ts': true
                },
                excludePattern: {
                    '*.js': true
                },
                folderQueries: [
                    { folder: rootFolderA },
                    { folder: rootFolderB }
                ]
            };
            await runTextSearch(query);
        });
        test('global/local include/excludes combined', async () => {
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    if (options.folder.toString() === rootFolderA.toString()) {
                        assert.deepStrictEqual(options.includes.sort(), ['*.ts', 'foo']);
                        assert.deepStrictEqual(options.excludes.sort(), ['*.js', 'bar']);
                    }
                    else {
                        assert.deepStrictEqual(options.includes.sort(), ['*.ts']);
                        assert.deepStrictEqual(options.excludes.sort(), ['*.js']);
                    }
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                includePattern: {
                    '*.ts': true
                },
                excludePattern: {
                    '*.js': true
                },
                folderQueries: [
                    {
                        folder: rootFolderA,
                        includePattern: {
                            'foo': true
                        },
                        excludePattern: [{
                                pattern: {
                                    'bar': true
                                }
                            }]
                    },
                    { folder: rootFolderB }
                ]
            };
            await runTextSearch(query);
        });
        test('include/excludes resolved correctly', async () => {
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    assert.deepStrictEqual(options.includes.sort(), ['*.jsx', '*.ts']);
                    assert.deepStrictEqual(options.excludes.sort(), []);
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                includePattern: {
                    '*.ts': true,
                    '*.jsx': false
                },
                excludePattern: {
                    '*.js': true,
                    '*.tsx': false
                },
                folderQueries: [
                    {
                        folder: rootFolderA,
                        includePattern: {
                            '*.jsx': true
                        },
                        excludePattern: [{
                                pattern: {
                                    '*.js': false
                                }
                            }]
                    }
                ]
            };
            await runTextSearch(query);
        });
        test('provider fail', async () => {
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    throw new Error('Provider fail');
                }
            });
            try {
                await runTextSearch(getSimpleQuery('foo'));
                assert(false, 'Expected to fail');
            }
            catch {
                // expected to fail
            }
        });
        test('basic sibling clause', async () => {
            // eslint-disable-next-line local/code-no-any-casts
            mockPFS.Promises = {
                readdir: (_path) => {
                    if (_path === rootFolderA.fsPath) {
                        return Promise.resolve([
                            'file1.js',
                            'file1.ts'
                        ]);
                    }
                    else {
                        return Promise.reject(new Error('Wrong path'));
                    }
                }
            };
            const providedResults = [
                makeTextResult(rootFolderA, 'file1.js'),
                makeTextResult(rootFolderA, 'file1.ts')
            ];
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                excludePattern: {
                    '*.js': {
                        when: '$(basename).ts'
                    }
                },
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results } = await runTextSearch(query);
            assertResults(results, providedResults.slice(1));
        });
        test('multiroot sibling clause', async () => {
            // eslint-disable-next-line local/code-no-any-casts
            mockPFS.Promises = {
                readdir: (_path) => {
                    if (_path === joinPath(rootFolderA, 'folder').fsPath) {
                        return Promise.resolve([
                            'fileA.scss',
                            'fileA.css',
                            'file2.css'
                        ]);
                    }
                    else if (_path === rootFolderB.fsPath) {
                        return Promise.resolve([
                            'fileB.ts',
                            'fileB.js',
                            'file3.js'
                        ]);
                    }
                    else {
                        return Promise.reject(new Error('Wrong path'));
                    }
                }
            };
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    let reportedResults;
                    if (options.folder.fsPath === rootFolderA.fsPath) {
                        reportedResults = [
                            makeTextResult(rootFolderA, 'folder/fileA.scss'),
                            makeTextResult(rootFolderA, 'folder/fileA.css'),
                            makeTextResult(rootFolderA, 'folder/file2.css')
                        ];
                    }
                    else {
                        reportedResults = [
                            makeTextResult(rootFolderB, 'fileB.ts'),
                            makeTextResult(rootFolderB, 'fileB.js'),
                            makeTextResult(rootFolderB, 'file3.js')
                        ];
                    }
                    reportedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                excludePattern: {
                    '*.js': {
                        when: '$(basename).ts'
                    },
                    '*.css': true
                },
                folderQueries: [
                    {
                        folder: rootFolderA,
                        excludePattern: [{
                                pattern: {
                                    'folder/*.css': {
                                        when: '$(basename).scss'
                                    }
                                }
                            }]
                    },
                    {
                        folder: rootFolderB,
                        excludePattern: [{
                                pattern: {
                                    '*.js': false
                                }
                            }]
                    }
                ]
            };
            const { results } = await runTextSearch(query);
            assertResults(results, [
                makeTextResult(rootFolderA, 'folder/fileA.scss'),
                makeTextResult(rootFolderA, 'folder/file2.css'),
                makeTextResult(rootFolderB, 'fileB.ts'),
                makeTextResult(rootFolderB, 'fileB.js'),
                makeTextResult(rootFolderB, 'file3.js')
            ]);
        });
        test('include pattern applied', async () => {
            const providedResults = [
                makeTextResult(rootFolderA, 'file1.js'),
                makeTextResult(rootFolderA, 'file1.ts')
            ];
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                includePattern: {
                    '*.ts': true
                },
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results } = await runTextSearch(query);
            assertResults(results, providedResults.slice(1));
        });
        test('max results = 1', async () => {
            const providedResults = [
                makeTextResult(rootFolderA, 'file1.ts'),
                makeTextResult(rootFolderA, 'file2.ts')
            ];
            let wasCanceled = false;
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    disposables.add(token.onCancellationRequested(() => wasCanceled = true));
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                maxResults: 1,
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results, stats } = await runTextSearch(query);
            assert(stats.limitHit, 'Expected to return limitHit');
            assertResults(results, providedResults.slice(0, 1));
            assert(wasCanceled, 'Expected to be canceled');
        });
        test('max results = 2', async () => {
            const providedResults = [
                makeTextResult(rootFolderA, 'file1.ts'),
                makeTextResult(rootFolderA, 'file2.ts'),
                makeTextResult(rootFolderA, 'file3.ts')
            ];
            let wasCanceled = false;
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    disposables.add(token.onCancellationRequested(() => wasCanceled = true));
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                maxResults: 2,
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results, stats } = await runTextSearch(query);
            assert(stats.limitHit, 'Expected to return limitHit');
            assertResults(results, providedResults.slice(0, 2));
            assert(wasCanceled, 'Expected to be canceled');
        });
        test('provider returns maxResults exactly', async () => {
            const providedResults = [
                makeTextResult(rootFolderA, 'file1.ts'),
                makeTextResult(rootFolderA, 'file2.ts')
            ];
            let wasCanceled = false;
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    disposables.add(token.onCancellationRequested(() => wasCanceled = true));
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                maxResults: 2,
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results, stats } = await runTextSearch(query);
            assert(!stats.limitHit, 'Expected not to return limitHit');
            assertResults(results, providedResults);
            assert(!wasCanceled, 'Expected not to be canceled');
        });
        test('provider returns early with limitHit', async () => {
            const providedResults = [
                makeTextResult(rootFolderA, 'file1.ts'),
                makeTextResult(rootFolderA, 'file2.ts'),
                makeTextResult(rootFolderA, 'file3.ts')
            ];
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve({ limitHit: true });
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                maxResults: 1000,
                folderQueries: [
                    { folder: rootFolderA }
                ]
            };
            const { results, stats } = await runTextSearch(query);
            assert(stats.limitHit, 'Expected to return limitHit');
            assertResults(results, providedResults);
        });
        test('multiroot max results', async () => {
            let cancels = 0;
            await registerTestTextSearchProvider({
                async provideTextSearchResults(query, options, progress, token) {
                    disposables.add(token.onCancellationRequested(() => cancels++));
                    await new Promise(r => process.nextTick(r));
                    [
                        'file1.ts',
                        'file2.ts',
                        'file3.ts',
                    ].forEach(f => progress.report(makeTextResult(options.folder, f)));
                    return null;
                }
            });
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                maxResults: 2,
                folderQueries: [
                    { folder: rootFolderA },
                    { folder: rootFolderB }
                ]
            };
            const { results } = await runTextSearch(query);
            assert.strictEqual(results.length, 2);
            assert.strictEqual(cancels, 2);
        });
        test('works with non-file schemes', async () => {
            const providedResults = [
                makeTextResult(fancySchemeFolderA, 'file1.ts'),
                makeTextResult(fancySchemeFolderA, 'file2.ts'),
                makeTextResult(fancySchemeFolderA, 'file3.ts')
            ];
            await registerTestTextSearchProvider({
                provideTextSearchResults(query, options, progress, token) {
                    providedResults.forEach(r => progress.report(r));
                    return Promise.resolve(null);
                }
            }, fancyScheme);
            const query = {
                type: 2 /* QueryType.Text */,
                contentPattern: getPattern('foo'),
                folderQueries: [
                    { folder: fancySchemeFolderA }
                ]
            };
            const { results } = await runTextSearch(query);
            assertResults(results, providedResults);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFNlYXJjaC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L25vZGUvZXh0SG9zdFNlYXJjaC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVwRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxXQUFXLEVBQXlCLE1BQU0sa0NBQWtDLENBQUM7QUFHdEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVB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