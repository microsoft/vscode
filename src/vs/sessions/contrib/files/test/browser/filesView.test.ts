/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, WorkbenchState, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { ResourceLabels } from '../../../../../workbench/browser/labels.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IExplorerService } from '../../../../../workbench/contrib/files/browser/files.js';
import { ExplorerView } from '../../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ExplorerDataSource, ExplorerFindProvider, explorerRootErrorEmitter, FilesFilter, FilesRenderer } from '../../../../../workbench/contrib/files/browser/views/explorerViewer.js';
import { LexicographicOptions, SESSIONS_FILES_VIEW_ID, SortOrder } from '../../../../../workbench/contrib/files/common/files.js';
import { ExplorerItem } from '../../../../../workbench/contrib/files/common/explorerModel.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestContextService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionsExplorerView, SessionsSingleRootExplorerView, SingleRootWorkspaceContextService } from '../../browser/filesView.js';

suite('SessionsExplorerView folder reveal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/workspace/folder');
	teardown(() => sinon.restore());

	function createView(openFiles: () => Promise<void>, calls: object[], visible = true) {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.AuxiliaryBar,
		});
		instantiation.stub(IExplorerService, { registerView: () => { } });
		instantiation.stub(ICommandService, {
			executeCommand: async id => {
				calls.push({ command: id });
				await openFiles();
			},
		});
		sinon.stub(ExplorerView.prototype, 'selectResource').callsFake(async (uri, reveal, retry) => {
			calls.push({ select: uri, reveal, retry });
		});
		const view = store.add(instantiation.createInstance(SessionsExplorerView, {
			id: SESSIONS_FILES_VIEW_ID,
			title: 'Files',
			delegate: { willOpenElement: () => { }, didOpenElement: () => { } },
		}));
		sinon.stub(view, 'isExpanded').returns(true);
		view.setVisible(visible);
		return view;
	}

	test('waits for Files tab activation before selecting a folder in a reopened panel', async () => {
		const activation = new DeferredPromise<void>();
		const calls: object[] = [];
		const view = createView(() => activation.p, calls);
		const selection = view.selectResource(resource, 'force');
		const whileActivating = [...calls];
		await activation.complete();
		await selection;
		assert.deepStrictEqual({ whileActivating, calls }, {
			whileActivating: [{ command: NEW_FILE_TAB_COMMAND_ID }],
			calls: [
				{ command: NEW_FILE_TAB_COMMAND_ID },
				{ select: resource, reveal: 'force', retry: 0 },
			],
		});
	});

	test('waits for the sidebar to become visible after Files tab activation completes', async () => {
		const activated = new DeferredPromise<void>();
		const calls: object[] = [];
		const view = createView(async () => { await activated.complete(); }, calls, false);
		const selection = view.selectResource(resource, 'force');
		await activated.p;
		await timeout(0);
		const beforeVisibility = [...calls];
		view.setVisible(true);
		await selection;
		assert.deepStrictEqual({ beforeVisibility, calls }, {
			beforeVisibility: [{ command: NEW_FILE_TAB_COMMAND_ID }],
			calls: [
				{ command: NEW_FILE_TAB_COMMAND_ID },
				{ select: resource, reveal: 'force', retry: 0 },
			],
		});
	});

	for (const { uri, reveal, retry } of [
		{ uri: resource, reveal: true, retry: 0 },
		{ uri: resource, reveal: 'force', retry: 1 },
		{ uri: undefined, reveal: 'force', retry: 0 },
	] as const) {
		test(`does not change tabs for automatic selection or retries (${reveal}, ${retry}, ${uri})`, async () => {
			const calls: object[] = [];
			const view = createView(async () => { }, calls);
			await view.selectResource(uri, reveal, retry);
			assert.deepStrictEqual(calls, [{ select: uri, reveal, retry }]);
		});
	}

	test('propagates Files tab activation failures without selecting a hidden tree', async () => {
		const error = new Error('Files activation failed');
		const calls: object[] = [];
		const view = createView(async () => { throw error; }, calls);
		await assert.rejects(view.selectResource(resource, 'force'), error);
		assert.deepStrictEqual(calls, [{ command: NEW_FILE_TAB_COMMAND_ID }]);
	});
});

