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
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AgentsChatPartComposerFolders } from '../../../browser/agentsView/agentsChatPartComposerFolders.js';

suite('AgentsChatPartComposerFolders', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const worktree = (path: string, branch: string): IFolderLocation => ({ uri: URI.file(path), label: path.split('/').pop()!, description: branch, icon: Codicon.gitBranchCheckout });

	function create(options: { folders: { uri: string; primaryUri?: string }[]; remote?: boolean; currentLocation?: IFolderLocation; noLocations?: boolean }) {
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidChangeProviders = store.add(new Emitter<void>());
		let folders = options.folders;
		let locations: IFolderLocation[] = options.noLocations ? [] : [worktree('/work/vscode.worktrees/a', 'feature-a'), worktree('/work/vscode.worktrees/b', 'feature-b')];
		const asked: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(folder => upcastPartial<IWorkspaceFolder>({ uri: URI.file(folder.uri), primaryUri: folder.primaryUri ? URI.file(folder.primaryUri) : undefined })) }),
			getWorkbenchState: () => folders.length === 1 ? WorkbenchState.FOLDER : folders.length ? WorkbenchState.WORKSPACE : WorkbenchState.EMPTY,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: onDidChangeProviders.event,
			onDidChangeCurrentLocation: Event.None,
			currentLocation: options.currentLocation && { ...options.currentLocation, providerId: 'agentsView.linkedCheckouts', builtIn: true },
			getLocations: async primary => { asked.push(primary.path); return locations; },
		}));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: options.remote ? 'ssh-remote+host' : undefined }));
		const composerFolders = store.add(instantiationService.createInstance(AgentsChatPartComposerFolders));
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
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/work/vscode') })] }),
			getWorkbenchState: () => WorkbenchState.FOLDER,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeCurrentLocation: Event.None,
			getLocations: (_primary, cancellation) => { token = cancellation; return read.p; },
		}));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: undefined }));
		const composerFolders = instantiationService.createInstance(AgentsChatPartComposerFolders);
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
});
