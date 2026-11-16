/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MainThreadWorkspace } from '../../browser/mainThreadWorkspace.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { IFileQuery, ISearchService } from '../../../services/search/common/search.js';
import { workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../platform/workspace/test/common/testWorkspace.js';
import { IFolderLocation, IFolderLocationChangeEvent, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceFolderLocationsDto } from '../../common/extHost.protocol.js';

suite('MainThreadWorkspace', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let configService: TestConfigurationService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables) as TestInstantiationService;

		configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration('search', {});
		instantiationService.stub(IWorkspaceFolderLocationService, {
			onDidChangeLocation: Event.None,
			onDidChangeProviders: Event.None,
			getLocations: async () => []
		});
	});

	test('simple', () => {
		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries.length, 1);
				assert.strictEqual(query.folderQueries[0].disregardIgnoreFiles, true);

				assert.deepStrictEqual({ ...query.includePattern }, { 'foo': true });
				assert.strictEqual(query.maxResults, 10);

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { }, $acceptWorkspaceFolderLocations: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: 'foo', disregardSearchExcludeSettings: true }, CancellationToken.None);
	});

	test('exclude defaults', () => {
		configService.setUserConfiguration('search', {
			'exclude': { 'searchExclude': true }
		});
		configService.setUserConfiguration('files', {
			'exclude': { 'filesExclude': true }
		});

		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries.length, 1);
				assert.strictEqual(query.folderQueries[0].disregardIgnoreFiles, true);
				assert.strictEqual(query.folderQueries[0].excludePattern?.length, 1);
				assert.deepStrictEqual(query.folderQueries[0].excludePattern[0].pattern, { 'filesExclude': true });

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { }, $acceptWorkspaceFolderLocations: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', disregardSearchExcludeSettings: true }, CancellationToken.None);
	});

	test('disregard excludes', () => {
		configService.setUserConfiguration('search', {
			'exclude': { 'searchExclude': true }
		});
		configService.setUserConfiguration('files', {
			'exclude': { 'filesExclude': true }
		});

		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.deepStrictEqual(query.folderQueries[0].excludePattern, []);
				assert.deepStrictEqual(query.excludePattern, undefined);

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { }, $acceptWorkspaceFolderLocations: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', disregardSearchExcludeSettings: true, disregardExcludeSettings: true }, CancellationToken.None);
	});

	test('do not disregard anything if disregardExcludeSettings is true', () => {
		configService.setUserConfiguration('search', {
			'exclude': { 'searchExclude': true }
		});
		configService.setUserConfiguration('files', {
			'exclude': { 'filesExclude': true }
		});

		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries.length, 1);
				assert.strictEqual(query.folderQueries[0].disregardIgnoreFiles, true);
				assert.deepStrictEqual(query.folderQueries[0].excludePattern, []);

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { }, $acceptWorkspaceFolderLocations: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', disregardExcludeSettings: true, disregardSearchExcludeSettings: false }, CancellationToken.None);
	});

	test('exclude string', () => {
		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.deepStrictEqual(query.folderQueries[0].excludePattern, []);
				assert.deepStrictEqual({ ...query.excludePattern }, { 'exclude/**': true });

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { }, $acceptWorkspaceFolderLocations: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', excludePattern: [{ pattern: 'exclude/**' }], disregardSearchExcludeSettings: true }, CancellationToken.None);
	});
	test('Valid revived URI after moving to EH', () => {
		const uriComponents: UriComponents = {
			scheme: 'test',
			path: '/Users/username/Downloads',
		};
		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries?.length, 1);
				assert.ok(URI.isUri(query.folderQueries[0].folder));
				assert.strictEqual(query.folderQueries[0].folder.path, '/Users/username/Downloads');
				assert.strictEqual(query.folderQueries[0].folder.scheme, 'test');

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { }, $acceptWorkspaceFolderLocations: () => { } })));
		return mtw.$startFileSearch(uriComponents, { filePattern: '*.md' }, CancellationToken.None);
	});

	test('pushes the locations of the workspace folders to the extension host', async () => {
		const pushed: IWorkspaceFolderLocationsDto[][] = [];
		disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({
			$initializeWorkspace: () => { },
			$acceptWorkspaceFolderLocations: (data: IWorkspaceFolderLocationsDto[]) => { pushed.push(data); }
		})));
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.ok(pushed.length > 0);
		for (const [data] of pushed) {
			assert.strictEqual(data.locations.filter(l => l.isCurrent).length, 1);
			assert.strictEqual(data.locations[0].isPrimary, true);
		}
	});
	suite('location resolution lifetime', () => {

		const folder = URI.file('/work/repo');

		function location(uri: URI): IFolderLocation {
			return { uri, label: uri.path };
		}

		function setup2(context?: Partial<IWorkspaceContextService>) {
			const changes = disposables.add(new Emitter<IFolderLocationChangeEvent>());
			const requests: DeferredPromise<IFolderLocation[]>[] = [];
			instantiationService.stub(IWorkspaceFolderLocationService, {
				onDidChangeLocation: changes.event,
				onDidChangeProviders: Event.None,
				// ignores the cancellation token on purpose
				getLocations: () => {
					const request = new DeferredPromise<IFolderLocation[]>();
					requests.push(request);
					return request.p;
				}
			});
			if (context) {
				instantiationService.stub(IWorkspaceContextService, context);
			} else {
				instantiationService.stub(IWorkspaceContextService, new class {
					getWorkspace() { return testWorkspace(folder); }
					hasWorkspaceData() { return true; }
					getCompleteWorkspace() { return Promise.resolve(testWorkspace(folder)); }
					getWorkbenchState() { return WorkbenchState.FOLDER; }
					onDidChangeWorkspaceFolders = Event.None;
					onDidChangeWorkbenchState = Event.None;
				} as unknown as IWorkspaceContextService);
			}
			const pushed: IWorkspaceFolderLocationsDto[][] = [];
			const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({
				$initializeWorkspace: () => { },
				$acceptWorkspaceData: () => { },
				$acceptWorkspaceFolderLocations: (data: IWorkspaceFolderLocationsDto[]) => { pushed.push(data); }
			})));
			return { changes, requests, pushed, mtw };
		}

		const tick = () => new Promise(resolve => setTimeout(resolve, 0));

		test('a stale resolve does not overwrite a newer one', async () => {
			const { changes, requests, pushed } = setup2();
			await tick();
			changes.fire({} as IFolderLocationChangeEvent);
			assert.strictEqual(requests.length, 2);

			requests[1].complete([location(URI.file('/work/b'))]);
			await tick();
			requests[0].complete([location(URI.file('/work/a'))]);
			await tick();

			assert.deepStrictEqual(pushed.map(p => p[0].locations.map(l => l.uri.path)), [['/work/repo', '/work/b']]);
		});

		test('nothing is pushed after dispose', async () => {
			const { requests, pushed, mtw } = setup2();
			await tick();
			mtw.dispose();
			requests[0].complete([location(URI.file('/work/a'))]);
			await tick();

			assert.deepStrictEqual(pushed, []);
		});

		test('a workspace completing after dispose starts no resolve', async () => {
			const complete = new DeferredPromise<ReturnType<typeof testWorkspace>>();
			const { requests, pushed, mtw } = setup2({
				getWorkspace: () => testWorkspace(folder),
				hasWorkspaceData: () => true,
				getCompleteWorkspace: () => complete.p,
				getWorkbenchState: () => WorkbenchState.FOLDER,
				onDidChangeWorkspaceFolders: Event.None,
				onDidChangeWorkbenchState: Event.None
			});
			mtw.dispose();
			complete.complete(testWorkspace(folder));
			await tick();

			assert.deepStrictEqual({ requests: requests.length, pushed }, { requests: 0, pushed: [] });
		});

		test('a removed and re-added folder does not accept old data', async () => {
			const removed = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
			let current = testWorkspace(folder);
			const { requests, pushed } = setup2({
				getWorkspace: () => current,
				hasWorkspaceData: () => true,
				getCompleteWorkspace: () => Promise.resolve(current),
				getWorkbenchState: () => WorkbenchState.FOLDER,
				onDidChangeWorkspaceFolders: removed.event,
				onDidChangeWorkbenchState: Event.None
			});
			await tick();
			assert.strictEqual(requests.length, 1);

			current = testWorkspace();
			removed.fire({ added: [], removed: [], changed: [] });
			current = testWorkspace(folder);
			removed.fire({ added: [], removed: [], changed: [] });
			assert.strictEqual(requests.length, 2);

			requests[1].complete([location(URI.file('/work/new'))]);
			await tick();
			requests[0].complete([location(URI.file('/work/old'))]);
			await tick();

			assert.deepStrictEqual(pushed.map(p => p[0].locations.map(l => l.uri.path)), [['/work/repo', '/work/new']]);
		});
	});
});
