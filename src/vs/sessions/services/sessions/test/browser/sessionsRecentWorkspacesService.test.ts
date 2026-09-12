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
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
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
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: () => undefined,
			getProviders: () => [provider],
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
		assert.deepStrictEqual({
			removed: harness.removed, afterRestore,
			afterRepick: snapshot(restored.service), noWorkspaceAfterRepick: restored.service.isNoWorkspaceChecked(),
		}, {
			removed: [[firstFolder, firstFolder]],
			afterRestore: { entries: [{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false }], noWorkspace: true },
			afterRepick: [
				{ uri: firstFolder.toString(), source: 'agents', checked: true },
				{ uri: secondFolder.toString(), source: 'vscodeWorkspace', checked: false },
			],
			noWorkspaceAfterRepick: false,
		});
	});

	test('a subsequently reopened standalone folder remains eligible after its workspace-file entry was removed', async () => {
		const harness = createHarness([recentWorkspace()], new Map([[extUri.getComparisonKey(workspaceFile), '{"folders":[{"path":"../first"}]}']]));
		await harness.ready();
		harness.service.removeRecentWorkspace(firstFolder);
		await harness.ready();
		harness.refresh([recentWorkspace(), { folderUri: firstFolder }]);
		await harness.ready();
		assert.deepStrictEqual(snapshot(harness.service), [{ uri: firstFolder.toString(), source: 'vscode', checked: false }]);
	});
});
