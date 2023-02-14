/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IFileMatch, IFileSearchStats, IFolderQuery, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchService, ITextSearchMatch, OneLineRange, QueryType, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { SearchModel } from 'vs/workbench/contrib/search/browser/searchModel';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { FileService } from 'vs/platform/files/common/fileService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { isWindows } from 'vs/base/common/platform';
import { ILabelService } from 'vs/platform/label/common/label';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { TestEditorGroupsService } from 'vs/workbench/test/browser/workbenchTestServices';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';

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
	let restoreStubs: sinon.SinonStub[];

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
		restoreStubs = [];
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILabelService, { getUriBasenameLabel: (uri: URI) => '' });
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService));
		instantiationService.stub(ISearchService, {});
		instantiationService.stub(ISearchService, 'textSearch', Promise.resolve({ results: [] }));
		instantiationService.stub(IUriIdentityService, new UriIdentityService(new FileService(new NullLogService())));
		instantiationService.stub(ILogService, new NullLogService());
	});

	teardown(() => {
		restoreStubs.forEach(element => {
			element.restore();
		});
	});

	function searchServiceWithResults(results: IFileMatch[], complete: ISearchComplete | null = null): ISearchService {
		return <ISearchService>{
			textSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
				return new Promise(resolve => {
					queueMicrotask(() => {
						results.forEach(onProgress!);
						resolve(complete!);
					});
				});
			}
		};
	}

	function searchServiceWithError(error: Error): ISearchService {
		return <ISearchService>{
			textSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
				return new Promise((resolve, reject) => {
					reject(error);
				});
			}
		};
	}

	function canceleableSearchService(tokenSource: CancellationTokenSource): ISearchService {
		return <ISearchService>{
			textSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
				token?.onCancellationRequested(() => tokenSource.cancel());

				return new Promise(resolve => {
					queueMicrotask(() => {
						resolve(<any>{});
					});
				});
			}
		};
	}

	test('Search Model: Search adds to results', async () => {
		const results = [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results));

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

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

	test('Search Model: Search reports telemetry on search completed', async () => {
		const target = instantiationService.spy(ITelemetryService, 'publicLog');
		const results = [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('/2',
				new TextSearchMatch('preview 2', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results));

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

		assert.ok(target.calledThrice);
		assert.ok(target.calledWith('searchResultsFirstRender'));
		assert.ok(target.calledWith('searchResultsFinished'));
	});

	test('Search Model: Search reports timed telemetry on search when progress is not called', () => {
		const target2 = sinon.spy();
		stub(nullEvent, 'stop', target2);
		const target1 = sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'publicLog', target1);

		instantiationService.stub(ISearchService, searchServiceWithResults([]));

		const testObject = instantiationService.createInstance(SearchModel);
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

		return result.then(() => {
			return timeout(1).then(() => {
				assert.ok(target1.calledWith('searchResultsFirstRender'));
				assert.ok(target1.calledWith('searchResultsFinished'));
			});
		});
	});

	test('Search Model: Search reports timed telemetry on search when progress is called', () => {
		const target2 = sinon.spy();
		stub(nullEvent, 'stop', target2);
		const target1 = sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'publicLog', target1);

		instantiationService.stub(ISearchService, searchServiceWithResults(
			[aRawMatch('/1', new TextSearchMatch('some preview', lineOneRange))],
			{ results: [], stats: testSearchStats, messages: [] }));

		const testObject = instantiationService.createInstance(SearchModel);
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

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
		stub(nullEvent, 'stop', target2);
		const target1 = sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'publicLog', target1);

		instantiationService.stub(ISearchService, searchServiceWithError(new Error('error')));

		const testObject = instantiationService.createInstance(SearchModel);
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

		return result.then(() => { }, () => {
			return timeout(1).then(() => {
				assert.ok(target1.calledWith('searchResultsFirstRender'));
				assert.ok(target1.calledWith('searchResultsFinished'));
				// assert.ok(target2.calledOnce);
			});
		});
	});

	test('Search Model: Search reports timed telemetry on search when error is cancelled error', () => {
		const target2 = sinon.spy();
		stub(nullEvent, 'stop', target2);
		const target1 = sinon.stub().returns(nullEvent);
		instantiationService.stub(ITelemetryService, 'publicLog', target1);

		const deferredPromise = new DeferredPromise<ISearchComplete>();
		instantiationService.stub(ISearchService, 'textSearch', deferredPromise.p);

		const testObject = instantiationService.createInstance(SearchModel);
		const result = testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

		deferredPromise.cancel();

		return result.then(() => { }, () => {
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
		instantiationService.stub(ISearchService, searchServiceWithResults(results));
		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });
		assert.ok(!testObject.searchResult.isEmpty());

		instantiationService.stub(ISearchService, searchServiceWithResults([]));

		testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });
		assert.ok(testObject.searchResult.isEmpty());
	});

	test('Search Model: Previous search is cancelled when new search is called', async () => {
		const tokenSource = new CancellationTokenSource();
		instantiationService.stub(ISearchService, canceleableSearchService(tokenSource));
		const testObject: SearchModel = instantiationService.createInstance(SearchModel);

		testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });
		instantiationService.stub(ISearchService, searchServiceWithResults([]));
		testObject.search({ contentPattern: { pattern: 'somestring' }, type: QueryType.Text, folderQueries });

		assert.ok(tokenSource.token.isCancellationRequested);
	});

	test('getReplaceString returns proper replace string for regExpressions', async () => {
		const results = [
			aRawMatch('/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results));

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 're' }, type: QueryType.Text, folderQueries });
		testObject.replaceString = 'hello';
		let match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 're', isRegExp: true }, type: QueryType.Text, folderQueries });
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 're(?:vi)', isRegExp: true }, type: QueryType.Text, folderQueries });
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: QueryType.Text, folderQueries });
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: QueryType.Text, folderQueries });
		testObject.replaceString = 'hello$1';
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('helloe', match.replaceString);
	});

	function aRawMatch(resource: string, ...results: ITextSearchMatch[]): IFileMatch {
		return { resource: createFileUriFromPathFromRoot(resource), results };
	}

	function createFileUriFromPathFromRoot(path?: string): URI {
		const rootName = getRootName();
		if (path) {
			return URI.file(`${rootName}${path}`);
		} else {
			if (isWindows) {
				return URI.file(`${rootName}/`);
			} else {
				return URI.file(rootName);
			}
		}
	}

	function getRootName(): string {
		if (isWindows) {
			return 'c:';
		} else {
			return '';
		}
	}

	function stub(arg1: any, arg2: any, arg3: any): sinon.SinonStub {
		const stub = sinon.stub(arg1, arg2).callsFake(arg3);
		restoreStubs.push(stub);
		return stub;
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IThemeService, new TestThemeService());
		const config = new TestConfigurationService();
		config.setUserConfiguration('search', { searchOnType: true, experimental: { notebookSearch: false } });
		instantiationService.stub(IConfigurationService, config);
		return instantiationService.createInstance(ModelService);
	}

	function stubNotebookEditorService(instantiationService: TestInstantiationService): INotebookEditorService {
		instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
		return instantiationService.createInstance(NotebookEditorWidgetService);
	}

});
