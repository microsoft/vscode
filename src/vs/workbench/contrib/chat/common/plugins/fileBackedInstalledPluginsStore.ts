/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer, ThrottledDelayer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { IObservable, ITransaction, observableValue } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { FileOperationResult, IFileContent, IFileService, IWriteFileOptions, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import type { IAgentPluginEnablementService } from './agentPluginService.js';

const INSTALLED_JSON_FILENAME = 'installed.json';
const INSTALLED_JSON_VERSION = 1;

/** Legacy storage key used before migration to file-backed store. */
const LEGACY_INSTALLED_PLUGINS_STORAGE_KEY = 'chat.plugins.installed.v1';
/** Legacy storage key for the marketplace index that cached old URI paths. */
const LEGACY_MARKETPLACE_INDEX_STORAGE_KEY = 'chat.plugins.marketplaces.index.v1';

/**
 * Minimal entry stored in `installed.json`. URIs are serialised as strings
 * so that external tools can read and write the file without depending on
 * VS Code internal URI representations. The optional `name` identifies the
 * marketplace plugin and lets VS Code re-read the full descriptor from the
 * marketplace when needed.
 */
interface IInstalledJsonEntry {
	/** Absolute URI retained for older readers and plugins outside the agent-plugins directory. */
	readonly pluginUri: string;
	/** Path relative to the agent-plugins directory, preferred over pluginUri when present. */
	readonly relativePath?: string;
	/** Stable enablement identity retained when pluginUri changes, for every user profile. */
	readonly enablementUri?: string;
	readonly marketplace: string;
	readonly name?: string;
}

/**
 * On-disk schema for `installed.json`.
 */
interface IInstalledJson {
	readonly version: number;
	readonly installed: readonly IInstalledJsonEntry[];
}

/**
 * In-memory representation of an installed plugin entry.
 */
export interface IStoredInstalledPlugin {
	readonly pluginUri: URI;
	readonly enablementUri?: URI;
	readonly marketplace: string;
	readonly name?: string;
}

/**
 * An observable store for installed agent plugins that is backed by a
 * `installed.json` file within the agent-plugins directory. This makes
 * the installed-plugin manifest discoverable by external tools (CLIs,
 * other editors, etc.) without depending on VS Code internals.
 *
 * The on-disk format stores the plugin URI, a relative path for managed
 * plugins, marketplace identifier, and plugin name. Full plugin metadata
 * (description, source descriptor, etc.) is read by the discovery layer -
 * keeping a single source of truth.
 *
 * On construction the store:
 * 1. Attempts to read `installed.json` from the agent-plugins directory.
 * 2. If no file exists, migrates data from the legacy {@link StorageService}
 *    key (`chat.plugins.installed.v1`), rebasing plugin URIs from the old
 *    cache directory to the new agent-plugins directory.
 * 3. Sets up a correlated file watcher so that external edits to
 *    `installed.json` are picked up automatically.
 *
 * Write operations update the in-memory observable synchronously and
 * schedule a debounced file write so that rapid successive mutations
 * (e.g. batch enables) are coalesced into a single I/O operation.
 */
export class FileBackedInstalledPluginsStore extends Disposable {
	private readonly _installed = observableValue<readonly IStoredInstalledPlugin[]>('file/installed.json', []);
	private readonly _fileUri: URI;
	private readonly _writeDelayer: ThrottledDelayer<void>;
	private readonly _reloadScheduler: RunOnceScheduler;
	private readonly _fileOperationQueue = new Sequencer();
	private _hasPendingChanges = false;
	private _suppressFileWatch = false;
	private _initialized = false;

	readonly value: IObservable<readonly IStoredInstalledPlugin[]> = this._installed;

	constructor(
		private readonly _agentPluginsHome: URI,
		private readonly _oldCacheRoot: URI | undefined,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _storageService: IStorageService,
		private readonly _pluginEnablementService: IAgentPluginEnablementService,
	) {
		super();
		this._fileUri = joinPath(_agentPluginsHome, INSTALLED_JSON_FILENAME);
		this._writeDelayer = this._register(new ThrottledDelayer<void>(100));
		this._reloadScheduler = this._register(new RunOnceScheduler(() => this._fileOperationQueue.queue(() => this._onFileChanged()), 100));
		void this._fileOperationQueue.queue(() => this._initialize());
	}

	get(): readonly IStoredInstalledPlugin[] {
		return this._installed.get();
	}

	set(newValue: readonly IStoredInstalledPlugin[], tx: ITransaction | undefined): void {
		this._hasPendingChanges = true;
		this._installed.set(newValue, tx);
		if (this._initialized) {
			this._scheduleWrite();
		}
	}

	private async _initialize(): Promise<void> {
		try {
			const entries = await this._readAndMigrateFromFile();
			if (!this._hasPendingChanges) {
				if (entries !== undefined) {
					this._installed.set(entries, undefined);
				} else {
					// No installed.json yet — attempt migration from legacy storage.
					await this._migrateFromStorage();
				}
			}
		} catch (error) {
			this._logService.error('[FileBackedInstalledPluginsStore] Initialization failed', error);
		}

		this._initialized = true;
		this._setupFileWatcher();
		if (this._hasPendingChanges) {
			this._scheduleWrite();
		}
	}

	// --- File I/O ----------------------------------------------------------------

	private async _readAndMigrateFromFile(): Promise<readonly IStoredInstalledPlugin[] | undefined> {
		let read = await this._readFromFile();
		if (read?.needsMigration) {
			const result = await this._writeToFile(read.entries, { mtime: read.content.mtime, etag: read.content.etag });
			if (result !== 'success') {
				read = await this._readFromFile();
				if (result === 'conflict' && read?.needsMigration && !this._store.isDisposed) {
					this._reloadScheduler.schedule();
				}
			}
		}
		return read?.entries;
	}

	private async _readFromFile(): Promise<{ entries: readonly IStoredInstalledPlugin[]; needsMigration: boolean; content: IFileContent } | undefined> {
		try {
			const exists = await this._fileService.exists(this._fileUri);
			if (!exists) {
				return undefined;
			}

			const content = await this._fileService.readFile(this._fileUri);
			const json: IInstalledJson = JSON.parse(content.value.toString());
			if (!json || !Array.isArray(json.installed)) {
				this._logService.warn('[FileBackedInstalledPluginsStore] installed.json has unexpected format, ignoring');
				return undefined;
			}

			let needsMigration = false;
			const entries = json.installed
				.filter((entry): entry is IInstalledJsonEntry => typeof entry.pluginUri === 'string' && typeof entry.marketplace === 'string')
				.map(entry => {
					const hasRelativePath = typeof entry.relativePath === 'string';
					const originalUri = URI.parse(entry.pluginUri);
					let pluginUri = originalUri;
					if (hasRelativePath) {
						const relativePluginUri = joinPath(this._agentPluginsHome, entry.relativePath);
						if (this._getRelativePath(this._agentPluginsHome, relativePluginUri) !== undefined) {
							pluginUri = relativePluginUri;
						} else {
							needsMigration = true;
							this._logService.warn('[FileBackedInstalledPluginsStore] installed.json contains a relative path outside the plugin home; using pluginUri');
						}
					}
					const relocated = !isEqual(originalUri, pluginUri);
					const enablementUri = typeof entry.enablementUri === 'string' ? URI.parse(entry.enablementUri) : relocated ? originalUri : undefined;
					if (relocated || (!hasRelativePath && this._getRelativePath(this._agentPluginsHome, pluginUri) !== undefined)) {
						needsMigration = true;
					}
					if (enablementUri) {
						this._pluginEnablementService.copyEnablement(enablementUri, pluginUri);
					}
					return {
						pluginUri,
						...(enablementUri ? { enablementUri } : {}),
						marketplace: entry.marketplace,
						name: typeof entry.name === 'string' ? entry.name : undefined,
					};
				});
			return { entries, needsMigration, content };
		} catch (error) {
			this._logService.error('[FileBackedInstalledPluginsStore] Failed to read installed.json', error);
			return undefined;
		}
	}

	private _scheduleWrite(): void {
		void this._writeDelayer.trigger(() => this._fileOperationQueue.queue(async () => {
			this._hasPendingChanges = false;
			await this._writeToFile();
		}));
	}

	private async _writeToFile(plugins: readonly IStoredInstalledPlugin[] = this.get(), options?: IWriteFileOptions): Promise<'success' | 'conflict' | 'error'> {
		const entries: IInstalledJsonEntry[] = plugins.map(e => ({
			pluginUri: e.pluginUri.toString(),
			relativePath: this._getRelativePath(this._agentPluginsHome, e.pluginUri),
			...(e.enablementUri ? { enablementUri: e.enablementUri.toString() } : {}),
			marketplace: e.marketplace,
			...(e.name ? { name: e.name } : {}),
		}));

		const data: IInstalledJson = {
			version: INSTALLED_JSON_VERSION,
			installed: entries,
		};

		try {
			this._suppressFileWatch = true;
			const content = JSON.stringify(data, undefined, '\t');
			await this._fileService.createFolder(this._agentPluginsHome);
			await this._fileService.writeFile(this._fileUri, VSBuffer.fromString(content), options);
			return 'success';
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_MODIFIED_SINCE) {
				this._logService.info('[FileBackedInstalledPluginsStore] installed.json changed during migration; reloading');
				return 'conflict';
			}
			this._logService.error('[FileBackedInstalledPluginsStore] Failed to write installed.json', error);
			return 'error';
		} finally {
			this._suppressFileWatch = false;
		}
	}

	// --- File watching ------------------------------------------------------------

	private _setupFileWatcher(): void {
		if (typeof this._fileService.createWatcher !== 'function') {
			return;
		}
		const dir = this._agentPluginsHome;
		const watcher = this._fileService.createWatcher(dir, { recursive: false, excludes: [] });
		this._register(watcher);

		this._register(watcher.onDidChange(e => {
			if (!this._suppressFileWatch && e.affects(this._fileUri)) {
				this._reloadScheduler.schedule();
			}
		}));
	}

	private async _onFileChanged(): Promise<void> {
		if (this._hasPendingChanges) {
			return;
		}

		const entries = await this._readAndMigrateFromFile();
		if (entries !== undefined && !this._hasPendingChanges) {
			this._installed.set(entries, undefined);
		}
	}

	// --- Migration from legacy storage -------------------------------------------

	private async _migrateFromStorage(): Promise<void> {
		const raw = this._storageService.get(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return;
		}

		try {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed) || parsed.length === 0) {
				return;
			}

			const migrated: IStoredInstalledPlugin[] = (revive(parsed) as { pluginUri: UriComponents; plugin?: { name?: string; marketplaceReference?: { rawValue?: string } } }[]).map(entry => {
				const uri = URI.revive(entry.pluginUri);
				const rebased = this._rebasePluginUri(uri);
				if (rebased) {
					this._pluginEnablementService.copyEnablement(uri, rebased);
				}
				return {
					pluginUri: rebased ?? uri,
					...(rebased ? { enablementUri: uri } : {}),
					marketplace: entry.plugin?.marketplaceReference?.rawValue ?? '',
					name: entry.plugin?.name,
				};
			}).filter(e => !!e.marketplace);

			this._logService.info(`[FileBackedInstalledPluginsStore] Migrating ${migrated.length} plugin(s) from storage to installed.json`);

			// Set in memory and persist to file before removing legacy keys.
			this._installed.set(migrated, undefined);
			const result = await this._writeToFile();
			if (result !== 'success') {
				return;
			}

			// Clean up legacy keys.
			this._storageService.remove(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, StorageScope.APPLICATION);
			this._storageService.remove(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
		} catch (error) {
			this._logService.error('[FileBackedInstalledPluginsStore] Migration from storage failed', error);
		}
	}

	private _getRelativePath(root: URI, uri: URI): string | undefined {
		const normalizedRoot = extUriBiasedIgnorePathCase.removeTrailingPathSeparator(extUriBiasedIgnorePathCase.normalizePath(root));
		const normalizedUri = extUriBiasedIgnorePathCase.normalizePath(uri);
		if (!extUriBiasedIgnorePathCase.isEqualOrParent(normalizedUri, normalizedRoot)) {
			return undefined;
		}

		// Native relative paths are case-sensitive on macOS even when containment is not.
		const relativePath = normalizedUri.path.slice(normalizedRoot.path.length);
		return relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
	}

	/**
	 * If the plugin URI was under the old cache root, rebase it to the
	 * new agent-plugins directory. Otherwise, return `undefined` to keep
	 * the original.
	 */
	private _rebasePluginUri(uri: URI): URI | undefined {
		if (!this._oldCacheRoot) {
			return undefined;
		}

		const relativePath = this._getRelativePath(this._oldCacheRoot, uri);
		if (relativePath !== undefined) {
			return joinPath(this._agentPluginsHome, relativePath);
		}
		return undefined;
	}
}
