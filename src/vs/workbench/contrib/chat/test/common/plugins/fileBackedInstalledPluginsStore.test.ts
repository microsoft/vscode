/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer, VSBufferReadable, VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult, IFileService, IFileSystemWatcher, IStat, IWriteFileOptions } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { FileBackedInstalledPluginsStore } from '../../../common/plugins/fileBackedInstalledPluginsStore.js';
import { AgentPluginEnablementService } from '../../../common/plugins/agentPluginEnablement.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { MarketplaceType, PluginSourceKind, parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';

const LEGACY_INSTALLED_PLUGINS_STORAGE_KEY = 'chat.plugins.installed.v1';
const LEGACY_MARKETPLACE_INDEX_STORAGE_KEY = 'chat.plugins.marketplaces.index.v1';

class TestFileService {
	private readonly _files = new Map<string, string>();
	private readonly _folders = new Set<string>();
	private readonly _versions = new Map<string, number>();
	private _version = 0;
	isWatching = false;

	constructor(
		private readonly _failWrites = false,
		private readonly _onDidChange: Event<FileChangesEvent> = Event.None,
	) { }

	async exists(resource: URI): Promise<boolean> {
		const key = resource.toString();
		return this._files.has(key) || this._folders.has(key);
	}

	async readFile(resource: URI): Promise<{ value: VSBuffer; mtime: number; etag: string }> {
		const key = resource.toString();
		const value = this._files.get(key);
		if (value === undefined) {
			throw new Error(`Missing file: ${key}`);
		}
		const version = this._versions.get(key)!;
		return { value: VSBuffer.fromString(value), mtime: version, etag: String(version) };
	}

	async writeFile(resource: URI, content: VSBuffer, options?: IWriteFileOptions): Promise<unknown> {
		if (this._failWrites) {
			throw new Error('write failed');
		}

		if ((options?.expectedContent && options.expectedContent.toString() !== this._files.get(resource.toString()))
			|| (options?.etag !== undefined && options.etag !== String(this._versions.get(resource.toString())))) {
			throw new FileOperationError('File changed', FileOperationResult.FILE_MODIFIED_SINCE);
		}
		this.setFile(resource, content.toString());
		return {};
	}

	async createFolder(resource: URI): Promise<unknown> {
		this._folders.add(resource.toString());
		return {};
	}

	createWatcher(): IFileSystemWatcher {
		this.isWatching = true;
		return {
			onDidChange: this._onDidChange,
			dispose: () => { },
		};
	}

	setFile(resource: URI, content: string): void {
		this._files.set(resource.toString(), content);
		this._versions.set(resource.toString(), ++this._version);
	}

	getFile(resource: URI): string | undefined {
		return this._files.get(resource.toString());
	}
}

suite('FileBackedInstalledPluginsStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLegacyEntry(pluginPath: string) {
		const reference = parseMarketplaceReference('microsoft/plugins');
		assert.ok(reference);

		return {
			pluginUri: URI.file(pluginPath),
			plugin: {
				name: 'my-plugin',
				description: 'A plugin',
				version: '1.0.0',
				source: 'plugins/my-plugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/my-plugin' } as const,
				marketplace: reference.displayLabel,
				marketplaceReference: reference,
				marketplaceType: MarketplaceType.Copilot,
			},
			enabled: true,
		};
	}

	async function waitFor(predicate: () => boolean): Promise<void> {
		for (let i = 0; i < 40; i++) {
			if (predicate()) {
				return;
			}
			await timeout(10);
		}

		assert.fail('Condition not met in time');
	}

	function createPluginsStore(agentPluginsHome: URI, fileService: TestFileService, storageService = store.add(new InMemoryStorageService()), oldCacheRoot?: URI): FileBackedInstalledPluginsStore {
		return store.add(new FileBackedInstalledPluginsStore(
			agentPluginsHome,
			oldCacheRoot,
			fileService as unknown as IFileService,
			new NullLogService(),
			storageService,
			store.add(new AgentPluginEnablementService(storageService)),
		));
	}

	test('migrates legacy storage to installed.json and removes legacy keys', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const fileService = new TestFileService();

		const legacyEntry = createLegacyEntry('/cache/agentPlugins/github.com/microsoft/plugins/plugins/my-plugin');
		storageService.store(
			LEGACY_INSTALLED_PLUGINS_STORAGE_KEY,
			JSON.stringify([legacyEntry]),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);

		const agentPluginsHome = URI.file('/home/user/.vscode/agent-plugins');
		const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');

		const pluginsStore = store.add(new FileBackedInstalledPluginsStore(
			agentPluginsHome,
			URI.file('/cache/agentPlugins'),
			fileService as unknown as IFileService,
			new NullLogService(),
			storageService as unknown as IStorageService,
			store.add(new AgentPluginEnablementService(storageService)),
		));

		await waitFor(() => !!fileService.getFile(installedJson));

		const serialized = fileService.getFile(installedJson);
		assert.ok(serialized);
		const parsed = JSON.parse(serialized!);
		assert.deepStrictEqual(parsed, {
			version: 1,
			installed: [{
				pluginUri: URI.joinPath(agentPluginsHome, 'github.com/microsoft/plugins/plugins/my-plugin').toString(),
				relativePath: 'github.com/microsoft/plugins/plugins/my-plugin',
				enablementUri: legacyEntry.pluginUri.toString(),
				marketplace: 'microsoft/plugins',
				name: 'my-plugin',
			}],
		});
		assert.strictEqual(pluginsStore.get().length, 1);

		assert.strictEqual(storageService.get(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, StorageScope.APPLICATION), undefined);
		assert.strictEqual(storageService.get(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION), undefined);
	});

	test('keeps legacy keys when migration write fails', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const fileService = new TestFileService(true);

		const legacyEntry = createLegacyEntry('/cache/agentPlugins/github.com/microsoft/plugins/plugins/my-plugin');
		storageService.store(
			LEGACY_INSTALLED_PLUGINS_STORAGE_KEY,
			JSON.stringify([legacyEntry]),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);

		storageService.store(
			LEGACY_MARKETPLACE_INDEX_STORAGE_KEY,
			JSON.stringify({ any: 'value' }),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);

		const agentPluginsHome = URI.file('/home/user/.vscode/agent-plugins');
		const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');

		store.add(new FileBackedInstalledPluginsStore(
			agentPluginsHome,
			URI.file('/cache/agentPlugins'),
			fileService as unknown as IFileService,
			new NullLogService(),
			storageService as unknown as IStorageService,
			store.add(new AgentPluginEnablementService(storageService)),
		));

		await timeout(30);

		assert.strictEqual(fileService.getFile(installedJson), undefined);
		assert.ok(storageService.get(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, StorageScope.APPLICATION));
		assert.ok(storageService.get(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION));
	});

	test('loads and migrates absolute installed.json entries on startup', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const fileService = new TestFileService();
		const agentPluginsHome = URI.file(isWindows ? 'C:\\Users\\Test\\.vscode\\agent-plugins' : '/home/user/.vscode/agent-plugins');
		const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');

		const existingData = {
			version: 1,
			installed: [{
				pluginUri: URI.joinPath(agentPluginsHome, 'github.com/microsoft/plugins/plugins/my-plugin').toString(),
				marketplace: 'microsoft/plugins',
			}],
		};
		fileService.setFile(installedJson, JSON.stringify(existingData));

		const pluginsStore = store.add(new FileBackedInstalledPluginsStore(
			agentPluginsHome,
			URI.file('/cache/agentPlugins'),
			fileService as unknown as IFileService,
			new NullLogService(),
			storageService as unknown as IStorageService,
			store.add(new AgentPluginEnablementService(storageService)),
		));

		await waitFor(() => !!fileService.getFile(installedJson)?.includes('"relativePath"'));

		assert.deepStrictEqual({
			pluginUri: pluginsStore.get()[0].pluginUri.toString(),
			persisted: JSON.parse(fileService.getFile(installedJson)!),
		}, {
			pluginUri: existingData.installed[0].pluginUri,
			persisted: {
				version: 1,
				installed: [{
					...existingData.installed[0],
					relativePath: 'github.com/microsoft/plugins/plugins/my-plugin',
				}],
			},
		});
	});

	for (const { label, originalHome, relocatedHome } of [
		{
			label: 'local paths',
			originalHome: URI.file('/portable/vscode/data/agent-plugins'),
			relocatedHome: URI.file('/upgraded/vscode/data/agent-plugins'),
		},
		{
			label: 'Windows drives',
			originalHome: URI.from({ scheme: Schemas.file, path: '/c:/VSCode/data/agent-plugins' }),
			relocatedHome: URI.from({ scheme: Schemas.file, path: '/d:/VSCode New/data/agent-plugins' }),
		},
		{
			label: 'non-file schemes and authorities',
			originalHome: URI.from({ scheme: Schemas.vscodeUserData, authority: 'original', path: '/agent-plugins' }),
			relocatedHome: URI.from({ scheme: Schemas.vscodeUserData, authority: 'relocated', path: '/agent-plugins' }),
		},
	]) {
		test(`resolves managed plugins after moving the install with ${label}`, async () => {
			const fileService = new TestFileService();
			const pluginsStore = createPluginsStore(originalHome, fileService);
			await waitFor(() => fileService.isWatching);

			const relativePath = 'github.com/org/repo/plugins/my plugin #%20';
			const plugin = {
				pluginUri: URI.joinPath(originalHome, relativePath),
				marketplace: 'org/repo',
				name: 'my-plugin',
			};
			pluginsStore.set([plugin], undefined);

			const installedJson = URI.joinPath(originalHome, 'installed.json');
			await waitFor(() => !!fileService.getFile(installedJson));
			const serialized = fileService.getFile(installedJson)!;
			pluginsStore.dispose();

			fileService.setFile(URI.joinPath(relocatedHome, 'installed.json'), serialized);
			const relocatedStore = createPluginsStore(relocatedHome, fileService);
			await waitFor(() => relocatedStore.get().length === 1);

			assert.deepStrictEqual({
				persisted: JSON.parse(serialized),
				relocated: relocatedStore.get().map(entry => ({ ...entry, pluginUri: entry.pluginUri.toString(), enablementUri: entry.enablementUri?.toString() })),
			}, {
				persisted: {
					version: 1,
					installed: [{
						...plugin,
						pluginUri: plugin.pluginUri.toString(),
						relativePath,
					}],
				},
				relocated: [{ ...plugin, pluginUri: URI.joinPath(relocatedHome, relativePath).toString(), enablementUri: plugin.pluginUri.toString() }],
			});
		});
	}

	test('keeps external plugin URIs absolute and supports the plugin home itself', async () => {
		const agentPluginsHome = URI.file('/portable/data/agent-plugins');
		const externalUris = [
			URI.file('/external/plugin'),
			URI.file('/portable/data/agent-plugins-other/plugin'),
			agentPluginsHome.with({ scheme: Schemas.vscodeUserData }),
			agentPluginsHome.with({ authority: 'other-server' }),
			agentPluginsHome.with({ query: 'query', fragment: 'fragment' }),
		];
		const fileService = new TestFileService();
		const pluginsStore = createPluginsStore(agentPluginsHome, fileService);
		await waitFor(() => fileService.isWatching);

		pluginsStore.set([agentPluginsHome, ...externalUris].map(pluginUri => ({
			pluginUri,
			marketplace: 'org/repo',
		})), undefined);

		const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
		await waitFor(() => !!fileService.getFile(installedJson));
		const serialized = fileService.getFile(installedJson)!;
		pluginsStore.dispose();

		const relocatedHome = URI.file('/relocated/data/agent-plugins');
		fileService.setFile(URI.joinPath(relocatedHome, 'installed.json'), serialized);
		const relocatedStore = createPluginsStore(relocatedHome, fileService);
		await waitFor(() => relocatedStore.get().length === externalUris.length + 1);

		assert.deepStrictEqual({
			persisted: JSON.parse(serialized),
			locations: relocatedStore.get().map(entry => entry.pluginUri.toString()),
		}, {
			persisted: {
				version: 1,
				installed: [
					{ pluginUri: agentPluginsHome.toString(), relativePath: '', marketplace: 'org/repo' },
					...externalUris.map(pluginUri => ({ pluginUri: pluginUri.toString(), marketplace: 'org/repo' })),
				],
			},
			locations: [relocatedHome, ...externalUris].map(uri => uri.toString()),
		});
	});

	test('resolves relative paths after external manifest edits', async () => {
		const agentPluginsHome = URI.file('/portable/data/agent-plugins');
		const onDidChange = store.add(new Emitter<FileChangesEvent>());
		const fileService = new TestFileService(false, onDidChange.event);
		const pluginsStore = createPluginsStore(agentPluginsHome, fileService);
		await waitFor(() => fileService.isWatching);

		const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
		const relativePath = 'github.com/org/repo/plugins/added';
		const content = JSON.stringify({
			version: 1,
			installed: [{
				pluginUri: URI.file('/previous/data/agent-plugins/' + relativePath).toString(),
				relativePath,
				marketplace: 'org/repo',
				name: 'added',
			}],
		});
		fileService.setFile(installedJson, content);
		onDidChange.fire(new FileChangesEvent([{ resource: installedJson, type: FileChangeType.ADDED }], false));
		await waitFor(() => pluginsStore.get().length === 1);

		const entry = {
			pluginUri: URI.joinPath(agentPluginsHome, relativePath).toString(),
			enablementUri: URI.file('/previous/data/agent-plugins/' + relativePath).toString(),
			marketplace: 'org/repo',
			name: 'added',
		};
		assert.deepStrictEqual({
			plugins: pluginsStore.get().map(entry => ({ ...entry, pluginUri: entry.pluginUri.toString(), enablementUri: entry.enablementUri?.toString() })),
			file: JSON.parse(fileService.getFile(installedJson)!),
		}, {
			plugins: [entry],
			file: { version: 1, installed: [{ ...entry, relativePath }] },
		});
	});

	for (const onStartup of [true, false]) {
		for (const mtimeChange of [0, 1000]) {
			test(`preserves concurrent same-size edits ${onStartup ? 'on startup' : 'after a file change'} (mtime change: ${mtimeChange})`, async () => {
				const agentPluginsHome = URI.file('/portable/data/agent-plugins');
				const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
				const entries = ['rev1', 'rev2', 'rev3'].map(revision => ({
					pluginUri: URI.joinPath(agentPluginsHome, revision).toString(),
					marketplace: 'org/repo',
					name: 'plugin',
				}));
				let mtime = 1;
				const provider = store.add(new class extends InMemoryFileSystemProvider {
					override async stat(resource: URI): Promise<IStat> {
						return { ...await super.stat(resource), mtime };
					}
				}());
				const onDidChange = store.add(new Emitter<FileChangesEvent>());
				const fileService = store.add(new class extends FileService {
					isWatching = false;
					attempts = 0;
					migrations = 0;

					override async writeFile(resource: URI, content: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: IWriteFileOptions) {
						if (options && ++this.attempts <= 2) {
							await provider.writeFile(installedJson, VSBuffer.fromString(JSON.stringify({
								version: 1,
								installed: [entries[this.attempts]],
							})).buffer, { create: true, overwrite: true, unlock: false, atomic: false });
							mtime += mtimeChange;
						}
						const result = await super.writeFile(resource, content, options);
						if (options) {
							this.migrations++;
						}
						return result;
					}

					override createWatcher(): IFileSystemWatcher {
						this.isWatching = true;
						return { onDidChange: onDidChange.event, dispose: () => { } };
					}
				}(new NullLogService()));
				store.add(fileService.registerProvider(Schemas.file, provider));
				const initialContent = VSBuffer.fromString(JSON.stringify({ version: 1, installed: [entries[0]] }));
				if (onStartup) {
					await fileService.writeFile(installedJson, initialContent);
				}
				const storageService = store.add(new InMemoryStorageService());
				const pluginsStore = store.add(new FileBackedInstalledPluginsStore(
					agentPluginsHome,
					undefined,
					fileService,
					new NullLogService(),
					storageService,
					store.add(new AgentPluginEnablementService(storageService)),
				));
				await waitFor(() => fileService.isWatching);
				if (!onStartup) {
					await fileService.writeFile(installedJson, initialContent);
					onDidChange.fire(new FileChangesEvent([{ resource: installedJson, type: FileChangeType.ADDED }], false));
				}
				await waitFor(() => fileService.migrations > 0 && pluginsStore.get().length === 1);

				assert.deepStrictEqual({
					attempts: fileService.attempts,
					migrations: fileService.migrations,
					file: JSON.parse((await fileService.readFile(installedJson)).value.toString()),
					plugins: pluginsStore.get().map(entry => entry.pluginUri.toString()),
				}, {
					attempts: 3,
					migrations: 1,
					file: { version: 1, installed: [{ ...entries[2], relativePath: 'rev3' }] },
					plugins: [entries[2].pluginUri],
				});
			});
		}

		test(`migrates concurrent external installs ${onStartup ? 'on startup' : 'after a file change'}`, async () => {
			const agentPluginsHome = URI.file('/portable/data/agent-plugins');
			const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
			const entries = ['first', 'external', 'another'].map(name => ({
				pluginUri: URI.joinPath(agentPluginsHome, name).toString(),
				marketplace: 'org/repo',
				name,
			}));
			const onDidChange = store.add(new Emitter<FileChangesEvent>());
			const fileService = new class extends TestFileService {
				writes = 0;
				override async writeFile(resource: URI, content: VSBuffer, options?: IWriteFileOptions): Promise<unknown> {
					if (++this.writes <= 2) {
						this.setFile(installedJson, JSON.stringify({ version: 1, installed: entries.slice(0, this.writes + 1) }));
					}
					return super.writeFile(resource, content, options);
				}
			}(false, onDidChange.event);
			const initialContent = JSON.stringify({ version: 1, installed: [entries[0]] });
			if (onStartup) {
				fileService.setFile(installedJson, initialContent);
			}
			const pluginsStore = createPluginsStore(agentPluginsHome, fileService);
			await waitFor(() => fileService.isWatching);
			if (!onStartup) {
				fileService.setFile(installedJson, initialContent);
				onDidChange.fire(new FileChangesEvent([{ resource: installedJson, type: FileChangeType.ADDED }], false));
			}
			await waitFor(() => !!fileService.getFile(installedJson)?.includes('"relativePath"'));
			const persisted = JSON.parse(fileService.getFile(installedJson)!);

			const relocatedHome = URI.file('/relocated/data/agent-plugins');
			fileService.setFile(URI.joinPath(relocatedHome, 'installed.json'), fileService.getFile(installedJson)!);
			const relocatedStore = createPluginsStore(relocatedHome, fileService);
			await waitFor(() => relocatedStore.get().length === entries.length);

			assert.deepStrictEqual({
				file: persisted,
				plugins: pluginsStore.get().map(entry => entry.name),
				relocated: relocatedStore.get().map(entry => entry.pluginUri.toString()),
			}, {
				file: { version: 1, installed: entries.map(entry => ({ ...entry, relativePath: entry.name })) },
				plugins: entries.map(entry => entry.name),
				relocated: entries.map(entry => URI.joinPath(relocatedHome, entry.name).toString()),
			});
		});
	}

	test('does not repeatedly retry migration after a write error', async () => {
		const agentPluginsHome = URI.file('/portable/data/agent-plugins');
		const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
		const entry = {
			pluginUri: URI.joinPath(agentPluginsHome, 'plugin').toString(),
			marketplace: 'org/repo',
			name: 'plugin',
		};
		const content = JSON.stringify({ version: 1, installed: [entry] });
		const fileService = new class extends TestFileService {
			writes = 0;
			override async writeFile(resource: URI, content: VSBuffer, options?: IWriteFileOptions): Promise<unknown> {
				this.writes++;
				return super.writeFile(resource, content, options);
			}
		}(true);
		fileService.setFile(installedJson, content);
		const pluginsStore = createPluginsStore(agentPluginsHome, fileService);
		await waitFor(() => fileService.isWatching);
		await timeout(250);

		assert.deepStrictEqual({
			writes: fileService.writes,
			file: fileService.getFile(installedJson),
			plugins: pluginsStore.get().map(entry => entry.name),
		}, {
			writes: 1,
			file: content,
			plugins: ['plugin'],
		});
	});

	for (const state of [ContributionEnablementState.DisabledProfile, ContributionEnablementState.DisabledWorkspace]) {
		test(`preserves disabled enablement after relocation and restart (${state})`, async () => {
			const storageService = store.add(new InMemoryStorageService());
			const originalHome = URI.file('/original/data/agent-plugins');
			const relocatedHome = URI.file('/relocated/data/agent-plugins');
			const relativePath = 'github.com/org/repo/plugins/disabled';
			const originalUri = URI.joinPath(originalHome, relativePath);
			const relocatedUri = URI.joinPath(relocatedHome, relativePath);
			const enablementService = store.add(new AgentPluginEnablementService(storageService));
			enablementService.setEnabled(originalUri.toString(), state);

			const fileService = new TestFileService();
			fileService.setFile(URI.joinPath(relocatedHome, 'installed.json'), JSON.stringify({
				version: 1,
				installed: [{
					pluginUri: originalUri.toString(),
					relativePath,
					marketplace: 'org/repo',
				}],
			}));
			const pluginsStore = createPluginsStore(relocatedHome, fileService, storageService);
			await waitFor(() => pluginsStore.get().length === 1);
			const reopenedEnablementService = store.add(new AgentPluginEnablementService(storageService));
			assert.strictEqual(reopenedEnablementService.readEnabled(relocatedUri.toString()), state);
		});

		for (const fromLegacyStorage of [false, true]) {
			test(`preserves another profile's disabled state after migration (${state}, ${fromLegacyStorage ? 'legacy storage' : 'installed.json'})`, async () => {
				const originalHome = URI.file('/original/data/agent-plugins');
				const relocatedHome = URI.file('/relocated/data/agent-plugins');
				const relativePath = 'github.com/org/repo/plugins/disabled';
				const originalUri = URI.joinPath(originalHome, relativePath);
				const relocatedUri = URI.joinPath(relocatedHome, relativePath);
				const profiles = [store.add(new InMemoryStorageService()), store.add(new InMemoryStorageService())];
				const enablementServices = profiles.map(storageService => store.add(new AgentPluginEnablementService(storageService)));
				for (const service of enablementServices) {
					service.setEnabled(originalUri.toString(), state);
				}

				const fileService = new TestFileService();
				const installedJson = URI.joinPath(relocatedHome, 'installed.json');
				if (fromLegacyStorage) {
					profiles[0].store(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, JSON.stringify([createLegacyEntry(originalUri.fsPath)]), StorageScope.APPLICATION, StorageTarget.MACHINE);
				} else {
					fileService.setFile(installedJson, JSON.stringify({
						version: 1,
						installed: [{ pluginUri: originalUri.toString(), relativePath, marketplace: 'org/repo' }],
					}));
				}
				const firstProfile = createPluginsStore(relocatedHome, fileService, profiles[0], fromLegacyStorage ? originalHome : undefined);
				await waitFor(() => firstProfile.get().length === 1);
				await waitFor(() => !!fileService.getFile(installedJson)?.includes('"enablementUri"'));
				firstProfile.dispose();

				const secondProfile = createPluginsStore(relocatedHome, fileService, profiles[1]);
				await waitFor(() => secondProfile.get().length === 1);
				assert.deepStrictEqual({
					identity: JSON.parse(fileService.getFile(installedJson)!).installed[0].enablementUri,
					states: profiles.map(storageService => store.add(new AgentPluginEnablementService(storageService)).readEnabled(relocatedUri.toString())),
				}, {
					identity: originalUri.toString(),
					states: [state, state],
				});
			});
		}
	}
});
