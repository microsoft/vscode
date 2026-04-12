/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { CLAUDE_CONFIG_FOLDER } from '../promptSyntax/config/promptFileLocations.js';
import { parseMarketplaceReference } from './marketplaceReference.js';
const SETTINGS_FILENAME = 'settings.json';
const SETTINGS_LOCAL_FILENAME = 'settings.local.json';
/** Copilot CLI settings folder inside `.github/`. */
const COPILOT_CONFIG_FOLDER = '.github/copilot';
export const IWorkspacePluginSettingsService = createDecorator('workspacePluginSettingsService');
/**
 * Converts a single `extraKnownMarketplaces` entry into an
 * {@link IMarketplaceReference} by mapping the source format to
 * existing marketplace reference parsing.
 */
function marketplaceEntryToReference(entry) {
    // Two shapes supported:
    // 1. { source: "github", repo: "owner/repo" }   →  GitHub shorthand
    // 2. { source: { source: "github", repo: "owner/repo" } }  →  nested
    // 3. { source: "git", url: "https://..." }       →  Git URI
    let sourceType;
    let repo;
    let url;
    if (typeof entry.source === 'object' && entry.source !== null) {
        const nested = entry.source;
        sourceType = nested.source;
        repo = nested.repo;
        url = nested.url;
    }
    else {
        sourceType = entry.source;
        repo = entry.repo;
        url = entry.url;
    }
    if (sourceType === 'github' && typeof repo === 'string') {
        return parseMarketplaceReference(repo);
    }
    if (sourceType === 'git' && typeof url === 'string') {
        return parseMarketplaceReference(url);
    }
    return undefined;
}
/**
 * Parses `enabledPlugins` from a JSON object.
 */
function parseEnabledPlugins(json) {
    const result = new Map();
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return result;
    }
    const obj = json;
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'boolean') {
            result.set(key, value);
        }
    }
    return result;
}
/**
 * Parses `extraKnownMarketplaces` from a JSON object.
 */
function parseExtraMarketplaces(json, logPrefix, logService) {
    const entries = [];
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return entries;
    }
    const obj = json;
    for (const [name, value] of Object.entries(obj)) {
        if (!value || typeof value !== 'object') {
            logService.debug(`${logPrefix} Ignoring non-object extraKnownMarketplaces entry: ${name}`);
            continue;
        }
        const reference = marketplaceEntryToReference(value);
        if (!reference) {
            logService.debug(`${logPrefix} Could not parse marketplace reference for: ${name}`);
            continue;
        }
        // Override displayLabel with the user-chosen marketplace name so that
        // fetched plugins use this name in their `marketplace` field, which is
        // what `enabledPlugins` keys reference (e.g. "plugin@claude-settings").
        entries.push({ name, reference: { ...reference, displayLabel: name } });
    }
    return entries;
}
const EMPTY_DATA = { marketplaces: [], enabledPlugins: new Map() };
/**
 * Reads `enabledPlugins` and `extraKnownMarketplaces` from a pair of
 * `settings.json` / `settings.local.json` files inside a given config
 * folder (e.g. `.claude/` or `.github/copilot/`) across all workspace
 * folders. Watches for changes and exposes results as an observable.
 */
