/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Queue } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { parse } from '../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../base/common/jsonEdit.js';
import { equals } from '../../../../base/common/objects.js';
import { distinct, equals as arrayEquals } from '../../../../base/common/arrays.js';
import { OS } from '../../../../base/common/platform.js';
import { isConfigurationOverrides, isConfigurationUpdateOverrides } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationChangeEvent, ConfigurationModel } from '../../../../platform/configuration/common/configurationModels.js';
import { DefaultConfiguration, NullPolicyConfiguration, PolicyConfiguration } from '../../../../platform/configuration/common/configurations.js';
import { Extensions, keyFromOverrideIdentifiers } from '../../../../platform/configuration/common/configurationRegistry.js';
import { NullPolicyService } from '../../../../platform/policy/common/policy.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { FolderConfiguration, UserConfiguration } from '../../../../workbench/services/configuration/browser/configuration.js';
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, FOLDER_CONFIG_FOLDER_NAME, FOLDER_SETTINGS_PATH } from '../../../../workbench/services/configuration/common/configuration.js';
import { Configuration } from '../../../../workbench/services/configuration/common/configurationModels.js';
// Import to register configuration contributions
import '../../../../workbench/services/configuration/browser/configurationService.js';
export class ConfigurationService extends Disposable {
    constructor(userDataProfileService, workspaceService, uriIdentityService, fileService, policyService, logService) {
        super();
        this.workspaceService = workspaceService;
        this.uriIdentityService = uriIdentityService;
        this.fileService = fileService;
        this.logService = logService;
        this.cachedFolderConfigs = this._register(new DisposableMap(new ResourceMap()));
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this.onDidChangeRestrictedSettings = Event.None;
        this.restrictedSettings = { default: [] };
        this.configurationRegistry = Registry.as(Extensions.Configuration);
        this.settingsResource = userDataProfileService.currentProfile.settingsResource;
        this.defaultConfiguration = this._register(new DefaultConfiguration(logService));
        this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
        this.userConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, {}, fileService, uriIdentityService, logService));
        this.configurationEditing = new ConfigurationEditing(fileService, this);
        this._configuration = new Configuration(ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), this.workspaceService.getWorkspace(), this.logService);
        this._register(this.defaultConfiguration.onDidChangeConfiguration(({ defaults, properties }) => this.onDefaultConfigurationChanged(defaults, properties)));
        this._register(this.policyConfiguration.onDidChangeConfiguration(configurationModel => this.onPolicyConfigurationChanged(configurationModel)));
        this._register(this.userConfiguration.onDidChangeConfiguration(userConfiguration => this.onUserConfigurationChanged(userConfiguration)));
        this._register(this.workspaceService.onWillChangeWorkspaceFolders(e => e.join(this.loadFolderConfigurations(e.changes.added))));
        this._register(this.workspaceService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
    }
    async initialize() {
        const [defaultModel, policyModel, userModel] = await Promise.all([
            this.defaultConfiguration.initialize(),
            this.policyConfiguration.initialize(),
            this.userConfiguration.initialize()
        ]);
        const workspace = this.workspaceService.getWorkspace();
        this._configuration = new Configuration(defaultModel, policyModel, ConfigurationModel.createEmptyModel(this.logService), userModel, ConfigurationModel.createEmptyModel(this.logService), ConfigurationModel.createEmptyModel(this.logService), new ResourceMap(), ConfigurationModel.createEmptyModel(this.logService), new ResourceMap(), workspace, this.logService);
        await this.loadFolderConfigurations(workspace.folders);
    }
    // #region IWorkbenchConfigurationService
    getConfigurationData() {
        return this._configuration.toData();
    }
    getValue(arg1, arg2) {
        const section = typeof arg1 === 'string' ? arg1 : undefined;
        const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
        return this._configuration.getValue(section, overrides);
    }
    async updateValue(key, value, arg3, arg4, _options) {
        const overrides = isConfigurationUpdateOverrides(arg3) ? arg3
            : isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : undefined } : undefined;
        const target = (overrides ? arg4 : arg3);
        if (overrides?.overrideIdentifiers) {
            overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
            overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : undefined;
        }
        const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : undefined });
        if (inspect.policyValue !== undefined) {
            throw new Error(`Unable to write ${key} because it is configured in system policy.`);
        }
        // Remove the setting, if the value is same as default value
        if (equals(value, inspect.defaultValue)) {
            value = undefined;
        }
        if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
            const overrideIdentifiers = overrides.overrideIdentifiers.sort();
            const existingOverrides = this._configuration.localUserConfiguration.overrides.find(override => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
            if (existingOverrides) {
                overrides.overrideIdentifiers = existingOverrides.identifiers;
            }
        }
        const path = overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
        const settingsResource = this.getSettingsResource(target, overrides?.resource ?? undefined);
        await this.configurationEditing.write(settingsResource, path, value);
        await this.reloadConfiguration();
    }
    getSettingsResource(target, resource) {
        if (target === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */ || target === 5 /* ConfigurationTarget.WORKSPACE */) {
            if (resource) {
                const folder = this.workspaceService.getWorkspaceFolder(resource);
                if (folder) {
                    return this.uriIdentityService.extUri.joinPath(folder.uri, FOLDER_SETTINGS_PATH);
                }
            }
        }
        return this.settingsResource;
    }
    inspect(key, overrides) {
        return this._configuration.inspect(key, overrides);
    }
    keys() {
        return this._configuration.keys();
    }
    async reloadConfiguration(_target) {
        const userModel = await this.userConfiguration.initialize();
        const previousData = this._configuration.toData();
        const change = this._configuration.compareAndUpdateLocalUserConfiguration(userModel);
        // Reload folder configurations
        for (const folder of this.workspaceService.getWorkspace().folders) {
            const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
            if (folderConfiguration) {
                const folderModel = await folderConfiguration.loadConfiguration();
                const folderChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderModel);
                change.keys.push(...folderChange.keys);
                change.overrides.push(...folderChange.overrides);
            }
        }
        this.triggerConfigurationChange(change, previousData, 2 /* ConfigurationTarget.USER */);
    }
    hasCachedConfigurationDefaultsOverrides() {
        return false;
    }
    async whenRemoteConfigurationLoaded() { }
    isSettingAppliedForAllProfiles(key) {
        const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
        if (scope && APPLICATION_SCOPES.includes(scope)) {
            return true;
        }
        const allProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
        return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
    }
    // #endregion
    // #region Configuration change handlers
    onDefaultConfigurationChanged(defaults, properties) {
        const previousData = this._configuration.toData();
        const change = this._configuration.compareAndUpdateDefaultConfiguration(defaults, properties);
        this._configuration.updateLocalUserConfiguration(this.userConfiguration.reparse());
        for (const folder of this.workspaceService.getWorkspace().folders) {
            const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
            if (folderConfiguration) {
                this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
            }
        }
        this.triggerConfigurationChange(change, previousData, 7 /* ConfigurationTarget.DEFAULT */);
    }
    onPolicyConfigurationChanged(policyConfiguration) {
        const previousData = this._configuration.toData();
        const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
        this.triggerConfigurationChange(change, previousData, 7 /* ConfigurationTarget.DEFAULT */);
    }
    onUserConfigurationChanged(userConfiguration) {
        const previousData = this._configuration.toData();
        const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
        this.triggerConfigurationChange(change, previousData, 2 /* ConfigurationTarget.USER */);
    }
    onWorkspaceFoldersChanged(e) {
        // Remove configurations for removed folders
        const previousData = this._configuration.toData();
        const keys = [];
        const overrides = [];
        for (const folder of e.removed) {
            const change = this._configuration.compareAndDeleteFolderConfiguration(folder.uri);
            keys.push(...change.keys);
            overrides.push(...change.overrides);
            this.cachedFolderConfigs.deleteAndDispose(folder.uri);
        }
        if (keys.length || overrides.length) {
            this.triggerConfigurationChange({ keys, overrides }, previousData, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        }
    }
    onWorkspaceFolderConfigurationChanged(folder) {
        const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
        if (folderConfiguration) {
            folderConfiguration.loadConfiguration().then(configurationModel => {
                const previousData = this._configuration.toData();
                const change = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, configurationModel);
                this.triggerConfigurationChange(change, previousData, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
            }, onUnexpectedError);
        }
    }
    async loadFolderConfigurations(folders) {
        for (const folder of folders) {
            let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
            if (!folderConfiguration) {
                folderConfiguration = new FolderConfiguration(false, folder, FOLDER_CONFIG_FOLDER_NAME, 3 /* WorkbenchState.WORKSPACE */, true, this.fileService, this.uriIdentityService, this.logService, { needsCaching: () => false, read: async () => '', write: async () => { }, remove: async () => { } });
                folderConfiguration.addRelated(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
                this.cachedFolderConfigs.set(folder.uri, folderConfiguration);
            }
            const configurationModel = await folderConfiguration.loadConfiguration();
            this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
        }
    }
    triggerConfigurationChange(change, previousData, target) {
        if (change.keys.length) {
            const workspace = this.workspaceService.getWorkspace();
            const event = new ConfigurationChangeEvent(change, { data: previousData, workspace }, this._configuration, workspace, this.logService);
            event.source = target;
            this._onDidChangeConfiguration.fire(event);
        }
    }
}
class ConfigurationEditing {
    constructor(fileService, configurationService) {
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.queue = new Queue();
    }
    write(settingsResource, path, value) {
        return this.queue.queue(() => this.doWriteConfiguration(settingsResource, path, value));
    }
    async doWriteConfiguration(settingsResource, path, value) {
        let content;
        try {
            const fileContent = await this.fileService.readFile(settingsResource);
            content = fileContent.value.toString();
        }
        catch (error) {
            if (error.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                content = '{}';
            }
            else {
                throw error;
            }
        }
        const parseErrors = [];
        parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
        if (parseErrors.length > 0) {
            throw new Error('Unable to write into the settings file. Please open the file to correct errors/warnings in the file and try again.');
        }
        const edits = this.getEdits(content, path, value);
        content = applyEdits(content, edits);
        await this.fileService.writeFile(settingsResource, VSBuffer.fromString(content));
    }
    getEdits(content, path, value) {
        const { tabSize, insertSpaces, eol } = this.formattingOptions;
        if (!path.length) {
            const newContent = JSON.stringify(value, null, insertSpaces ? ' '.repeat(tabSize) : '\t');
            return [{
                    content: newContent,
                    length: content.length,
                    offset: 0
                }];
        }
        return setProperty(content, path, value, { tabSize, insertSpaces, eol });
    }
    get formattingOptions() {
        if (!this._formattingOptions) {
            let eol = OS === 3 /* OperatingSystem.Linux */ || OS === 2 /* OperatingSystem.Macintosh */ ? '\n' : '\r\n';
            const configuredEol = this.configurationService.getValue('files.eol', { overrideIdentifier: 'jsonc' });
            if (configuredEol && typeof configuredEol === 'string' && configuredEol !== 'auto') {
                eol = configuredEol;
            }
            this._formattingOptions = {
                eol,
                insertSpaces: !!this.configurationService.getValue('editor.insertSpaces', { overrideIdentifier: 'jsonc' }),
                tabSize: this.configurationService.getValue('editor.tabSize', { overrideIdentifier: 'jsonc' })
            };
        }
        return this._formattingOptions;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2Jyb3dzZXIvY29uZmlndXJhdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBd0IsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLElBQUksV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEYsT0FBTyxFQUFFLEVBQUUsRUFBbUIsTUFBTSxxQ0FBcUMsQ0FBQztBQUMxRSxPQUFPLEVBQXNNLHdCQUF3QixFQUFFLDhCQUE4QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDMVUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDaEksT0FBTyxFQUFFLG9CQUFvQixFQUF3Qix1QkFBdUIsRUFB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