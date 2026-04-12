/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from '../../../../base/common/objects.js';
import { toValuesTree } from '../../../../platform/configuration/common/configuration.js';
import { Configuration as BaseConfiguration, ConfigurationModelParser, ConfigurationModel } from '../../../../platform/configuration/common/configurationModels.js';
import { isBoolean } from '../../../../base/common/types.js';
import { distinct } from '../../../../base/common/arrays.js';
export class WorkspaceConfigurationModelParser extends ConfigurationModelParser {
    constructor(name, logService) {
        super(name, logService);
        this._folders = [];
        this._transient = false;
        this._settingsModelParser = new ConfigurationModelParser(name, logService);
        this._launchModel = ConfigurationModel.createEmptyModel(logService);
        this._tasksModel = ConfigurationModel.createEmptyModel(logService);
    }
    get folders() {
        return this._folders;
    }
    get transient() {
        return this._transient;
    }
    get settingsModel() {
        return this._settingsModelParser.configurationModel;
    }
    get launchModel() {
        return this._launchModel;
    }
    get tasksModel() {
        return this._tasksModel;
    }
    reparseWorkspaceSettings(configurationParseOptions) {
        this._settingsModelParser.reparse(configurationParseOptions);
    }
    getRestrictedWorkspaceSettings() {
        return this._settingsModelParser.restrictedConfigurations;
    }
    doParseRaw(raw, configurationParseOptions) {
        this._folders = (raw['folders'] || []);
        this._transient = isBoolean(raw['transient']) && raw['transient'];
        this._settingsModelParser.parseRaw(raw['settings'], configurationParseOptions);
        this._launchModel = this.createConfigurationModelFrom(raw, 'launch');
        this._tasksModel = this.createConfigurationModelFrom(raw, 'tasks');
        return super.doParseRaw(raw, configurationParseOptions);
    }
    createConfigurationModelFrom(raw, key) {
        const data = raw[key];
        if (data) {
            const contents = toValuesTree(data, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
            const scopedContents = Object.create(null);
            scopedContents[key] = contents;
            const keys = Object.keys(data).map(k => `${key}.${k}`);
            return new ConfigurationModel(scopedContents, keys, [], undefined, this.logService);
        }
        return ConfigurationModel.createEmptyModel(this.logService);
    }
}
export class StandaloneConfigurationModelParser extends ConfigurationModelParser {
    constructor(name, scope, logService) {
        super(name, logService);
        this.scope = scope;
    }
    doParseRaw(raw, configurationParseOptions) {
        const contents = toValuesTree(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
        const scopedContents = Object.create(null);
        scopedContents[this.scope] = contents;
        const keys = Object.keys(raw).map(key => `${this.scope}.${key}`);
        return { contents: scopedContents, keys, overrides: [] };
    }
}
export class Configuration extends BaseConfiguration {
    constructor(defaults, policy, application, localUser, remoteUser, workspaceConfiguration, folders, memoryConfiguration, memoryConfigurationByResource, _workspace, logService) {
        super(defaults, policy, application, localUser, remoteUser, workspaceConfiguration, folders, memoryConfiguration, memoryConfigurationByResource, logService);
        this._workspace = _workspace;
    }
    getValue(key, overrides = {}) {
        return super.getValue(key, overrides, this._workspace);
    }
    inspect(key, overrides = {}) {
        return super.inspect(key, overrides, this._workspace);
    }
    keys() {
        return super.keys(this._workspace);
    }
    compareAndDeleteFolderConfiguration(folder) {
        if (this._workspace && this._workspace.folders.length > 0 && this._workspace.folders[0].uri.toString() === folder.toString()) {
            // Do not remove workspace configuration
            return { keys: [], overrides: [] };
        }
        return super.compareAndDeleteFolderConfiguration(folder);
    }
    compare(other) {
        const compare = (fromKeys, toKeys, overrideIdentifier) => {
            const keys = [];
            keys.push(...toKeys.filter(key => fromKeys.indexOf(key) === -1));
            keys.push(...fromKeys.filter(key => toKeys.indexOf(key) === -1));
            keys.push(...fromKeys.filter(key => {
                // Ignore if the key does not exist in both models
                if (toKeys.indexOf(key) === -1) {
                    return false;
                }
                // Compare workspace value
                if (!equals(this.getValue(key, { overrideIdentifier }), other.getValue(key, { overrideIdentifier }))) {
                    return true;
                }
                // Compare workspace folder value
                return this._workspace && this._workspace.folders.some(folder => !equals(this.getValue(key, { resource: folder.uri, overrideIdentifier }), other.getValue(key, { resource: folder.uri, overrideIdentifier })));
            }));
            return keys;
        };
        const keys = compare(this.allKeys(), other.allKeys());
        const overrides = [];
        const allOverrideIdentifiers = distinct([...this.allOverrideIdentifiers(), ...other.allOverrideIdentifiers()]);
        for (const overrideIdentifier of allOverrideIdentifiers) {
            const keys = compare(this.getAllKeysForOverrideIdentifier(overrideIdentifier), other.getAllKeysForOverrideIdentifier(overrideIdentifier), overrideIdentifier);
            if (keys.length) {
                overrides.push([overrideIdentifier, keys]);
            }
        }
        return { keys, overrides };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbk1vZGVscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsWUFBWSxFQUEyRixNQUFNLDREQUE0RCxDQUFDO0FBQ25MLE9BQU8sRUFBRSxhQUFhLElBQUksaUJBQWlCLEVBQUUsd0JBQXdCLEVBQUUsa0JBQWtCLEVBQTZCLE1BQU0sa0VBQWtFLENBQUM7QUFLL0wsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUk3RCxNQUFNLE9BQU8saUNBQWtDLFNBQVEsd0JBQXdCO0lBUTlFLFlBQVksSUFBWSxFQUFFLFVBQXVCO1FBQ2hELEtBQUssQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFQakIsYUFBUSxHQUE2QixFQUFFLENBQUM7UUFDeEMsZUFBVSxHQUFZLEtBQUssQ0FBQztRQU9uQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLFlBQVksR0FBRyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsV0FBVyxHQUFHLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRCxJQUFJLE9BQU87UUFDVixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDdEIsQ0FBQztJQUVELElB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