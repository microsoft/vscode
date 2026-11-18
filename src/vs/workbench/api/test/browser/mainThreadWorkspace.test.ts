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
			onDidChangeLocations: Event.None,
			onDidChangeProviders: Event.None,
			getLocations: async () => [],
			getFolderLocations: async folder => [{ uri: folder.uri, label: folder.name }]
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
		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({
			$initializeWorkspace: () => { },
			$acceptWorkspaceFolderLocations: (data: IWorkspaceFolderLocationsDto[]) => { pushed.push(data); }
		})));
		mtw.$getWorkspaceFolderLocations();
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.ok(pushed.length > 0);
	});
	suite('location resolution lifetime', () => {

		const folder = URI.file('/work/repo');

		function location(uri: URI): IFolderLocation {
			return { uri, label: uri.path };
		}

		async function setup2(context?: Partial<IWorkspaceContextService>, requested = true) {
			const changes = disposables.add(new Emitter<IFolderLocationChangeEvent>());
			const requests: DeferredPromise<IFolderLocation[]>[] = [];
			instantiationService.stub(IWorkspaceFolderLocationService, {
				onDidChangeLocation: Event.None,
				onDidChangeLocations: Event.map(changes.event, () => undefined),
				onDidChangeProviders: Event.None,
				getLocations: async () => [],
				// ignores the cancellation token on purpose
				getFolderLocations: () => {
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
			if (requested) {
				// let the deferred workspace initialization settle before the extension host asks
				await tick();
				mtw.$getWorkspaceFolderLocations();
			}
			return { changes, requests, pushed, mtw };
		}

		const tick = () => new Promise(resolve => setTimeout(resolve, 0));

		test('no locations are resolved until an extension host consumer asks', async () => {
			const { changes, requests, mtw } = await setup2(undefined, false);
			await tick();
			changes.fire({} as IFolderLocationChangeEvent);
			await tick();
			assert.strictEqual(requests.length, 0);

			mtw.$getWorkspaceFolderLocations();
			assert.strictEqual(requests.length, 1);
		});

		test('a stale resolve does not overwrite a newer one', async () => {
			const { changes, requests, pushed } = await setup2();
			changes.fire({} as IFolderLocationChangeEvent);
			assert.strictEqual(requests.length, 2);

			requests[1].complete([location(URI.file('/work/b'))]);
			await tick();
			requests[0].complete([location(URI.file('/work/a'))]);
			await tick();

			assert.deepStrictEqual(pushed.map(p => p[0].locations.map(l => l.uri.path)), [['/work/b']]);
		});

		test('nothing is pushed after dispose', async () => {
			const { requests, pushed, mtw } = await setup2();
			mtw.dispose();
			requests[0].complete([location(URI.file('/work/a'))]);
			await tick();

			assert.deepStrictEqual(pushed, []);
		});

		test('a workspace completing after dispose starts no resolve', async () => {
			const complete = new DeferredPromise<ReturnType<typeof testWorkspace>>();
			const { requests, pushed, mtw } = await setup2({
				getWorkspace: () => testWorkspace(folder),
				hasWorkspaceData: () => true,
				getCompleteWorkspace: () => complete.p,
				getWorkbenchState: () => WorkbenchState.FOLDER,
				onDidChangeWorkspaceFolders: Event.None,
				onDidChangeWorkbenchState: Event.None
			}, false);
			mtw.dispose();
			complete.complete(testWorkspace(folder));
			await tick();
			mtw.$getWorkspaceFolderLocations();

			assert.deepStrictEqual({ requests: requests.length, pushed }, { requests: 0, pushed: [] });
		});

		test('a removed and re-added folder does not accept old data', async () => {
			const removed = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
			let current = testWorkspace(folder);
			const { requests, pushed } = await setup2({
				getWorkspace: () => current,
				hasWorkspaceData: () => true,
				getCompleteWorkspace: () => Promise.resolve(current),
				getWorkbenchState: () => WorkbenchState.FOLDER,
				onDidChangeWorkspaceFolders: removed.event,
				onDidChangeWorkbenchState: Event.None
			});
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

			assert.deepStrictEqual(pushed.map(p => p[0].locations.map(l => l.uri.path)), [['/work/new']]);
		});

		test('the pushed model comes from the location service', async () => {
			const { requests, pushed } = await setup2();
			requests[0].complete([{ uri: folder, label: 'repo' }, location(URI.file('/work/wt'))]);
			await tick();
			assert.deepStrictEqual(pushed.map(p => p[0].locations.map(l => [l.uri.path, l.name])), [[['/work/repo', 'repo'], ['/work/wt', '/work/wt']]]);
		});

		test('a service locations change resolves and pushes again', async () => {
			const { requests, pushed, changes } = await setup2();
			requests[0].complete([location(folder)]);
			await tick();
			changes.fire({} as IFolderLocationChangeEvent);
			assert.strictEqual(requests.length, 2);
			requests[1].complete([location(folder), location(URI.file('/work/wt'))]);
			await tick();
			assert.deepStrictEqual(pushed.map(p => p[0].locations.length), [1, 2]);
		});
	});
});
