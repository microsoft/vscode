/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RunOnceScheduler, ThrottledDelayer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
const INSTALLED_JSON_FILENAME = 'installed.json';
const INSTALLED_JSON_VERSION = 1;
/** Legacy storage key used before migration to file-backed store. */
const LEGACY_INSTALLED_PLUGINS_STORAGE_KEY = 'chat.plugins.installed.v1';
/** Legacy storage key for the marketplace index that cached old URI paths. */
const LEGACY_MARKETPLACE_INDEX_STORAGE_KEY = 'chat.plugins.marketplaces.index.v1';
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
    constructor(_agentPluginsHome, _oldCacheRoot, _fileService, _logService, _storageService) {
        super();
        this._agentPluginsHome = _agentPluginsHome;
        this._oldCacheRoot = _oldCacheRoot;
        this._fileService = _fileService;
        this._logService = _logService;
        this._storageService = _storageService;
        this._installed = observableValue('file/installed.json', []);
        this._suppressFileWatch = false;
        this._initialized = false;
        this.value = this._installed;
        this._fileUri = joinPath(_agentPluginsHome, INSTALLED_JSON_FILENAME);
        this._writeDelayer = this._register(new ThrottledDelayer(100));
        void this._initialize();
    }
    get() {
        return this._installed.get();
    }
    set(newValue, tx) {
        this._setValue(newValue, tx, true);
    }
    async _initialize() {
        try {
            const read = await this._readFromFile();
            if (read !== undefined) {
                this._setValue(read, undefined, false);
            }
            else {
                // No installed.json yet — attempt migration from legacy storage.
                await this._migrateFromStorage();
            }
        }
        catch (error) {
            this._logService.error('[FileBackedInstalledPluginsStore] Initialization failed', error);
        }
        this._initialized = true;
        this._setupFileWatcher();
    }
    // --- File I/O ----------------------------------------------------------------
    async _readFromFile() {
        try {
            const exists = await this._fileService.exists(this._fileUri);
            if (!exists) {
                return undefined;
            }
            const content = await this._fileService.readFile(this._fileUri);
            const json = JSON.parse(content.value.toString());
            if (!json || !Array.isArray(json.installed)) {
                this._logService.warn('[FileBackedInstalledPluginsStore] installed.json has unexpected format, ignoring');
                return undefined;
            }
            // Each entry is { pluginUri: string, enabled: boolean }.
            return json.installed
                .filter((entry) => typeof entry.pluginUri === 'string' && typeof entry.marketplace === 'string')
                .map(entry => ({ pluginUri: URI.parse(entry.pluginUri), marketplace: entry.marketplace }));
        }
        catch {
            return undefined;
        }
    }
    _scheduleWrite() {
        void this._writeDelayer.trigger(async () => {
            await this._writeToFile();
        });
    }
    async _writeToFile() {
        const entries = this.get().map(e => ({
            pluginUri: e.pluginUri.toString(),
            marketplace: e.marketplace,
        }));
        const data = {
            version: INSTALLED_JSON_VERSION,
            installed: entries,
        };
        try {
            this._suppressFileWatch = true;
            const content = JSON.stringify(data, undefined, '\t');
            await this._fileService.createFolder(this._agentPluginsHome);
            await this._fileService.writeFile(this._fileUri, VSBuffer.fromString(content));
            return true;
        }
        catch (error) {
            this._logService.error('[FileBackedInstalledPluginsStore] Failed to write installed.json', error);
            return false;
        }
        finally {
            this._suppressFileWatch = false;
        }
    }
    // --- File watching ------------------------------------------------------------
    _setupFileWatcher() {
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
    async _onFileChanged() {
        const read = await this._readFromFile();
        if (read !== undefined) {
            // Suppress file write for externally triggered updates.
            this._suppressFileWatch = true;
            try {
                this._setValue(read, undefined, false);
            }
            finally {
                this._suppressFileWatch = false;
            }
        }
    }
    // --- Write-through to file ----------------------------------------------------
    _setValue(newValue, tx, scheduleWrite) {
        this._installed.set(newValue, tx);
        // Only schedule writes after initialization and when not processing
        // an external file change.
        if (scheduleWrite && this._initialized && !this._suppressFileWatch) {
            this._scheduleWrite();
        }
    }
    // --- Migration from legacy storage -------------------------------------------
    async _migrateFromStorage() {
        const raw = this._storageService.get(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        if (!raw) {
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return;
            }
            const migrated = revive(parsed).map(entry => {
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
            this._storageService.remove(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            this._storageService.remove(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        }
        catch (error) {
            this._logService.error('[FileBackedInstalledPluginsStore] Migration from storage failed', error);
        }
    }
    /**
     * If the plugin URI was under the old cache root, rebase it to the
     * new agent-plugins directory. Otherwise, return `undefined` to keep
     * the original.
     */
    _rebasePluginUri(uri) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUJhY2tlZEluc3RhbGxlZFBsdWdpbnNTdG9yZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3BsdWdpbnMvZmlsZUJhY2tlZEluc3RhbGxlZFBsdWdpbnNTdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNuRSxPQUFPLEVBQTZCLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxtQ0FBbUMsQ0FBQztBQUt2RSxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDO0FBQ2pELE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxDQUFDO0FBRWpDLHFFQUFxRTtBQUNyRSxNQUFNLG9DQUFvQyxHQUFHLDJCQUEyQixDQUFDO0FBQ3pFLDhFQUE4RTtBQUM5RSxNQUFNLG9DQUFvQyxHQUFHLG9DQUFvQyxDQUFDO0FBNEJsRjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXNCRztBQUNILE1BQU0sT0FBTywrQkFBZ0MsU0FBUSxVQUFVO0lBUzlELFlBQ2tCLGlCQUFzQixFQUN0QixhQUE4QixFQUM5QixZQUEwQixFQUMxQixXQUF3QixFQUN4QixlQUFnQztRQUVqRCxLQUFLLEVBQUUsQ0FBQztRQU5TLHNCQUFpQixHQUFq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