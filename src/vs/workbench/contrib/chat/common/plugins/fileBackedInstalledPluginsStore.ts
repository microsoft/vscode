/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, ThrottledDelayer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { IObservable, ITransaction, observableValue } from '../../../../../base/common/observable.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';

const INSTALLED_JSON_FILENAME = 'installed.json';
const INSTALLED_JSON_VERSION = 1;

/** Legacy storage key used before migration to file-backed store. */
const LEGACY_INSTALLED_PLUGINS_STORAGE_KEY = 'chat.plugins.installed.v1';
/** Legacy storage key for the marketplace index that cached old URI paths. */
const LEGACY_MARKETPLACE_INDEX_STORAGE_KEY = 'chat.plugins.marketplaces.index.v1';

/**
 * Minimal entry stored in `installed.json`. URIs are serialised as strings
 * so that external tools can read and write the file without depending on
 * VS Code internal URI representations.
 */
interface IInstalledJsonEntry {
	readonly pluginUri: string;
	readonly marketplace: string;
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
	readonly marketplace: string;
}

/**
 * An observable store for installed agent plugins that is backed by a
 * `installed.json` file within the agent-plugins directory. This makes
 * the installed-plugin manifest discoverable by external tools (CLIs,
 * other editors, etc.) without depending on VS Code internals.
 *
 * The on-disk format stores only the plugin URI (as a string) and the
 * marketplace identifier. Plugin metadata (name, description, etc.) is
 * read from the plugin manifest on disk by the discovery layer -
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
	private _suppressFileWatch = false;
	private _initialized = false;

	readonly value: IObservable<readonly IStoredInstalledPlugin[]> = this._installed;

	constructor(
		private readonly _agentPluginsHome: URI,
		private readonly _oldCacheRoot: URI | undefined,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _storageService: IStorageService,
	) {
		super();
		this._fileUri = joinPath(_agentPluginsHome, INSTALLED_JSON_FILENAME);
		this._writeDelayer = this._register(new ThrottledDelayer<void>(100));
		void this._initialize();
	}

	get(): readonly IStoredInstalledPlugin[] {
		return this._installed.get();
	}

	set(newValue: readonly IStoredInstalledPlugin[], tx: ITransaction | undefined): void {
		this._setValue(newValue, tx, true);
	}

	private async _initialize(): Promise<void> {
		try {
			const read = await this._readFromFile();
			if (read !== undefined) {
				this._setValue(read, undefined, false);
			} else {
				// No installed.json yet — attempt migration from legacy storage.
				await this._migrateFromStorage();
			}
		} catch (error) {
			this._logService.error('[FileBackedInstalledPluginsStore] Initialization failed', error);
		}

		this._initialized = true;
		this._setupFileWatcher();
	}

	// --- File I/O ----------------------------------------------------------------

	private async _readFromFile(): Promise<readonly IStoredInstalledPlugin[] | undefined> {
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

			// Each entry is { pluginUri: string, enabled: boolean }.
			return json.installed
				.filter((entry): entry is IInstalledJsonEntry => typeof entry.pluginUri === 'string' && typeof entry.marketplace === 'string')
				.map(entry => ({ pluginUri: URI.parse(entry.pluginUri), marketplace: entry.marketplace }));
		} catch {
			return undefined;
		}
	}

	private _scheduleWrite(): void {
		void this._writeDelayer.trigger(async () => {
			await this._writeToFile();
		});
	}

	private async _writeToFile(): Promise<boolean> {
		const entries: IInstalledJsonEntry[] = this.get().map(e => ({
			pluginUri: e.pluginUri.toString(),
			marketplace: e.marketplace,
		}));

		const data: IInstalledJson = {
			version: INSTALLED_JSON_VERSION,
			installed: entries,
		};

		try {
			this._suppressFileWatch = true;
			const content = JSON.stringify(data, undefined, '\t');
			await this._fileService.createFolder(this._agentPluginsHome);
			await this._fileService.writeFile(this._fileUri, VSBuffer.fromString(content));
			return true;
		} catch (error) {
			this._logService.error('[FileBackedInstalledPluginsStore] Failed to write installed.json', error);
			return false;
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

		const scheduler = this._register(new RunOnceScheduler(() => this._onFileChanged(), 100));
		this._register(watcher.onDidChange(e => {
			if (!this._suppressFileWatch && e.affects(this._fileUri)) {
				scheduler.schedule();
			}
		}));
	}

	private async _onFileChanged(): Promise<void> {
		const read = await this._readFromFile();
		if (read !== undefined) {
			// Suppress file write for externally triggered updates.
			this._suppressFileWatch = true;
			try {
				this._setValue(read, undefined, false);
			} finally {
				this._suppressFileWatch = false;
			}
		}
	}

	// --- Write-through to file ----------------------------------------------------

	private _setValue(newValue: readonly IStoredInstalledPlugin[], tx: ITransaction | undefined, scheduleWrite: boolean): void {
		this._installed.set(newValue, tx);
		// Only schedule writes after initialization and when not processing
		// an external file change.
		if (scheduleWrite && this._initialized && !this._suppressFileWatch) {
			this._scheduleWrite();
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

			const migrated: IStoredInstalledPlugin[] = (revive(parsed) as { pluginUri: UriComponents; plugin?: { marketplaceReference?: { rawValue?: string } } }[]).map(entry => {
				const uri = URI.revive(entry.pluginUri);
				const rebased = this._rebasePluginUri(uri);
				return {
					pluginUri: rebased ?? uri,
					marketplace: entry.plugin?.marketplaceReference?.rawValue ?? '',
				};
			}).filter(e => !!e.marketplace);

			this._logService.info(`[FileBackedInstalledPluginsStore] Migrating ${migrated.length} plugin(s) from storage to installed.json`);

			// Set in memory and persist to file before removing legacy keys.
			this._setValue(migrated, undefined, false);
			const didPersist = await this._writeToFile();
			if (!didPersist) {
				return;
			}

			// Clean up legacy keys.
			this._storageService.remove(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, StorageScope.APPLICATION);
			this._storageService.remove(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
		} catch (error) {
			this._logService.error('[FileBackedInstalledPluginsStore] Migration from storage failed', error);
		}
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

		const oldRoot = this._oldCacheRoot;
		if (!isEqual(uri, oldRoot) && uri.scheme === oldRoot.scheme && uri.path.startsWith(oldRoot.path + '/')) {
			const relativePart = uri.path.substring(oldRoot.path.length);
			return uri.with({ path: this._agentPluginsHome.path + relativePart });
		}
		return undefined;
	}
}
