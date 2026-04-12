/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { distinct, equals as arrayEquals } from '../../../base/common/arrays.js';
import { Queue, RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { parse } from '../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../base/common/jsonEdit.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { equals } from '../../../base/common/objects.js';
import { OS } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { isConfigurationOverrides, isConfigurationUpdateOverrides } from './configuration.js';
import { Configuration, ConfigurationChangeEvent, ConfigurationModel, UserSettings } from './configurationModels.js';
import { keyFromOverrideIdentifiers } from './configurationRegistry.js';
import { DefaultConfiguration, NullPolicyConfiguration, PolicyConfiguration } from './configurations.js';
import { NullPolicyService } from '../../policy/common/policy.js';
export class ConfigurationService extends Disposable {
    constructor(settingsResource, fileService, policyService, logService) {
        super();
        this.settingsResource = settingsResource;
        this.logService = logService;
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this.defaultConfiguration = this._register(new DefaultConfiguration(logService));
        this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
        this.userConfiguration = this._register(new UserSettings(this.settingsResource, {}, extUriBiasedIgnorePathCase, fileService, logService));
        this.configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), logService);
        this.configurationEditing = new ConfigurationEditing(settingsResource, fileService, this);
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reloadConfiguration(), 50));
        this._register(this.defaultConfiguration.onDidChangeConfiguration(({ defaults, properties }) => this.onDidDefaultConfigurationChange(defaults, properties)));
        this._register(this.policyConfiguration.onDidChangeConfiguration(model => this.onDidPolicyConfigurationChange(model)));
        this._register(this.userConfiguration.onDidChange(() => this.reloadConfigurationScheduler.schedule()));
    }
    async initialize() {
        const [defaultModel, policyModel, userModel] = await Promise.all([this.defaultConfiguration.initialize(), this.policyConfiguration.initialize(), this.userConfiguration.loadConfiguration()]);
        this.configuration = new Configuration(defaultModel, policyModel, ConfigurationModel.createEmptyModel(this.logService), userModel, ConfigurationModel.createEmptyModel(this.logService), ConfigurationModel.createEmptyModel(this.logService), new ResourceMap(), ConfigurationModel.createEmptyModel(this.logService), new ResourceMap(), this.logService);
    }
    getConfigurationData() {
        return this.configuration.toData();
    }
    getValue(arg1, arg2) {
        const section = typeof arg1 === 'string' ? arg1 : undefined;
        const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
        return this.configuration.getValue(section, overrides, undefined);
    }
    async updateValue(key, value, arg3, arg4, options) {
        const overrides = isConfigurationUpdateOverrides(arg3) ? arg3
            : isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : undefined } : undefined;
        const target = (overrides ? arg4 : arg3);
        if (target !== undefined) {
            if (target !== 3 /* ConfigurationTarget.USER_LOCAL */ && target !== 2 /* ConfigurationTarget.USER */) {
                throw new Error(`Unable to write ${key} to target ${target}.`);
            }
        }
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
            const existingOverrides = this.configuration.localUserConfiguration.overrides.find(override => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
            if (existingOverrides) {
                overrides.overrideIdentifiers = existingOverrides.identifiers;
            }
        }
        const path = overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
        await this.configurationEditing.write(path, value);
        await this.reloadConfiguration();
    }
    inspect(key, overrides = {}) {
        return this.configuration.inspect(key, overrides, undefined);
    }
    keys() {
        return this.configuration.keys(undefined);
    }
    async reloadConfiguration() {
        const configurationModel = await this.userConfiguration.loadConfiguration();
        this.onDidChangeUserConfiguration(configurationModel);
    }
    onDidChangeUserConfiguration(userConfigurationModel) {
        const previous = this.configuration.toData();
        const change = this.configuration.compareAndUpdateLocalUserConfiguration(userConfigurationModel);
        this.trigger(change, previous, 2 /* ConfigurationTarget.USER */);
    }
    onDidDefaultConfigurationChange(defaultConfigurationModel, properties) {
        const previous = this.configuration.toData();
        const change = this.configuration.compareAndUpdateDefaultConfiguration(defaultConfigurationModel, properties);
        this.trigger(change, previous, 7 /* ConfigurationTarget.DEFAULT */);
    }
    onDidPolicyConfigurationChange(policyConfiguration) {
        const previous = this.configuration.toData();
        const change = this.configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
        this.trigger(change, previous, 7 /* ConfigurationTarget.DEFAULT */);
    }
    trigger(configurationChange, previous, source) {
        const event = new ConfigurationChangeEvent(configurationChange, { data: previous }, this.configuration, undefined, this.logService);
        event.source = source;
        this._onDidChangeConfiguration.fire(event);
    }
}
class ConfigurationEditing {
    constructor(settingsResource, fileService, configurationService) {
        this.settingsResource = settingsResource;
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.queue = new Queue();
    }
    write(path, value) {
        return this.queue.queue(() => this.doWriteConfiguration(path, value)); // queue up writes to prevent race conditions
    }
    async doWriteConfiguration(path, value) {
        let content;
        try {
            const fileContent = await this.fileService.readFile(this.settingsResource);
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
        await this.fileService.writeFile(this.settingsResource, VSBuffer.fromString(content));
    }
    getEdits(content, path, value) {
        const { tabSize, insertSpaces, eol } = this.formattingOptions;
        // With empty path the entire file is being replaced, so we just use JSON.stringify
        if (!path.length) {
            const content = JSON.stringify(value, null, insertSpaces ? ' '.repeat(tabSize) : '\t');
            return [{
                    content,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sSUFBSSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQXdCLEtBQUssRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzNFLE9BQU8sRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0UsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekQsT0FBTyxFQUFFLEVBQUUsRUFBbUIsTUFBTSxrQ0FBa0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRSxPQUFPLEVBQTZOLHdCQUF3QixFQUFFLDhCQUE4QixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDelQsT0FBTyxFQUFFLGFBQWEsRUFBRSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxZQUFZLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNySCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0QkFB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