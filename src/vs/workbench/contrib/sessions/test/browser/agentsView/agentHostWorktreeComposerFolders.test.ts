/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { EditorWindowComposerFoldersService, IEditorWindowComposerFolderOptions, IEditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';
import { AgentHostWorktreeComposerFolders, AgentHostWorktreeComposerFoldersContribution } from '../../../browser/agentsView/agentHostWorktreeComposerFolders.js';
import { IAgentHostWorktreeLocations } from '../../../../chat/browser/agentSessions/agentHost/agentHostWorktreeLocationsService.js';

suite('AgentHostWorktreeComposerFolders', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const worktree = (path: string, branch: string): IFolderLocation => ({ uri: URI.file(path), label: path.split('/').pop()!, description: branch, icon: Codicon.gitBranchCheckout });

	/** The forms of a folder as the agent host's locations know them: itself, and its real path where it is another. */
	function worktreeLocations(realPaths: Record<string, string> = {}) {
		return upcastPartial<IAgentHostWorktreeLocations>({ getFolderForms: (folder: URI) => realPaths[folder.path] ? [folder, URI.file(realPaths[folder.path])] : [folder] });
	}

	function create(options: { folders: { uri: string; primaryUri?: string }[]; remote?: boolean; currentLocation?: IFolderLocation; noLocations?: boolean; locations?: IFolderLocation[]; realPaths?: Record<string, string> }) {
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidChangeProviders = store.add(new Emitter<void>());
		const onDidChangeWorkbenchState = store.add(new Emitter<WorkbenchState>());
		let folders = options.folders;
		let locations: IFolderLocation[] = options.locations ?? (options.noLocations ? [] : [worktree('/work/vscode.worktrees/a', 'feature-a'), worktree('/work/vscode.worktrees/b', 'feature-b')]);
		const onDidChangeLocations = store.add(new Emitter<void>());
		const asked: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		// The workspace's own location is the folder's primary location; it does not change as the folder moves
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({
				uri: folders.length === 1 ? URI.file(folders[0].primaryUri ?? folders[0].uri) : undefined,
				folders: folders.map(folder => upcastPartial<IWorkspaceFolder>({ uri: URI.file(folder.uri) })),
			}),
		}));
		// As the workspace answers: only the folder of a local single-folder window can move
		const atAlternate = (folder: IWorkspaceFolder) => folders.some(candidate => candidate.primaryUri && candidate.uri === folder.uri.path);
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: onDidChangeProviders.event,
			onDidChangeLocations: onDidChangeLocations.event,
			onDidChangeLocation: Event.None,
			// As the service has it: whether a folder can move changes also as the window's folders change
			onDidChangeCanSetLocation: Event.any<unknown>(onDidChangeWorkbenchState.event, onDidChangeWorkspaceFolders.event) as Event<void>,
			canSetLocation: () => folders.length === 1 && !options.remote,
			isAtAlternateLocation: atAlternate,
			getLocation: folder => atAlternate(folder) && options.currentLocation ? { ...options.currentLocation, providerId: 'agentHost.sessionWorktrees', builtIn: true } : undefined,
			getLocations: async primary => { asked.push(primary.path); return locations; },
		}));
		instantiationService.stub(IAgentHostWorktreeLocations, worktreeLocations(options.realPaths));
		const composerFolders = store.add(instantiationService.createInstance(AgentHostWorktreeComposerFolders));
		composerFolders.refresh();
		return {
			composerFolders,
			asked,
			snapshot: () => ({
				folders: composerFolders.folders.get().map(uri => uri.path),
				presentations: composerFolders.folders.get().map(uri => composerFolders.getPresentation(uri)?.description ?? null),
			}),
			moveTo: (next: { uri: string; primaryUri?: string }[]) => { folders = next; onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] }); },
			addWorktree: (location: IFolderLocation) => { locations = [...locations, location]; },
			providersChanged: () => onDidChangeProviders.fire(),
			locationsChanged: () => onDidChangeLocations.fire(),
		};
	}

	test('offers the folder of a local window and its linked checkouts, by their branch, from the folder\'s primary location also while the folder is at one of them', async () => {
		const { composerFolders, asked, snapshot, moveTo, addWorktree } = create({ folders: [{ uri: '/work/vscode' }] });
		await timeout(0);
		const atPrimary = snapshot();
		moveTo([{ uri: '/work/vscode.worktrees/a', primaryUri: '/work/vscode' }]);
		await timeout(0);
		const atWorktree = snapshot();
		addWorktree(worktree('/work/vscode.worktrees/c', 'feature-c'));
		composerFolders.refresh();
		await timeout(0);

		assert.deepStrictEqual({ atPrimary, atWorktree, afterNewWorktree: snapshot().folders, asked }, {
			atPrimary: { folders: ['/work/vscode', '/work/vscode.worktrees/a', '/work/vscode.worktrees/b'], presentations: [null, 'feature-a', 'feature-b'] },
			atWorktree: { folders: ['/work/vscode.worktrees/a', '/work/vscode', '/work/vscode.worktrees/b'], presentations: ['feature-a', null, 'feature-b'] },
			afterNewWorktree: ['/work/vscode.worktrees/a', '/work/vscode', '/work/vscode.worktrees/b', '/work/vscode.worktrees/c'],
			asked: ['/work/vscode', '/work/vscode', '/work/vscode'],
		});
	});

	test('reads the folder\'s locations once as the window\'s folders change, which also changes whether the folder can move', async () => {
		const { asked, moveTo } = create({ folders: [{ uri: '/work/vscode' }] });
		await timeout(0);
		asked.splice(0);
		moveTo([{ uri: '/work/vscode.worktrees/a', primaryUri: '/work/vscode' }]);
		await timeout(0);

		assert.deepStrictEqual(asked, ['/work/vscode']);
	});

	test('as the window\'s folder moves to another location, it offers it at once and tells where it moved from and to; not as it changes to another repository', async () => {
		const { composerFolders, snapshot, moveTo } = create({ folders: [{ uri: '/work/vscode' }] });
		const moves: string[] = [];
		store.add(composerFolders.onDidMoveFolder(({ from, to }) => moves.push(`${from.path} -> ${to.path}`)));
		await timeout(0);
		moveTo([{ uri: '/work/vscode.worktrees/a', primaryUri: '/work/vscode' }]);
		const atOnce = snapshot().folders;
		await timeout(0);
		moveTo([{ uri: '/work/other' }]);

		assert.deepStrictEqual({ atOnce, moves }, {
			atOnce: ['/work/vscode.worktrees/a', '/work/vscode', '/work/vscode.worktrees/b'],
			moves: ['/work/vscode -> /work/vscode.worktrees/a'],
		});
	});

	test('the location the window\'s folder is at shows as that worktree, by its branch, also where its provider lists none', async () => {
		const { snapshot } = create({ folders: [{ uri: '/work/vscode.worktrees/a', primaryUri: '/work/vscode' }], currentLocation: worktree('/work/vscode.worktrees/a', 'feature-a'), noLocations: true });
		await timeout(0);

		assert.deepStrictEqual(snapshot(), { folders: ['/work/vscode.worktrees/a', '/work/vscode'], presentations: ['feature-a', null] });
	});

	test('in a window at a worktree, the primary folder presents as a folder and the current worktree as the current worktree', async () => {
		const { composerFolders } = create({ folders: [{ uri: '/work/vscode.worktrees/a', primaryUri: '/work/vscode' }], currentLocation: worktree('/work/vscode.worktrees/a', 'feature-a') });
		await timeout(0);
		const present = (path: string) => {
			const presentation = composerFolders.getPresentation(URI.file(path));
			return { kind: presentation?.kind, current: presentation?.current };
		};

		assert.deepStrictEqual({ primary: present('/work/vscode'), current: present('/work/vscode.worktrees/a'), other: present('/work/vscode.worktrees/b') }, {
			primary: { kind: 'folder', current: false },
			current: { kind: 'worktree', current: true },
			other: { kind: 'worktree', current: false },
		});
	});

	test('offers only the window\'s folders where its folder cannot move: several folders, a remote window, no folder', async () => {
		const multiRoot = create({ folders: [{ uri: '/work/vscode' }, { uri: '/work/tools' }] });
		const remote = create({ folders: [{ uri: '/work/vscode' }], remote: true });
		const empty = create({ folders: [] });
		await timeout(0);

		assert.deepStrictEqual({ multiRoot: multiRoot.snapshot().folders, remote: remote.snapshot().folders, empty: empty.snapshot().folders, asked: [...multiRoot.asked, ...remote.asked, ...empty.asked] }, {
			multiRoot: ['/work/vscode', '/work/tools'],
			remote: ['/work/vscode'],
			empty: [],
			asked: [],
		});
	});

	test('cancels a read under way as it is disposed, and does not take its result', async () => {
		const read = new DeferredPromise<IFolderLocation[]>();
		let token: CancellationToken | undefined;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: URI.file('/work/vscode'), folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/work/vscode') })] }),
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocations: Event.None,
			onDidChangeLocation: Event.None,
			onDidChangeCanSetLocation: Event.None,
			canSetLocation: () => true,
			isAtAlternateLocation: () => false,
			getLocations: (_primary, cancellation) => { token = cancellation; return read.p; },
		}));
		instantiationService.stub(IAgentHostWorktreeLocations, worktreeLocations());
		const composerFolders = instantiationService.createInstance(AgentHostWorktreeComposerFolders);
		composerFolders.refresh();
		composerFolders.dispose();
		const cancelled = token?.isCancellationRequested;
		read.complete([worktree('/work/vscode.worktrees/a', 'feature-a')]);
		await timeout(0);

		assert.deepStrictEqual({ cancelled, folders: composerFolders.folders.get().map(uri => uri.path) }, { cancelled: true, folders: ['/work/vscode'] });
	});

	test('reads the locations again as providers change', async () => {
		const { asked, providersChanged } = create({ folders: [{ uri: '/work/vscode' }] });
		await timeout(0);
		providersChanged();
		await timeout(0);

		assert.deepStrictEqual(asked, ['/work/vscode', '/work/vscode']);
	});

	test('offers a worktree that a session in the background comes to work in, as the folder\'s locations change, while the folder stays where it is', async () => {
		const { asked, snapshot, addWorktree, locationsChanged } = create({ folders: [{ uri: '/work/vscode' }] });
		await timeout(0);
		asked.splice(0);
		addWorktree(worktree('/work/vscode.worktrees/c', 'feature-c'));
		locationsChanged();
		await timeout(0);

		assert.deepStrictEqual({ folders: snapshot().folders, asked }, {
			folders: ['/work/vscode', '/work/vscode.worktrees/a', '/work/vscode.worktrees/b', '/work/vscode.worktrees/c'],
			asked: ['/work/vscode'],
		});
	});

	test('offers a folder the agent host names by its real path once, as the window names it, and the composers match either form of a folder and of the paths inside it, an equal folder before a containing one', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: URI.file('/tmp/wt'), folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/tmp/wt') })] }),
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocations: Event.None,
			onDidChangeLocation: Event.None,
			onDidChangeCanSetLocation: Event.None,
			canSetLocation: () => true,
			isAtAlternateLocation: () => false,
			getLocation: () => undefined,
			// As the agent host names them: by their real paths
			getLocations: async () => [worktree('/private/tmp/wt', 'main'), worktree('/private/tmp/wt/nested', 'feature-n')],
		}));
		instantiationService.stub(IAgentHostWorktreeLocations, worktreeLocations({ '/tmp/wt': '/private/tmp/wt' }));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true }));
		const contextKeyService = store.add(new MockContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		const service = instantiationService.createInstance(EditorWindowComposerFoldersService);
		// The options as the contribution provides them, with its hooks, which the service uses as it maps a folder
		let provided: (() => IEditorWindowComposerFolderOptions) | undefined;
		instantiationService.stub(IEditorWindowComposerFoldersService, upcastPartial<IEditorWindowComposerFoldersService>({
			setComposerFolderOptions: provider => { provided = provider; return service.setComposerFolderOptions(provider); },
			retargetComposerFolders: (to: URI, from: URI) => service.retargetComposerFolders(to, from),
		}));
		store.add(instantiationService.createInstance(AgentHostWorktreeComposerFoldersContribution));
		await timeout(0);
		const options = provided!();
		const tmp = URI.file('/tmp/wt');

		assert.deepStrictEqual({
			offered: options.allowedFolders?.get().map(uri => uri.path),
			isSameFolder: options.isSameFolder?.(tmp, URI.file('/private/tmp/wt')),
			isInFolder: options.isInFolder?.(tmp, URI.file('/private/tmp/wt/src')),
			notInFolder: options.isInFolder?.(tmp, URI.file('/private/tmp/other')),
			allowed: ['/private/tmp/wt', '/private/tmp/wt/src', '/private/tmp/wt/nested'].map(path => service.toAllowedFolder(URI.file(path))?.path),
		}, {
			offered: ['/tmp/wt', '/private/tmp/wt/nested'],
			isSameFolder: true,
			isInFolder: true,
			notInFolder: false,
			allowed: ['/tmp/wt', '/tmp/wt', '/private/tmp/wt/nested'],
		});
	});

	test('with worktree support and AI features on, the composers offer the folder\'s locations and follow the folder as it moves, without a chat part', async () => {
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		let at = '/work/vscode';
		const configurationService = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true });
		const contextKeyService = store.add(new MockContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		const calls: string[] = [];
		let options: (() => IEditorWindowComposerFolderOptions) | undefined;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: URI.file('/work/vscode'), folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file(at) })] }),
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocations: Event.None,
			onDidChangeLocation: Event.None,
			onDidChangeCanSetLocation: onDidChangeWorkspaceFolders.event as Event<unknown> as Event<void>,
			canSetLocation: () => true,
			isAtAlternateLocation: folder => folder.uri.path !== '/work/vscode',
			getLocation: () => undefined,
			getLocations: async () => [worktree('/work/vscode.worktrees/a', 'feature-a')],
		}));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		instantiationService.stub(IAgentHostWorktreeLocations, worktreeLocations());
		// No chat part: the service of the window's composers only
		instantiationService.stub(IEditorWindowComposerFoldersService, upcastPartial<IEditorWindowComposerFoldersService>({
			setComposerFolderOptions: provider => { calls.push('options'); options = provider; return toDisposable(() => { calls.push('options cleared'); options = undefined; }); },
			retargetComposerFolders: (to: URI, from: URI) => { calls.push(`retarget ${from.path} -> ${to.path}`); },
		}));
		store.add(instantiationService.createInstance(AgentHostWorktreeComposerFoldersContribution));
		await timeout(0);
		const offered = options?.().allowedFolders?.get().map(uri => uri.path);
		at = '/work/vscode.worktrees/a';
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		configurationService.setUserConfiguration(ChatConfiguration.EditorWindowEnableWorktree, false);
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === ChatConfiguration.EditorWindowEnableWorktree } as never);

		assert.deepStrictEqual({ offered, calls }, {
			offered: ['/work/vscode', '/work/vscode.worktrees/a'],
			calls: ['options', 'retarget /work/vscode -> /work/vscode.worktrees/a', 'options cleared'],
		});
	});

	test('as the folder moves, every composer of the window registered with the service follows it, the chat part\'s and the Chat view\'s alike, without the chat part', async () => {
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		let at = '/work/vscode';
		const contextKeyService = store.add(new MockContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: URI.file('/work/vscode'), folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file(at) })] }),
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocations: Event.None,
			onDidChangeLocation: Event.None,
			onDidChangeCanSetLocation: onDidChangeWorkspaceFolders.event as Event<unknown> as Event<void>,
			canSetLocation: () => true,
			isAtAlternateLocation: folder => folder.uri.path !== '/work/vscode',
			getLocation: () => undefined,
			getLocations: async () => [],
		}));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true }));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		instantiationService.stub(IAgentHostWorktreeLocations, worktreeLocations());
		const service = instantiationService.createInstance(EditorWindowComposerFoldersService);
		instantiationService.stub(IEditorWindowComposerFoldersService, service);
		const retargeted: string[] = [];
		const composer = (name: string) => ({ retargetFolder: (folder: URI, from?: URI) => { retargeted.push(`${name}: ${from?.path} -> ${folder.path}`); return true; } });
		store.add(service.registerComposer(composer('chat part')));
		store.add(service.registerComposer(composer('Chat view')));
		store.add(instantiationService.createInstance(AgentHostWorktreeComposerFoldersContribution));
		at = '/work/vscode.worktrees/a';
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });

		assert.deepStrictEqual(retargeted, ['chat part: /work/vscode -> /work/vscode.worktrees/a', 'Chat view: /work/vscode -> /work/vscode.worktrees/a']);
	});
});
