/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService, IFileSystemProviderRegistrationEvent } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IRecentlyOpened, isRecentFolder, IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ISessionsProvidersService } from '../../browser/sessionsProvidersService.js';
import { SessionsRecentWorkspacesService } from '../../browser/sessionsRecentWorkspacesService.js';
import { ISessionsProvider } from '../../common/sessionsProvider.js';

suite('SessionsRecentWorkspacesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const workspaceFile = URI.file(isWindows ? 'c:\\workspaces\\project.code-workspace' : '/workspaces/project.code-workspace');
	const firstFolder = URI.file(isWindows ? 'c:\\first' : '/first');
	const secondFolder = URI.file(isWindows ? 'c:\\second' : '/second');

	function recentWorkspace(configPath = workspaceFile, remoteAuthority?: string) {
		return { workspace: { id: extUri.getComparisonKey(configPath), configPath }, remoteAuthority };
	}

	function createHarness(
		initialRecents: IRecentlyOpened['workspaces'],
		files: ReadonlyMap<string, string | DeferredPromise<string>> = new Map(),
		storage: IStorageService = disposables.add(new TestStorageService()),
		initialLookup?: () => Promise<IRecentlyOpened>,
		providedProviders?: readonly ISessionsProvider[],
	) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const changed = disposables.add(new Emitter<void>());
		const fileProvidersChanged = disposables.add(new Emitter<IFileSystemProviderRegistrationEvent>());
		const reads: { uri: URI; sizeLimit?: number; token?: CancellationToken }[] = [];
		const removed: URI[][] = [];
		const warnings: string[] = [];
		let recents = initialRecents;
		let lookup = initialLookup;
		let fileProviderAvailable = true;
		const provider = upcastPartial<ISessionsProvider>({
			id: 'provider',
			resolveWorkspace: uri => ({
				uri, label: 'workspace', icon: Codicon.folder,
				folders: [{ root: uri, workingDirectory: uri, name: 'folder', description: undefined }],
				requiresWorkspaceTrust: true, isVirtualWorkspace: false,
			}),
		});
		const providers = providedProviders ?? [provider];
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>(id: string) => providers.find(provider => provider.id === id) as T | undefined,
			getProviders: () => [...providers],
		}));
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ warn: message => warnings.push(message) }));
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			onDidChangeFileSystemProviderRegistrations: fileProvidersChanged.event,
			hasProvider: () => fileProviderAvailable,
			readFile: async (uri, options, token) => {
				reads.push({ uri, sizeLimit: options?.limits?.size, token });
				const content = files.get(extUri.getComparisonKey(uri));
				if (content === undefined) {
					throw new Error('Workspace file not found');
				}
				return upcastPartial<IFileContent>({ value: VSBuffer.fromString(typeof content === 'string' ? content : await content.p) });
			},
		}));
		instantiationService.stub(IWorkspacesService, upcastPartial<IWorkspacesService>({
			onDidChangeRecentlyOpened: changed.event,
			getRecentlyOpened: () => lookup ? lookup() : Promise.resolve({ workspaces: recents, files: [] }),
			removeRecentlyOpened: async uris => {
				removed.push(uris);
				recents = recents.filter(entry => !isRecentFolder(entry) || !uris.some(uri => extUri.isEqual(uri, entry.folderUri)));
				changed.fire();
			},
		}));
		const service = disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService));
		return {
			service, storage, reads, removed, warnings, changed, fileProvidersChanged,
			ready: () => waitForState(service.historyLoadState, state => state !== 'loading'),
			refresh(entries = recents) {
				recents = entries;
				lookup = undefined;
				changed.fire();
			},
			set fileProviderAvailable(value: boolean) { fileProviderAvailable = value; },
		};
	}

	function snapshot(service: SessionsRecentWorkspacesService) {
		return service.getRecentWorkspaces().map(entry => ({
			uri: entry.workspace.uri.toString(), source: entry.source, checked: entry.checked,
		}));
	}

	test('history-only additions preserve the checked workspace and its provider', () => {
		const { service } = createHarness([]);
		service.addRecentWorkspace(firstFolder, 'provider', true);
		service.addRecentWorkspace(secondFolder, 'provider', undefined);
		service.addRecentWorkspace(firstFolder, 'other-provider', undefined);

		assert.deepStrictEqual(service.getRecentWorkspaces(false).map(entry => ({
			uri: entry.workspace.uri, providerId: entry.providerId, checked: entry.checked,
		})), [
			{ uri: firstFolder, providerId: 'provider', checked: true },
			{ uri: secondFolder, providerId: 'provider', checked: false },
		]);
	});

	test('history-only additions retain the checked entry within the history capacity', () => {
		const { service } = createHarness([]);
		service.addRecentWorkspace(firstFolder, 'provider', true);
		const folders = Array.from({ length: 12 }, (_, index) => URI.file(`/history-${index}`));
		for (const folder of folders) {
			service.addRecentWorkspace(folder, 'provider', undefined);
		}

		assert.deepStrictEqual(service.getRecentWorkspaces(false).map(entry => ({
			uri: entry.workspace.uri, checked: entry.checked,
		})), [
			...folders.slice(-9).reverse().map(uri => ({ uri, checked: false })),
			{ uri: firstFolder, checked: true },
		]);
	});

	test('history-only additions preserve No workspace across service recreation', () => {
		const { service, storage } = createHarness([]);
		service.addRecentWorkspace(firstFolder, 'provider', true);
		service.checkNoWorkspace();
		service.addRecentWorkspace(secondFolder, 'provider', undefined);
		const restored = createHarness([], new Map(), storage).service;

		assert.deepStrictEqual({
			noWorkspace: restored.isNoWorkspaceChecked(),
			recents: snapshot(restored),
		}, {
			noWorkspace: true,
			recents: [
				{ uri: secondFolder.toString(), source: 'agents', checked: false },
				{ uri: firstFolder.toString(), source: 'agents', checked: false },
			],
		});
	});

	test('history-only additions without a checked entry remain bounded and do not check one', () => {
		const { service } = createHarness([]);
		const folders = Array.from({ length: 12 }, (_, index) => URI.parse(`vscode-agent-host://ssh-host/history-${index}`));
		for (const folder of folders) {
			service.addRecentWorkspace(folder, 'provider', undefined);
		}

		assert.deepStrictEqual({
			noWorkspace: service.isNoWorkspaceChecked(),
			recents: service.getRecentWorkspaces(false).map(entry => ({
				uri: entry.workspace.uri, providerId: entry.providerId, checked: entry.checked,
			})),
		}, {
			noWorkspace: false,
			recents: folders.slice(-10).reverse().map(uri => ({ uri, providerId: 'provider', checked: false })),
		});
	});

	test('history-only additions do not undo explicit workspace dismissal', () => {
		const { service } = createHarness([]);
		service.addRecentWorkspace(firstFolder, 'provider', true);
		service.removeRecentWorkspace(firstFolder);
		service.addRecentWorkspace(firstFolder, 'provider', undefined);

		assert.deepStrictEqual({
			dismissed: service.isWorkspaceDismissed(firstFolder),
			recents: snapshot(service),
		}, { dismissed: true, recents: [] });
	});

	test('explicit checked flags retain their selection and uncheck semantics', () => {
		const { service } = createHarness([]);
		service.addRecentWorkspace(firstFolder, 'provider', true);
		service.addRecentWorkspace(firstFolder, 'provider', false);
		const unchecked = snapshot(service);
		service.checkNoWorkspace();
		service.addRecentWorkspace(secondFolder, 'provider', true);

		assert.deepStrictEqual({
			unchecked,
			noWorkspace: service.isNoWorkspaceChecked(),
			selected: snapshot(service),
		}, {
			unchecked: [{ uri: firstFolder.toString(), source: 'agents', checked: false }],
			noWorkspace: false,
			selected: [
				{ uri: secondFolder.toString(), source: 'agents', checked: true },
				{ uri: firstFolder.toString(), source: 'agents', checked: false },
			],
		});
	});

	test('expands JSONC multi-root history in order while preserving Agents history, filtering, and deduplication', async () => {
		const harness = createHarness([
			recentWorkspace(),
			{ folderUri: firstFolder },
			{ folderUri: URI.file('/third') },
		], new Map([[extUri.getComparisonKey(workspaceFile), `{
			// Relative paths use the workspace file's directory.
			"folders": [
				{ "path": "../first" },
				{ "uri": "${secondFolder.toString()}" },
				{ "path": "../first" },
				{ "path": "../copilot-temporary" },
				{ "path": "../repo.worktrees/feature" },
			],
		}`]]));
		harness.service.addRecentWorkspace(secondFolder, 'provider', true);
		await harness.ready();
		assert.deepStrictEqual({
			entries: snapshot(harness.service),
			ownOnly: harness.service.getRecentWorkspaces(false).map(entry => entry.workspace.uri),
			state: harness.service.historyLoadState.get(),
		}, {
			entries: [
				{ uri: secondFolder.toString(), source: 'agents', checked: true },
				{ uri: firstFolder.toString(), source: 'vscodeWorkspace', checked: false },
				{ uri: URI.file('/third').toString(), source: 'vscode', checked: false },
			],
			ownOnly: [secondFolder],
			state: 'loaded',
		});
	});

	test('collapses Dev Container recents onto their source workspace', async () => {
		const sourceUri = URI.parse('vscode-agent-host://wsl__Ubuntu/home/test/vscode-remote-try-node');
		const firstContainerUri = URI.parse('vscode-agent-host://devcontainer__first/workspaces/vscode-remote-try-node');
		const secondContainerUri = URI.parse('vscode-agent-host://devcontainer__second/workspaces/vscode-remote-try-node');
		const createProvider = (id: string, workspaceUri: URI, canonicalWorkspaceUri?: URI) => upcastPartial<ISessionsProvider>({
			id,
			...(canonicalWorkspaceUri ? { canonicalizeWorkspaceUri: () => canonicalWorkspaceUri } : {}),
			resolveWorkspace: uri => extUri.isEqual(uri, workspaceUri) ? {
				uri,
				label: 'workspace',
				icon: Codicon.folder,
				folders: [{ root: uri, workingDirectory: uri, name: 'folder', description: undefined }],
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			} : undefined,
		});
		const sourceProvider = createProvider('agenthost-wsl__Ubuntu', sourceUri);
		const firstContainerProvider = createProvider('agenthost-devcontainer__first', firstContainerUri, sourceUri);
		const secondContainerProvider = createProvider('agenthost-devcontainer__second', secondContainerUri, sourceUri);
		const storage = disposables.add(new TestStorageService());
		storage.store('sessions.recentlyPickedWorkspaces', JSON.stringify([
			{ uri: secondContainerUri.toJSON(), providerId: secondContainerProvider.id, checked: true },
			{ uri: firstContainerUri.toJSON(), providerId: firstContainerProvider.id, checked: false },
			{ uri: sourceUri.toJSON(), providerId: sourceProvider.id, checked: false },
		]), StorageScope.PROFILE, StorageTarget.MACHINE);

		const harness = createHarness([], undefined, storage, undefined, [
			firstContainerProvider,
			secondContainerProvider,
			sourceProvider,
		]);
		await harness.ready();

		assert.deepStrictEqual(harness.service.getRecentWorkspaces().map(entry => ({
			uri: entry.workspace.uri.toString(),
			providerId: entry.providerId,
			checked: entry.checked,
		})), [{
			uri: sourceUri.toString(),
			providerId: sourceProvider.id,
			checked: true,
		}]);
	});

	test('bounds workspace-file reads and file size while retaining later standalone folders', async () => {
		const workspaceFiles = Array.from({ length: 15 }, (_, index) => URI.file(`/workspace-${index}.code-workspace`));
		const harness = createHarness([
			...workspaceFiles.map(uri => recentWorkspace(uri)),
			{ folderUri: firstFolder },
		], new Map(workspaceFiles.map(uri => [extUri.getComparisonKey(uri), '{"folders":[]}'])));
		await harness.ready();
		assert.deepStrictEqual({
			readCount: harness.reads.length,
			sizeLimits: [...new Set(harness.reads.map(read => read.sizeLimit))],
			entries: snapshot(harness.service),
		}, {
			readCount: 10, sizeLimits: [1024 * 1024],
			entries: [{ uri: firstFolder.toString(), source: 'vscode', checked: false }],
		});
	});

	test('keeps the ten-folder limit and does not read older workspace files unnecessarily', async () => {
		const folders = Array.from({ length: 12 }, (_, index) => URI.file(`/folder-${index}`));
		const harness = createHarness([...folders.map(folderUri => ({ folderUri })), recentWorkspace()]);
		await harness.ready();
		assert.deepStrictEqual({
			folders: harness.service.getRecentWorkspaces().map(entry => entry.workspace.uri), reads: harness.reads,
		}, { folders: folders.slice(0, 10), reads: [] });
	});

	test('never interprets a remote workspace file path relative to the local filesystem', async () => {
		const remoteConfig = URI.parse('vscode-remote://ssh-remote+test/home/config/project.code-workspace');
		const remoteFolder = URI.parse('vscode-remote://ssh-remote+test/home/explicit');
		const harness = createHarness([recentWorkspace(), recentWorkspace(remoteConfig)], new Map([
			[extUri.getComparisonKey(workspaceFile), JSON.stringify({
				remoteAuthority: 'ssh-remote+test',
				folders: [{ path: '../local-but-ambiguous' }, { path: '/remote-but-ambiguous' }, { uri: remoteFolder.toString() }],
			})],
			[extUri.getComparisonKey(remoteConfig), '{"folders":[{"path":"../repository"}]}'],
		]));
		await harness.ready();
		assert.deepStrictEqual({
			folders: harness.service.getRecentWorkspaces().map(entry => entry.workspace.uri.toString()),
			state: harness.service.historyLoadState.get(), warningCount: harness.warnings.length,
		}, {
			folders: [remoteFolder.toString(), URI.parse('vscode-remote://ssh-remote+test/home/repository').toString()],
			state: 'error', warningCount: 1,
		});
	});

	test('reports malformed and missing workspace files but still supplies valid history', async () => {
		const missing = URI.file('/missing.code-workspace');
		const harness = createHarness([recentWorkspace(), recentWorkspace(missing), { folderUri: firstFolder }],
			new Map([[extUri.getComparisonKey(workspaceFile), '{"folders": [}']]));
		await harness.ready();
		assert.deepStrictEqual({
			entries: snapshot(harness.service), state: harness.service.historyLoadState.get(), warningCount: harness.warnings.length,
		}, {
			entries: [{ uri: firstFolder.toString(), source: 'vscode', checked: false }], state: 'error', warningCount: 2,
		});
	});

	test('retries workspace files when a filesystem provider becomes available without activating one itself', async () => {
		const harness = createHarness([recentWorkspace()], new Map([[extUri.getComparisonKey(workspaceFile), '{"folders":[{"path":"../first"}]}']]));
		harness.fileProviderAvailable = false;
		await harness.ready();
		const unavailable = { readCount: harness.reads.length, state: harness.service.historyLoadState.get() };
		harness.fileProviderAvailable = true;
		harness.fileProvidersChanged.fire(upcastPartial<IFileSystemProviderRegistrationEvent>({ added: true }));
		await harness.ready();
		assert.deepStrictEqual({ unavailable, entries: snapshot(harness.service) }, {
			unavailable: { readCount: 0, state: 'error' },
			entries: [{ uri: firstFolder.toString(), source: 'vscodeWorkspace', checked: false }],
		});
	});

	test('a superseded history refresh cannot overwrite newer entries', async () => {
		const old = new DeferredPromise<IRecentlyOpened>();
		const harness = createHarness([], undefined, undefined, () => old.p);
		harness.refresh([{ folderUri: secondFolder }]);
		await harness.ready();
		await old.complete({ workspaces: [{ folderUri: firstFolder }], files: [] });
		await timeout(0);
		assert.deepStrictEqual(snapshot(harness.service), [{ uri: secondFolder.toString(), source: 'vscode', checked: false }]);
	});

	test('disposal cancels in-flight file reads without publishing stale history', async () => {
		const pending = new DeferredPromise<string>();
		const harness = createHarness([recentWorkspace()], new Map([[extUri.getComparisonKey(workspaceFile), pending]]));
		let changed = 0;
		disposables.add(harness.service.onDidChangeRecentWorkspaces(() => changed++));
		await timeout(0);
		harness.service.dispose();
		await pending.complete('{"folders":[{"path":"../first"}]}');
		await timeout(0);
		assert.deepStrictEqual({
			changed, cancelled: harness.reads[0].token?.isCancellationRequested, entries: snapshot(harness.service),
		}, { changed: 0, cancelled: true, entries: [] });
	});

	test('times out slow workspace files at five seconds and keeps standalone-folder fallback', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const pending = new DeferredPromise<string>();
			const startedAt = Date.now();
			const harness = createHarness([recentWorkspace(), { folderUri: firstFolder }],
				new Map([[extUri.getComparisonKey(workspaceFile), pending]]));
			await harness.ready();
			const elapsed = Date.now() - startedAt;
			await pending.complete('{"folders":[{"path":"../second"}]}');
			assert.deepStrictEqual({
				elapsed, entries: snapshot(harness.service), state: harness.service.historyLoadState.get(),
				cancelled: harness.reads[0].token?.isCancellationRequested, warningCount: harness.warnings.length,
			}, {
				elapsed: 5_000, entries: [{ uri: firstFolder.toString(), source: 'vscode', checked: false }],
				state: 'error', cancelled: true, warningCount: 1,
			});
		});
	});

	test('removing an expanded folder persists without deleting its parent workspace or the no-workspace choice', async () => {
		const files = new Map([[extUri.getComparisonKey(workspaceFile), '{"folders":[{"path":"../first"},{"path":"../second"}]}']]);
		const harness = createHarness([recentWorkspace()], files);
		await harness.ready();
		const removedEvents: string[][] = [];
		disposables.add(harness.service.onDidRemoveRecentWorkspaces(uris => removedEvents.push(uris.map(uri => uri.toString()))));
		harness.service.checkNoWorkspace();
		harness.service.removeRecentWorkspace(firstFolder);
		await harness.ready();
		harness.service.dispose();
		const restored = createHarness([recentWorkspace()], files, harness.storage);
		await restored.ready();
		const afterRestore = { entries: snapshot(restored.service), noWorkspace: restored.service.isNoWorkspaceChecked() };
		restored.service.addRecentWorkspace(firstFolder, 'provider', true);
		restored.refresh();
		await restored.ready();
		const afterRepick = snapshot(restored.service);
		restored.service.restoreDismissedWorkspace(firstFolder);
		assert.deepStrictEqual({
			removed: harness.removed, removedEvents, afterRestore,
			afterRepick, afterSend: snapshot(restored.service), noWorkspaceAfterRepick: restored.service.isNoWorkspaceChecked(),
		}, {
			removed: [[firstFolder, firstFolder]],
			removedEvents: [[firstFolder.toString()]],
			afterRestore: { entries: [{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false }], noWorkspace: true },
			afterRepick: [{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false }],
			afterSend: [
				{ uri: firstFolder.toString(), source: 'agents', checked: true },
				{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false },
			],
			noWorkspaceAfterRepick: false,
		});
	});

	test('reopening a dismissed folder outside the composer does not restore it', async () => {
		const harness = createHarness([recentWorkspace()], new Map([[extUri.getComparisonKey(workspaceFile), '{"folders":[{"path":"../first"}]}']]));
		await harness.ready();
		harness.service.removeRecentWorkspace(firstFolder);
		await harness.ready();
		harness.refresh([recentWorkspace(), { folderUri: firstFolder }]);
		await harness.ready();
		assert.deepStrictEqual(snapshot(harness.service), []);
	});
});
