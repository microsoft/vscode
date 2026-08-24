/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import * as arrays from '../../../../../base/common/arrays.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ModelService } from '../../../../../editor/common/services/modelService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAITextQuery, IFileMatch, IFileQuery, IFileSearchStats, IFolderQuery, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchService, ITextQuery, ITextSearchMatch, OneLineRange, QueryType, TextSearchMatch } from '../../../../services/search/common/search.js';
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
import { INotebookCellMatchWithModel, INotebookFileMatchWithModel, contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from '../../browser/notebookSearch/searchNotebookHelpers.js';
import { CellKind } from '../../../notebook/common/notebookCommon.js';
import { ICellViewModel } from '../../../notebook/browser/notebookBrowser.js';
import { FindMatch, IReadonlyTextBuffer } from '../../../../../editor/common/model.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { INotebookSearchService } from '../../common/notebookSearch.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CellMatch, MatchInNotebook } from '../../browser/notebookSearch/notebookSearchModel.js';

const nullEvent = new class {
	id: number = -1;
	topic!: string;
	name!: string;
	description!: string;
	data: any;

	startTime!: Date;
	stopTime!: Date;

	stop(): void {
		return;
	}

	timeTaken(): number {
		return -1;
	}
};

const lineOneRange = new OneLineRange(1, 0, 1);

