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
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { untildify } from '../../../../../base/common/labels.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, ObservablePromise, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { posix, win32 } from '../../../../../base/common/path.js';
import { basename, isEqualOrParent, joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { getConfigValueInTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { parseComponentPathConfig, resolveComponentDirs, readSkills, readMarkdownComponents, parseMcpServerDefinitionMap, detectPluginFormat, } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { Extensions } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatConfiguration } from '../constants.js';
import { EnablementModel } from '../enablement.js';
import { HookType } from '../promptSyntax/hookTypes.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { agentPluginDiscoveryRegistry } from './agentPluginService.js';
import { IPluginMarketplaceService } from './pluginMarketplaceService.js';
// Re-export shared helpers so existing consumers (including tests) continue to work.
export { shellQuotePluginRootInCommand, resolveMcpServersMap, convertBareEnvVarsToVsCodeSyntax } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
/**
 * Converts platform-layer parsed hook groups to the workbench's {@link IAgentPluginHook} type.
 * The canonical type strings from the platform layer map directly to {@link HookType} enum values.
 */
function toAgentPluginHooks(groups) {
    return groups
        .filter(g => Object.values(HookType).includes(g.type))
        .map(g => ({
        type: g.type,
        hooks: g.commands,
        uri: g.uri,
        originalId: g.originalId,
    }));
}
/** File suffixes accepted for rule/instruction files (longest first for correct name stripping). */
const RULE_FILE_SUFFIXES = ['.instructions.md', '.mdc', '.md'];
/**
 * Resolves the workspace folder that contains the plugin URI for cwd resolution,
 * falling back to the first workspace folder for plugins outside the workspace.
 */
function resolveWorkspaceRoot(pluginUri, workspaceContextService) {
    const defaultFolder = workspaceContextService.getWorkspace().folders[0];
    const folder = workspaceContextService.getWorkspaceFolder(pluginUri) ?? defaultFolder;
    return folder?.uri;
}
let AgentPluginService = class AgentPluginService extends Disposable {
    constructor(instantiationService, configurationService, storageService) {
        super();
        this.enablementModel = this._register(new EnablementModel('agentPlugins.enablement', storageService));
        const pluginsEnabled = observableConfigValue(ChatConfiguration.PluginsEnabled, true, configurationService);
        const discoveries = [];
        for (const descriptor of agentPluginDiscoveryRegistry.getAll()) {
            const discovery = instantiationService.createInstance(descriptor);
            this._register(discovery);
            discoveries.push(discovery);
            discovery.start(this.enablementModel);
        }
        this.plugins = derived(read => {
            if (!pluginsEnabled.read(read)) {
                return [];
            }
            return this._dedupeAndSort(discoveries.flatMap(d => d.plugins.read(read)));
        });
    }
    _dedupeAndSort(plugins) {
        const unique = [];
        const seen = new ResourceSet();
        for (const plugin of plugins) {
            if (seen.has(plugin.uri)) {
                continue;
            }
            seen.add(plugin.uri);
            unique.push(plugin);
        }
        unique.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
        return unique;
    }
};
AgentPluginService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IConfigurationService),
    __param(2, IStorageService)
], AgentPluginService);
export { AgentPluginService };
/**
 * Shared base class for plugin discovery implementations. Contains the common
 * logic for reading plugin contents (commands, skills, agents, hooks, MCP server
 * definitions) from the filesystem and watching for live updates.
 *
 * Subclasses implement {@link _discoverPluginSources} to determine *which*
 * plugins exist, while this class handles the rest.
 */
