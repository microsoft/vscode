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
import { URI } from '../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { equals } from '../../../../base/common/objects.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Queue, Barrier, Promises, Delayer, Throttler } from '../../../../base/common/async.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IWorkspaceContextService, Workspace as BaseWorkspace, toWorkspaceFolder, isWorkspaceFolder, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { ConfigurationModel, ConfigurationChangeEvent, mergeChanges } from '../../../../platform/configuration/common/configurationModels.js';
import { isConfigurationOverrides, ConfigurationTargetToString, isConfigurationUpdateOverrides, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { NullPolicyConfiguration, PolicyConfiguration } from '../../../../platform/configuration/common/configurations.js';
import { Configuration } from '../common/configurationModels.js';
import { FOLDER_CONFIG_FOLDER_NAME, defaultSettingsSchemaId, userSettingsSchemaId, workspaceSettingsSchemaId, folderSettingsSchemaId, machineSettingsSchemaId, LOCAL_MACHINE_SCOPES, PROFILE_SCOPES, LOCAL_MACHINE_PROFILE_SCOPES, profileSettingsSchemaId, APPLY_ALL_PROFILES_SETTING, APPLICATION_SCOPES } from '../common/configuration.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, allSettings, windowSettings, resourceSettings, applicationSettings, machineSettings, machineOverridableSettings, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_PATTERN, resourceLanguageSettingsSchemaId, configurationDefaultsSchemaId, applicationMachineSettings, isConfigurationDefaultSourceEquals } from '../../../../platform/configuration/common/configurationRegistry.js';
import { isStoredWorkspaceFolder, getStoredWorkspaceFolder, toWorkspaceFolders } from '../../../../platform/workspaces/common/workspaces.js';
import { ConfigurationEditing } from '../common/configurationEditing.js';
import { WorkspaceConfiguration, FolderConfiguration, RemoteUserConfiguration, UserConfiguration, DefaultConfiguration, ApplicationConfiguration } from './configuration.js';
import { mark } from '../../../../base/common/performance.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { delta, distinct, equals as arrayEquals } from '../../../../base/common/arrays.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IWorkbenchAssignmentService } from '../../assignment/common/assignmentService.js';
import { isUndefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { NullPolicyService } from '../../../../platform/policy/common/policy.js';
import { IJSONEditingService } from '../common/jsonEditing.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { runWhenWindowIdle } from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { fixSettingLinks } from '../../preferences/common/preferencesModels.js';
function getLocalUserConfigurationScopes(userDataProfile, hasRemote) {
    const isDefaultProfile = userDataProfile.isDefault || userDataProfile.useDefaultFlags?.settings;
    if (isDefaultProfile) {
        return hasRemote ? LOCAL_MACHINE_SCOPES : undefined;
    }
    return hasRemote ? LOCAL_MACHINE_PROFILE_SCOPES : PROFILE_SCOPES;
}
class Workspace extends BaseWorkspace {
    constructor() {
        super(...arguments);
        this.initialized = false;
    }
}
export class WorkspaceService extends Disposable {
    get restrictedSettings() { return this._restrictedSettings; }
    constructor({ remoteAuthority, configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService) {
        super();
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.fileService = fileService;
        this.remoteAgentService = remoteAgentService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this.initialized = false;
        this.applicationConfiguration = null;
        this.remoteUserConfiguration = null;
        this.cachedFolderConfigs = this._register(new DisposableMap(new ResourceMap()));
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this._onWillChangeWorkspaceFolders = this._register(new Emitter());
        this.onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;
        this._onDidChangeWorkspaceFolders = this._register(new Emitter());
        this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
        this._onDidChangeWorkspaceName = this._register(new Emitter());
        this.onDidChangeWorkspaceName = this._onDidChangeWorkspaceName.event;
        this._onDidChangeWorkbenchState = this._register(new Emitter());
        this.onDidChangeWorkbenchState = this._onDidChangeWorkbenchState.event;
        this.isWorkspaceTrusted = true;
        this._restrictedSettings = { default: [] };
        this._onDidChangeRestrictedSettings = this._register(new Emitter());
        this.onDidChangeRestrictedSettings = this._onDidChangeRestrictedSettings.event;
        this.configurationRegistry = Registry.as(Extensions.Configuration);
        this.initRemoteUserConfigurationBarrier = new Barrier();
        this.completeWorkspaceBarrier = new Barrier();
        this.defaultConfiguration = this._register(new DefaultConfiguration(userDataProfileService.currentProfile.id, configurationCache, environmentService, logService));
        this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
        this.configurationCache = configurationCache;
        this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), this.workspace, logService);
        this.applicationConfigurationDisposables = this._register(new DisposableStore());
        this.createApplicationConfiguration();
        this.localUserConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, { scopes: getLocalUserConfigurationScopes(userDataProfileService.currentProfile, !!remoteAuthority) }, fileService, uriIdentityService, logService));
        this._register(this.localUserConfiguration.onDidChangeConfiguration(userConfiguration => this.onLocalUserConfigurationChanged(userConfiguration)));
        if (remoteAuthority) {
            const remoteUserConfiguration = this.remoteUserConfiguration = this._register(new RemoteUserConfiguration(remoteAuthority, configurationCache, fileService, uriIdentityService, remoteAgentService, logService));
            this._register(remoteUserConfiguration.onDidInitialize(remoteUserConfigurationModel => {
                this._register(remoteUserConfiguration.onDidChangeConfiguration(remoteUserConfigurationModel => this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel)));
                this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel);
                this.initRemoteUserConfigurationBarrier.open();
            }));
        }
        else {
            this.initRemoteUserConfigurationBarrier.open();
        }
        this.workspaceConfiguration = this._register(new WorkspaceConfiguration(configurationCache, fileService, uriIdentityService, logService));
        this._register(this.workspaceConfiguration.onDidUpdateConfiguration(fromCache => {
            this.onWorkspaceConfigurationChanged(fromCache).then(() => {
                this.workspace.initialized = this.workspaceConfiguration.initialized;
                this.checkAndMarkWorkspaceComplete(fromCache);
            });
        }));
        this._register(this.defaultConfiguration.onDidChangeConfiguration(({ properties, defaults }) => this.onDefaultConfigurationChanged(defaults, properties)));
        this._register(this.policyConfiguration.onDidChangeConfiguration(configurationModel => this.onPolicyConfigurationChanged(configurationModel)));
        this._register(userDataProfileService.onDidChangeCurrentProfile(e => this.onUserDataProfileChanged(e)));
        this.workspaceEditingQueue = new Queue();
    }
    createApplicationConfiguration() {
        this.applicationConfigurationDisposables.clear();
        if (this.userDataProfileService.currentProfile.isDefault || this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
            this.applicationConfiguration = null;
        }
        else {
            this.applicationConfiguration = this.applicationConfigurationDisposables.add(this._register(new ApplicationConfiguration(this.userDataProfilesService, this.fileService, this.uriIdentityService, this.logService)));
            this.applicationConfigurationDisposables.add(this.applicationConfiguration.onDidChangeConfiguration(configurationModel => this.onApplicationConfigurationChanged(configurationModel)));
        }
    }
    // Workspace Context Service Impl
    async getCompleteWorkspace() {
        await this.completeWorkspaceBarrier.wait();
        return this.getWorkspace();
    }
    getWorkspace() {
        return this.workspace;
    }
    getWorkbenchState() {
        // Workspace has configuration file
        if (this.workspace.configuration) {
            return 3 /* WorkbenchState.WORKSPACE */;
        }
        // Folder has single root
        if (this.workspace.folders.length === 1) {
            return 2 /* WorkbenchState.FOLDER */;
        }
        // Empty
        return 1 /* WorkbenchState.EMPTY */;
    }
    hasWorkspaceData() {
        return this.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    }
    getWorkspaceFolder(resource) {
        return this.workspace.getFolder(resource);
    }
    addFolders(foldersToAdd, index) {
        return this.updateFolders(foldersToAdd, [], index);
    }
    removeFolders(foldersToRemove) {
        return this.updateFolders([], foldersToRemove);
    }
    async updateFolders(foldersToAdd, foldersToRemove, index) {
        return this.workspaceEditingQueue.queue(() => this.doUpdateFolders(foldersToAdd, foldersToRemove, index));
    }
    isInsideWorkspace(resource) {
        return !!this.getWorkspaceFolder(resource);
    }
    isCurrentWorkspace(workspaceIdOrFolder) {
        switch (this.getWorkbenchState()) {
            case 2 /* WorkbenchState.FOLDER */: {
                let folderUri = undefined;
                if (URI.isUri(workspaceIdOrFolder)) {
                    folderUri = workspaceIdOrFolder;
                }
                else if (isSingleFolderWorkspaceIdentifier(workspaceIdOrFolder)) {
                    folderUri = workspaceIdOrFolder.uri;
                }
                return URI.isUri(folderUri) && this.uriIdentityService.extUri.isEqual(folderUri, this.workspace.folders[0].uri);
            }
            case 3 /* WorkbenchState.WORKSPACE */:
                return isWorkspaceIdentifier(workspaceIdOrFolder) && this.workspace.id === workspaceIdOrFolder.id;
        }
        return false;
    }
    async doUpdateFolders(foldersToAdd, foldersToRemove, index) {
        if (this.getWorkbenchState() !== 3 /* WorkbenchState.WORKSPACE */) {
            return Promise.resolve(undefined); // we need a workspace to begin with
        }
        if (foldersToAdd.length + foldersToRemove.length === 0) {
            return Promise.resolve(undefined); // nothing to do
        }
        let foldersHaveChanged = false;
        // Remove first (if any)
        let currentWorkspaceFolders = this.getWorkspace().folders;
        let newStoredFolders = currentWorkspaceFolders.map(f => f.raw).filter((folder, index) => {
            if (!isStoredWorkspaceFolder(folder)) {
                return true; // keep entries which are unrelated
            }
            return !this.contains(foldersToRemove, currentWorkspaceFolders[index].uri); // keep entries which are unrelated
        });
        foldersHaveChanged = currentWorkspaceFolders.length !== newStoredFolders.length;
        // Add afterwards (if any)
        if (foldersToAdd.length) {
            // Recompute current workspace folders if we have folders to add
            const workspaceConfigPath = this.getWorkspace().configuration;
            const workspaceConfigFolder = this.uriIdentityService.extUri.dirname(workspaceConfigPath);
            currentWorkspaceFolders = toWorkspaceFolders(newStoredFolders, workspaceConfigPath, this.uriIdentityService.extUri);
            const currentWorkspaceFolderUris = currentWorkspaceFolders.map(folder => folder.uri);
            const storedFoldersToAdd = [];
            for (const folderToAdd of foldersToAdd) {
                const folderURI = folderToAdd.uri;
                if (this.contains(currentWorkspaceFolderUris, folderURI)) {
                    continue; // already existing
                }
                try {
                    const result = await this.fileService.stat(folderURI);
                    if (!result.isDirectory) {
                        continue;
                    }
                }
                catch (e) { /* Ignore */ }
                storedFoldersToAdd.push(getStoredWorkspaceFolder(folderURI, false, folderToAdd.name, workspaceConfigFolder, this.uriIdentityService.extUri));
            }
            // Apply to array of newStoredFolders
            if (storedFoldersToAdd.length > 0) {
                foldersHaveChanged = true;
                if (typeof index === 'number' && index >= 0 && index < newStoredFolders.length) {
                    newStoredFolders = newStoredFolders.slice(0);
                    newStoredFolders.splice(index, 0, ...storedFoldersToAdd);
                }
                else {
                    newStoredFolders = [...newStoredFolders, ...storedFoldersToAdd];
                }
            }
        }
        // Set folders if we recorded a change
        if (foldersHaveChanged) {
            return this.setFolders(newStoredFolders);
        }
        return Promise.resolve(undefined);
    }
    async setFolders(folders) {
        if (!this.instantiationService) {
            throw new Error('Cannot update workspace folders because workspace service is not yet ready to accept writes.');
        }
        await this.instantiationService.invokeFunction(accessor => this.workspaceConfiguration.setFolders(folders, accessor.get(IJSONEditingService)));
        return this.onWorkspaceConfigurationChanged(false);
    }
    contains(resources, toCheck) {
        return resources.some(resource => this.uriIdentityService.extUri.isEqual(resource, toCheck));
    }
    // Workspace Configuration Service Impl
    getConfigurationData() {
        return this._configuration.toData();
    }
    getValue(arg1, arg2) {
        const section = typeof arg1 === 'string' ? arg1 : undefined;
        const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
        return this._configuration.getValue(section, overrides);
    }
    async updateValue(key, value, arg3, arg4, options) {
        const overrides = isConfigurationUpdateOverrides(arg3) ? arg3
            : isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : undefined } : undefined;
        const target = (overrides ? arg4 : arg3);
        const targets = target ? [target] : [];
        if (overrides?.overrideIdentifiers) {
            overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
            overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : undefined;
        }
        if (!targets.length) {
            if (overrides?.overrideIdentifiers && overrides.overrideIdentifiers.length > 1) {
                throw new Error('Configuration Target is required while updating the value for multiple override identifiers');
            }
            const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : undefined });
            targets.push(...this.deriveConfigurationTargets(key, value, inspect));
            // Remove the setting, if the value is same as default value and is updated only in user target
            if (equals(value, inspect.defaultValue) && targets.length === 1 && (targets[0] === 2 /* ConfigurationTarget.USER */ || targets[0] === 3 /* ConfigurationTarget.USER_LOCAL */)) {
                value = undefined;
            }
        }
        await Promises.settled(targets.map(target => this.writeConfigurationValue(key, value, target, overrides, options)));
    }
    async reloadConfiguration(target) {
        if (target === undefined) {
            this.reloadDefaultConfiguration();
            const application = await this.reloadApplicationConfiguration(true);
            const { local, remote } = await this.reloadUserConfiguration();
            await this.reloadWorkspaceConfiguration();
            await this.loadConfiguration(application, local, remote, true);
            return;
        }
        if (isWorkspaceFolder(target)) {
            await this.reloadWorkspaceFolderConfiguration(target);
            return;
        }
        switch (target) {
            case 7 /* ConfigurationTarget.DEFAULT */:
                this.reloadDefaultConfiguration();
                return;
            case 2 /* ConfigurationTarget.USER */: {
                const { local, remote } = await this.reloadUserConfiguration();
                await this.loadConfiguration(this._configuration.applicationConfiguration, local, remote, true);
                return;
            }
            case 3 /* ConfigurationTarget.USER_LOCAL */:
                await this.reloadLocalUserConfiguration();
                return;
            case 4 /* ConfigurationTarget.USER_REMOTE */:
                await this.reloadRemoteUserConfiguration();
                return;
            case 5 /* ConfigurationTarget.WORKSPACE */:
            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                await this.reloadWorkspaceConfiguration();
                return;
        }
    }
    hasCachedConfigurationDefaultsOverrides() {
        return this.defaultConfiguration.hasCachedConfigurationDefaultsOverrides();
    }
    inspect(key, overrides) {
        return this._configuration.inspect(key, overrides);
    }
    keys() {
        return this._configuration.keys();
    }
    async whenRemoteConfigurationLoaded() {
        await this.initRemoteUserConfigurationBarrier.wait();
    }
    /**
     * At present, all workspaces (empty, single-folder, multi-root) in local and remote
     * can be initialized without requiring extension host except following case:
     *
     * A multi root workspace with .code-workspace file that has to be resolved by an extension.
     * Because of readonly `rootPath` property in extension API we have to resolve multi root workspace
     * before extension host starts so that `rootPath` can be set to first folder.
     *
     * This restriction is lifted partially for web in `MainThreadWorkspace`.
     * In web, we start extension host with empty `rootPath` in this case.
     *
     * Related root path issue discussion is being tracked here - https://github.com/microsoft/vscode/issues/69335
     */
    async initialize(arg) {
        mark('code/willInitWorkspaceService');
        const trigger = this.initialized;
        this.initialized = false;
        const workspace = await this.createWorkspace(arg);
        await this.updateWorkspaceAndInitializeConfiguration(workspace, trigger);
        this.checkAndMarkWorkspaceComplete(false);
        mark('code/didInitWorkspaceService');
    }
    updateWorkspaceTrust(trusted) {
        if (this.isWorkspaceTrusted !== trusted) {
            this.isWorkspaceTrusted = trusted;
            const data = this._configuration.toData();
            const folderConfigurationModels = [];
            for (const folder of this.workspace.folders) {
                const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
                let configurationModel;
                if (folderConfiguration) {
                    configurationModel = folderConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted);
                    this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
                }
                folderConfigurationModels.push(configurationModel);
            }
            if (this.getWorkbenchState() === 2 /* WorkbenchState.FOLDER */) {
                if (folderConfigurationModels[0]) {
                    this._configuration.updateWorkspaceConfiguration(folderConfigurationModels[0]);
                }
            }
            else {
                this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted));
            }
            this.updateRestrictedSettings();
            let keys = [];
            if (this.restrictedSettings.userLocal) {
                keys.push(...this.restrictedSettings.userLocal);
            }
            if (this.restrictedSettings.userRemote) {
                keys.push(...this.restrictedSettings.userRemote);
            }
            if (this.restrictedSettings.workspace) {
                keys.push(...this.restrictedSettings.workspace);
            }
            this.restrictedSettings.workspaceFolder?.forEach((value) => keys.push(...value));
            keys = distinct(keys);
            if (keys.length) {
                this.triggerConfigurationChange({ keys, overrides: [] }, { data, workspace: this.workspace }, 5 /* ConfigurationTarget.WORKSPACE */);
            }
        }
    }
    acquireInstantiationService(instantiationService) {
        this.instantiationService = instantiationService;
    }
    isSettingAppliedForAllProfiles(key) {
        const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
        if (scope && APPLICATION_SCOPES.includes(scope)) {
            return true;
        }
        const allProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
        return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
    }
    async createWorkspace(arg) {
        if (isWorkspaceIdentifier(arg)) {
            return this.createMultiFolderWorkspace(arg);
        }
        if (isSingleFolderWorkspaceIdentifier(arg)) {
            return this.createSingleFolderWorkspace(arg);
        }
        return this.createEmptyWorkspace(arg);
    }
    async createMultiFolderWorkspace(workspaceIdentifier) {
        await this.workspaceConfiguration.initialize({ id: workspaceIdentifier.id, configPath: workspaceIdentifier.configPath }, this.isWorkspaceTrusted);
        const workspaceConfigPath = workspaceIdentifier.configPath;
        const workspaceFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), workspaceConfigPath, this.uriIdentityService.extUri);
        const workspaceId = workspaceIdentifier.id;
        const workspace = new Workspace(workspaceId, workspaceFolders, this.workspaceConfiguration.isTransient(), workspaceConfigPath, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));
        workspace.initialized = this.workspaceConfiguration.initialized;
        return workspace;
    }
    createSingleFolderWorkspace(singleFolderWorkspaceIdentifier) {
        const workspace = new Workspace(singleFolderWorkspaceIdentifier.id, [toWorkspaceFolder(singleFolderWorkspaceIdentifier.uri)], false, null, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));
        workspace.initialized = true;
        return workspace;
    }
    createEmptyWorkspace(emptyWorkspaceIdentifier) {
        const workspace = new Workspace(emptyWorkspaceIdentifier.id, [], false, null, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));
        workspace.initialized = true;
        return Promise.resolve(workspace);
    }
    checkAndMarkWorkspaceComplete(fromCache) {
        if (!this.completeWorkspaceBarrier.isOpen() && this.workspace.initialized) {
            this.completeWorkspaceBarrier.open();
            this.validateWorkspaceFoldersAndReload(fromCache);
        }
    }
    async updateWorkspaceAndInitializeConfiguration(workspace, trigger) {
        const hasWorkspaceBefore = !!this.workspace;
        let previousState;
        let previousWorkspacePath;
        let previousFolders = [];
        if (hasWorkspaceBefore) {
            previousState = this.getWorkbenchState();
            previousWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : undefined;
            previousFolders = this.workspace.folders;
            this.workspace.update(workspace);
        }
        else {
            this.workspace = workspace;
        }
        await this.initializeConfiguration(trigger);
        // Trigger changes after configuration initialization so that configuration is up to date.
        if (hasWorkspaceBefore) {
            const newState = this.getWorkbenchState();
            if (previousState && newState !== previousState) {
                this._onDidChangeWorkbenchState.fire(newState);
            }
            const newWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : undefined;
            if (previousWorkspacePath && newWorkspacePath !== previousWorkspacePath || newState !== previousState) {
                this._onDidChangeWorkspaceName.fire();
            }
            const folderChanges = this.compareFolders(previousFolders, this.workspace.folders);
            if (folderChanges && (folderChanges.added.length || folderChanges.removed.length || folderChanges.changed.length)) {
                await this.handleWillChangeWorkspaceFolders(folderChanges, false);
                this._onDidChangeWorkspaceFolders.fire(folderChanges);
            }
        }
        if (!this.localUserConfiguration.hasTasksLoaded) {
            // Reload local user configuration again to load user tasks
            this._register(runWhenWindowIdle(mainWindow, () => this.reloadLocalUserConfiguration(false, this._configuration.localUserConfiguration)));
        }
    }
    compareFolders(currentFolders, newFolders) {
        const result = { added: [], removed: [], changed: [] };
        result.added = newFolders.filter(newFolder => !currentFolders.some(currentFolder => newFolder.uri.toString() === currentFolder.uri.toString()));
        for (let currentIndex = 0; currentIndex < currentFolders.length; currentIndex++) {
            const currentFolder = currentFolders[currentIndex];
            let newIndex = 0;
            for (newIndex = 0; newIndex < newFolders.length && currentFolder.uri.toString() !== newFolders[newIndex].uri.toString(); newIndex++) { }
            if (newIndex < newFolders.length) {
                if (currentIndex !== newIndex || currentFolder.name !== newFolders[newIndex].name) {
                    result.changed.push(currentFolder);
                }
            }
            else {
                result.removed.push(currentFolder);
            }
        }
        return result;
    }
    async initializeConfiguration(trigger) {
        await this.defaultConfiguration.initialize();
        const initPolicyConfigurationPromise = this.policyConfiguration.initialize();
        const initApplicationConfigurationPromise = this.applicationConfiguration ? this.applicationConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService));
        const initUserConfiguration = async () => {
            mark('code/willInitUserConfiguration');
            const result = await Promise.all([this.localUserConfiguration.initialize(), this.remoteUserConfiguration ? this.remoteUserConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService))]);
            if (this.applicationConfiguration) {
                const applicationConfigurationModel = await initApplicationConfigurationPromise;
                result[0] = this.localUserConfiguration.reparse({ exclude: applicationConfigurationModel.getValue(APPLY_ALL_PROFILES_SETTING) });
            }
            mark('code/didInitUserConfiguration');
            return result;
        };
        const [, application, [local, remote]] = await Promise.all([
            initPolicyConfigurationPromise,
            initApplicationConfigurationPromise,
            initUserConfiguration()
        ]);
        mark('code/willInitWorkspaceConfiguration');
        await this.loadConfiguration(application, local, remote, trigger);
        mark('code/didInitWorkspaceConfiguration');
    }
    reloadDefaultConfiguration() {
        this.onDefaultConfigurationChanged(this.defaultConfiguration.reload());
    }
    async reloadApplicationConfiguration(donotTrigger) {
        if (!this.applicationConfiguration) {
            return ConfigurationModel.createEmptyModel(this.logService);
        }
        const model = await this.applicationConfiguration.loadConfiguration();
        if (!donotTrigger) {
            this.onApplicationConfigurationChanged(model);
        }
        return model;
    }
    async reloadUserConfiguration() {
        const [local, remote] = await Promise.all([this.reloadLocalUserConfiguration(true), this.reloadRemoteUserConfiguration(true)]);
        return { local, remote };
    }
    async reloadLocalUserConfiguration(donotTrigger, settingsConfiguration) {
        const model = await this.localUserConfiguration.reload(settingsConfiguration);
        if (!donotTrigger) {
            this.onLocalUserConfigurationChanged(model);
        }
        return model;
    }
    async reloadRemoteUserConfiguration(donotTrigger) {
        if (this.remoteUserConfiguration) {
            const model = await this.remoteUserConfiguration.reload();
            if (!donotTrigger) {
                this.onRemoteUserConfigurationChanged(model);
            }
            return model;
        }
        return ConfigurationModel.createEmptyModel(this.logService);
    }
    async reloadWorkspaceConfiguration() {
        const workbenchState = this.getWorkbenchState();
        if (workbenchState === 2 /* WorkbenchState.FOLDER */) {
            return this.onWorkspaceFolderConfigurationChanged(this.workspace.folders[0]);
        }
        if (workbenchState === 3 /* WorkbenchState.WORKSPACE */) {
            return this.workspaceConfiguration.reload().then(() => this.onWorkspaceConfigurationChanged(false));
        }
    }
    reloadWorkspaceFolderConfiguration(folder) {
        return this.onWorkspaceFolderConfigurationChanged(folder);
    }
    async loadConfiguration(applicationConfigurationModel, userConfigurationModel, remoteUserConfigurationModel, trigger) {
        // reset caches
        this.cachedFolderConfigs.clearAndDisposeAll();
        const folders = this.workspace.folders;
        const folderConfigurations = await this.loadFolderConfigurations(folders);
        const workspaceConfiguration = this.getWorkspaceConfigurationModel(folderConfigurations);
        const folderConfigurationModels = new ResourceMap();
        folderConfigurations.forEach((folderConfiguration, index) => folderConfigurationModels.set(folders[index].uri, folderConfiguration));
        const currentConfiguration = this._configuration;
        this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, applicationConfigurationModel, userConfigurationModel, remoteUserConfigurationModel, workspaceConfiguration, folderConfigurationModels, ConfigurationModel.createEmptyModel(this.logService), new ResourceMap(), this.workspace, this.logService);
        this.initialized = true;
        if (trigger) {
            const change = this._configuration.compare(currentConfiguration);
            this.triggerConfigurationChange(change, { data: currentConfiguration.toData(), workspace: this.workspace }, 5 /* ConfigurationTarget.WORKSPACE */);
        }
        this.updateRestrictedSettings();
    }
    getWorkspaceConfigurationModel(folderConfigurations) {
        switch (this.getWorkbenchState()) {
            case 2 /* WorkbenchState.FOLDER */:
                return folderConfigurations[0];
            case 3 /* WorkbenchState.WORKSPACE */:
                return this.workspaceConfiguration.getConfiguration();
            default:
                return ConfigurationModel.createEmptyModel(this.logService);
        }
    }
    onUserDataProfileChanged(e) {
        e.join((async () => {
            const promises = [];
            promises.push(this.localUserConfiguration.reset(e.profile.settingsResource, e.profile.tasksResource, e.profile.mcpResource, { scopes: getLocalUserConfigurationScopes(e.profile, !!this.remoteUserConfiguration) }));
            if (e.previous.isDefault !== e.profile.isDefault
                || !!e.previous.useDefaultFlags?.settings !== !!e.profile.useDefaultFlags?.settings) {
                this.createApplicationConfiguration();
                if (this.applicationConfiguration) {
                    promises.push(this.reloadApplicationConfiguration(true));
                }
            }
            let [localUser, application] = await Promise.all(promises);
            application = application ?? this._configuration.applicationConfiguration;
            if (this.applicationConfiguration) {
                localUser = this.localUserConfiguration.reparse({ exclude: application.getValue(APPLY_ALL_PROFILES_SETTING) });
            }
            await this.loadConfiguration(application, localUser, this._configuration.remoteUserConfiguration, true);
        })());
    }
    onDefaultConfigurationChanged(configurationModel, properties) {
        if (this.workspace) {
            const previousData = this._configuration.toData();
            const change = this._configuration.compareAndUpdateDefaultConfiguration(configurationModel, properties);
            if (this.applicationConfiguration) {
                this._configuration.updateApplicationConfiguration(this.applicationConfiguration.reparse());
            }
            if (this.remoteUserConfiguration) {
                this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse());
                this._configuration.updateRemoteUserConfiguration(this.remoteUserConfiguration.reparse());
            }
            if (this.getWorkbenchState() === 2 /* WorkbenchState.FOLDER */) {
                const folderConfiguration = this.cachedFolderConfigs.get(this.workspace.folders[0].uri);
                if (folderConfiguration) {
                    this._configuration.updateWorkspaceConfiguration(folderConfiguration.reparse());
                    this._configuration.updateFolderConfiguration(this.workspace.folders[0].uri, folderConfiguration.reparse());
                }
            }
            else {
                this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.reparseWorkspaceSettings());
                for (const folder of this.workspace.folders) {
                    const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
                    if (folderConfiguration) {
                        this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
                    }
                }
            }
            this.triggerConfigurationChange(change, { data: previousData, workspace: this.workspace }, 7 /* ConfigurationTarget.DEFAULT */);
            this.updateRestrictedSettings();
        }
    }
    onPolicyConfigurationChanged(policyConfiguration) {
        const previous = { data: this._configuration.toData(), workspace: this.workspace };
        const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
        this.triggerConfigurationChange(change, previous, 7 /* ConfigurationTarget.DEFAULT */);
    }
    onApplicationConfigurationChanged(applicationConfiguration) {
        const previous = { data: this._configuration.toData(), workspace: this.workspace };
        const previousAllProfilesSettings = this._configuration.applicationConfiguration.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
        const change = this._configuration.compareAndUpdateApplicationConfiguration(applicationConfiguration);
        const currentAllProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
        const configurationProperties = this.configurationRegistry.getConfigurationProperties();
        const changedKeys = [];
        for (const changedKey of change.keys) {
            const scope = configurationProperties[changedKey]?.scope;
            if (scope && APPLICATION_SCOPES.includes(scope)) {
                changedKeys.push(changedKey);
                if (changedKey === APPLY_ALL_PROFILES_SETTING) {
                    for (const previousAllProfileSetting of previousAllProfilesSettings) {
                        if (!currentAllProfilesSettings.includes(previousAllProfileSetting)) {
                            changedKeys.push(previousAllProfileSetting);
                        }
                    }
                    for (const currentAllProfileSetting of currentAllProfilesSettings) {
                        if (!previousAllProfilesSettings.includes(currentAllProfileSetting)) {
                            changedKeys.push(currentAllProfileSetting);
                        }
                    }
                }
            }
            else if (currentAllProfilesSettings.includes(changedKey)) {
                changedKeys.push(changedKey);
            }
        }
        change.keys = changedKeys;
        if (change.keys.includes(APPLY_ALL_PROFILES_SETTING)) {
            this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse({ exclude: currentAllProfilesSettings }));
        }
        this.triggerConfigurationChange(change, previous, 2 /* ConfigurationTarget.USER */);
    }
    onLocalUserConfigurationChanged(userConfiguration) {
        const previous = { data: this._configuration.toData(), workspace: this.workspace };
        const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
        this.triggerConfigurationChange(change, previous, 2 /* ConfigurationTarget.USER */);
    }
    onRemoteUserConfigurationChanged(userConfiguration) {
        const previous = { data: this._configuration.toData(), workspace: this.workspace };
        const change = this._configuration.compareAndUpdateRemoteUserConfiguration(userConfiguration);
        this.triggerConfigurationChange(change, previous, 2 /* ConfigurationTarget.USER */);
    }
    async onWorkspaceConfigurationChanged(fromCache) {
        if (this.workspace && this.workspace.configuration) {
            let newFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), this.workspace.configuration, this.uriIdentityService.extUri);
            // Validate only if workspace is initialized
            if (this.workspace.initialized) {
                const { added, removed, changed } = this.compareFolders(this.workspace.folders, newFolders);
                /* If changed validate new folders */
                if (added.length || removed.length || changed.length) {
                    newFolders = await this.toValidWorkspaceFolders(newFolders);
                }
                /* Otherwise use existing */
                else {
                    newFolders = this.workspace.folders;
                }
            }
            await this.updateWorkspaceConfiguration(newFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
        }
    }
    updateRestrictedSettings() {
        const changed = [];
        const allProperties = this.configurationRegistry.getConfigurationProperties();
        const defaultRestrictedSettings = Object.keys(allProperties).filter(key => allProperties[key].restricted).sort((a, b) => a.localeCompare(b));
        const defaultDelta = delta(defaultRestrictedSettings, this._restrictedSettings.default, (a, b) => a.localeCompare(b));
        changed.push(...defaultDelta.added, ...defaultDelta.removed);
        const application = (this.applicationConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
        const applicationDelta = delta(application, this._restrictedSettings.application || [], (a, b) => a.localeCompare(b));
        changed.push(...applicationDelta.added, ...applicationDelta.removed);
        const userLocal = this.localUserConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b));
        const userLocalDelta = delta(userLocal, this._restrictedSettings.userLocal || [], (a, b) => a.localeCompare(b));
        changed.push(...userLocalDelta.added, ...userLocalDelta.removed);
        const userRemote = (this.remoteUserConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
        const userRemoteDelta = delta(userRemote, this._restrictedSettings.userRemote || [], (a, b) => a.localeCompare(b));
        changed.push(...userRemoteDelta.added, ...userRemoteDelta.removed);
        const workspaceFolderMap = new ResourceMap();
        for (const workspaceFolder of this.workspace.folders) {
            const cachedFolderConfig = this.cachedFolderConfigs.get(workspaceFolder.uri);
            const folderRestrictedSettings = (cachedFolderConfig?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
            if (folderRestrictedSettings.length) {
                workspaceFolderMap.set(workspaceFolder.uri, folderRestrictedSettings);
            }
            const previous = this._restrictedSettings.workspaceFolder?.get(workspaceFolder.uri) || [];
            const workspaceFolderDelta = delta(folderRestrictedSettings, previous, (a, b) => a.localeCompare(b));
            changed.push(...workspaceFolderDelta.added, ...workspaceFolderDelta.removed);
        }
        const workspace = this.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ ? this.workspaceConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b))
            : this.workspace.folders[0] ? (workspaceFolderMap.get(this.workspace.folders[0].uri) || []) : [];
        const workspaceDelta = delta(workspace, this._restrictedSettings.workspace || [], (a, b) => a.localeCompare(b));
        changed.push(...workspaceDelta.added, ...workspaceDelta.removed);
        if (changed.length) {
            this._restrictedSettings = {
                default: defaultRestrictedSettings,
                application: application.length ? application : undefined,
                userLocal: userLocal.length ? userLocal : undefined,
                userRemote: userRemote.length ? userRemote : undefined,
                workspace: workspace.length ? workspace : undefined,
                workspaceFolder: workspaceFolderMap.size ? workspaceFolderMap : undefined,
            };
            this._onDidChangeRestrictedSettings.fire(this.restrictedSettings);
        }
    }
    async updateWorkspaceConfiguration(workspaceFolders, configuration, fromCache) {
        const previous = { data: this._configuration.toData(), workspace: this.workspace };
        const change = this._configuration.compareAndUpdateWorkspaceConfiguration(configuration);
        const changes = this.compareFolders(this.workspace.folders, workspaceFolders);
        if (changes.added.length || changes.removed.length || changes.changed.length) {
            this.workspace.folders = workspaceFolders;
            const change = await this.onFoldersChanged();
            await this.handleWillChangeWorkspaceFolders(changes, fromCache);
            this.triggerConfigurationChange(change, previous, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
            this._onDidChangeWorkspaceFolders.fire(changes);
        }
        else {
            this.triggerConfigurationChange(change, previous, 5 /* ConfigurationTarget.WORKSPACE */);
        }
        this.updateRestrictedSettings();
    }
    async handleWillChangeWorkspaceFolders(changes, fromCache) {
        const joiners = [];
        this._onWillChangeWorkspaceFolders.fire({
            join(updateWorkspaceTrustStatePromise) {
                joiners.push(updateWorkspaceTrustStatePromise);
            },
            changes,
            fromCache
        });
        try {
            await Promises.settled(joiners);
        }
        catch (error) { /* Ignore */ }
    }
    async onWorkspaceFolderConfigurationChanged(folder) {
        const [folderConfiguration] = await this.loadFolderConfigurations([folder]);
        const previous = { data: this._configuration.toData(), workspace: this.workspace };
        const folderConfigurationChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderConfiguration);
        if (this.getWorkbenchState() === 2 /* WorkbenchState.FOLDER */) {
            const workspaceConfigurationChange = this._configuration.compareAndUpdateWorkspaceConfiguration(folderConfiguration);
            this.triggerConfigurationChange(mergeChanges(folderConfigurationChange, workspaceConfigurationChange), previous, 5 /* ConfigurationTarget.WORKSPACE */);
        }
        else {
            this.triggerConfigurationChange(folderConfigurationChange, previous, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        }
        this.updateRestrictedSettings();
    }
    async onFoldersChanged() {
        const changes = [];
        // Remove the configurations of deleted folders
        for (const key of this.cachedFolderConfigs.keys()) {
            if (!this.workspace.folders.filter(folder => folder.uri.toString() === key.toString())[0]) {
                this.cachedFolderConfigs.deleteAndDispose(key);
                changes.push(this._configuration.compareAndDeleteFolderConfiguration(key));
            }
        }
        const toInitialize = this.workspace.folders.filter(folder => !this.cachedFolderConfigs.has(folder.uri));
        if (toInitialize.length) {
            const folderConfigurations = await this.loadFolderConfigurations(toInitialize);
            folderConfigurations.forEach((folderConfiguration, index) => {
                changes.push(this._configuration.compareAndUpdateFolderConfiguration(toInitialize[index].uri, folderConfiguration));
            });
        }
        return mergeChanges(...changes);
    }
    loadFolderConfigurations(folders) {
        return Promise.all([...folders.map(folder => {
                let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
                if (!folderConfiguration) {
                    folderConfiguration = new FolderConfiguration(!this.initialized, folder, FOLDER_CONFIG_FOLDER_NAME, this.getWorkbenchState(), this.isWorkspaceTrusted, this.fileService, this.uriIdentityService, this.logService, this.configurationCache);
                    folderConfiguration.addRelated(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
                    this.cachedFolderConfigs.set(folder.uri, folderConfiguration);
                }
                return folderConfiguration.loadConfiguration();
            })]);
    }
    async validateWorkspaceFoldersAndReload(fromCache) {
        const validWorkspaceFolders = await this.toValidWorkspaceFolders(this.workspace.folders);
        const { removed } = this.compareFolders(this.workspace.folders, validWorkspaceFolders);
        if (removed.length) {
            await this.updateWorkspaceConfiguration(validWorkspaceFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
        }
    }
    // Filter out workspace folders which are files (not directories)
    // Workspace folders those cannot be resolved are not filtered because they are handled by the Explorer.
    async toValidWorkspaceFolders(workspaceFolders) {
        const validWorkspaceFolders = [];
        for (const workspaceFolder of workspaceFolders) {
            try {
                const result = await this.fileService.stat(workspaceFolder.uri);
                if (!result.isDirectory) {
                    continue;
                }
            }
            catch (e) {
                this.logService.warn(`Ignoring the error while validating workspace folder ${workspaceFolder.uri.toString()} - ${toErrorMessage(e)}`);
            }
            validWorkspaceFolders.push(workspaceFolder);
        }
        return validWorkspaceFolders;
    }
    async writeConfigurationValue(key, value, target, overrides, options) {
        if (!this.instantiationService) {
            throw new Error('Cannot write configuration because the configuration service is not yet ready to accept writes.');
        }
        if (target === 7 /* ConfigurationTarget.DEFAULT */) {
            throw new Error('Invalid configuration target');
        }
        if (target === 8 /* ConfigurationTarget.MEMORY */) {
            const previous = { data: this._configuration.toData(), workspace: this.workspace };
            this._configuration.updateValue(key, value, overrides);
            this.triggerConfigurationChange({ keys: overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key], overrides: overrides?.overrideIdentifiers?.length ? overrides.overrideIdentifiers.map(overrideIdentifier => ([overrideIdentifier, [key]])) : [] }, previous, target);
            return;
        }
        const editableConfigurationTarget = this.toEditableConfigurationTarget(target, key);
        if (!editableConfigurationTarget) {
            throw new Error('Invalid configuration target');
        }
        if (editableConfigurationTarget === 2 /* EditableConfigurationTarget.USER_REMOTE */ && !this.remoteUserConfiguration) {
            throw new Error('Invalid configuration target');
        }
        if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
            const configurationModel = this.getConfigurationModelForEditableConfigurationTarget(editableConfigurationTarget, overrides.resource);
            if (configurationModel) {
                const overrideIdentifiers = overrides.overrideIdentifiers.sort();
                const existingOverrides = configurationModel.overrides.find(override => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
                if (existingOverrides) {
                    overrides.overrideIdentifiers = existingOverrides.identifiers;
                }
            }
        }
        // Use same instance of ConfigurationEditing to make sure all writes go through the same queue
        this.configurationEditing = this.configurationEditing ?? this.createConfigurationEditingService(this.instantiationService);
        await (await this.configurationEditing).writeConfiguration(editableConfigurationTarget, { key, value }, { scopes: overrides, ...options });
        switch (editableConfigurationTarget) {
            case 1 /* EditableConfigurationTarget.USER_LOCAL */:
                if (this.applicationConfiguration && this.isSettingAppliedForAllProfiles(key)) {
                    await this.reloadApplicationConfiguration();
                }
                else {
                    await this.reloadLocalUserConfiguration();
                }
                return;
            case 2 /* EditableConfigurationTarget.USER_REMOTE */:
                return this.reloadRemoteUserConfiguration().then(() => undefined);
            case 3 /* EditableConfigurationTarget.WORKSPACE */:
                return this.reloadWorkspaceConfiguration();
            case 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */: {
                const workspaceFolder = overrides && overrides.resource ? this.workspace.getFolder(overrides.resource) : null;
                if (workspaceFolder) {
                    return this.reloadWorkspaceFolderConfiguration(workspaceFolder);
                }
            }
        }
    }
    async createConfigurationEditingService(instantiationService) {
        const remoteSettingsResource = (await this.remoteAgentService.getEnvironment())?.settingsPath ?? null;
        return instantiationService.createInstance(ConfigurationEditing, remoteSettingsResource);
    }
    getConfigurationModelForEditableConfigurationTarget(target, resource) {
        switch (target) {
            case 1 /* EditableConfigurationTarget.USER_LOCAL */: return this._configuration.localUserConfiguration;
            case 2 /* EditableConfigurationTarget.USER_REMOTE */: return this._configuration.remoteUserConfiguration;
            case 3 /* EditableConfigurationTarget.WORKSPACE */: return this._configuration.workspaceConfiguration;
            case 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */: return resource ? this._configuration.folderConfigurations.get(resource) : undefined;
        }
    }
    getConfigurationModel(target, resource) {
        switch (target) {
            case 3 /* ConfigurationTarget.USER_LOCAL */: return this._configuration.localUserConfiguration;
            case 4 /* ConfigurationTarget.USER_REMOTE */: return this._configuration.remoteUserConfiguration;
            case 5 /* ConfigurationTarget.WORKSPACE */: return this._configuration.workspaceConfiguration;
            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */: return resource ? this._configuration.folderConfigurations.get(resource) : undefined;
            default: return undefined;
        }
    }
    deriveConfigurationTargets(key, value, inspect) {
        if (equals(value, inspect.value)) {
            return [];
        }
        const definedTargets = [];
        if (inspect.workspaceFolderValue !== undefined) {
            definedTargets.push(6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        }
        if (inspect.workspaceValue !== undefined) {
            definedTargets.push(5 /* ConfigurationTarget.WORKSPACE */);
        }
        if (inspect.userRemoteValue !== undefined) {
            definedTargets.push(4 /* ConfigurationTarget.USER_REMOTE */);
        }
        if (inspect.userLocalValue !== undefined) {
            definedTargets.push(3 /* ConfigurationTarget.USER_LOCAL */);
        }
        if (inspect.applicationValue !== undefined) {
            definedTargets.push(1 /* ConfigurationTarget.APPLICATION */);
        }
        if (value === undefined) {
            // Remove the setting in all defined targets
            return definedTargets;
        }
        return [definedTargets[0] || 2 /* ConfigurationTarget.USER */];
    }
    triggerConfigurationChange(change, previous, target) {
        if (change.keys.length) {
            if (target !== 7 /* ConfigurationTarget.DEFAULT */) {
                this.logService.debug(`Configuration keys changed in ${ConfigurationTargetToString(target)} target`, ...change.keys);
            }
            const configurationChangeEvent = new ConfigurationChangeEvent(change, previous, this._configuration, this.workspace, this.logService);
            configurationChangeEvent.source = target;
            this._onDidChangeConfiguration.fire(configurationChangeEvent);
        }
    }
    toEditableConfigurationTarget(target, key) {
        if (target === 1 /* ConfigurationTarget.APPLICATION */) {
            return 1 /* EditableConfigurationTarget.USER_LOCAL */;
        }
        if (target === 2 /* ConfigurationTarget.USER */) {
            if (this.remoteUserConfiguration) {
                const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
                if (scope === 2 /* ConfigurationScope.MACHINE */ || scope === 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */ || scope === 3 /* ConfigurationScope.APPLICATION_MACHINE */) {
                    return 2 /* EditableConfigurationTarget.USER_REMOTE */;
                }
                if (this.inspect(key).userRemoteValue !== undefined) {
                    return 2 /* EditableConfigurationTarget.USER_REMOTE */;
                }
            }
            return 1 /* EditableConfigurationTarget.USER_LOCAL */;
        }
        if (target === 3 /* ConfigurationTarget.USER_LOCAL */) {
            return 1 /* EditableConfigurationTarget.USER_LOCAL */;
        }
        if (target === 4 /* ConfigurationTarget.USER_REMOTE */) {
            return 2 /* EditableConfigurationTarget.USER_REMOTE */;
        }
        if (target === 5 /* ConfigurationTarget.WORKSPACE */) {
            return 3 /* EditableConfigurationTarget.WORKSPACE */;
        }
        if (target === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */) {
            return 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */;
        }
        return null;
    }
}
let RegisterConfigurationSchemasContribution = class RegisterConfigurationSchemasContribution extends Disposable {
    constructor(workspaceContextService, environmentService, workspaceTrustManagementService, extensionService, lifecycleService) {
        super();
        this.workspaceContextService = workspaceContextService;
        this.environmentService = environmentService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        extensionService.whenInstalledExtensionsRegistered().then(() => {
            this.registerConfigurationSchemas();
            const configurationRegistry = Registry.as(Extensions.Configuration);
            const delayer = this._register(new Delayer(50));
            this._register(Event.any(configurationRegistry.onDidUpdateConfiguration, configurationRegistry.onDidSchemaChange, workspaceTrustManagementService.onDidChangeTrust)(() => delayer.trigger(() => this.registerConfigurationSchemas(), lifecycleService.phase === 4 /* LifecyclePhase.Eventually */ ? undefined : 2500 /* delay longer in early phases */)));
        });
    }
    registerConfigurationSchemas() {
        // Ensure deprecationMessage is plain text for properties where it was derived from
        // markdownDeprecationMessage, since the JSON editor diagnostics don't support markdown.
        for (const key of Object.keys(allSettings.properties)) {
            const prop = allSettings.properties[key];
            if (prop.markdownDeprecationMessage && prop.deprecationMessage === prop.markdownDeprecationMessage) {
                prop.deprecationMessage = renderAsPlaintext({ value: fixSettingLinks(prop.markdownDeprecationMessage) });
            }
        }
        const allSettingsSchema = {
            properties: allSettings.properties,
            patternProperties: allSettings.patternProperties,
            additionalProperties: true,
            allowTrailingCommas: true,
            allowComments: true
        };
        const userSettingsSchema = this.environmentService.remoteAuthority ?
            {
                properties: Object.assign({}, applicationSettings.properties, windowSettings.properties, resourceSettings.properties),
                patternProperties: allSettings.patternProperties,
                additionalProperties: true,
                allowTrailingCommas: true,
                allowComments: true
            }
            : allSettingsSchema;
        const profileSettingsSchema = {
            properties: Object.assign({}, machineSettings.properties, machineOverridableSettings.properties, windowSettings.properties, resourceSettings.properties),
            patternProperties: allSettings.patternProperties,
            additionalProperties: true,
            allowTrailingCommas: true,
            allowComments: true
        };
        const machineSettingsSchema = {
            properties: Object.assign({}, applicationMachineSettings.properties, machineSettings.properties, machineOverridableSettings.properties, windowSettings.properties, resourceSettings.properties),
            patternProperties: allSettings.patternProperties,
            additionalProperties: true,
            allowTrailingCommas: true,
            allowComments: true
        };
        const workspaceSettingsSchema = {
            properties: Object.assign({}, this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties), this.checkAndFilterPropertiesRequiringTrust(windowSettings.properties), this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)),
            patternProperties: allSettings.patternProperties,
            additionalProperties: true,
            allowTrailingCommas: true,
            allowComments: true
        };
        const defaultSettingsSchema = {
            properties: Object.keys(allSettings.properties).reduce((result, key) => {
                result[key] = Object.assign({ deprecationMessage: undefined }, allSettings.properties[key]);
                return result;
            }, {}),
            patternProperties: Object.keys(allSettings.patternProperties).reduce((result, key) => {
                result[key] = Object.assign({ deprecationMessage: undefined }, allSettings.patternProperties[key]);
                return result;
            }, {}),
            additionalProperties: true,
            allowTrailingCommas: true,
            allowComments: true
        };
        const folderSettingsSchema = 3 /* WorkbenchState.WORKSPACE */ === this.workspaceContextService.getWorkbenchState() ?
            {
                properties: Object.assign({}, this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties), this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)),
                patternProperties: allSettings.patternProperties,
                additionalProperties: true,
                allowTrailingCommas: true,
                allowComments: true
            } : workspaceSettingsSchema;
        const configDefaultsSchema = {
            type: 'object',
            description: localize('configurationDefaults.description', 'Contribute defaults for configurations'),
            properties: Object.assign({}, this.filterDefaultOverridableProperties(machineOverridableSettings.properties), this.filterDefaultOverridableProperties(windowSettings.properties), this.filterDefaultOverridableProperties(resourceSettings.properties)),
            patternProperties: {
                [OVERRIDE_PROPERTY_PATTERN]: {
                    type: 'object',
                    default: {},
                    $ref: resourceLanguageSettingsSchemaId,
                }
            },
            additionalProperties: false
        };
        this.registerSchemas({
            defaultSettingsSchema,
            userSettingsSchema,
            profileSettingsSchema,
            machineSettingsSchema,
            workspaceSettingsSchema,
            folderSettingsSchema,
            configDefaultsSchema,
        });
    }
    registerSchemas(schemas) {
        const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
        jsonRegistry.registerSchema(defaultSettingsSchemaId, schemas.defaultSettingsSchema);
        jsonRegistry.registerSchema(userSettingsSchemaId, schemas.userSettingsSchema);
        jsonRegistry.registerSchema(profileSettingsSchemaId, schemas.profileSettingsSchema);
        jsonRegistry.registerSchema(machineSettingsSchemaId, schemas.machineSettingsSchema);
        jsonRegistry.registerSchema(workspaceSettingsSchemaId, schemas.workspaceSettingsSchema);
        jsonRegistry.registerSchema(folderSettingsSchemaId, schemas.folderSettingsSchema);
        jsonRegistry.registerSchema(configurationDefaultsSchemaId, schemas.configDefaultsSchema);
    }
    checkAndFilterPropertiesRequiringTrust(properties) {
        if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
            return properties;
        }
        const result = {};
        Object.entries(properties).forEach(([key, value]) => {
            if (!value.restricted) {
                result[key] = value;
            }
        });
        return result;
    }
    filterDefaultOverridableProperties(properties) {
        const result = {};
        Object.entries(properties).forEach(([key, value]) => {
            if (!value.disallowConfigurationDefault) {
                result[key] = value;
            }
        });
        return result;
    }
};
RegisterConfigurationSchemasContribution = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IWorkspaceTrustManagementService),
    __param(3, IExtensionService),
    __param(4, ILifecycleService)
], RegisterConfigurationSchemasContribution);
let ConfigurationDefaultOverridesContribution = class ConfigurationDefaultOverridesContribution extends Disposable {
    static { this.ID = 'workbench.contrib.configurationDefaultOverridesContribution'; }
    constructor(workbenchAssignmentService, extensionService, configurationService, logService) {
        super();
        this.workbenchAssignmentService = workbenchAssignmentService;
        this.extensionService = extensionService;
        this.configurationService = configurationService;
        this.logService = logService;
        this.processedExperimentalSettings = new Set();
        this.autoExperimentalSettings = new Set();
        this.configurationRegistry = Registry.as(Extensions.Configuration);
        this.throttler = this._register(new Throttler());
        this.throttler.queue(() => this.updateDefaults());
        this._register(workbenchAssignmentService.onDidRefetchAssignments(() => this.throttler.queue(() => this.processExperimentalSettings(this.autoExperimentalSettings, true))));
        // When configuration is updated make sure to apply experimental configuration overrides
        this._register(this.configurationRegistry.onDidUpdateConfiguration(({ properties }) => this.processExperimentalSettings(properties, false)));
    }
    async updateDefaults() {
        this.logService.trace('ConfigurationService#updateDefaults: begin');
        try {
            // Check for experiments
            await this.processExperimentalSettings(Object.keys(this.configurationRegistry.getConfigurationProperties()), false);
        }
        finally {
            // Invalidate defaults cache after extensions have registered
            // and after the experiments have been resolved to prevent
            // resetting the overrides too early.
            await this.extensionService.whenInstalledExtensionsRegistered();
            this.logService.trace('ConfigurationService#updateDefaults: resetting the defaults');
            this.configurationService.reloadConfiguration(7 /* ConfigurationTarget.DEFAULT */);
        }
    }
    async processExperimentalSettings(properties, autoRefetch) {
        const overrides = {};
        const allProperties = this.configurationRegistry.getConfigurationProperties();
        const defaultConfigurationsPreventingExperimentOverrides = this.configurationRegistry.getRegisteredDefaultConfigurations().filter(configuration => configuration.preventExperimentOverride);
        for (const property of properties) {
            const schema = allProperties[property];
            if (!schema?.experiment) {
                continue;
            }
            const defaultValueSource = schema.defaultValueSource && !(schema.defaultValueSource instanceof Map) ? schema.defaultValueSource : undefined;
            if (defaultValueSource && defaultConfigurationsPreventingExperimentOverrides.some(configuration => isConfigurationDefaultSourceEquals(configuration.source, defaultValueSource) && configuration.overrides?.[property] !== undefined)) {
                continue;
            }
            if (!autoRefetch && this.processedExperimentalSettings.has(property)) {
                continue;
            }
            this.processedExperimentalSettings.add(property);
            if (schema.experiment.mode === 'auto') {
                this.autoExperimentalSettings.add(property);
            }
            try {
                const value = await this.workbenchAssignmentService.getTreatment(schema.experiment.name ?? `config.${property}`);
                if (!isUndefined(value) && !equals(value, schema.default)) {
                    overrides[property] = value;
                }
            }
            catch (error) { /*ignore */ }
        }
        if (Object.keys(overrides).length) {
            this.configurationRegistry.registerDefaultConfigurations([{ overrides }]);
        }
    }
};
ConfigurationDefaultOverridesContribution = __decorate([
    __param(0, IWorkbenchAssignmentService),
    __param(1, IExtensionService),
    __param(2, IConfigurationService),
    __param(3, ILogService)
], ConfigurationDefaultOverridesContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RegisterConfigurationSchemasContribution, 3 /* LifecyclePhase.Restored */);
registerWorkbenchContribution2(ConfigurationDefaultOverridesContribution.ID, ConfigurationDefaultOverridesContribution, 2 /* WorkbenchPhase.BlockRestore */);
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
    ...workbenchConfigurationNodeBase,
    properties: {
        [APPLY_ALL_PROFILES_SETTING]: {
            'type': 'array',
            description: localize('setting description', "Configure settings to be applied for all profiles."),
            'default': [],
            'scope': 1 /* ConfigurationScope.APPLICATION */,
            additionalProperties: true,
            uniqueItems: true,
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvbi9icm93c2VyL2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoRyxPQUFPLEVBQTZCLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM5SSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsU0FBUyxJQUFJLGFBQWEsRUFBbUYsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQWlHLGlDQUFpQyxFQUFFLHFCQUFxQixFQUFpRCxNQUFNLG9EQUFvRCxDQUFDO0FBQ3piLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSx3QkFBd0IsRUFBRSxZQUFZLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUM5SSxPQUFPLEVBQTJFLHdCQUF3QixFQUFpRSwyQkFBMkIsRUFBaUMsOEJBQThCLEVBQUUscUJBQXFCLEVBQStCLE1BQU0sNERBQTRELENBQUM7QUFDOVgsT0FBTyxFQUF3Qix1QkFB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