suite('SearchModel', () => {

	let instantiationService: TestInstantiationService;
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const testSearchStats: IFileSearchStats = {
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

	const folderQueries: IFolderQuery[] = [
		{ folder: createFileUriFromPathFromRoot() }
	];

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILabelService, { getUriBasenameLabel: (uri: URI) => '' });
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

	function searchServiceWithResults(results: IFileMatch[], complete: ISearchComplete | null = null): ISearchService {
		return <ISearchService>{
			textSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void, notebookURIs?: ResourceSet): Promise<ISearchComplete> {
				return new Promise(resolve => {
					queueMicrotask(() => {
						results.forEach(onProgress!);
						resolve(complete!);
					});
				});
			},
			fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
				return new Promise(resolve => {
					queueMicrotask(() => {
						resolve({ results: results, messages: [] });
					});

				});
			},
			aiTextSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void, notebookURIs?: ResourceSet): Promise<ISearchComplete> {
				return new Promise(resolve => {
					queueMicrotask(() => {
						results.forEach(onProgress!);
						resolve(complete!);
					});
				});
			},
			textSearchSplitSyncAsync(query: ITextQuery, token?: CancellationToken | undefined, onProgress?: ((result: ISearchProgressItem) => void) | undefined): { syncResults: ISearchComplete; asyncResults: Promise<ISearchComplete> } {
				return {
					syncResults: {
						results: [],
						messages: []
					},
					asyncResults: new Promise(resolve => {
						queueMicrotask(() => {
							results.forEach(onProgress!);
							resolve(complete!);
						});
					})
				};
			}
		};
	}

	function searchServiceWithError(error: Error): ISearchService {
		return <ISearchService>{
			textSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
				return new Promise((resolve, reject) => {
					reject(error);
				});
			},
			fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
				return new Promise((resolve, reject) => {
					queueMicrotask(() => {
						reject(error);
					});
				});
			},
			aiTextSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void, notebookURIs?: ResourceSet): Promise<ISearchComplete> {
				return new Promise((resolve, reject) => {
					reject(error);
				});
			},
			textSearchSplitSyncAsync(query: ITextQuery, token?: CancellationToken | undefined, onProgress?: ((result: ISearchProgressItem) => void) | undefined): { syncResults: ISearchComplete; asyncResults: Promise<ISearchComplete> } {
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

	function canceleableSearchService(tokenSource: CancellationTokenSource): ISearchService {
		return <ISearchService>{
			textSearch(query: ITextQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
				const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
				if (disposable) {
					store.add(disposable);
				}

				return this.textSearchSplitSyncAsync(query, token, onProgress).asyncResults;
			},
			fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
				const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
				if (disposable) {
					store.add(disposable);
				}
				return new Promise(resolve => {
					queueMicrotask(() => {
						// eslint-disable-next-line local/code-no-any-casts
						resolve(<any>{});
					});
				});
			},
			aiTextSearch(query: IAITextQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void, notebookURIs?: ResourceSet): Promise<ISearchComplete> {
				const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
				if (disposable) {
					store.add(disposable);
				}

				return Promise.resolve({
					results: [],
					messages: []
				});
			},
			textSearchSplitSyncAsync(query: ITextQuery, token?: CancellationToken | undefined, onProgress?: ((result: ISearchProgressItem) => void) | undefined): { syncResults: ISearchComplete; asyncResults: Promise<ISearchComplete> } {
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
							resolve(<any>{
								results: [],
								messages: []
							});
						});
					})
				};
			}
		};
	}

	function searchServiceWithDeferredPromise(p: Promise<ISearchComplete>): ISearchService {
		return <ISearchService>{
			textSearchSplitSyncAsync(query: ITextQuery, token?: CancellationToken | undefined, onProgress?: ((result: ISearchProgressItem) => void) | undefined): { syncResults: ISearchComplete; asyncResults: Promise<ISearchComplete> } {
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


	function notebookSearchServiceWithInfo(results: INotebookFileMatchWithModel[], tokenSource: CancellationTokenSource | undefined): INotebookSearchService {
		return <INotebookSearchService>{
			_serviceBrand: undefined,
			notebookSearch(query: ITextQuery, token: CancellationToken | undefined, searchInstanceID: string, onProgress?: (result: ISearchProgressItem) => void): {
				openFilesToScan: ResourceSet;
				completeData: Promise<ISearchComplete>;
				allScannedFiles: Promise<ResourceSet>;
			} {
				const disposable = token?.onCancellationRequested(() => tokenSource?.cancel());
				if (disposable) {
					store.add(disposable);
				}
				const localResults = new ResourceMap<INotebookFileMatchWithModel | null>(uri => uri.path);

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
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));

		const testObject: SearchModelImpl = instantiationService.createInstance(SearchModelImpl);
		store.add(testObject);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;

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
			aRawMatch('/2',
				new TextSearchMatch('test', new OneLineRange(1, 1, 5)),
				new TextSearchMatch('this is a test', new OneLineRange(1, 11, 15))),
			aRawMatch('/3', new TextSearchMatch('test', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
		sinon.stub(CellMatch.prototype, 'addContext');

		const mdInputCell = {
			cellKind: CellKind.Markup, textBuffer: <IReadonlyTextBuffer>{
				getLineContent(lineNumber: number): string {
					if (lineNumber === 1) {
						return '# Test';
					} else {
						return '';
					}
				}
			},
			id: 'mdInputCell'
		} as ICellViewModel;

		const findMatchMds = [new FindMatch(new Range(1, 3, 1, 7), ['Test'])];

		const codeCell = {
			cellKind: CellKind.Code, textBuffer: <IReadonlyTextBuffer>{
				getLineContent(lineNumber: number): string {
					if (lineNumber === 1) {
						return 'print("test! testing!!")';
					} else {
						return '';
					}
				}
			},
			id: 'codeCell'
		} as ICellViewModel;

		const findMatchCodeCells =
			[new FindMatch(new Range(1, 8, 1, 12), ['test']),
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
		const cellMatchMd: INotebookCellMatchWithModel = {
			cell: mdInputCell,
			index: 0,
			contentResults: contentMatchesToTextSearchMatches(findMatchMds, mdInputCell),
			webviewResults: []
		};

		const cellMatchCode: INotebookCellMatchWithModel = {
			cell: codeCell,
			index: 1,
			contentResults: contentMatchesToTextSearchMatches(findMatchCodeCells, codeCell),
			webviewResults: webviewMatchesToTextSearchMatches(webviewMatches),
		};

		const notebookSearchService = instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([aRawMatchWithCells('/1', cellMatchMd, cellMatchCode)], undefined));
		const notebookSearch = sinon.spy(notebookSearchService, 'notebookSearch');
		const model: SearchModelImpl = instantiationService.createInstance(SearchModelImpl);
		store.add(model);
		await model.search({ contentPattern: { pattern: 'test' }, type: QueryType.Text, folderQueries }).asyncResults;
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
		assert((notebookFileMatches[0] as MatchInNotebook).cell?.id === 'mdInputCell');
		assert((notebookFileMatches[1] as MatchInNotebook).cell?.id === 'codeCell');
		assert((notebookFileMatches[2] as MatchInNotebook).cell?.id === 'codeCell');
		assert((notebookFileMatches[3] as MatchInNotebook).cell?.id === 'codeCell');
		assert((notebookFileMatches[4] as MatchInNotebook).cell?.id === 'codeCell');

		const mdCellMatchProcessed = (notebookFileMatches[0] as MatchInNotebook).cellParent;
		const codeCellMatchProcessed = (notebookFileMatches[1] as MatchInNotebook).cellParent;

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
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('/2',
				new TextSearchMatch('preview 2', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));

		const testObject: SearchModelImpl = instantiationService.createInstance(SearchModelImpl);
		store.add(testObject);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;

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
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;

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

		instantiationService.stub(ISearchService, searchServiceWithResults(
			[aRawMatch('/1', new TextSearchMatch('some preview', lineOneRange))],
			{ results: [], stats: testSearchStats, messages: [] }));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));

		const testObject = instantiationService.createInstance(SearchModelImpl);
		store.add(testObject);
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;

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
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;

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

		const deferredPromise = new DeferredPromise<ISearchComplete>();

		instantiationService.stub(ISearchService, searchServiceWithDeferredPromise(deferredPromise.p));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));

		const testObject = instantiationService.createInstance(SearchModelImpl);
		store.add(testObject);
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;

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
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('/2',
				new TextSearchMatch('preview 2', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results: [] }));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
		const testObject: SearchModelImpl = instantiationService.createInstance(SearchModelImpl);
		store.add(testObject);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;
		assert.ok(!testObject.searchResult.isEmpty());

		instantiationService.stub(ISearchService, searchServiceWithResults([]));

		testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });
		assert.ok(testObject.searchResult.isEmpty());
	});

	test('Search Model: Previous search is cancelled when new search is called', async () => {
		const tokenSource = new CancellationTokenSource();
		store.add(tokenSource);
		instantiationService.stub(ISearchService, canceleableSearchService(tokenSource));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], tokenSource));
		const testObject: SearchModelImpl = instantiationService.createInstance(SearchModelImpl);
		store.add(testObject);
		testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });
		instantiationService.stub(ISearchService, searchServiceWithResults([]));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));
		testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

		assert.ok(tokenSource.token.isCancellationRequested);
	});

	test('getReplaceString returns proper replace string for regExpressions', async () => {
		const results = [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], undefined));

		const testObject: SearchModelImpl = instantiationService.createInstance(SearchModelImpl);
		store.add(testObject);
		await testObject.search({ contentPattern: { pattern: 're' }, type: QueryType.Text, folderQueries }).asyncResults;
		testObject.replaceString = 'hello';
		let match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 're', isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 're(?:vi)', isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
		testObject.replaceString = 'hello$1';
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('helloe', match.replaceString);
	});

	function aRawMatch(resource: string, ...results: ITextSearchMatch[]): IFileMatch {
		return { resource: createFileUriFromPathFromRoot(resource), results };
	}

	function aRawMatchWithCells(resource: string, ...cells: INotebookCellMatchWithModel[]) {
		return { resource: createFileUriFromPathFromRoot(resource), cellResults: cells };
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IThemeService, new TestThemeService());
		const config = new TestConfigurationService();
		config.setUserConfiguration('search', { searchOnType: true });
		instantiationService.stub(IConfigurationService, config);
		const modelService = instantiationService.createInstance(ModelService);
		store.add(modelService);
		return modelService;
	}

	function stubNotebookEditorService(instantiationService: TestInstantiationService): INotebookEditorService {
		instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IEditorService, store.add(new TestEditorService()));
		const notebookEditorWidgetService = instantiationService.createInstance(NotebookEditorWidgetService);
		store.add(notebookEditorWidgetService);
		return notebookEditorWidgetService;
	}
});