class WorkspaceSettingsReader extends Disposable {
    constructor(
    /** Workspace-relative config folder (e.g. `.claude`). */
    configFolder, logPrefix, fileService, workspaceContextService, _logService) {
        super();
        this._logService = _logService;
        this._data = observableValue('data', EMPTY_DATA);
        this.data = this._data;
        const settingsDirs = observableFromEvent(this, workspaceContextService.onDidChangeWorkspaceFolders, () => workspaceContextService.getWorkspace().folders.map(f => joinPath(f.uri, configFolder)));
        const watcherStore = this._register(new DisposableStore());
        this._register(autorun(reader => {
            const dirs = settingsDirs.read(reader);
            watcherStore.clear();
            // Coalesce rapid file-change events into a single read.
            const scheduler = new RunOnceScheduler(() => this._readSettings(dirs, logPrefix, fileService), 100);
            watcherStore.add(scheduler);
            for (const dir of dirs) {
                const watcher = fileService.createWatcher(dir, { recursive: false, excludes: [] });
                watcherStore.add(watcher);
                watcherStore.add(watcher.onDidChange(e => {
                    if (e.affects(joinPath(dir, SETTINGS_FILENAME)) || e.affects(joinPath(dir, SETTINGS_LOCAL_FILENAME))) {
                        scheduler.schedule();
                    }
                }));
            }
            // Perform initial read immediately.
            this._readSettings(dirs, logPrefix, fileService);
        }));
    }
    async _readSettings(dirs, logPrefix, fileService) {
        const allMarketplaces = [];
        const mergedEnabled = new Map();
        for (const dir of dirs) {
            const sharedUri = joinPath(dir, SETTINGS_FILENAME);
            const localUri = joinPath(dir, SETTINGS_LOCAL_FILENAME);
            for (const uri of [sharedUri, localUri]) {
                try {
                    const content = await fileService.readFile(uri);
                    const json = parseJSONC(content.value.toString());
                    if (!json || typeof json !== 'object') {
                        continue;
                    }
                    const root = json;
                    const marketplaces = parseExtraMarketplaces(root.extraKnownMarketplaces, logPrefix, this._logService);
                    for (const entry of marketplaces) {
                        if (!allMarketplaces.some(e => e.reference.canonicalId === entry.reference.canonicalId)) {
                            allMarketplaces.push(entry);
                        }
                    }
                    const enabled = parseEnabledPlugins(root.enabledPlugins);
                    for (const [key, value] of enabled) {
                        mergedEnabled.set(key, value);
                    }
                }
                catch {
                    this._logService.debug(`${logPrefix} Could not read ${uri.toString()}`);
                }
            }
        }
        this._data.set({ marketplaces: allMarketplaces, enabledPlugins: mergedEnabled }, undefined);
    }
}
// --- Aggregating service implementation --------------------------------------
let WorkspacePluginSettingsService = class WorkspacePluginSettingsService extends Disposable {
    constructor(fileService, workspaceContextService, logService) {
        super();
        const claudeReader = this._register(new WorkspaceSettingsReader(CLAUDE_CONFIG_FOLDER, '[ClaudePluginSettings]', fileService, workspaceContextService, logService));
        const copilotReader = this._register(new WorkspaceSettingsReader(COPILOT_CONFIG_FOLDER, '[CopilotPluginSettings]', fileService, workspaceContextService, logService));
        // Merge marketplaces from all readers, deduplicating by canonical ID.
        this.extraMarketplaces = derived(reader => {
            const claude = claudeReader.data.read(reader).marketplaces;
            const copilot = copilotReader.data.read(reader).marketplaces;
            const byCanonicalId = new Map();
            for (const entry of [...claude, ...copilot]) {
                if (!byCanonicalId.has(entry.reference.canonicalId)) {
                    byCanonicalId.set(entry.reference.canonicalId, entry);
                }
            }
            return [...byCanonicalId.values()];
        });
        // Merge enabledPlugins from all readers. Claude entries take
        // precedence for keys that exist in both (first-writer wins).
        this.enabledPlugins = derived(reader => {
            const claude = claudeReader.data.read(reader).enabledPlugins;
            const copilot = copilotReader.data.read(reader).enabledPlugins;
            const merged = new Map();
            for (const [key, value] of claude) {
                merged.set(key, value);
            }
            for (const [key, value] of copilot) {
                if (!merged.has(key)) {
                    merged.set(key, value);
                }
            }
            return merged;
        });
    }
};
WorkspacePluginSettingsService = __decorate([
    __param(0, IFileService),
    __param(1, IWorkspaceContextService),
    __param(2, ILogService)
], WorkspacePluginSettingsService);
export { WorkspacePluginSettingsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy93b3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFlLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQy9ILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNyRixPQUFPLEVBQXlCLHlCQUF5QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFN0YsTUFBTSxpQkFBaUIsR0FBRyxlQUFlLENBQUM7QUFDMUMsTUFBTSx1QkFBdUIsR0FBRyxxQkFBcUIsQ0FBQztBQUV0RCxxREFBcUQ7QUFDckQsTUFBTSxxQkFBcUIsR0FBRyxpQkFBaUIsQ0FBQztBQVVo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