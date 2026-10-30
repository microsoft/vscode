/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
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

	function snapshot(service: SessionsRecentWorkspacesService, catalog = false) {
		return (catalog ? service.getWorkspaceCatalog() : service.getRecentWorkspaces()).map(entry => ({
			uri: entry.workspace.uri.toString(), source: entry.source, checked: entry.checked,
		}));
	}

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
		const resolutions: { uri: URI; resolveMetadata: boolean | undefined }[] = [];
		const createProvider = (id: string, workspaceUri: URI, canonicalWorkspaceUri?: URI) => upcastPartial<ISessionsProvider>({
			id,
			...(canonicalWorkspaceUri ? { canonicalizeWorkspaceUri: () => canonicalWorkspaceUri } : {}),
			resolveWorkspace: (uri, options) => {
				resolutions.push({ uri, resolveMetadata: options?.resolveMetadata });
				return extUri.isEqual(uri, workspaceUri) ? {
					uri,
					label: 'workspace',
					icon: Codicon.folder,
					folders: [{ root: uri, workingDirectory: uri, name: 'folder', description: undefined }],
					requiresWorkspaceTrust: true,
					isVirtualWorkspace: false,
				} : undefined;
			},
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
		assert.ok(resolutions.every(call => call.resolveMetadata === undefined));
		resolutions.length = 0;
		assert.deepStrictEqual({
			catalog: harness.service.getWorkspaceCatalog().map(entry => ({ uri: entry.workspace.uri, providerId: entry.providerId, checked: entry.checked })),
			resolutions,
		}, {
			catalog: [{ uri: sourceUri, providerId: sourceProvider.id, checked: true }],
			resolutions: Array.from({ length: 7 }, () => ({ uri: sourceUri, resolveMetadata: false })),
		});
	});

	test('loads older workspace files while bounding file size and retaining later standalone folders', async () => {
		const workspaceFiles = Array.from({ length: 15 }, (_, index) => URI.file(`/workspace-${index}.code-workspace`));
		const folders = workspaceFiles.map((_, index) => URI.file(`/workspace-folder-${index}`));
		const harness = createHarness([
			...workspaceFiles.map(uri => recentWorkspace(uri)),
			{ folderUri: firstFolder },
		], new Map(workspaceFiles.map((uri, index) => [extUri.getComparisonKey(uri), JSON.stringify({ folders: [{ uri: folders[index].toString() }] })])));
		await harness.ready();
		assert.deepStrictEqual({
			readCount: harness.reads.length,
			sizeLimits: [...new Set(harness.reads.map(read => read.sizeLimit))],
			entries: snapshot(harness.service, true),
		}, {
			readCount: 15, sizeLimits: [1024 * 1024],
			entries: [
				...folders.map(uri => ({ uri: uri.toString(), source: 'vscodeWorkspace', checked: false })),
				{ uri: firstFolder.toString(), source: 'vscode', checked: false },
			],
		});
	});

	test('bounds concurrent workspace-file reads while loading the full history', async () => {
		const pending = new DeferredPromise<string>();
		const workspaceFiles = Array.from({ length: 15 }, (_, index) => URI.file(`/workspace-${index}.code-workspace`));
		const harness = createHarness(workspaceFiles.map(uri => recentWorkspace(uri)),
			new Map(workspaceFiles.map(uri => [extUri.getComparisonKey(uri), pending])));
		await timeout(0);
		const initialReads = harness.reads.length;
		await pending.complete('{"folders":[]}');
		await harness.ready();
		assert.deepStrictEqual({ initialReads, totalReads: harness.reads.length }, { initialReads: 4, totalReads: 15 });
	});

	test('loads standalone folders and workspace-file folders beyond the compact recent list', async () => {
		const folders = Array.from({ length: 12 }, (_, index) => URI.file(`/folder-${index}`));
		const harness = createHarness([...folders.map(folderUri => ({ folderUri })), recentWorkspace()],
			new Map([[extUri.getComparisonKey(workspaceFile), JSON.stringify({ folders: [{ uri: firstFolder.toString() }] })]]));
		await harness.ready();
		assert.deepStrictEqual({
			recents: harness.service.getRecentWorkspaces().map(entry => entry.workspace.uri),
			folders: harness.service.getWorkspaceCatalog().map(entry => entry.workspace.uri),
			reads: harness.reads.map(read => read.uri),
		}, { recents: folders.slice(0, 10), folders: [...folders, firstFolder], reads: [workspaceFile] });
	});

	test('bounds stored candidates before canonicalization, resolution, dismissal, and own/import deduplication', async () => {
		const own = Array.from({ length: 12 }, (_, index) => URI.file(`/own-${index}`));
		const imported = [own[1], ...Array.from({ length: 11 }, (_, index) => URI.file(`/imported-${index}`))];
		const canonicalized: URI[] = [];
		const resolved: { uri: URI; resolveMetadata: boolean | undefined }[] = [];
		const provider = upcastPartial<ISessionsProvider>({
			id: 'provider',
			canonicalizeWorkspaceUri: uri => {
				canonicalized.push(uri);
				return uri;
			},
			resolveWorkspace: (uri, options) => {
				resolved.push({ uri, resolveMetadata: options?.resolveMetadata });
				return extUri.isEqual(uri, own[0]) ? undefined : {
					uri, label: 'workspace', icon: Codicon.folder,
					folders: [{ root: uri, workingDirectory: uri, name: 'folder', description: undefined }],
					requiresWorkspaceTrust: true, isVirtualWorkspace: false,
				};
			},
		});
		const storage = disposables.add(new TestStorageService());
		storage.store('sessions.recentlyPickedWorkspaces', own.map(uri => ({ uri: uri.toJSON(), providerId: provider.id, checked: false })), StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.store('sessions.dismissedWorkspaces', [extUri.getComparisonKey(own[2])], StorageScope.PROFILE, StorageTarget.MACHINE);
		const harness = createHarness(imported.map(folderUri => ({ folderUri })), undefined, storage, undefined, [provider]);
		await harness.ready();
		const recents = harness.service.getRecentWorkspaces().map(entry => entry.workspace.uri.toString());
		assert.deepStrictEqual({
			recents, canonicalized: canonicalized.map(uri => uri.toString()),
			resolvedUris: [...new Set(resolved.map(call => extUri.getComparisonKey(call.uri)))].sort(),
			metadata: [...new Set(resolved.map(call => call.resolveMetadata))],
		}, {
			recents: [...own.slice(1, 10).filter(uri => !extUri.isEqual(uri, own[2])), ...imported.slice(1, 10)].map(uri => uri.toString()),
			canonicalized: own.slice(0, 10).map(uri => uri.toString()),
			resolvedUris: [...imported.slice(1, 10), ...own.slice(0, 10)].map(uri => extUri.getComparisonKey(uri)).sort(),
			metadata: [undefined],
		});
		canonicalized.length = 0;
		resolved.length = 0;
		assert.deepStrictEqual({
			catalog: harness.service.getWorkspaceCatalog().map(entry => entry.workspace.uri.toString()),
			canonicalized: canonicalized.map(uri => uri.toString()),
			metadata: [...new Set(resolved.map(call => call.resolveMetadata))],
		}, {
			catalog: [...own.slice(1).filter(uri => !extUri.isEqual(uri, own[2])), ...imported.slice(1)].map(uri => uri.toString()),
			canonicalized: own.map(uri => uri.toString()),
			metadata: [false],
		});
	});

	test('retains older Agents picks across service recreation', async () => {
		const harness = createHarness([]);
		const folders = Array.from({ length: 15 }, (_, index) => URI.file(`/picked-${index}`));
		for (const folder of folders) {
			harness.service.addRecentWorkspace(folder, 'provider', true);
		}
		const restored = createHarness([], undefined, harness.storage);
		const expected = folders.toReversed().map((uri, index) => ({ uri, checked: index === 0 }));
		assert.deepStrictEqual({
			recents: restored.service.getRecentWorkspaces(false).map(entry => ({ uri: entry.workspace.uri, checked: entry.checked })),
			catalog: restored.service.getWorkspaceCatalog().map(entry => ({ uri: entry.workspace.uri, checked: entry.checked })),
		}, { recents: expected.slice(0, 10), catalog: expected });
	});

	test('collapses worktrees against the full catalog only when requested', async () => {
		const repository = URI.file('/project');
		const worktree = URI.file('/project.worktrees/branch');
		const folders = Array.from({ length: 10 }, (_, index) => URI.file(`/folder-${index}`));
		const harness = createHarness([...folders, repository].map(folderUri => ({ folderUri })));
		harness.service.addRecentWorkspace(worktree, 'provider', true);
		await harness.ready();
		assert.deepStrictEqual({
			recents: harness.service.getRecentWorkspaces(true, true).map(entry => entry.workspace.uri),
			catalog: harness.service.getWorkspaceCatalog().map(entry => entry.workspace.uri),
			collapsedCatalog: harness.service.getWorkspaceCatalog(true).map(entry => entry.workspace.uri),
		}, {
			recents: [worktree, ...folders],
			catalog: [worktree, ...folders, repository],
			collapsedCatalog: [repository, ...folders],
		});
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

	test('publishes standalone folders immediately, then interleaves workspace folders as each file loads', async () => {
		const earlier = new DeferredPromise<string>();
		const later = new DeferredPromise<string>();
		const laterFile = URI.file('/later.code-workspace');
		const thirdFolder = URI.file('/third');
		const harness = createHarness([recentWorkspace(), { folderUri: firstFolder }, recentWorkspace(laterFile), { folderUri: thirdFolder }], new Map([
			[extUri.getComparisonKey(workspaceFile), earlier],
			[extUri.getComparisonKey(laterFile), later],
		]));
		await timeout(0);
		const initial = { entries: snapshot(harness.service), state: harness.service.historyLoadState.get() };
		const published = Event.toPromise(harness.service.onDidChangeRecentWorkspaces);
		await later.complete(JSON.stringify({ folders: [{ uri: secondFolder.toString() }] }));
		await published;
		const partial = { entries: snapshot(harness.service), state: harness.service.historyLoadState.get() };
		await earlier.complete(JSON.stringify({ folders: [{ uri: firstFolder.toString() }, { uri: secondFolder.toString() }] }));
		await harness.ready();
		assert.deepStrictEqual({ initial, partial, final: snapshot(harness.service), state: harness.service.historyLoadState.get() }, {
			initial: {
				entries: [
					{ uri: firstFolder.toString(), source: 'vscode', checked: false },
					{ uri: thirdFolder.toString(), source: 'vscode', checked: false },
				],
				state: 'loading',
			},
			partial: {
				entries: [
					{ uri: firstFolder.toString(), source: 'vscode', checked: false },
					{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false },
					{ uri: thirdFolder.toString(), source: 'vscode', checked: false },
				],
				state: 'loading',
			},
			final: [
				{ uri: firstFolder.toString(), source: 'vscodeWorkspace', checked: false },
				{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false },
				{ uri: thirdFolder.toString(), source: 'vscode', checked: false },
			],
			state: 'loaded',
		});
	});

	test('superseding a progressive refresh cancels file reads and ignores their late results', async () => {
		const pending = new DeferredPromise<string>();
		const harness = createHarness([recentWorkspace(), { folderUri: firstFolder }], new Map([[extUri.getComparisonKey(workspaceFile), pending]]));
		await timeout(0);
		const initial = snapshot(harness.service);
		harness.refresh([{ folderUri: secondFolder }]);
		await harness.ready();
		let changed = 0;
		disposables.add(harness.service.onDidChangeRecentWorkspaces(() => changed++));
		await pending.complete('{"folders":[{"path":"../stale"}]}');
		await timeout(0);
		assert.deepStrictEqual({
			initial, entries: snapshot(harness.service), changed,
			cancelled: harness.reads[0].token?.isCancellationRequested, warnings: harness.warnings,
			state: harness.service.historyLoadState.get(),
		}, {
			initial: [{ uri: firstFolder.toString(), source: 'vscode', checked: false }],
			entries: [{ uri: secondFolder.toString(), source: 'vscode', checked: false }],
			changed: 0, cancelled: true, warnings: [], state: 'loaded',
		});
	});

	test('disposal cancels in-flight file reads without publishing stale history', async () => {
		const pending = new DeferredPromise<string>();
		const workspaceFiles = Array.from({ length: 5 }, (_, index) => URI.file(`/workspace-${index}.code-workspace`));
		const harness = createHarness([...workspaceFiles.map(uri => recentWorkspace(uri)), { folderUri: firstFolder }],
			new Map(workspaceFiles.map(uri => [extUri.getComparisonKey(uri), pending])));
		await timeout(0);
		let changed = 0;
		disposables.add(harness.service.onDidChangeRecentWorkspaces(() => changed++));
		harness.service.dispose();
		await pending.complete('{"folders":[{"path":"../first"}]}');
		await timeout(0);
		assert.deepStrictEqual({
			changed, cancelled: harness.reads.every(read => read.token?.isCancellationRequested),
			readCount: harness.reads.length, entries: snapshot(harness.service), warnings: harness.warnings,
		}, {
			changed: 0, cancelled: true, readCount: 4, warnings: [],
			entries: [{ uri: firstFolder.toString(), source: 'vscode', checked: false }],
		});
	});

	test('times out individual workspace files and releases slots for a healthy fifth file', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const pending = new DeferredPromise<string>();
			const startedAt = Date.now();
			const workspaceFiles = Array.from({ length: 5 }, (_, index) => extUri.joinPath(extUri.dirname(workspaceFile), `workspace-${index}.code-workspace`));
			const files = new Map<string, string | DeferredPromise<string>>(workspaceFiles.map(uri => [extUri.getComparisonKey(uri), pending]));
			files.set(extUri.getComparisonKey(workspaceFiles[4]), '{"folders":[{"path":"../second"}]}');
			const harness = createHarness([...workspaceFiles.map(uri => recentWorkspace(uri)), { folderUri: firstFolder }],
				files);
			await harness.ready();
			const elapsed = Date.now() - startedAt;
			await pending.complete('{"folders":[{"path":"../second"}]}');
			assert.deepStrictEqual({
				elapsed, entries: snapshot(harness.service), state: harness.service.historyLoadState.get(),
				cancelled: harness.reads.slice(0, 4).every(read => read.token?.isCancellationRequested), warnings: harness.warnings,
				readCount: harness.reads.length,
			}, {
				elapsed: 1_000,
				entries: [
					{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false },
					{ uri: firstFolder.toString(), source: 'vscode', checked: false },
				],
				state: 'error', cancelled: true,
				warnings: Array.from({ length: 4 }, () => '[SessionsRecentWorkspaces] Timed out reading a recent workspace file'),
				readCount: 5,
			});
		});
	});

	test('retains the overall five-second deadline for a large stalled history', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const pending = new DeferredPromise<string>();
			const startedAt = Date.now();
			const workspaceFiles = Array.from({ length: 25 }, (_, index) => URI.file(`/workspace-${index}.code-workspace`));
			const harness = createHarness([...workspaceFiles.map(uri => recentWorkspace(uri)), { folderUri: firstFolder }],
				new Map(workspaceFiles.map(uri => [extUri.getComparisonKey(uri), pending])));
			await harness.ready();
			const elapsed = Date.now() - startedAt;
			const atDeadline = snapshot(harness.service);
			await pending.complete('{"folders":[{"path":"../stale"}]}');
			await timeout(0);
			assert.deepStrictEqual({
				elapsed, atDeadline, entries: snapshot(harness.service),
				state: harness.service.historyLoadState.get(),
				cancelled: harness.reads.every(read => read.token?.isCancellationRequested),
				readCount: harness.reads.length, lastWarning: harness.warnings.at(-1),
			}, {
				elapsed: 5_000,
				atDeadline: [{ uri: firstFolder.toString(), source: 'vscode', checked: false }],
				entries: [{ uri: firstFolder.toString(), source: 'vscode', checked: false }],
				state: 'error', cancelled: true, readCount: 20,
				lastWarning: '[SessionsRecentWorkspaces] Timed out reading recent workspace folders',
			});
		});
	});

	test('retains the overall deadline while recently opened history itself is stalled', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const pending = new DeferredPromise<IRecentlyOpened>();
			const startedAt = Date.now();
			const harness = createHarness([], undefined, undefined, () => pending.p);
			await harness.ready();
			const elapsed = Date.now() - startedAt;
			await pending.complete({ workspaces: [{ folderUri: firstFolder }], files: [] });
			await timeout(0);
			assert.deepStrictEqual({ elapsed, entries: snapshot(harness.service), state: harness.service.historyLoadState.get(), warnings: harness.warnings }, {
				elapsed: 5_000, entries: [], state: 'error',
				warnings: ['[SessionsRecentWorkspaces] Timed out loading workspace history'],
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
