/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as arrays from 'vs/base/common/arrays';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IFileMatch, IFileQuery, IFileSearchStats, IFolderQuery, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchService, ITextQuery, ITextSearchMatch, OneLineRange, QueryType, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { CellMatch, MatchInNotebook, SearchModel } from 'vs/workbench/contrib/search/browser/searchModel';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { FileService } from 'vs/platform/files/common/fileService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { ILabelService } from 'vs/platform/label/common/label';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { TestEditorGroupsService } from 'vs/workbench/test/browser/workbenchTestServices';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';
import { createFileUriFromPathFromRoot, getRootName } from 'vs/workbench/contrib/search/test/browser/searchTestCommon';
import { ICellMatch, IFileMatchWithCells, contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from 'vs/workbench/contrib/search/browser/searchNotebookHelpers';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { FindMatch, IReadonlyTextBuffer } from 'vs/editor/common/model';
import { ResourceMap, ResourceSet } from 'vs/base/common/map';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { INotebookSearchService } from 'vs/workbench/contrib/search/common/notebookSearch';

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
		instantiationService.stub(IUriIdentityService, new UriIdentityService(new FileService(new NullLogService())));
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
				token?.onCancellationRequested(() => tokenSource.cancel());

				return this.textSearchSplitSyncAsync(query, token, onProgress).asyncResults;
			},
			fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
				token?.onCancellationRequested(() => tokenSource.cancel());
				return new Promise(resolve => {
					queueMicrotask(() => {
						resolve(<any>{});
					});
				});
			},
			textSearchSplitSyncAsync(query: ITextQuery, token?: CancellationToken | undefined, onProgress?: ((result: ISearchProgressItem) => void) | undefined): { syncResults: ISearchComplete; asyncResults: Promise<ISearchComplete> } {
				token?.onCancellationRequested(() => tokenSource.cancel());
				return {
					syncResults: {
						results: [],
						messages: []
					},
					asyncResults: new Promise(resolve => {
						queueMicrotask(() => {
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


	function notebookSearchServiceWithInfo(results: IFileMatchWithCells[], tokenSource: CancellationTokenSource | undefined): INotebookSearchService {
		return <INotebookSearchService>{
			_serviceBrand: undefined,
			notebookSearch(query: ITextQuery, token: CancellationToken | undefined, searchInstanceID: string, onProgress?: (result: ISearchProgressItem) => void): {
				openFilesToScan: ResourceSet;
				completeData: Promise<ISearchComplete>;
				allScannedFiles: Promise<ResourceSet>;
			} {
				token?.onCancellationRequested(() => tokenSource?.cancel());
				const localResults = new ResourceMap<IFileMatchWithCells | null>(uri => uri.path);

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

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
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
		const cellMatchMd: ICellMatch = {
			cell: mdInputCell,
			index: 0,
			contentResults: contentMatchesToTextSearchMatches(findMatchMds, mdInputCell),
			webviewResults: []
		};

		const cellMatchCode: ICellMatch = {
			cell: codeCell,
			index: 1,
			contentResults: contentMatchesToTextSearchMatches(findMatchCodeCells, codeCell),
			webviewResults: webviewMatchesToTextSearchMatches(webviewMatches),
		};

		const notebookSearchService = instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([aRawMatchWithCells('/1', cellMatchMd, cellMatchCode)], undefined));
		const notebookSearch = sinon.spy(notebookSearchService, "notebookSearch");
		const model: SearchModel = instantiationService.createInstance(SearchModel);
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
		// assert(notebookFileMatches[0] instanceof MatchInNotebook);
		assert((notebookFileMatches[0] as MatchInNotebook).cell.id === 'mdInputCell');
		assert((notebookFileMatches[1] as MatchInNotebook).cell.id === 'codeCell');
		assert((notebookFileMatches[2] as MatchInNotebook).cell.id === 'codeCell');
		assert((notebookFileMatches[3] as MatchInNotebook).cell.id === 'codeCell');
		assert((notebookFileMatches[4] as MatchInNotebook).cell.id === 'codeCell');

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

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
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

		const testObject = instantiationService.createInstance(SearchModel);
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

		const testObject = instantiationService.createInstance(SearchModel);
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

		const testObject = instantiationService.createInstance(SearchModel);
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

		const testObject = instantiationService.createInstance(SearchModel);
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
		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries }).asyncResults;
		assert.ok(!testObject.searchResult.isEmpty());

		instantiationService.stub(ISearchService, searchServiceWithResults([]));

		testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });
		assert.ok(testObject.searchResult.isEmpty());
	});

	test('Search Model: Previous search is cancelled when new search is called', async () => {
		const tokenSource = new CancellationTokenSource();
		instantiationService.stub(ISearchService, canceleableSearchService(tokenSource));
		instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], tokenSource));
		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
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

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
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

	function aRawMatchWithCells(resource: string, ...cells: ICellMatch[]) {
		return { resource: createFileUriFromPathFromRoot(resource), cellResults: cells };
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IThemeService, new TestThemeService());
		const config = new TestConfigurationService();
		config.setUserConfiguration('search', { searchOnType: true });
		instantiationService.stub(IConfigurationService, config);
		return instantiationService.createInstance(ModelService);
	}

	function stubNotebookEditorService(instantiationService: TestInstantiationService): INotebookEditorService {
		instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
		return instantiationService.createInstance(NotebookEditorWidgetService);
	}
});