suite('SessionsSingleRootExplorerView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createFixture() {
		const instantiation = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({ explorer: { expandSingleFolderWorkspaces: false } }),
		}, store);
		instantiation.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.AuxiliaryBar,
		});
		const roots: ExplorerItem[] = [];
		instantiation.stub(IExplorerService, {
			roots,
			registerView: () => { },
			sortOrderConfiguration: { sortOrder: SortOrder.Default, lexicographicOptions: LexicographicOptions.Default, reverse: false },
		});
		const contextService = new TestContextService();
		instantiation.stub(IWorkspaceContextService, contextService);
		const createItem = (path: string, parent?: ExplorerItem, isDirectory = true) => new ExplorerItem(URI.file(path), instantiation.get(IFileService), instantiation.get(IConfigurationService), NullFilesConfigurationService, parent, isDirectory);
		const root = createItem('/repo');
		const second = createItem('/second');
		return {
			contextService,
			root,
			second,
			createItem,
			// The workspace folders follow the Explorer roots, as they do in the Agents window.
			setRoots: (...items: ExplorerItem[]) => {
				roots.splice(0, roots.length, ...items);
				contextService.setWorkspace(new Workspace('workspace', items.map((item, index) => new WorkspaceFolder({ uri: item.resource, name: item.name, index })), URI.file('/workspace.code-workspace')));
			},
			createView: (ctor: typeof SessionsExplorerView) => {
				const view = store.add(instantiation.createInstance(ctor, {
					id: SESSIONS_FILES_VIEW_ID,
					title: 'Files',
					delegate: { willOpenElement: () => { }, didOpenElement: () => { } },
				}));
				const treeInputs: (ExplorerItem | ExplorerItem[])[] = [];
				Reflect.set(view, 'tree', {
					getInput: () => undefined,
					setInput: async (input: ExplorerItem | ExplorerItem[]) => { treeInputs.push(Array.isArray(input) ? [...input] : input); },
					expand: async () => true,
				});
				sinon.stub(view, 'isBodyVisible').returns(true);
				// The instantiation service the view creates its tree, data source and renderer with.
				const viewInstantiationService = Reflect.get(view, 'instantiationService') as IInstantiationService;
				return { view, treeInputs, viewInstantiationService };
			},
		};
	}

	const paths = (input: ExplorerItem | ExplorerItem[]) => Array.isArray(input) ? input.map(item => item.resource.path) : input.resource.path;

	test('omits only a single healthy root while the workspace stays a multi-root workbench', async () => {
		const fixture = createFixture();
		const treeInputs = async (ctor: typeof SessionsExplorerView) => {
			const { view, treeInputs } = fixture.createView(ctor);
			fixture.setRoots(fixture.root);
			await view.setTreeInput();
			fixture.setRoots(fixture.root, fixture.second);
			await view.setTreeInput();
			fixture.setRoots(fixture.root);
			fixture.root.error = new Error('Root unavailable');
			await view.setTreeInput();
			fixture.root.error = undefined;
			fixture.setRoots();
			await view.setTreeInput();
			return treeInputs.map(paths);
		};

		assert.deepStrictEqual({
			classic: await treeInputs(SessionsExplorerView),
			singleRoot: await treeInputs(SessionsSingleRootExplorerView),
			workbenchState: fixture.contextService.getWorkbenchState(),
		}, {
			classic: [['/repo'], ['/repo', '/second'], ['/repo'], []],
			singleRoot: ['/repo', ['/repo', '/second'], ['/repo'], []],
			workbenchState: WorkbenchState.WORKSPACE,
		});
	});

	test('shows a failure to read the hidden root in the tree instead of decorating the hidden root', async () => {
		const fixture = createFixture();
		fixture.setRoots(fixture.root);
		sinon.stub(fixture.root, 'fetchChildren').rejects(new Error('Root unavailable'));
		const readRoot = async (ctor: typeof SessionsExplorerView) => {
			const { view, treeInputs, viewInstantiationService } = fixture.createView(ctor);
			const dataSource = viewInstantiationService.createInstance(ExplorerDataSource,
				new class extends mock<FilesFilter>() { },
				new class extends mock<ExplorerFindProvider>() { override isShowingFilterResults() { return false; } });
			const decoratedRoots: string[] = [];
			const listener = explorerRootErrorEmitter.event(resource => decoratedRoots.push(resource.path));
			try {
				await view.setTreeInput();
				// The tree reads the children of the root, whether it is the input or listed in it.
				const children = await dataSource.getChildren(fixture.root);
				return {
					input: paths(treeInputs[0]),
					children: children.map(child => ({ path: child.resource.path, error: child.error?.message })),
					decoratedRoots,
				};
			} finally {
				listener.dispose();
			}
		};

		assert.deepStrictEqual({
			classic: await readRoot(SessionsExplorerView),
			singleRoot: await readRoot(SessionsSingleRootExplorerView),
		}, {
			classic: { input: ['/repo'], children: [], decoratedRoots: ['/repo'] },
			singleRoot: { input: '/repo', children: [{ path: '/repo', error: 'Root unavailable' }], decoratedRoots: [] },
		});
	});

	test('uses accessibility levels that match the visible tree when switching between single and multiple roots', () => {
		const fixture = createFixture();
		const file = fixture.createItem('/repo/file.txt', fixture.root, false);
		const fileLevels = (ctor: typeof SessionsExplorerView) => {
			const { viewInstantiationService } = fixture.createView(ctor);
			const renderer = store.add(viewInstantiationService.createInstance(FilesRenderer,
				document.createElement('div'),
				new class extends mock<ResourceLabels>() { },
				new class extends mock<ConstructorParameters<typeof FilesRenderer>[2]>() { },
				() => { }));
			fixture.setRoots(fixture.root);
			const singleRoot = renderer.getAriaLevel(file);
			fixture.setRoots(fixture.root, fixture.second);
			const multiRoot = renderer.getAriaLevel(file);
			return { singleRoot, multiRoot };
		};

		assert.deepStrictEqual({
			classic: fileLevels(SessionsExplorerView),
			singleRootView: fileLevels(SessionsSingleRootExplorerView),
		}, {
			classic: { singleRoot: 2, multiRoot: 2 },
			singleRootView: { singleRoot: 1, multiRoot: 2 },
		});
	});

	test('reports only a workspace with a single root folder as a single folder workbench', () => {
		const folder = (path: string, index: number) => new WorkspaceFolder({ uri: URI.file(path), name: path.slice(1), index });
		const workbenchState = (folders: WorkspaceFolder[], configuration?: URI) => {
			const contextService = new TestContextService(new Workspace('workspace', folders, configuration));
			return {
				actual: contextService.getWorkbenchState(),
				singleRoot: new SingleRootWorkspaceContextService(contextService).getWorkbenchState(),
			};
		};
		const configuration = URI.file('/workspace.code-workspace');

		assert.deepStrictEqual({
			singleRootWorkspace: workbenchState([folder('/repo', 0)], configuration),
			multiRootWorkspace: workbenchState([folder('/first', 0), folder('/second', 1)], configuration),
			emptyWorkspace: workbenchState([], configuration),
			folder: workbenchState([folder('/repo', 0)]),
			empty: workbenchState([]),
		}, {
			singleRootWorkspace: { actual: WorkbenchState.WORKSPACE, singleRoot: WorkbenchState.FOLDER },
			multiRootWorkspace: { actual: WorkbenchState.WORKSPACE, singleRoot: WorkbenchState.WORKSPACE },
			emptyWorkspace: { actual: WorkbenchState.WORKSPACE, singleRoot: WorkbenchState.WORKSPACE },
			folder: { actual: WorkbenchState.FOLDER, singleRoot: WorkbenchState.FOLDER },
			empty: { actual: WorkbenchState.EMPTY, singleRoot: WorkbenchState.EMPTY },
		});
	});
});
