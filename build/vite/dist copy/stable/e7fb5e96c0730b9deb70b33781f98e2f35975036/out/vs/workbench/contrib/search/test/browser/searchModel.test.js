/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import * as arrays from '../../../../../base/common/arrays.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ModelService } from '../../../../../editor/common/services/modelService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISearchService, OneLineRange, TextSearchMatch } from '../../../../services/search/common/search.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { SearchModelImpl } from '../../browser/searchTreeModel/searchModel.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { TestEditorGroupsService, TestEditorService } from '../../../../test/browser/workbenchTestServices.js';
import { NotebookEditorWidgetService } from '../../../notebook/browser/services/notebookEditorServiceImpl.js';
import { createFileUriFromPathFromRoot, getRootName } from './searchTestCommon.js';
import { contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from '../../browser/notebookSearch/searchNotebookHelpers.js';
import { CellKind } from '../../../notebook/common/notebookCommon.js';
import { FindMatch } from '../../../../../editor/common/model.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { INotebookSearchService } from '../../common/notebookSearch.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CellMatch, MatchInNotebook } from '../../browser/notebookSearch/notebookSearchModel.js';
const nullEvent = new class {
    constructor() {
        this.id = -1;
    }
    stop() {
        return;
    }
    timeTaken() {
        return -1;
    }
};
const lineOneRange = new OneLineRange(1, 0, 1);
suite('SearchModel', () => {
    let instantiationService;
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const testSearchStats = {
        fromCache: false,
        resultCount: 1,
        type: 'searchProcess',
        detailStats: {
            fileWalkTime: 0,
            cmdTime: 0,
            cmdResultCount: 0,
            directoriesWalked: 2,
            filesWalked: 3
        }
    };
    const folderQueries = [
        { folder: createFileUriFromPathFromRoot() }
    ];
    setup(() => {
        instantiationService = new TestInstantiationService();
        instantiationService.stub(ITelemetryService, NullTelemetryService);
        instantiationService.stub(ILabelService, { getUriBasenameLabel: (uri) => '' });
        instantiationService.stub(INotebookService, { getNotebookTextModels: () => [] });
        instantiationService.stub(IModelService, stubModelService(instantiationService));
        instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService));
        instantiationService.stub(ISearchService, {});
        instantiationService.stub(ISearchService, 'textSearch', Promise.resolve({ results: [] }));
        const fileService = new FileService(new NullLogService());
        store.add(fileService);
        const uriIdentityService = new UriIdentityService(fileService);
        store.add(uriIdentityService);
        instantiationService.stub(IUriIdentityService, uriIdentityService);
        instantiationService.stub(ILogService, new NullLogService());
    });
    teardown(() => sinon.restore());
    function searchServiceWithResults(results, complete = null) {
        return {
            textSearch(query, token, onProgress, notebookURIs) {
                return new Promise(resolve => {
                    queueMicrotask(() => {
                        results.forEach(onProgress);
                        resolve(complete);
                    });
                });
            },
            fileSearch(query, token) {
                return new Promise(resolve => {
                    queueMicrotask(() => {
                        resolve({ results: results, messages: [] });
                    });
                });
            },
            aiTextSearch(query, token, onProgress, notebookURIs) {
                return new Promise(resolve => {
                    queueMicrotask(() => {
                        results.forEach(onProgress);
                        resolve(complete);
                    });
                });
            },
            textSearchSplitSyncAsync(query, token, onProgress) {
                return {
                    syncResults: {
                        results: [],
                        messages: []
                    },
                    asyncResults: new Promise(resolve => {
                        queueMicrotask(() => {
                            results.forEach(onProgress);
                            resolve(complete);
                        });
                    })
                };
            }
        };
    }
    function searchServiceWithError(error) {
        return {
            textSearch(query, token, onProgress) {
                return new Promise((resolve, reject) => {
                    reject(error);
                });
            },
            fileSearch(query, token) {
                return new Promise((resolve, reject) => {
                    queueMicrotask(() => {
                        reject(error);
                    });
                });
            },
            aiTextSearch(query, token, onProgress, notebookURIs) {
                return new Promise((resolve, reject) => {
                    reject(error);
                });
            },
            textSearchSplitSyncAsync(query, token, onProgress) {
                return {
                    syncResults: {
                        results: [],
                        messages: []
                    },
                    asyncResults: new Promise((resolve, reject) => {
                        reject(error);
                    })
                };
            }
        };
    }
    function canceleableSearchService(tokenSource) {
        return {
            textSearch(query, token, onProgress) {
                const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
                if (disposable) {
                    store.add(disposable);
                }
                return this.textSearchSplitSyncAsync(query, token, onProgress).asyncResults;
            },
            fileSearch(query, token) {
                const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
                if (disposable) {
                    store.add(disposable);
                }
                return new Promise(resolve => {
                    queueMicrotask(() => {
                        // eslint-disable-next-line local/code-no-any-casts
                        resolve({});
                    });
                });
            },
            aiTextSearch(query, token, onProgress, notebookURIs) {
                const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
                if (disposable) {
                    store.add(disposable);
                }
                return Promise.resolve({
                    results: [],
                    messages: []
                });
            },
            textSearchSplitSyncAsync(query, token, onProgress) {
                const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
                if (disposable) {
                    store.add(disposable);
                }
                return {
                    syncResults: {
                        results: [],
                        messages: []
                    },
                    asyncResults: new Promise(resolve => {
                        queueMicrotask(() => {
                            // eslint-disable-next-line local/code-no-any-casts
                            resolve({
                                results: [],
                                messages: []
                            });
                        });
                    })
                };
            }
        };
    }
    function searchServiceWithDeferredPromise(p) {
        return {
            textSearchSplitSyncAsync(query, token, onProgress) {
                return {
                    syncResults: {
                        results: [],
                        messages: []
                    },
                    asyncResults: p,
                };
            }
        };
    }
    function notebookSearchServiceWithInfo(results, tokenSource) {
        return {
            _serviceBrand: undefined,
            notebookSearch(query, token, searchInstanceID, onProgress) {
                const disposable = token?.onCancellationRequested(() => tokenSource?.cancel());
                if (disposable) {
                    store.add(disposable);
                }
                const localResults = new ResourceMap(uri => uri.path);
                results.forEach(r => {
                    localResults.set(r.resource, r);
                });
                if (onProgress) {
                    arrays.coalesce([...localResults.values()]).forEach(onProgress);
                }
                return {
                    openFilesToScan: new ResourceSet([...localResults.keys()]),
                    completeData: Promise.resolve({
                        messages: [],
                        results: arrays.coalesce([...localResults.values()]),
                        limitHit: false
                    }),
                    allScannedFiles: Promise.resolve(new ResourceSet()),
                };
            }
        };
    }
    test('Search Model: Search adds to results', async () => {
        const results = [
            aRawMatch('/1', new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)), new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
            aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))
        ];
        instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        await testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        const actual = testObject.searchResult.matches();
        assert.strictEqual(2, actual.length);
        assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());
        let actuaMatches = actual[0].matches();
        assert.strictEqual(2, actuaMatches.length);
        assert.strictEqual('preview 1', actuaMatches[0].text());
        assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
        assert.strictEqual('preview 1', actuaMatches[1].text());
        assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));
        actuaMatches = actual[1].matches();
        assert.strictEqual(1, actuaMatches.length);
        assert.strictEqual('preview 2', actuaMatches[0].text());
        assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));
    });
    test('Search Model: Search can return notebook results', async () => {
        const results = [
            aRawMatch('/2', new TextSearchMatch('test', new OneLineRange(1, 1, 5)), new TextSearchMatch('this is a test', new OneLineRange(1, 11, 15))),
            aRawMatch('/3', new TextSearchMatch('test', lineOneRange))
        ];
        instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
        sinon.stub(CellMatch.prototype, 'addContext');
        const mdInputCell = {
            cellKind: CellKind.Markup, textBuffer: {
                getLineContent(lineNumber) {
                    if (lineNumber === 1) {
                        return '# Test';
                    }
                    else {
                        return '';
                    }
                }
            },
            id: 'mdInputCell'
        };
        const findMatchMds = [new FindMatch(new Range(1, 3, 1, 7), ['Test'])];
        const codeCell = {
            cellKind: CellKind.Code, textBuffer: {
                getLineContent(lineNumber) {
                    if (lineNumber === 1) {
                        return 'print("test! testing!!")';
                    }
                    else {
                        return '';
                    }
                }
            },
            id: 'codeCell'
        };
        const findMatchCodeCells = [new FindMatch(new Range(1, 8, 1, 12), ['test']),
            new FindMatch(new Range(1, 14, 1, 18), ['test']),
        ];
        const webviewMatches = [{
                index: 0,
                searchPreviewInfo: {
                    line: 'test! testing!!',
                    range: {
                        start: 1,
                        end: 5
                    }
                }
            },
            {
                index: 1,
                searchPreviewInfo: {
                    line: 'test! testing!!',
                    range: {
                        start: 7,
                        end: 11
                    }
                }
            }
        ];
        const cellMatchMd = {
            cell: mdInputCell,
            index: 0,
            contentResults: contentMatchesToTextSearchMatches(findMatchMds, mdInputCell),
            webviewResults: []
        };
        const cellMatchCode = {
            cell: codeCell,
            index: 1,
            contentResults: contentMatchesToTextSearchMatches(findMatchCodeCells, codeCell),
            webviewResults: webviewMatchesToTextSearchMatches(webviewMatches),
        };
        const notebookSearchService = instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([aRawMatchWithCells('/1', cellMatchMd, cellMatchCode)], undefined));
        const notebookSearch = sinon.spy(notebookSearchService, 'notebookSearch');
        const model = instantiationService.createInstance(SearchModelImpl);
        store.add(model);
        await model.search({ contentPattern: { pattern: 'test' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        const actual = model.searchResult.matches();
        assert(notebookSearch.calledOnce);
        assert.strictEqual(3, actual.length);
        assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());
        const notebookFileMatches = actual[0].matches();
        assert.ok(notebookFileMatches[0].range().equalsRange(new Range(1, 3, 1, 7)));
        assert.ok(notebookFileMatches[1].range().equalsRange(new Range(1, 8, 1, 12)));
        assert.ok(notebookFileMatches[2].range().equalsRange(new Range(1, 14, 1, 18)));
        assert.ok(notebookFileMatches[3].range().equalsRange(new Range(1, 2, 1, 6)));
        assert.ok(notebookFileMatches[4].range().equalsRange(new Range(1, 8, 1, 12)));
        notebookFileMatches.forEach(match => match instanceof MatchInNotebook);
        assert(notebookFileMatches[0].cell?.id === 'mdInputCell');
        assert(notebookFileMatches[1].cell?.id === 'codeCell');
        assert(notebookFileMatches[2].cell?.id === 'codeCell');
        assert(notebookFileMatches[3].cell?.id === 'codeCell');
        assert(notebookFileMatches[4].cell?.id === 'codeCell');
        const mdCellMatchProcessed = notebookFileMatches[0].cellParent;
        const codeCellMatchProcessed = notebookFileMatches[1].cellParent;
        assert(mdCellMatchProcessed.contentMatches.length === 1);
        assert(codeCellMatchProcessed.contentMatches.length === 2);
        assert(codeCellMatchProcessed.webviewMatches.length === 2);
        assert(mdCellMatchProcessed.contentMatches[0] === notebookFileMatches[0]);
        assert(codeCellMatchProcessed.contentMatches[0] === notebookFileMatches[1]);
        assert(codeCellMatchProcessed.contentMatches[1] === notebookFileMatches[2]);
        assert(codeCellMatchProcessed.webviewMatches[0] === notebookFileMatches[3]);
        assert(codeCellMatchProcessed.webviewMatches[1] === notebookFileMatches[4]);
        assert.strictEqual(URI.file(`${getRootName()}/2`).toString(), actual[1].resource.toString());
        assert.strictEqual(URI.file(`${getRootName()}/3`).toString(), actual[2].resource.toString());
    });
    test('Search Model: Search reports telemetry on search completed', async () => {
        const target = instantiationService.spy(ITelemetryService, 'publicLog');
        const results = [
            aRawMatch('/1', new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)), new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
            aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))
        ];
        instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        await testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        assert.ok(target.calledThrice);
        assert.ok(target.calledWith('searchResultsFirstRender'));
        assert.ok(target.calledWith('searchResultsFinished'));
    });
    test('Search Model: Search reports timed telemetry on search when progress is not called', () => {
        const target2 = sinon.spy();
        sinon.stub(nullEvent, 'stop').callsFake(target2);
        const target1 = sinon.stub().returns(nullEvent);
        instantiationService.stub(ITelemetryService, 'publicLog', target1);
        instantiationService.stub(ISearchService, searchServiceWithResults([], { limitHit: false, messages: [], results: [] }));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        return result.then(() => {
            return timeout(1).then(() => {
                assert.ok(target1.calledWith('searchResultsFirstRender'));
                assert.ok(target1.calledWith('searchResultsFinished'));
            });
        });
    });
    test('Search Model: Search reports timed telemetry on search when progress is called', () => {
        const target2 = sinon.spy();
        sinon.stub(nullEvent, 'stop').callsFake(target2);
        const target1 = sinon.stub().returns(nullEvent);
        instantiationService.stub(ITelemetryService, 'publicLog', target1);
        instantiationService.stub(ISearchService, searchServiceWithResults([aRawMatch('/1', new TextSearchMatch('some preview', lineOneRange))], { results: [], stats: testSearchStats, messages: [] }));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        return result.then(() => {
            return timeout(1).then(() => {
                // timeout because promise handlers may run in a different order. We only care that these
                // are fired at some point.
                assert.ok(target1.calledWith('searchResultsFirstRender'));
                assert.ok(target1.calledWith('searchResultsFinished'));
                // assert.strictEqual(1, target2.callCount);
            });
        });
    });
    test('Search Model: Search reports timed telemetry on search when error is called', () => {
        const target2 = sinon.spy();
        sinon.stub(nullEvent, 'stop').callsFake(target2);
        const target1 = sinon.stub().returns(nullEvent);
        instantiationService.stub(ITelemetryService, 'publicLog', target1);
        instantiationService.stub(ISearchService, searchServiceWithError(new Error('This error should be thrown by this test.')));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        return result.then(() => { }, () => {
            return timeout(1).then(() => {
                assert.ok(target1.calledWith('searchResultsFirstRender'));
                assert.ok(target1.calledWith('searchResultsFinished'));
            });
        });
    });
    test('Search Model: Search reports timed telemetry on search when error is cancelled error', () => {
        const target2 = sinon.spy();
        sinon.stub(nullEvent, 'stop').callsFake(target2);
        const target1 = sinon.stub().returns(nullEvent);
        instantiationService.stub(ITelemetryService, 'publicLog', target1);
        const deferredPromise = new DeferredPromise();
        instantiationService.stub(ISearchService, searchServiceWithDeferredPromise(deferredPromise.p));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        deferredPromise.cancel();
        return result.then(() => { }, async () => {
            return timeout(1).then(() => {
                assert.ok(target1.calledWith('searchResultsFirstRender'));
                assert.ok(target1.calledWith('searchResultsFinished'));
                // assert.ok(target2.calledOnce);
            });
        });
    });
    test('Search Model: Search results are cleared during search', async () => {
        const results = [
            aRawMatch('/1', new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)), new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
            aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))
        ];
        instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results: [] }));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        await testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        assert.ok(!testObject.searchResult.isEmpty());
        instantiationService.stub(ISearchService, searchServiceWithResults([]));
        testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries });
        assert.ok(testObject.searchResult.isEmpty());
    });
    test('Search Model: Previous search is cancelled when new search is called', async () => {
        const tokenSource = new CancellationTokenSource();
        store.add(tokenSource);
        instantiationService.stub(ISearchService, canceleableSearchService(tokenSource));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], tokenSource));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries });
        instantiationService.stub(ISearchService, searchServiceWithResults([]));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        testObject.search({ contentPattern: { pattern: 'somestring' }, type: 2 /* QueryType.Text */, folderQueries });
        assert.ok(tokenSource.token.isCancellationRequested);
    });
    test('getReplaceString returns proper replace string for regExpressions', async () => {
        const results = [
            aRawMatch('/1', new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)), new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)))
        ];
        instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
        instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
        const testObject = instantiationService.createInstance(SearchModelImpl);
        store.add(testObject);
        await testObject.search({ contentPattern: { pattern: 're' }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        testObject.replaceString = 'hello';
        let match = testObject.searchResult.matches()[0].matches()[0];
        assert.strictEqual('hello', match.replaceString);
        await testObject.search({ contentPattern: { pattern: 're', isRegExp: true }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        match = testObject.searchResult.matches()[0].matches()[0];
        assert.strictEqual('hello', match.replaceString);
        await testObject.search({ contentPattern: { pattern: 're(?:vi)', isRegExp: true }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        match = testObject.searchResult.matches()[0].matches()[0];
        assert.strictEqual('hello', match.replaceString);
        await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        match = testObject.searchResult.matches()[0].matches()[0];
        assert.strictEqual('hello', match.replaceString);
        await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: 2 /* QueryType.Text */, folderQueries }).asyncResults;
        testObject.replaceString = 'hello$1';
        match = testObject.searchResult.matches()[0].matches()[0];
        assert.strictEqual('helloe', match.replaceString);
    });
    function aRawMatch(resource, ...results) {
        return { resource: createFileUriFromPathFromRoot(resource), results };
    }
    function aRawMatchWithCells(resource, ...cells) {
        return { resource: createFileUriFromPathFromRoot(resource), cellResults: cells };
    }
    function stubModelService(instantiationService) {
        instantiationService.stub(IThemeService, new TestThemeService());
        const config = new TestConfigurationService();
        config.setUserConfiguration('search', { searchOnType: true });
        instantiationService.stub(IConfigurationService, config);
        const modelService = instantiationService.createInstance(ModelService);
        store.add(modelService);
        return modelService;
    }
    function stubNotebookEditorService(instantiationService) {
        instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IEditorService, store.add(new TestEditorService()));
        const notebookEditorWidgetService = instantiationService.createInstance(NotebookEditorWidgetService);
        store.add(notebookEditorWidgetService);
        return notebookEditorWidgetService;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoTW9kZWwudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC90ZXN0L2Jyb3dzZXIvc2VhcmNoTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxLQUFLLE1BQU0sTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9FLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDckYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUE0SCxjQUFjLEVBQWdDLFlBQVksRUFBYSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNoUixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsZUFBZSxFQUFF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bUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RSxNQUFNLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFOUUsbUJBQW1CLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxZQUFZLGVBQWUsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sQ0FBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQXFCLENBQUMsSUFBSSxFQUFFLEVBQUUsS0FBSyxhQUFhLENBQUMsQ0FBQztRQUMvRSxNQUFNLENBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFxQixDQUFDLElBQUksRUFBRSxFQUFFLEtBQUssVUFBVSxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFFLG1CQUFtQixDQUFDLENBQUMsQ0FBcUIsQ0FBQyxJQUFJLEVBQUUsRUFBRSxLQUFLLFVBQVUsQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQXFCLENBQUMsSUFBSSxFQUFFLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFxQixDQUFDLElBQUksRUFBRSxFQUFFLEtBQUssVUFBVSxDQUFDLENBQUM7UUFFNUUsTUFBTSxvQkFBb0Is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