export class AbstractAgentPluginDiscovery extends Disposable {
    constructor(_fileService, _pathService, _logService, _workspaceContextService) {
        super();
        this._fileService = _fileService;
        this._pathService = _pathService;
        this._logService = _logService;
        this._workspaceContextService = _workspaceContextService;
        this._pluginEntries = new Map();
        this._plugins = observableValue('discoveredAgentPlugins', []);
        this.plugins = this._plugins;
        this._discoverVersion = 0;
    }
    async _refreshPlugins() {
        const version = ++this._discoverVersion;
        const plugins = await this._discoverAndBuildPlugins();
        if (version !== this._discoverVersion || this._store.isDisposed) {
            return;
        }
        this._plugins.set(plugins, undefined);
    }
    async _discoverAndBuildPlugins() {
        const sources = await this._discoverPluginSources();
        const plugins = [];
        const seenPluginUris = new Set();
        for (const source of sources) {
            const key = source.uri.toString();
            if (!seenPluginUris.has(key)) {
                seenPluginUris.add(key);
                const format = await detectPluginFormat(source.uri, this._fileService);
                plugins.push(this._toPlugin(source.uri, format, source.fromMarketplace, () => source.remove()));
            }
        }
        this._disposePluginEntriesExcept(seenPluginUris);
        plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
        return plugins;
    }
    async _pathExists(resource) {
        try {
            await this._fileService.resolve(resource);
            return true;
        }
        catch {
            return false;
        }
    }
    _toPlugin(uri, format, fromMarketplace, removeCallback) {
        const key = uri.toString();
        const existing = this._pluginEntries.get(key);
        if (existing) {
            if (existing.format.format !== format.format) {
                existing.store.dispose();
                this._pluginEntries.delete(key);
            }
            else {
                return existing.plugin;
            }
        }
        const store = new DisposableStore();
        const enablement = derived(r => this._enablementModel.readEnabled(key, r));
        // Track current component directories for the file watcher. These are
        // updated whenever the manifest is read (inside each component reader).
        const manifest = observableValue('agentPluginManifest', undefined);
        const observeComponent = (prop, doRead, tryReadEmbedded, defaultPath = prop) => {
            const secondObs = derivedOpts({ equalsFn: equals }, reader => manifest.read(reader)?.[prop]);
            const wrapped = derived(reader => {
                const section = secondObs.read(reader);
                if (tryReadEmbedded) {
                    if (section && typeof section === 'object' && !Array.isArray(section) && !(hasKey(section, { paths: true }))) {
                        return { kind: 'const', data: new ObservablePromise(tryReadEmbedded(section)) };
                    }
                }
                const paths = parseComponentPathConfig(section);
                const dirs = resolveComponentDirs(uri, defaultPath, paths);
                for (const d of dirs) {
                    const watcher = this._fileService.createWatcher(d, { recursive: false, excludes: [] });
                    reader.store.add(watcher);
                    reader.store.add(watcher.onDidChange(() => changeTrigger.trigger(undefined)));
                }
                return { kind: 'dirs', dirs: dirs };
            });
            const changeTrigger = observableSignal('fileChange');
            const promised = derived(reader => {
                const w = wrapped.read(reader);
                if (w.kind === 'const') {
                    return w.data.promiseResult;
                }
                else {
                    changeTrigger.read(reader); // re-run when a relevant file change occurs
                    const promise = new ObservablePromise(doRead(w.dirs));
                    return promise.promiseResult;
                }
            });
            const result = promised.map((w, r) => w.read(r)?.data ?? Iterable.empty());
            return result.recomputeInitiallyAndOnChange(store);
        };
        const manifestUri = joinPath(uri, format.manifestPath);
        const commands = observeComponent('commands', d => readMarkdownComponents(d, this._fileService));
        const skills = observeComponent('skills', d => readSkills(uri, d, this._fileService));
        const agents = observeComponent('agents', d => readMarkdownComponents(d, this._fileService));
        const instructions = observeComponent('rules', d => this._readRules(d));
        const hooks = observeComponent('hooks', paths => this._readHooksFromPaths(uri, paths, format), async (section) => {
            const userHome = (await this._pathService.userHome()).fsPath;
            const workspaceRoot = resolveWorkspaceRoot(uri, this._workspaceContextService);
            return toAgentPluginHooks(format.parseHooks(manifestUri, section, uri, workspaceRoot, userHome));
        }, format.hookConfigPath);
        const mcpServerDefinitions = observeComponent('mcpServers', paths => this._readMcpDefinitionsFromPaths(paths, uri.fsPath, format), async (section) => parseMcpServerDefinitionMap(manifestUri, { mcpServers: section }, uri.fsPath, format), '.mcp.json');
        // Read the manifest initially and re-read whenever manifest files change.
        const readManifest = async () => {
            manifest.set(await this._readManifest(uri, format), undefined);
        };
        const manifestWatcher = this._fileService.createWatcher(manifestUri, { recursive: false, excludes: [] });
        store.add(manifestWatcher);
        store.add(manifestWatcher.onDidChange(() => readManifest()));
        readManifest();
        const plugin = {
            uri,
            label: fromMarketplace?.name ?? basename(uri),
            enablement,
            remove: removeCallback,
            hooks,
            commands,
            skills,
            agents,
            instructions,
            mcpServerDefinitions,
            fromMarketplace,
        };
        this._pluginEntries.set(key, { store, plugin, format });
        return plugin;
    }
    async _readManifest(pluginUri, format) {
        const json = await this._readJsonFile(joinPath(pluginUri, format.manifestPath));
        if (json && typeof json === 'object') {
            return json;
        }
        return undefined;
    }
    /**
     * Reads hook definitions from a list of resolved paths (JSON files).
     * Each path is tried in order; the first one that contains valid hook
     * JSON is used.
     */
    async _readHooksFromPaths(pluginUri, paths, format) {
        const userHome = (await this._pathService.userHome()).fsPath;
        const workspaceRoot = resolveWorkspaceRoot(pluginUri, this._workspaceContextService);
        for (const hookPath of paths) {
            const json = await this._readJsonFile(hookPath);
            if (json) {
                try {
                    return toAgentPluginHooks(format.parseHooks(hookPath, json, pluginUri, workspaceRoot, userHome));
                }
                catch (e) {
                    this._logService.info(`[AgentPluginDiscovery] Failed to parse hooks from ${hookPath.toString()}:`, e);
                }
            }
        }
        return [];
    }
    /**
     * Reads MCP server definitions from a list of resolved paths (JSON files).
     * Definitions from all files are merged; the first definition for a given
     * server name wins.
     */
    async _readMcpDefinitionsFromPaths(paths, pluginFsPath, format) {
        const merged = new Map();
        for (const mcpPath of paths) {
            const json = await this._readJsonFile(mcpPath);
            for (const def of parseMcpServerDefinitionMap(mcpPath, json, pluginFsPath, format)) {
                if (!merged.has(def.name)) {
                    merged.set(def.name, def);
                }
            }
        }
        return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    async _readJsonFile(uri) {
        try {
            const fileContents = await this._fileService.readFile(uri);
            return parseJSONC(fileContents.value.toString());
        }
        catch {
            return undefined;
        }
    }
    /**
     * Scans directories for rule/instruction files (`.mdc`, `.md`,
     * `.instructions.md`), returning `{ uri, name }` entries where name is
     * derived from the filename minus the matched suffix.
     */
    async _readRules(dirs) {
        const seen = new Set();
        const items = [];
        const matchSuffix = (filename) => {
            const lower = filename.toLowerCase();
            return RULE_FILE_SUFFIXES.find(s => lower.endsWith(s));
        };
        const addItem = (name, uri) => {
            if (!seen.has(name)) {
                seen.add(name);
                items.push({ uri, name });
            }
        };
        for (const dir of dirs) {
            let stat;
            try {
                stat = await this._fileService.resolve(dir);
            }
            catch {
                continue;
            }
            if (stat.isFile) {
                const suffix = matchSuffix(basename(dir));
                if (suffix) {
                    addItem(basename(dir).slice(0, -suffix.length), dir);
                }
                continue;
            }
            if (!stat.isDirectory || !stat.children) {
                continue;
            }
            for (const child of stat.children) {
                if (!child.isFile) {
                    continue;
                }
                const suffix = matchSuffix(child.name);
                if (suffix) {
                    addItem(child.name.slice(0, -suffix.length), child.resource);
                }
            }
        }
        items.sort((a, b) => a.name.localeCompare(b.name));
        return items;
    }
    _disposePluginEntriesExcept(keep) {
        for (const [key, entry] of this._pluginEntries) {
            if (!keep.has(key)) {
                entry.store.dispose();
                this._pluginEntries.delete(key);
            }
        }
    }
    dispose() {
        this._disposePluginEntriesExcept(new Set());
        super.dispose();
    }
}
let ConfiguredAgentPluginDiscovery = class ConfiguredAgentPluginDiscovery extends AbstractAgentPluginDiscovery {
    constructor(_configurationService, fileService, _pluginMarketplaceService, workspaceContextService, pathService, logService) {
        super(fileService, pathService, logService, workspaceContextService);
        this._configurationService = _configurationService;
        this._pluginMarketplaceService = _pluginMarketplaceService;
        this._pluginLocationsConfig = observableConfigValue(ChatConfiguration.PluginLocations, {}, _configurationService);
    }
    start(enablementModel) {
        this._enablementModel = enablementModel;
        const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
        this._register(autorun(reader => {
            this._pluginLocationsConfig.read(reader);
            scheduler.schedule();
        }));
        scheduler.schedule();
    }
    async _discoverPluginSources() {
        const sources = [];
        const config = this._pluginLocationsConfig.get();
        const userHome = await this._getUserHome();
        for (const [path, enabled] of Object.entries(config)) {
            if (!path.trim() || enabled === false) {
                continue;
            }
            const resources = this._resolvePluginPath(path.trim(), userHome);
            for (const resource of resources) {
                let stat;
                try {
                    stat = await this._fileService.resolve(resource);
                }
                catch {
                    this._logService.debug(`[ConfiguredAgentPluginDiscovery] Could not resolve plugin path: ${resource.toString()}`);
                    continue;
                }
                if (!stat.isDirectory) {
                    this._logService.debug(`[ConfiguredAgentPluginDiscovery] Plugin path is not a directory: ${resource.toString()}`);
                    continue;
                }
                const fromMarketplace = this._pluginMarketplaceService.getMarketplacePluginMetadata(stat.resource);
                const configKey = path;
                sources.push({
                    uri: stat.resource,
                    fromMarketplace,
                    remove: () => this._removePluginPath(configKey),
                });
            }
        }
        return sources;
    }
    async _getUserHome() {
        const userHome = await this._pathService.userHome();
        return userHome.scheme === 'file' ? userHome.fsPath : userHome.path;
    }
    /**
     * Resolves a plugin path to one or more resource URIs. Supports:
     * - Absolute paths (used directly)
     * - Tilde paths (expanded to user home directory)
     * - Relative paths (resolved against each workspace folder)
     */
    _resolvePluginPath(path, userHome) {
        if (path.startsWith('~')) {
            path = untildify(path, userHome);
        }
        // Handle absolute paths
        if (win32.isAbsolute(path) || posix.isAbsolute(path)) {
            return [URI.file(path)];
        }
        return this._workspaceContextService.getWorkspace().folders.map(folder => joinPath(folder.uri, path));
    }
    /**
     * Removes a plugin path from `chat.pluginLocations` in the most specific
     * config target where the key is defined.
     */
    _removePluginPath(configKey) {
        const inspected = this._configurationService.inspect(ChatConfiguration.PluginLocations);
        const targets = [
            6 /* ConfigurationTarget.WORKSPACE_FOLDER */,
            5 /* ConfigurationTarget.WORKSPACE */,
            3 /* ConfigurationTarget.USER_LOCAL */,
            4 /* ConfigurationTarget.USER_REMOTE */,
            2 /* ConfigurationTarget.USER */,
            1 /* ConfigurationTarget.APPLICATION */,
        ];
        for (const target of targets) {
            const mapping = getConfigValueInTarget(inspected, target);
            if (mapping && Object.prototype.hasOwnProperty.call(mapping, configKey)) {
                const updated = { ...mapping };
                delete updated[configKey];
                this._configurationService.updateValue(ChatConfiguration.PluginLocations, updated, target);
                return;
            }
        }
    }
};
ConfiguredAgentPluginDiscovery = __decorate([
    __param(0, IConfigurationService),
    __param(1, IFileService),
    __param(2, IPluginMarketplaceService),
    __param(3, IWorkspaceContextService),
    __param(4, IPathService),
    __param(5, ILogService)
], ConfiguredAgentPluginDiscovery);
export { ConfiguredAgentPluginDiscovery };
let MarketplaceAgentPluginDiscovery = class MarketplaceAgentPluginDiscovery extends AbstractAgentPluginDiscovery {
    constructor(_pluginMarketplaceService, _pluginRepositoryService, fileService, pathService, logService, workspaceContextService) {
        super(fileService, pathService, logService, workspaceContextService);
        this._pluginMarketplaceService = _pluginMarketplaceService;
        this._pluginRepositoryService = _pluginRepositoryService;
    }
    start(enablementModel) {
        this._enablementModel = enablementModel;
        const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
        this._register(autorun(reader => {
            this._pluginMarketplaceService.installedPlugins.read(reader);
            scheduler.schedule();
        }));
        scheduler.schedule();
    }
    async _discoverPluginSources() {
        const installed = this._pluginMarketplaceService.installedPlugins.get();
        const sources = [];
        for (const entry of installed) {
            let stat;
            try {
                stat = await this._fileService.resolve(entry.pluginUri);
            }
            catch {
                this._logService.debug(`[MarketplaceAgentPluginDiscovery] Could not resolve installed plugin: ${entry.pluginUri.toString()}`);
                continue;
            }
            if (!stat.isDirectory) {
                this._logService.debug(`[MarketplaceAgentPluginDiscovery] Installed plugin path is not a directory: ${entry.pluginUri.toString()}`);
                continue;
            }
            sources.push({
                uri: stat.resource,
                fromMarketplace: entry.plugin,
                remove: () => {
                    this._enablementModel.remove(stat.resource.toString());
                    this._pluginMarketplaceService.removeInstalledPlugin(entry.pluginUri);
                    // Pass remaining installed descriptors so the repository service
                    // can skip deletion when other plugins share the same cache dir.
                    const remaining = this._pluginMarketplaceService.installedPlugins.get();
                    this._pluginRepositoryService.cleanupPluginSource(entry.plugin, remaining.map(e => e.plugin.sourceDescriptor)).catch(error => {
                        this._logService.error('[MarketplaceAgentPluginDiscovery] Failed to clean up plugin source', error);
                    });
                },
            });
        }
        return sources;
    }
};
MarketplaceAgentPluginDiscovery = __decorate([
    __param(0, IPluginMarketplaceService),
    __param(1, IAgentPluginRepositoryService),
    __param(2, IFileService),
    __param(3, IPathService),
    __param(4, ILogService),
    __param(5, IWorkspaceContextService)
], MarketplaceAgentPluginDiscovery);
export { MarketplaceAgentPluginDiscovery };
const epPlugins = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'chatPlugins',
    jsonSchema: {
        description: localize('chatPlugins.schema.description', 'Contributes agent plugins for chat.'),
        type: 'array',
        items: {
            additionalProperties: false,
            type: 'object',
            defaultSnippets: [{
                    body: {
                        path: './relative/path/to/plugin/',
                    }
                }],
            required: ['path'],
            properties: {
                path: {
                    description: localize('chatPlugins.property.path', 'Path to the agent plugin root directory relative to the extension root.'),
                    type: 'string'
                },
                when: {
                    description: localize('chatPlugins.property.when', '(Optional) A condition which must be true to enable this plugin.'),
                    type: 'string'
                }
            }
        }
    }
});
let ExtensionAgentPluginDiscovery = class ExtensionAgentPluginDiscovery extends AbstractAgentPluginDiscovery {
    constructor(_commandService, _contextKeyService, _dialogService, fileService, pathService, logService, workspaceContextService) {
        super(fileService, pathService, logService, workspaceContextService);
        this._commandService = _commandService;
        this._contextKeyService = _contextKeyService;
        this._dialogService = _dialogService;
        this._extensionPlugins = new Map();
        this._whenKeys = new Set();
    }
    start(enablementModel) {
        this._enablementModel = enablementModel;
        const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
        this._register(this._contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(this._whenKeys)) {
                scheduler.schedule();
            }
        }));
        epPlugins.setHandler((_extensions, delta) => {
            for (const ext of delta.added) {
                for (const raw of ext.value) {
                    if (!raw.path) {
                        ext.collector.error(localize('extension.plugin.missing.path', "Extension '{0}' cannot register a chatPlugins entry without a path.", ext.description.identifier.value));
                        continue;
                    }
                    const pluginUri = joinPath(ext.description.extensionLocation, raw.path);
                    if (!isEqualOrParent(pluginUri, ext.description.extensionLocation)) {
                        ext.collector.error(localize('extension.plugin.invalid.path', "Extension '{0}' chatPlugins entry '{1}' resolves outside the extension.", ext.description.identifier.value, raw.path));
                        continue;
                    }
                    let whenExpr;
                    if (raw.when) {
                        whenExpr = ContextKeyExpr.deserialize(raw.when);
                        if (!whenExpr) {
                            ext.collector.error(localize('extension.plugin.invalid.when', "Extension '{0}' chatPlugins entry '{1}' has an invalid when clause: '{2}'.", ext.description.identifier.value, raw.path, raw.when));
                            continue;
                        }
                    }
                    this._extensionPlugins.set(extensionPluginKey(ext.description.identifier, raw.path), { uri: pluginUri, when: whenExpr, extensionId: ext.description.identifier.value });
                }
            }
            for (const ext of delta.removed) {
                for (const raw of ext.value) {
                    this._extensionPlugins.delete(extensionPluginKey(ext.description.identifier, raw.path));
                }
            }
            this._rebuildWhenKeys();
            scheduler.schedule();
        });
    }
    _rebuildWhenKeys() {
        this._whenKeys.clear();
        for (const { when } of this._extensionPlugins.values()) {
            if (when) {
                for (const key of when.keys()) {
                    this._whenKeys.add(key);
                }
            }
        }
    }
    async _discoverPluginSources() {
        const sources = [];
        for (const [, entry] of this._extensionPlugins) {
            if (entry.when && !this._contextKeyService.contextMatchesRules(entry.when)) {
                continue;
            }
            let stat;
            try {
                stat = await this._fileService.resolve(entry.uri);
            }
            catch {
                this._logService.debug(`[ExtensionAgentPluginDiscovery] Could not resolve extension plugin path: ${entry.uri.toString()}`);
                continue;
            }
            if (!stat.isDirectory) {
                this._logService.debug(`[ExtensionAgentPluginDiscovery] Extension plugin path is not a directory: ${entry.uri.toString()}`);
                continue;
            }
            sources.push({
                uri: stat.resource,
                fromMarketplace: undefined,
                remove: () => this._promptUninstallExtension(entry.extensionId),
            });
        }
        return sources;
    }
    async _promptUninstallExtension(extensionId) {
        const { confirmed } = await this._dialogService.confirm({
            message: localize('uninstallExtensionForPlugin', "This plugin is provided by the extension '{0}'. Do you want to uninstall the extension?", extensionId),
        });
        if (confirmed) {
            await this._commandService.executeCommand('workbench.extensions.uninstallExtension', extensionId);
        }
    }
};
ExtensionAgentPluginDiscovery = __decorate([
    __param(0, ICommandService),
    __param(1, IContextKeyService),
    __param(2, IDialogService),
    __param(3, IFileService),
    __param(4, IPathService),
    __param(5, ILogService),
    __param(6, IWorkspaceContextService)
], ExtensionAgentPluginDiscovery);
export { ExtensionAgentPluginDiscovery };
function extensionPluginKey(extensionId, path) {
    return `${extensionId.value}/${path}`;
}
class ChatPluginsDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.chatPlugins?.length;
    }
    render(manifest) {
        const contributions = manifest.contributes?.chatPlugins ?? [];
        if (!contributions.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('chatPluginsPath', "Path"),
            localize('chatPluginsWhen', "When"),
        ];
        const rows = contributions.map(d => [
            d.path,
            d.when ?? '-',
        ]);
        return {
            data: { headers, rows },
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'chatPlugins',
    label: localize('chatPlugins', "Chat Plugins"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ChatPluginsDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5TZXJ2aWNlSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBZSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM1SixPQUFPLEVBQ04sS0FBSyxFQUNMLEtBQUssRUFDTCxNQUFNLG9DQUFvQyxDQUFDO0FBQzVDLE9BQU8sRUFDTixRQUFRLEVBQUUsZUFBZSxFQUFFLFFBQVEsRUFDbkMsTUFBTSx5Q0FBeUMsQ0FBQztBQUNqRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQXVCLHNCQUFzQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkosT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQXdCLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDbkksT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRW5GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM3RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUNOLHdCQUF3QixFQUN4QixvQkFBb0IsRUFDcEIsVUFBVSxFQUNWLHNCQUFzQixFQUN0QiwyQkFBMkIsRUFDM0Isa0JBQWtCLEdBR2xCLE1BQU0sOERBQThELENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBbUcsTUFBTSxzRUFBc0UsQ0FBQztBQUNuTSxPQUFPLEtBQUssa0JBQWtCLE1BQU0sOERBQThELENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxlQUFlLEVBQW9CLE1BQU0sa0JBQWtCLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hELE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSw0QkFBNEIsRUFBd0ksTUFBTSx5QkFBeUIsQ0FBQztBQUM3TSxPQUFPLEVBQXNCLHlCQUF5QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFOUYscUZBQXFGO0FBQ3JGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxvQkFBb0IsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRXJLOzs7R0FHRztBQUNILFNBQVMsa0JBQWtCLENBQUMsTUFBbUM7SUFDOUQsT0FBTyxNQUFNO1NBQ1gsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQWdCLENBQUMsQ0FBQztTQUNqRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ1YsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFnQjtRQUN4QixLQUFLLEVBQUUsQ0FBQyxDQUFDLFFBQVE7UUFDakIsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHO1FBQ1YsVUFBVSxFQUFFLENBQUMsQ0FBQyxVQUFVO0tBQ3hCLENBQUMsQ0FBQyxDQUFDO0FBQ04sQ0FBQztBQUVELG9HQUFvRztBQUNwRyxNQUFNLGtCQUFrQixHQUFHLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBRS9EOzs7R0FHRztBQUNILFNBQVMsb0JBQW9CLENBQUMsU0FBYyxFQUFFLHVCQUFpRDtJQUM5RixNQUFNLGFBQWEsR0FBRyx1QkFBdUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEUsTUFBTSxNQUFNLEdBQUcsdUJBQXVCLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxDQUFDO0lBQ3RGLE9BQU8sTUFBTSxFQUFFLEdBQUcsQ0FBQztBQUNwQixDQUFDO0FBRU0sSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxVQUFVO0lBT2pELFlBQ3dCLG9CQUEyQyxFQUMzQyxvQkFBMkMsRUFDakQsY0FBK0I7UUFFaEQsS0FBSyxFQUFFLENBQUM7UUFFUixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLENBQUMseUJBQXlCLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUV0RyxNQUFNLGNBQWMsR0FBRyxxQkFBcUIsQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFFM0csTUFBTSxXQUFXLEdBQTRCLEVBQUUsQ0FBQztRQUNoRCxLQUFLLE1BQU0sVUFBVSxJQUFJLDRCQUE0QixDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDaEUsTUFBTSxTQUFTLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDMUIsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM1QixTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBR0QsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDN0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDaEMsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sY0FBYyxDQUFDLE9BQWdDO1FBQ3RELE1BQU0sTUFBTSxHQUFtQixFQUFFLENBQUM7UUFDbEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUUvQixLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQzlCLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsU0FBUztZQUNWLENBQUM7WUFFRCxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNyQixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLENBQUM7UUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEUsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBQ0QsQ0FBQTtBQW5EWSxrQkFBa0I7SUFRNUIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZUFBZSxDQUFBO0dBVkwsa0JBQWtCLENBbUQ5Qjs7QUFlRDs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxPQUFnQiw0QkFBNkIsU0FBUSxVQUFVO0lBVXBFLFlBQ29CLFlBQTBCLEVBQzFCLFlBQTBCLEVBQzFCLFdBQXdCLEVBQ3hCLHdCQUFrRDtRQUVyRSxLQUFLLEVBQUUsQ0FBQztRQUxXLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQzFCLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQzFCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBQ3hCLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMEI7UUFackQsbUJBQWMsR0FBRyxJQUFJLEdBQUcsRUFBd0YsQ0FBQztRQUVqSCxhQUFRLEdBQUcsZUFBZSxDQUEwQix3QkFBd0IsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuRixZQUFPLEdBQXlDLElBQUksQ0FBQyxRQUFRLENBQUM7UUFFdEUscUJBQWdCLEdBQUcsQ0FBQyxDQUFDO0lBVTdCLENBQUM7SUFJUyxLQUFLLENBQUMsZUFBZTtRQUM5QixNQUFNLE9BQU8sR0FBRyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztRQUN4QyxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ3RELElBQUksT0FBTyxLQUFLLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pFLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFLTyxLQUFLLENBQUMsd0JBQXdCO1FBQ3JDLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDcEQsTUFBTSxPQUFPLEdBQW1CLEVBQUUsQ0FBQztRQUNuQyxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBRXpDLEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFLENBQUM7WUFDOUIsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM5QixjQUFjLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN4QixNQUFNLE1BQU0sR0FBRyxNQUFNLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN2RSxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pHLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRWpELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6RSxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRVMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFhO1FBQ3hDLElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDMUMsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0YsQ0FBQztJQUVPLFNBQVMsQ0FBQyxHQUFRLEVBQUUsTUFBMkIsRUFBRSxlQUErQyxFQUFFLGNBQTBCO1FBQ25JLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUMzQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5QyxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzlDLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUM7WUFDeEIsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3BDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFM0Usc0VBQXNFO1FBQ3RFLHdFQUF3RTtRQUN4RSxNQUFNLFFBQVEsR0FBRyxlQUFlLENBQXNDLHFCQUFxQixFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXhHLE1BQU0sZ0JBQWdCLEdBQUcsQ0FDeEIsSUFBWSxFQUNaLE1BQXVELEVBQ3ZELGVBQWdFLEVBQ2hFLFdBQVcsR0FBRyxJQUFJLEVBQ1UsRUFBRTtZQUM5QixNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUU3RixNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ2hDLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksZUFBZSxFQUFFLENBQUM7b0JBQ3JCLElBQUksT0FBTyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQzlHLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFXLENBQUM7b0JBQzFGLENBQUM7Z0JBQ0YsQ0FBQztnQkFFRCxNQUFNLEtBQUssR0FBRyx3QkFBd0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDaEQsTUFBTSxJQUFJLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxFQUFFLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDM0QsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDdEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDdkYsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQzFCLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9FLENBQUM7Z0JBRUQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBVyxDQUFDO1lBQzlDLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxhQUFhLEdBQUcsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFFckQsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUNqQyxNQUFNLENBQUMsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMvQixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7b0JBQ3hCLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7Z0JBQzdCLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsNENBQTRDO29CQUN4RSxNQUFNLE9BQU8sR0FBRyxJQUFJLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDdEQsT0FBTyxPQUFPLENBQUMsYUFBYSxDQUFDO2dCQUM5QixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLElBQUksUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7WUFFM0UsT0FBTyxNQUFNLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEQsQ0FBQyxDQUFDO1FBRUYsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkQsTUFBTSxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLHNCQUFzQixDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUM3RixNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEUsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQzdCLE9BQU8sRUFDUCxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxFQUNyRCxLQUFLLEVBQUMsT0FBTyxFQUFDLEVBQUU7WUFDZixNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUM3RCxNQUFNLGFBQWEsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDL0UsT0FBTyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ2xHLENBQUMsRUFDRCxNQUFNLENBQUMsY0FBYyxDQUNyQixDQUFDO1FBRUYsTUFBTSxvQkFBb0IsR0FBRyxnQkFBZ0IsQ0FDNUMsWUFBWSxFQUNaLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxFQUNyRSxLQUFLLEVBQUMsT0FBTyxFQUFDLEVBQUUsQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLEVBQUUsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsRUFDdEcsV0FBVyxDQUNYLENBQUM7UUFFRiwwRUFBMEU7UUFDMUUsTUFBTSxZQUFZLEdBQUcsS0FBSyxJQUFJLEVBQUU7WUFDL0IsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2hFLENBQUMsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUN0RCxXQUFXLEVBQ1gsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FDbEMsQ0FBQztRQUNGLEtBQUssQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDM0IsS0FBSyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3RCxZQUFZLEVBQUUsQ0FBQztRQUVmLE1BQU0sTUFBTSxHQUFnQjtZQUMzQixHQUFHO1lBQ0gsS0FBSyxFQUFFLGVBQWUsRUFBRSxJQUFJLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQztZQUM3QyxVQUFVO1lBQ1YsTUFBTSxFQUFFLGNBQWM7WUFDdEIsS0FBSztZQUNMLFFBQVE7WUFDUixNQUFNO1lBQ04sTUFBTTtZQUNOLFlBQVk7WUFDWixvQkFBb0I7WUFDcEIsZUFBZTtTQUNmLENBQUM7UUFFRixJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFeEQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRU8sS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFjLEVBQUUsTUFBMkI7UUFDdEUsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDaEYsSUFBSSxJQUFJLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdEMsT0FBTyxJQUErQixDQUFDO1FBQ3hDLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxTQUFjLEVBQUUsS0FBcUIsRUFBRSxNQUEyQjtRQUNuRyxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUM3RCxNQUFNLGFBQWEsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDckYsS0FBSyxNQUFNLFFBQVEsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUM5QixNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDaEQsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDVixJQUFJLENBQUM7b0JBQ0osT0FBTyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUNsRyxDQUFDO2dCQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMscURBQXFELFFBQVEsQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN2RyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssS0FBSyxDQUFDLDRCQUE0QixDQUFDLEtBQXFCLEVBQUUsWUFBb0IsRUFBRSxNQUEyQjtRQUNsSCxNQUFNLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBMkMsQ0FBQztRQUNsRSxLQUFLLE1BQU0sT0FBTyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzdCLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvQyxLQUFLLE1BQU0sR0FBRyxJQUFJLDJCQUEyQixDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3BGLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUMzQixNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzNCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYSxDQUFDLEdBQVE7UUFDbkMsSUFBSSxDQUFDO1lBQ0osTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMzRCxPQUFPLFVBQVUsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBb0I7UUFDNUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUMvQixNQUFNLEtBQUssR0FBOEIsRUFBRSxDQUFDO1FBRTVDLE1BQU0sV0FBVyxHQUFHLENBQUMsUUFBZ0IsRUFBc0IsRUFBRTtZQUM1RCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDckMsT0FBTyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEQsQ0FBQyxDQUFDO1FBRUYsTUFBTSxPQUFPLEdBQUcsQ0FBQyxJQUFZLEVBQUUsR0FBUSxFQUFFLEVBQUU7WUFDMUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDZixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDM0IsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7WUFDeEIsSUFBSSxJQUFJLENBQUM7WUFDVCxJQUFJLENBQUM7Z0JBQ0osSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDN0MsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixTQUFTO1lBQ1YsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNqQixNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzFDLElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1osT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUN0RCxDQUFDO2dCQUNELFNBQVM7WUFDVixDQUFDO1lBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3pDLFNBQVM7WUFDVixDQUFDO1lBRUQsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ25DLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ25CLFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN2QyxJQUFJLE1BQU0sRUFBRSxDQUFDO29CQUNaLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUM5RCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRU8sMkJBQTJCLENBQUMsSUFBaUI7UUFDcEQsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNoRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNwQixLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFZSxPQUFPO1FBQ3RCLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLEdBQUcsRUFBVSxDQUFDLENBQUM7UUFDcEQsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7Q0FDRDtBQUVNLElBQU0sOEJBQThCLEdBQXBDLE1BQU0sOEJBQStCLFNBQVEsNEJBQTRCO0lBSS9FLFlBQ3lDLHFCQUE0QyxFQUN0RSxXQUF5QixFQUNLLHlCQUFvRCxFQUN0RSx1QkFBaUQsRUFDN0QsV0FBeUIsRUFDMUIsVUFBdUI7UUFFcEMsS0FBSyxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFQN0IsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUV4Qyw4QkFBeUIsR0FBekIseUJBQXlCLENBQTJCO1FBTWhHLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxxQkFBcUIsQ0FBMEIsaUJBQWlCLENBQUMsZUFBZSxFQUFFLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO0lBQzVJLENBQUM7SUFFZSxLQUFLLENBQUMsZUFBaUM7UUFDdEQsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGVBQWUsQ0FBQztRQUN4QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN6QyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRWtCLEtBQUssQ0FBQyxzQkFBc0I7UUFDOUMsTUFBTSxPQUFPLEdBQW9CLEVBQUUsQ0FBQztRQUNwQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDakQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFM0MsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUN0RCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDdkMsU0FBUztZQUNWLENBQUM7WUFFRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2pFLEtBQUssTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksSUFBSSxDQUFDO2dCQUNULElBQUksQ0FBQztvQkFDSixJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztnQkFBQyxNQUFNLENBQUM7b0JBQ1IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsbUVBQW1FLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQ2pILFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUN2QixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxvRUFBb0UsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDbEgsU0FBUztnQkFDVixDQUFDO2dCQUVELE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ25HLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQztnQkFDdkIsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWixHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVE7b0JBQ2xCLGVBQWU7b0JBQ2YsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUM7aUJBQy9DLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZO1FBQ3pCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNwRCxPQUFPLFFBQVEsQ0FBQyxNQUFNLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO0lBQ3JFLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNLLGtCQUFrQixDQUFDLElBQVksRUFBRSxRQUFnQjtRQUN4RCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMxQixJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBRUQsd0JBQXdCO1FBQ3hCLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN6QixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUMsWUFBWSxFQUFFLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FDOUQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FDcEMsQ0FBQztJQUNILENBQUM7SUFFRDs7O09BR0c7SUFDSyxpQkFBaUIsQ0FBQyxTQUFpQjtRQUMxQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUEwQixpQkFBaUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUVqSCxNQUFNLE9BQU8sR0FBRzs7Ozs7OztTQU9mLENBQUM7UUFFRixLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQzlCLE1BQU0sT0FBTyxHQUFHLHNCQUFzQixDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMxRCxJQUFJLE9BQU8sSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pFLE1BQU0sT0FBTyxHQUFHLEVBQUUsR0FBRyxPQUFPLEVBQUUsQ0FBQztnQkFDL0IsT0FBTyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLENBQ3JDLGlCQUFpQixDQUFDLGVBQWUsRUFDakMsT0FBTyxFQUNQLE1BQU0sQ0FDTixDQUFDO2dCQUNGLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBeEhZLDhCQUE4QjtJQUt4QyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSx5QkFBeUIsQ0FBQTtJQUN6QixXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxXQUFXLENBQUE7R0FWRCw4QkFBOEIsQ0F3SDFDOztBQUVNLElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQWdDLFNBQVEsNEJBQTRCO0lBRWhGLFlBQzZDLHlCQUFvRCxFQUNoRCx3QkFBdUQsRUFDekYsV0FBeUIsRUFDekIsV0FBeUIsRUFDMUIsVUFBdUIsRUFDVix1QkFBaUQ7UUFFM0UsS0FBSyxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFQekIsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUEyQjtRQUNoRCw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQStCO0lBT3hHLENBQUM7SUFFZSxLQUFLLENBQUMsZUFBaUM7UUFDdEQsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGVBQWUsQ0FBQztRQUN4QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxDQUFDLHlCQUF5QixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM3RCxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRWtCLEtBQUssQ0FBQyxzQkFBc0I7UUFDOUMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3hFLE1BQU0sT0FBTyxHQUFvQixFQUFFLENBQUM7UUFFcEMsS0FBSyxNQUFNLEtBQUssSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUMvQixJQUFJLElBQUksQ0FBQztZQUNULElBQUksQ0FBQztnQkFDSixJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDekQsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyx5RUFBeUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzlILFNBQVM7WUFDVixDQUFDO1lBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsK0VBQStFLEtBQUssQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNwSSxTQUFTO1lBQ1YsQ0FBQztZQUVELE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQ1osR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRO2dCQUNsQixlQUFlLEVBQUUsS0FBSyxDQUFDLE1BQU07Z0JBQzdCLE1BQU0sRUFBRSxHQUFHLEVBQUU7b0JBQ1osSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7b0JBQ3ZELElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBRXRFLGlFQUFpRTtvQkFDakUsaUVBQWlFO29CQUNqRSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQ3hFLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxtQkFBbUIsQ0FDaEQsS0FBSyxDQUFDLE1BQU0sRUFDWixTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUM3QyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRTt3QkFDZixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxvRUFBb0UsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDckcsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQzthQUNELENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0NBQ0QsQ0FBQTtBQS9EWSwrQkFBK0I7SUFHekMsV0FBQSx5QkFBeUIsQ0FBQTtJQUN6QixXQUFBLDZCQUE2QixDQUFBO0lBQzdCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsd0JBQXdCLENBQUE7R0FSZCwrQkFBK0IsQ0ErRDNDOztBQVdELE1BQU0sU0FBUyxHQUFHLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLHNCQUFzQixDQUErQjtJQUM1RyxjQUFjLEVBQUUsYUFBYTtJQUM3QixVQUFVLEVBQUU7UUFDWCxXQUFXLEVBQUUsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLHFDQUFxQyxDQUFDO1FBQzlGLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFO1lBQ04sb0JBQW9CLEVBQUUsS0FBSztZQUMzQixJQUFJLEVBQUUsUUFBUTtZQUNkLGVBQWUsRUFBRSxDQUFDO29CQUNqQixJQUFJLEVBQUU7d0JBQ0wsSUFBSSxFQUFFLDRCQUE0QjtxQkFDbEM7aUJBQ0QsQ0FBQztZQUNGLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUNsQixVQUFVLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFO29CQUNMLFdBQVcsRUFBRSxRQUFRLENBQUMsMkJBQTJCLEVBQUUseUVBQXlFLENBQUM7b0JBQzdILElBQUksRUFBRSxRQUFRO2lCQUNkO2dCQUNELElBQUksRUFBRTtvQkFDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLGtFQUFrRSxDQUFDO29CQUN0SCxJQUFJLEVBQUUsUUFBUTtpQkFDZDthQUNEO1NBQ0Q7S0FDRDtDQUNELENBQUMsQ0FBQztBQUVJLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQThCLFNBQVEsNEJBQTRCO0lBSzlFLFlBQ2tCLGVBQWlELEVBQzlDLGtCQUF1RCxFQUMzRCxjQUErQyxFQUNqRCxXQUF5QixFQUN6QixXQUF5QixFQUMxQixVQUF1QixFQUNWLHVCQUFpRDtRQUUzRSxLQUFLLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztRQVJuQyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDN0IsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUMxQyxtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFOL0Msc0JBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQXFGLENBQUM7UUFDakgsY0FBUyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFZL0MsQ0FBQztJQUVlLEtBQUssQ0FBQyxlQUFpQztRQUN0RCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDO1FBQ3hDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUM3RCxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN0QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDM0MsS0FBSyxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQy9CLEtBQUssTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUNmLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxxRUFBcUUsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO3dCQUN4SyxTQUFTO29CQUNWLENBQUM7b0JBQ0QsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN4RSxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQzt3QkFDcEUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLCtCQUErQixFQUFFLHlFQUF5RSxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDdEwsU0FBUztvQkFDVixDQUFDO29CQUNELElBQUksUUFBMEMsQ0FBQztvQkFDL0MsSUFBSSxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ2QsUUFBUSxHQUFHLGNBQWMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNoRCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7NEJBQ2YsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLCtCQUErQixFQUFFLDRFQUE0RSxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDOzRCQUNuTSxTQUFTO3dCQUNWLENBQUM7b0JBQ0YsQ0FBQztvQkFDRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDekssQ0FBQztZQUNGLENBQUM7WUFDRCxLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDakMsS0FBSyxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQzdCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3pGLENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEIsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLGdCQUFnQjtRQUN2QixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3ZCLEtBQUssTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQ3hELElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ1YsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztvQkFDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3pCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFa0IsS0FBSyxDQUFDLHNCQUFzQjtRQUM5QyxNQUFNLE9BQU8sR0FBb0IsRUFBRSxDQUFDO1FBQ3BDLEtBQUssTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDaEQsSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUM1RSxTQUFTO1lBQ1YsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDO1lBQ1QsSUFBSSxDQUFDO2dCQUNKLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuRCxDQUFDO1lBQUMsTUFBTSxDQUFDO2dCQUNSLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLDRFQUE0RSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDM0gsU0FBUztZQUNWLENBQUM7WUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN2QixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyw2RUFBNkUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVILFNBQVM7WUFDVixDQUFDO1lBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQztnQkFDWixHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ2xCLGVBQWUsRUFBRSxTQUFTO2dCQUMxQixNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUM7YUFDL0QsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFTyxLQUFLLENBQUMseUJBQXlCLENBQUMsV0FBbUI7UUFDMUQsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUM7WUFDdkQsT0FBTyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx5RkFBeUYsRUFBRSxXQUFXLENBQUM7U0FDeEosQ0FBQyxDQUFDO1FBQ0gsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMseUNBQXlDLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDbkcsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBdkdZLDZCQUE2QjtJQU12QyxXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLHdCQUF3QixDQUFBO0dBWmQsNkJBQTZCLENBdUd6Qzs7QUFFRCxTQUFTLGtCQUFrQixDQUFDLFdBQWdDLEVBQUUsSUFBWTtJQUN6RSxPQUFPLEdBQUcsV0FBVyxDQUFDLEtBQUssSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUN2QyxDQUFDO0FBRUQsTUFBTSx1QkFBd0IsU0FBUSxVQUFVO0lBQWhEOztRQUNVLFNBQUksR0FBRyxPQUFnQixDQUFDO0lBMkJsQyxDQUFDO0lBekJBLFlBQVksQ0FBQyxRQUE0QjtRQUN4QyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLENBQUM7SUFDcEQsQ0FBQztJQUVELE1BQU0sQ0FBQyxRQUE0QjtRQUNsQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLFdBQVcsSUFBSSxFQUFFLENBQUM7UUFDOUQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMzQixPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2hFLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRztZQUNmLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxNQUFNLENBQUM7WUFDbkMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLE1BQU0sQ0FBQztTQUNuQyxDQUFDO1FBRUYsTUFBTSxJQUFJLEdBQWlCLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNqRCxDQUFDLENBQUMsSUFBSTtZQUNOLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRztTQUNiLENBQUMsQ0FBQztRQUVILE9BQU87WUFDTixJQUFJLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFO1lBQ3ZCLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1NBQ2xCLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRCxRQUFRLENBQUMsRUFBRSxDQUE2QixVQUFVLENBQUMseUJBQXlCLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztJQUN0RyxFQUFFLEVBQUUsYUFBYTtJQUNqQixLQUFLLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUM7SUFDOUMsTUFBTSxFQUFFO1FBQ1AsU0FBUyxFQUFFLEtBQUs7S0FDaEI7SUFDRCxRQUFRLEVBQUUsSUFBSSxjQUFjLENBQUMsdUJBQXVCLENBQUM7Q0FDckQsQ0FBQyxDQUFDIn0=