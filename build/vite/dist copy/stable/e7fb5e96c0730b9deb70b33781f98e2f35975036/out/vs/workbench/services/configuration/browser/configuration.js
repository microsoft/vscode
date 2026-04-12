/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event, Emitter } from '../../../../base/common/event.js';
import * as errors from '../../../../base/common/errors.js';
import { Disposable, dispose, toDisposable, MutableDisposable, combinedDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { whenProviderRegistered } from '../../../../platform/files/common/files.js';
import { ConfigurationModel, ConfigurationModelParser, UserSettings } from '../../../../platform/configuration/common/configurationModels.js';
import { WorkspaceConfigurationModelParser, StandaloneConfigurationModelParser } from '../common/configurationModels.js';
import { TASKS_CONFIGURATION_KEY, FOLDER_SETTINGS_NAME, LAUNCH_CONFIGURATION_KEY, REMOTE_MACHINE_SCOPES, FOLDER_SCOPES, WORKSPACE_SCOPES, APPLY_ALL_PROFILES_SETTING, APPLICATION_SCOPES, MCP_CONFIGURATION_KEY } from '../common/configuration.js';
import { Extensions, OVERRIDE_PROPERTY_REGEX } from '../../../../platform/configuration/common/configurationRegistry.js';
import { equals } from '../../../../base/common/objects.js';
import { hash } from '../../../../base/common/hash.js';
import { joinPath } from '../../../../base/common/resources.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { isEmptyObject, isObject } from '../../../../base/common/types.js';
import { DefaultConfiguration as BaseDefaultConfiguration } from '../../../../platform/configuration/common/configurations.js';
export class DefaultConfiguration extends BaseDefaultConfiguration {
    static { this.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY = 'DefaultOverridesCacheExists'; }
    constructor(cacheScope, configurationCache, environmentService, logService) {
        super(logService);
        this.configurationCache = configurationCache;
        this.configurationRegistry = Registry.as(Extensions.Configuration);
        this.cachedConfigurationDefaultsOverrides = {};
        this.cacheKey = { type: 'defaults', key: `${cacheScope}-configurationDefaultsOverrides` };
        if (environmentService.options?.configurationDefaults) {
            this.configurationRegistry.registerDefaultConfigurations([{ overrides: environmentService.options.configurationDefaults }]);
        }
    }
    getConfigurationDefaultOverrides() {
        return this.cachedConfigurationDefaultsOverrides;
    }
    async initialize() {
        await this.initializeCachedConfigurationDefaultsOverrides();
        return super.initialize();
    }
    reload() {
        this.cachedConfigurationDefaultsOverrides = {};
        this.updateCachedConfigurationDefaultsOverrides();
        return super.reload();
    }
    hasCachedConfigurationDefaultsOverrides() {
        return !isEmptyObject(this.cachedConfigurationDefaultsOverrides);
    }
    initializeCachedConfigurationDefaultsOverrides() {
        if (!this.initiaizeCachedConfigurationDefaultsOverridesPromise) {
            this.initiaizeCachedConfigurationDefaultsOverridesPromise = (async () => {
                try {
                    // Read only when the cache exists
                    if (localStorage.getItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY)) {
                        const content = await this.configurationCache.read(this.cacheKey);
                        if (content) {
                            this.cachedConfigurationDefaultsOverrides = JSON.parse(content);
                        }
                    }
                }
                catch (error) { /* ignore */ }
                this.cachedConfigurationDefaultsOverrides = isObject(this.cachedConfigurationDefaultsOverrides) ? this.cachedConfigurationDefaultsOverrides : {};
            })();
        }
        return this.initiaizeCachedConfigurationDefaultsOverridesPromise;
    }
    onDidUpdateConfiguration(properties, defaultsOverrides) {
        super.onDidUpdateConfiguration(properties, defaultsOverrides);
        if (defaultsOverrides) {
            this.updateCachedConfigurationDefaultsOverrides();
        }
    }
    async updateCachedConfigurationDefaultsOverrides() {
        const cachedConfigurationDefaultsOverrides = {};
        const defaultConfigurations = this.configurationRegistry.getRegisteredDefaultConfigurations();
        for (const defaultConfiguration of defaultConfigurations) {
            if (defaultConfiguration.donotCache) {
                continue;
            }
            for (const [key, value] of Object.entries(defaultConfiguration.overrides)) {
                if (!OVERRIDE_PROPERTY_REGEX.test(key) && value !== undefined) {
                    const existingValue = cachedConfigurationDefaultsOverrides[key];
                    if (isObject(existingValue) && isObject(value)) {
                        cachedConfigurationDefaultsOverrides[key] = { ...existingValue, ...value };
                    }
                    else {
                        cachedConfigurationDefaultsOverrides[key] = value;
                    }
                }
            }
        }
        try {
            if (Object.keys(cachedConfigurationDefaultsOverrides).length) {
                localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
                await this.configurationCache.write(this.cacheKey, JSON.stringify(cachedConfigurationDefaultsOverrides));
            }
            else {
                localStorage.removeItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY);
                await this.configurationCache.remove(this.cacheKey);
            }
        }
        catch (error) { /* Ignore error */ }
    }
}
export class ApplicationConfiguration extends UserSettings {
    constructor(userDataProfilesService, fileService, uriIdentityService, logService) {
        super(userDataProfilesService.defaultProfile.settingsResource, { scopes: APPLICATION_SCOPES, skipUnregistered: true }, uriIdentityService.extUri, fileService, logService);
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this._register(this.onDidChange(() => this.reloadConfigurationScheduler.schedule()));
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.loadConfiguration().then(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)), 50));
    }
    async initialize() {
        return this.loadConfiguration();
    }
    async loadConfiguration() {
        const model = await super.loadConfiguration();
        const value = model.getValue(APPLY_ALL_PROFILES_SETTING);
        const allProfilesSettings = Array.isArray(value) ? value : [];
        return this.parseOptions.include || allProfilesSettings.length
            ? this.reparse({ ...this.parseOptions, include: allProfilesSettings })
            : model;
    }
}
export class UserConfiguration extends Disposable {
    get hasTasksLoaded() { return this.userConfiguration.value instanceof FileServiceBasedConfiguration; }
    constructor(settingsResource, tasksResource, mcpResource, configurationParseOptions, fileService, uriIdentityService, logService) {
        super();
        this.settingsResource = settingsResource;
        this.tasksResource = tasksResource;
        this.mcpResource = mcpResource;
        this.configurationParseOptions = configurationParseOptions;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this.userConfiguration = this._register(new MutableDisposable());
        this.userConfigurationChangeDisposable = this._register(new MutableDisposable());
        this.userConfiguration.value = new UserSettings(settingsResource, this.configurationParseOptions, uriIdentityService.extUri, this.fileService, logService);
        this.userConfigurationChangeDisposable.value = this.userConfiguration.value.onDidChange(() => this.reloadConfigurationScheduler.schedule());
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.userConfiguration.value.loadConfiguration().then(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)), 50));
    }
    async reset(settingsResource, tasksResource, mcpResource, configurationParseOptions) {
        this.settingsResource = settingsResource;
        this.tasksResource = tasksResource;
        this.mcpResource = mcpResource;
        this.configurationParseOptions = configurationParseOptions;
        return this.doReset();
    }
    async doReset(settingsConfiguration) {
        const folder = this.uriIdentityService.extUri.dirname(this.settingsResource);
        const standAloneConfigurationResources = [];
        if (this.tasksResource) {
            standAloneConfigurationResources.push([TASKS_CONFIGURATION_KEY, this.tasksResource]);
        }
        if (this.mcpResource) {
            standAloneConfigurationResources.push([MCP_CONFIGURATION_KEY, this.mcpResource]);
        }
        const fileServiceBasedConfiguration = new FileServiceBasedConfiguration(folder.toString(), this.settingsResource, standAloneConfigurationResources, this.configurationParseOptions, this.fileService, this.uriIdentityService, this.logService);
        const configurationModel = await fileServiceBasedConfiguration.loadConfiguration(settingsConfiguration);
        this.userConfiguration.value = fileServiceBasedConfiguration;
        // Check for value because userConfiguration might have been disposed.
        if (this.userConfigurationChangeDisposable.value) {
            this.userConfigurationChangeDisposable.value = this.userConfiguration.value.onDidChange(() => this.reloadConfigurationScheduler.schedule());
        }
        return configurationModel;
    }
    async initialize() {
        return this.userConfiguration.value.loadConfiguration();
    }
    async reload(settingsConfiguration) {
        if (this.hasTasksLoaded) {
            return this.userConfiguration.value.loadConfiguration();
        }
        return this.doReset(settingsConfiguration);
    }
    reparse(parseOptions) {
        this.configurationParseOptions = { ...this.configurationParseOptions, ...parseOptions };
        return this.userConfiguration.value.reparse(this.configurationParseOptions);
    }
    getRestrictedSettings() {
        return this.userConfiguration.value.getRestrictedSettings();
    }
}
class FileServiceBasedConfiguration extends Disposable {
    constructor(name, settingsResource, standAloneConfigurationResources, configurationParseOptions, fileService, uriIdentityService, logService) {
        super();
        this.settingsResource = settingsResource;
        this.standAloneConfigurationResources = standAloneConfigurationResources;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.allResources = [this.settingsResource, ...this.standAloneConfigurationResources.map(([, resource]) => resource)];
        this._register(combinedDisposable(...this.allResources.map(resource => combinedDisposable(this.fileService.watch(uriIdentityService.extUri.dirname(resource)), 
        // Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
        this.fileService.watch(resource)))));
        this._folderSettingsModelParser = new ConfigurationModelParser(name, logService);
        this._folderSettingsParseOptions = configurationParseOptions;
        this._standAloneConfigurations = [];
        this._cache = ConfigurationModel.createEmptyModel(this.logService);
        this._register(Event.debounce(Event.any(Event.filter(this.fileService.onDidFilesChange, e => this.handleFileChangesEvent(e)), Event.filter(this.fileService.onDidRunOperation, e => this.handleFileOperationEvent(e))), () => undefined, 100)(() => this._onDidChange.fire()));
    }
    async resolveContents(donotResolveSettings) {
        const resolveContents = async (resources) => {
            return Promise.all(resources.map(async (resource) => {
                try {
                    const content = await this.fileService.readFile(resource, { atomic: true });
                    return content.value.toString();
                }
                catch (error) {
                    this.logService.trace(`Error while resolving configuration file '${resource.toString()}': ${errors.getErrorMessage(error)}`);
                    if (error.fileOperationResult !== 1 /* FileOperationResult.FILE_NOT_FOUND */
                        && error.fileOperationResult !== 9 /* FileOperationResult.FILE_NOT_DIRECTORY */) {
                        this.logService.error(error);
                    }
                }
                return '{}';
            }));
        };
        const [[settingsContent], standAloneConfigurationContents] = await Promise.all([
            donotResolveSettings ? Promise.resolve([undefined]) : resolveContents([this.settingsResource]),
            resolveContents(this.standAloneConfigurationResources.map(([, resource]) => resource)),
        ]);
        return [settingsContent, standAloneConfigurationContents.map((content, index) => ([this.standAloneConfigurationResources[index][0], content]))];
    }
    async loadConfiguration(settingsConfiguration) {
        const [settingsContent, standAloneConfigurationContents] = await this.resolveContents(!!settingsConfiguration);
        // reset
        this._standAloneConfigurations = [];
        this._folderSettingsModelParser.parse('', this._folderSettingsParseOptions);
        // parse
        if (settingsContent !== undefined) {
            this._folderSettingsModelParser.parse(settingsContent, this._folderSettingsParseOptions);
        }
        for (let index = 0; index < standAloneConfigurationContents.length; index++) {
            const contents = standAloneConfigurationContents[index][1];
            if (contents !== undefined) {
                const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(this.standAloneConfigurationResources[index][1].toString(), this.standAloneConfigurationResources[index][0], this.logService);
                standAloneConfigurationModelParser.parse(contents);
                this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
            }
        }
        // Consolidate (support *.json files in the workspace settings folder)
        this.consolidate(settingsConfiguration);
        return this._cache;
    }
    getRestrictedSettings() {
        return this._folderSettingsModelParser.restrictedConfigurations;
    }
    reparse(configurationParseOptions) {
        const oldContents = this._folderSettingsModelParser.configurationModel.contents;
        this._folderSettingsParseOptions = configurationParseOptions;
        this._folderSettingsModelParser.reparse(this._folderSettingsParseOptions);
        if (!equals(oldContents, this._folderSettingsModelParser.configurationModel.contents)) {
            this.consolidate();
        }
        return this._cache;
    }
    consolidate(settingsConfiguration) {
        this._cache = (settingsConfiguration ?? this._folderSettingsModelParser.configurationModel).merge(...this._standAloneConfigurations);
    }
    handleFileChangesEvent(event) {
        // One of the resources has changed
        if (this.allResources.some(resource => event.contains(resource))) {
            return true;
        }
        // One of the resource's parent got deleted
        if (this.allResources.some(resource => event.contains(this.uriIdentityService.extUri.dirname(resource), 2 /* FileChangeType.DELETED */))) {
            return true;
        }
        return false;
    }
    handleFileOperationEvent(event) {
        // One of the resources has changed
        if ((event.isOperation(0 /* FileOperation.CREATE */) || event.isOperation(3 /* FileOperation.COPY */) || event.isOperation(1 /* FileOperation.DELETE */) || event.isOperation(4 /* FileOperation.WRITE */))
            && this.allResources.some(resource => this.uriIdentityService.extUri.isEqual(event.resource, resource))) {
            return true;
        }
        // One of the resource's parent got deleted
        if (event.isOperation(1 /* FileOperation.DELETE */) && this.allResources.some(resource => this.uriIdentityService.extUri.isEqual(event.resource, this.uriIdentityService.extUri.dirname(resource)))) {
            return true;
        }
        return false;
    }
}
export class RemoteUserConfiguration extends Disposable {
    constructor(remoteAuthority, configurationCache, fileService, uriIdentityService, remoteAgentService, logService) {
        super();
        this._userConfigurationInitializationPromise = null;
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this._onDidInitialize = this._register(new Emitter());
        this.onDidInitialize = this._onDidInitialize.event;
        this._fileService = fileService;
        this._userConfiguration = this._cachedConfiguration = new CachedRemoteUserConfiguration(remoteAuthority, configurationCache, { scopes: REMOTE_MACHINE_SCOPES }, logService);
        remoteAgentService.getEnvironment().then(async (environment) => {
            if (environment) {
                const userConfiguration = this._register(new FileServiceBasedRemoteUserConfiguration(environment.settingsPath, { scopes: REMOTE_MACHINE_SCOPES }, this._fileService, uriIdentityService, logService));
                this._register(userConfiguration.onDidChangeConfiguration(configurationModel => this.onDidUserConfigurationChange(configurationModel)));
                this._userConfigurationInitializationPromise = userConfiguration.initialize();
                const configurationModel = await this._userConfigurationInitializationPromise;
                this._userConfiguration.dispose();
                this._userConfiguration = userConfiguration;
                this.onDidUserConfigurationChange(configurationModel);
                this._onDidInitialize.fire(configurationModel);
            }
        });
    }
    async initialize() {
        if (this._userConfiguration instanceof FileServiceBasedRemoteUserConfiguration) {
            return this._userConfiguration.initialize();
        }
        // Initialize cached configuration
        let configurationModel = await this._userConfiguration.initialize();
        if (this._userConfigurationInitializationPromise) {
            // Use user configuration
            configurationModel = await this._userConfigurationInitializationPromise;
            this._userConfigurationInitializationPromise = null;
        }
        return configurationModel;
    }
    reload() {
        return this._userConfiguration.reload();
    }
    reparse() {
        return this._userConfiguration.reparse({ scopes: REMOTE_MACHINE_SCOPES });
    }
    getRestrictedSettings() {
        return this._userConfiguration.getRestrictedSettings();
    }
    onDidUserConfigurationChange(configurationModel) {
        this.updateCache();
        this._onDidChangeConfiguration.fire(configurationModel);
    }
    async updateCache() {
        if (this._userConfiguration instanceof FileServiceBasedRemoteUserConfiguration) {
            let content;
            try {
                content = await this._userConfiguration.resolveContent();
            }
            catch (error) {
                if (error.fileOperationResult !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    return;
                }
            }
            await this._cachedConfiguration.updateConfiguration(content);
        }
    }
}
class FileServiceBasedRemoteUserConfiguration extends Disposable {
    constructor(configurationResource, configurationParseOptions, fileService, uriIdentityService, logService) {
        super();
        this.configurationResource = configurationResource;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this.fileWatcherDisposable = this._register(new MutableDisposable());
        this.directoryWatcherDisposable = this._register(new MutableDisposable());
        this.parser = new ConfigurationModelParser(this.configurationResource.toString(), logService);
        this.parseOptions = configurationParseOptions;
        this._register(fileService.onDidFilesChange(e => this.handleFileChangesEvent(e)));
        this._register(fileService.onDidRunOperation(e => this.handleFileOperationEvent(e)));
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)), 50));
        this._register(toDisposable(() => {
            this.stopWatchingResource();
            this.stopWatchingDirectory();
        }));
    }
    watchResource() {
        this.fileWatcherDisposable.value = this.fileService.watch(this.configurationResource);
    }
    stopWatchingResource() {
        this.fileWatcherDisposable.value = undefined;
    }
    watchDirectory() {
        const directory = this.uriIdentityService.extUri.dirname(this.configurationResource);
        this.directoryWatcherDisposable.value = this.fileService.watch(directory);
    }
    stopWatchingDirectory() {
        this.directoryWatcherDisposable.value = undefined;
    }
    async initialize() {
        const exists = await this.fileService.exists(this.configurationResource);
        this.onResourceExists(exists);
        return this.reload();
    }
    async resolveContent() {
        const content = await this.fileService.readFile(this.configurationResource, { atomic: true });
        return content.value.toString();
    }
    async reload() {
        try {
            const content = await this.resolveContent();
            this.parser.parse(content, this.parseOptions);
            return this.parser.configurationModel;
        }
        catch (e) {
            return ConfigurationModel.createEmptyModel(this.logService);
        }
    }
    reparse(configurationParseOptions) {
        this.parseOptions = configurationParseOptions;
        this.parser.reparse(this.parseOptions);
        return this.parser.configurationModel;
    }
    getRestrictedSettings() {
        return this.parser.restrictedConfigurations;
    }
    handleFileChangesEvent(event) {
        // Find changes that affect the resource
        let affectedByChanges = false;
        if (event.contains(this.configurationResource, 1 /* FileChangeType.ADDED */)) {
            affectedByChanges = true;
            this.onResourceExists(true);
        }
        else if (event.contains(this.configurationResource, 2 /* FileChangeType.DELETED */)) {
            affectedByChanges = true;
            this.onResourceExists(false);
        }
        else if (event.contains(this.configurationResource, 0 /* FileChangeType.UPDATED */)) {
            affectedByChanges = true;
        }
        if (affectedByChanges) {
            this.reloadConfigurationScheduler.schedule();
        }
    }
    handleFileOperationEvent(event) {
        if ((event.isOperation(0 /* FileOperation.CREATE */) || event.isOperation(3 /* FileOperation.COPY */) || event.isOperation(1 /* FileOperation.DELETE */) || event.isOperation(4 /* FileOperation.WRITE */))
            && this.uriIdentityService.extUri.isEqual(event.resource, this.configurationResource)) {
            this.reloadConfigurationScheduler.schedule();
        }
    }
    onResourceExists(exists) {
        if (exists) {
            this.stopWatchingDirectory();
            this.watchResource();
        }
        else {
            this.stopWatchingResource();
            this.watchDirectory();
        }
    }
}
class CachedRemoteUserConfiguration extends Disposable {
    constructor(remoteAuthority, configurationCache, configurationParseOptions, logService) {
        super();
        this.configurationCache = configurationCache;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.key = { type: 'user', key: remoteAuthority };
        this.parser = new ConfigurationModelParser('CachedRemoteUserConfiguration', logService);
        this.parseOptions = configurationParseOptions;
        this.configurationModel = ConfigurationModel.createEmptyModel(logService);
    }
    getConfigurationModel() {
        return this.configurationModel;
    }
    initialize() {
        return this.reload();
    }
    reparse(configurationParseOptions) {
        this.parseOptions = configurationParseOptions;
        this.parser.reparse(this.parseOptions);
        this.configurationModel = this.parser.configurationModel;
        return this.configurationModel;
    }
    getRestrictedSettings() {
        return this.parser.restrictedConfigurations;
    }
    async reload() {
        try {
            const content = await this.configurationCache.read(this.key);
            const parsed = JSON.parse(content);
            if (parsed.content) {
                this.parser.parse(parsed.content, this.parseOptions);
                this.configurationModel = this.parser.configurationModel;
            }
        }
        catch (e) { /* Ignore error */ }
        return this.configurationModel;
    }
    async updateConfiguration(content) {
        if (content) {
            return this.configurationCache.write(this.key, JSON.stringify({ content }));
        }
        else {
            return this.configurationCache.remove(this.key);
        }
    }
}
export class WorkspaceConfiguration extends Disposable {
    get initialized() { return this._initialized; }
    constructor(configurationCache, fileService, uriIdentityService, logService) {
        super();
        this.configurationCache = configurationCache;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this._workspaceConfigurationDisposables = this._register(new DisposableStore());
        this._workspaceIdentifier = null;
        this._isWorkspaceTrusted = false;
        this._onDidUpdateConfiguration = this._register(new Emitter());
        this.onDidUpdateConfiguration = this._onDidUpdateConfiguration.event;
        this._initialized = false;
        this.fileService = fileService;
        this._workspaceConfiguration = this._cachedConfiguration = new CachedWorkspaceConfiguration(configurationCache, logService);
    }
    async initialize(workspaceIdentifier, workspaceTrusted) {
        this._workspaceIdentifier = workspaceIdentifier;
        this._isWorkspaceTrusted = workspaceTrusted;
        if (!this._initialized) {
            if (this.configurationCache.needsCaching(this._workspaceIdentifier.configPath)) {
                this._workspaceConfiguration = this._cachedConfiguration;
                this.waitAndInitialize(this._workspaceIdentifier);
            }
            else {
                this.doInitialize(new FileServiceBasedWorkspaceConfiguration(this.fileService, this.uriIdentityService, this.logService));
            }
        }
        await this.reload();
    }
    async reload() {
        if (this._workspaceIdentifier) {
            await this._workspaceConfiguration.load(this._workspaceIdentifier, { scopes: WORKSPACE_SCOPES, skipRestricted: this.isUntrusted() });
        }
    }
    getFolders() {
        return this._workspaceConfiguration.getFolders();
    }
    setFolders(folders, jsonEditingService) {
        if (this._workspaceIdentifier) {
            return jsonEditingService.write(this._workspaceIdentifier.configPath, [{ path: ['folders'], value: folders }], true)
                .then(() => this.reload());
        }
        return Promise.resolve();
    }
    isTransient() {
        return this._workspaceConfiguration.isTransient();
    }
    getConfiguration() {
        return this._workspaceConfiguration.getWorkspaceSettings();
    }
    updateWorkspaceTrust(trusted) {
        this._isWorkspaceTrusted = trusted;
        return this.reparseWorkspaceSettings();
    }
    reparseWorkspaceSettings() {
        this._workspaceConfiguration.reparseWorkspaceSettings({ scopes: WORKSPACE_SCOPES, skipRestricted: this.isUntrusted() });
        return this.getConfiguration();
    }
    getRestrictedSettings() {
        return this._workspaceConfiguration.getRestrictedSettings();
    }
    async waitAndInitialize(workspaceIdentifier) {
        await whenProviderRegistered(workspaceIdentifier.configPath, this.fileService);
        if (!(this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration)) {
            const fileServiceBasedWorkspaceConfiguration = this._register(new FileServiceBasedWorkspaceConfiguration(this.fileService, this.uriIdentityService, this.logService));
            await fileServiceBasedWorkspaceConfiguration.load(workspaceIdentifier, { scopes: WORKSPACE_SCOPES, skipRestricted: this.isUntrusted() });
            this.doInitialize(fileServiceBasedWorkspaceConfiguration);
            this.onDidWorkspaceConfigurationChange(false, true);
        }
    }
    doInitialize(fileServiceBasedWorkspaceConfiguration) {
        this._workspaceConfigurationDisposables.clear();
        this._workspaceConfiguration = this._workspaceConfigurationDisposables.add(fileServiceBasedWorkspaceConfiguration);
        this._workspaceConfigurationDisposables.add(this._workspaceConfiguration.onDidChange(e => this.onDidWorkspaceConfigurationChange(true, false)));
        this._initialized = true;
    }
    isUntrusted() {
        return !this._isWorkspaceTrusted;
    }
    async onDidWorkspaceConfigurationChange(reload, fromCache) {
        if (reload) {
            await this.reload();
        }
        this.updateCache();
        this._onDidUpdateConfiguration.fire(fromCache);
    }
    async updateCache() {
        if (this._workspaceIdentifier && this.configurationCache.needsCaching(this._workspaceIdentifier.configPath) && this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration) {
            const content = await this._workspaceConfiguration.resolveContent(this._workspaceIdentifier);
            await this._cachedConfiguration.updateWorkspace(this._workspaceIdentifier, content);
        }
    }
}
class FileServiceBasedWorkspaceConfiguration extends Disposable {
    constructor(fileService, uriIdentityService, logService) {
        super();
        this.fileService = fileService;
        this.logService = logService;
        this._workspaceIdentifier = null;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser('', logService);
        this.workspaceSettings = ConfigurationModel.createEmptyModel(logService);
        this._register(Event.any(Event.filter(this.fileService.onDidFilesChange, e => !!this._workspaceIdentifier && e.contains(this._workspaceIdentifier.configPath)), Event.filter(this.fileService.onDidRunOperation, e => !!this._workspaceIdentifier && (e.isOperation(0 /* FileOperation.CREATE */) || e.isOperation(3 /* FileOperation.COPY */) || e.isOperation(1 /* FileOperation.DELETE */) || e.isOperation(4 /* FileOperation.WRITE */)) && uriIdentityService.extUri.isEqual(e.resource, this._workspaceIdentifier.configPath)))(() => this.reloadConfigurationScheduler.schedule()));
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
        this.workspaceConfigWatcher = this._register(this.watchWorkspaceConfigurationFile());
    }
    get workspaceIdentifier() {
        return this._workspaceIdentifier;
    }
    async resolveContent(workspaceIdentifier) {
        const content = await this.fileService.readFile(workspaceIdentifier.configPath, { atomic: true });
        return content.value.toString();
    }
    async load(workspaceIdentifier, configurationParseOptions) {
        if (!this._workspaceIdentifier || this._workspaceIdentifier.id !== workspaceIdentifier.id) {
            this._workspaceIdentifier = workspaceIdentifier;
            this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(this._workspaceIdentifier.id, this.logService);
            dispose(this.workspaceConfigWatcher);
            this.workspaceConfigWatcher = this._register(this.watchWorkspaceConfigurationFile());
        }
        let contents = '';
        try {
            contents = await this.resolveContent(this._workspaceIdentifier);
        }
        catch (error) {
            const exists = await this.fileService.exists(this._workspaceIdentifier.configPath);
            if (exists) {
                this.logService.error(error);
            }
        }
        this.workspaceConfigurationModelParser.parse(contents, configurationParseOptions);
        this.consolidate();
    }
    getConfigurationModel() {
        return this.workspaceConfigurationModelParser.configurationModel;
    }
    getFolders() {
        return this.workspaceConfigurationModelParser.folders;
    }
    isTransient() {
        return this.workspaceConfigurationModelParser.transient;
    }
    getWorkspaceSettings() {
        return this.workspaceSettings;
    }
    reparseWorkspaceSettings(configurationParseOptions) {
        this.workspaceConfigurationModelParser.reparseWorkspaceSettings(configurationParseOptions);
        this.consolidate();
        return this.getWorkspaceSettings();
    }
    getRestrictedSettings() {
        return this.workspaceConfigurationModelParser.getRestrictedWorkspaceSettings();
    }
    consolidate() {
        this.workspaceSettings = this.workspaceConfigurationModelParser.settingsModel.merge(this.workspaceConfigurationModelParser.launchModel, this.workspaceConfigurationModelParser.tasksModel);
    }
    watchWorkspaceConfigurationFile() {
        return this._workspaceIdentifier ? this.fileService.watch(this._workspaceIdentifier.configPath) : Disposable.None;
    }
}
class CachedWorkspaceConfiguration {
    constructor(configurationCache, logService) {
        this.configurationCache = configurationCache;
        this.logService = logService;
        this.onDidChange = Event.None;
        this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser('', logService);
        this.workspaceSettings = ConfigurationModel.createEmptyModel(logService);
    }
    async load(workspaceIdentifier, configurationParseOptions) {
        try {
            const key = this.getKey(workspaceIdentifier);
            const contents = await this.configurationCache.read(key);
            const parsed = JSON.parse(contents);
            if (parsed.content) {
                this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(key.key, this.logService);
                this.workspaceConfigurationModelParser.parse(parsed.content, configurationParseOptions);
                this.consolidate();
            }
        }
        catch (e) {
        }
    }
    get workspaceIdentifier() {
        return null;
    }
    getConfigurationModel() {
        return this.workspaceConfigurationModelParser.configurationModel;
    }
    getFolders() {
        return this.workspaceConfigurationModelParser.folders;
    }
    isTransient() {
        return this.workspaceConfigurationModelParser.transient;
    }
    getWorkspaceSettings() {
        return this.workspaceSettings;
    }
    reparseWorkspaceSettings(configurationParseOptions) {
        this.workspaceConfigurationModelParser.reparseWorkspaceSettings(configurationParseOptions);
        this.consolidate();
        return this.getWorkspaceSettings();
    }
    getRestrictedSettings() {
        return this.workspaceConfigurationModelParser.getRestrictedWorkspaceSettings();
    }
    consolidate() {
        this.workspaceSettings = this.workspaceConfigurationModelParser.settingsModel.merge(this.workspaceConfigurationModelParser.launchModel, this.workspaceConfigurationModelParser.tasksModel);
    }
    async updateWorkspace(workspaceIdentifier, content) {
        try {
            const key = this.getKey(workspaceIdentifier);
            if (content) {
                await this.configurationCache.write(key, JSON.stringify({ content }));
            }
            else {
                await this.configurationCache.remove(key);
            }
        }
        catch (error) {
        }
    }
    getKey(workspaceIdentifier) {
        return {
            type: 'workspaces',
            key: workspaceIdentifier.id
        };
    }
}
class CachedFolderConfiguration {
    constructor(folder, configFolderRelativePath, configurationParseOptions, configurationCache, logService) {
        this.configurationCache = configurationCache;
        this.logService = logService;
        this.onDidChange = Event.None;
        this.key = { type: 'folder', key: hash(joinPath(folder, configFolderRelativePath).toString()).toString(16) };
        this._folderSettingsModelParser = new ConfigurationModelParser('CachedFolderConfiguration', logService);
        this._folderSettingsParseOptions = configurationParseOptions;
        this._standAloneConfigurations = [];
        this.configurationModel = ConfigurationModel.createEmptyModel(logService);
    }
    async loadConfiguration() {
        try {
            const contents = await this.configurationCache.read(this.key);
            const { content: configurationContents } = JSON.parse(contents.toString());
            if (configurationContents) {
                for (const key of Object.keys(configurationContents)) {
                    if (key === FOLDER_SETTINGS_NAME) {
                        this._folderSettingsModelParser.parse(configurationContents[key], this._folderSettingsParseOptions);
                    }
                    else {
                        const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(key, key, this.logService);
                        standAloneConfigurationModelParser.parse(configurationContents[key]);
                        this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
                    }
                }
            }
            this.consolidate();
        }
        catch (e) {
        }
        return this.configurationModel;
    }
    async updateConfiguration(settingsContent, standAloneConfigurationContents) {
        const content = {};
        if (settingsContent) {
            content[FOLDER_SETTINGS_NAME] = settingsContent;
        }
        standAloneConfigurationContents.forEach(([key, contents]) => {
            if (contents) {
                content[key] = contents;
            }
        });
        if (Object.keys(content).length) {
            await this.configurationCache.write(this.key, JSON.stringify({ content }));
        }
        else {
            await this.configurationCache.remove(this.key);
        }
    }
    getRestrictedSettings() {
        return this._folderSettingsModelParser.restrictedConfigurations;
    }
    reparse(configurationParseOptions) {
        this._folderSettingsParseOptions = configurationParseOptions;
        this._folderSettingsModelParser.reparse(this._folderSettingsParseOptions);
        this.consolidate();
        return this.configurationModel;
    }
    consolidate() {
        this.configurationModel = this._folderSettingsModelParser.configurationModel.merge(...this._standAloneConfigurations);
    }
    getUnsupportedKeys() {
        return [];
    }
}
export class FolderConfiguration extends Disposable {
    constructor(useCache, workspaceFolder, configFolderRelativePath, workbenchState, workspaceTrusted, fileService, uriIdentityService, logService, configurationCache) {
        super();
        this.workspaceFolder = workspaceFolder;
        this.workbenchState = workbenchState;
        this.workspaceTrusted = workspaceTrusted;
        this.configurationCache = configurationCache;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.scopes = 3 /* WorkbenchState.WORKSPACE */ === this.workbenchState ? FOLDER_SCOPES : WORKSPACE_SCOPES;
        this.configurationFolder = uriIdentityService.extUri.joinPath(workspaceFolder.uri, configFolderRelativePath);
        this.cachedFolderConfiguration = new CachedFolderConfiguration(workspaceFolder.uri, configFolderRelativePath, { scopes: this.scopes, skipRestricted: this.isUntrusted() }, configurationCache, logService);
        if (useCache && this.configurationCache.needsCaching(workspaceFolder.uri)) {
            this.folderConfiguration = this.cachedFolderConfiguration;
            whenProviderRegistered(workspaceFolder.uri, fileService)
                .then(() => {
                this.folderConfiguration = this._register(this.createFileServiceBasedConfiguration(fileService, uriIdentityService, logService));
                this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
                this.onDidFolderConfigurationChange();
            });
        }
        else {
            this.folderConfiguration = this._register(this.createFileServiceBasedConfiguration(fileService, uriIdentityService, logService));
            this._register(this.folderConfiguration.onDidChange(e => this.onDidFolderConfigurationChange()));
        }
    }
    loadConfiguration() {
        return this.folderConfiguration.loadConfiguration();
    }
    updateWorkspaceTrust(trusted) {
        this.workspaceTrusted = trusted;
        return this.reparse();
    }
    reparse() {
        const configurationModel = this.folderConfiguration.reparse({ scopes: this.scopes, skipRestricted: this.isUntrusted() });
        this.updateCache();
        return configurationModel;
    }
    getRestrictedSettings() {
        return this.folderConfiguration.getRestrictedSettings();
    }
    isUntrusted() {
        return !this.workspaceTrusted;
    }
    onDidFolderConfigurationChange() {
        this.updateCache();
        this._onDidChange.fire();
    }
    createFileServiceBasedConfiguration(fileService, uriIdentityService, logService) {
        const settingsResource = uriIdentityService.extUri.joinPath(this.configurationFolder, `${FOLDER_SETTINGS_NAME}.json`);
        const standAloneConfigurationResources = [TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, MCP_CONFIGURATION_KEY].map(name => ([name, uriIdentityService.extUri.joinPath(this.configurationFolder, `${name}.json`)]));
        return new FileServiceBasedConfiguration(this.configurationFolder.toString(), settingsResource, standAloneConfigurationResources, { scopes: this.scopes, skipRestricted: this.isUntrusted() }, fileService, uriIdentityService, logService);
    }
    async updateCache() {
        if (this.configurationCache.needsCaching(this.configurationFolder) && this.folderConfiguration instanceof FileServiceBasedConfiguration) {
            const [settingsContent, standAloneConfigurationContents] = await this.folderConfiguration.resolveContents();
            this.cachedFolderConfiguration.updateConfiguration(settingsContent, standAloneConfigurationContents);
        }
    }
    addRelated(disposable) {
        this._register(disposable);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2Jyb3dzZXIvY29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sS0FBSyxNQUFNLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBZSxPQUFPLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlKLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBa0Qsc0JBQXNCLEVBQThFLE1BQU0sNENBQTRDLENBQUM7QUFDaE4sT0FBTyxFQUFFLGtCQUFrQixFQUFFLHdCQUF3QixFQUE2QixZQUFZLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6SyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6SCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsb0JBQW9CLEVBQUUsd0JBQXdCLEVBQXlDLHFCQUFxQixFQUFFLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSwwQkFBMEIsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRzNSLE9BQU8sRUFBc0IsVUFBVSxFQUEwQix1QkFBdUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ3JLLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFJdkQs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