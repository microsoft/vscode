/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as arrays from '../../../base/common/arrays.js';
import { Emitter, Event } from '../../../base/common/event.js';
import * as json from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getOrSet, ResourceMap } from '../../../base/common/map.js';
import * as objects from '../../../base/common/objects.js';
import * as types from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { addToValueTree, getConfigurationValue, removeFromValueTree, toValuesTree } from './configuration.js';
import { Extensions, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from './configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
function freeze(data) {
    return Object.isFrozen(data) ? data : objects.deepFreeze(data);
}
export class ConfigurationModel {
    static createEmptyModel(logService) {
        return new ConfigurationModel({}, [], [], undefined, logService);
    }
    constructor(_contents, _keys, _overrides, _raw, logService) {
        this._contents = _contents;
        this._keys = _keys;
        this._overrides = _overrides;
        this._raw = _raw;
        this.logService = logService;
        this.overrideConfigurations = new Map();
    }
    get rawConfiguration() {
        if (!this._rawConfiguration) {
            if (this._raw) {
                const rawConfigurationModels = (Array.isArray(this._raw) ? this._raw : [this._raw]).map(raw => {
                    if (raw instanceof ConfigurationModel) {
                        return raw;
                    }
                    const parser = new ConfigurationModelParser('', this.logService);
                    parser.parseRaw(raw);
                    return parser.configurationModel;
                });
                this._rawConfiguration = rawConfigurationModels.reduce((previous, current) => current === previous ? current : previous.merge(current), rawConfigurationModels[0]);
            }
            else {
                // raw is same as current
                this._rawConfiguration = this;
            }
        }
        return this._rawConfiguration;
    }
    get contents() {
        return this._contents;
    }
    get overrides() {
        return this._overrides;
    }
    get keys() {
        return this._keys;
    }
    get raw() {
        if (!this._raw) {
            return undefined;
        }
        if (Array.isArray(this._raw) && this._raw.every(raw => raw instanceof ConfigurationModel)) {
            return undefined;
        }
        return this._raw;
    }
    isEmpty() {
        return this._keys.length === 0 && Object.keys(this._contents).length === 0 && this._overrides.length === 0;
    }
    getValue(section) {
        return section ? getConfigurationValue(this.contents, section) : this.contents;
    }
    inspect(section, overrideIdentifier) {
        const that = this;
        return {
            get value() {
                return freeze(that.rawConfiguration.getValue(section));
            },
            get override() {
                return overrideIdentifier ? freeze(that.rawConfiguration.getOverrideValue(section, overrideIdentifier)) : undefined;
            },
            get merged() {
                return freeze(overrideIdentifier ? that.rawConfiguration.override(overrideIdentifier).getValue(section) : that.rawConfiguration.getValue(section));
            },
            get overrides() {
                const overrides = [];
                for (const { contents, identifiers, keys } of that.rawConfiguration.overrides) {
                    const value = new ConfigurationModel(contents, keys, [], undefined, that.logService).getValue(section);
                    if (value !== undefined) {
                        overrides.push({ identifiers, value });
                    }
                }
                return overrides.length ? freeze(overrides) : undefined;
            }
        };
    }
    getOverrideValue(section, overrideIdentifier) {
        const overrideContents = this.getContentsForOverrideIdentifer(overrideIdentifier);
        return overrideContents
            ? section ? getConfigurationValue(overrideContents, section) : overrideContents
            : undefined;
    }
    getKeysForOverrideIdentifier(identifier) {
        const keys = [];
        for (const override of this.overrides) {
            if (override.identifiers.includes(identifier)) {
                keys.push(...override.keys);
            }
        }
        return arrays.distinct(keys);
    }
    getAllOverrideIdentifiers() {
        const result = [];
        for (const override of this.overrides) {
            result.push(...override.identifiers);
        }
        return arrays.distinct(result);
    }
    override(identifier) {
        let overrideConfigurationModel = this.overrideConfigurations.get(identifier);
        if (!overrideConfigurationModel) {
            overrideConfigurationModel = this.createOverrideConfigurationModel(identifier);
            this.overrideConfigurations.set(identifier, overrideConfigurationModel);
        }
        return overrideConfigurationModel;
    }
    merge(...others) {
        const contents = objects.deepClone(this.contents);
        const overrides = objects.deepClone(this.overrides);
        const keys = [...this.keys];
        const raws = this._raw ? Array.isArray(this._raw) ? [...this._raw] : [this._raw] : [this];
        for (const other of others) {
            raws.push(...(other._raw ? Array.isArray(other._raw) ? other._raw : [other._raw] : [other]));
            if (other.isEmpty()) {
                continue;
            }
            this.mergeContents(contents, other.contents);
            for (const otherOverride of other.overrides) {
                const [override] = overrides.filter(o => arrays.equals(o.identifiers, otherOverride.identifiers));
                if (override) {
                    this.mergeContents(override.contents, otherOverride.contents);
                    override.keys.push(...otherOverride.keys);
                    override.keys = arrays.distinct(override.keys);
                }
                else {
                    overrides.push(objects.deepClone(otherOverride));
                }
            }
            for (const key of other.keys) {
                if (keys.indexOf(key) === -1) {
                    keys.push(key);
                }
            }
        }
        return new ConfigurationModel(contents, keys, overrides, !raws.length || raws.every(raw => raw instanceof ConfigurationModel) ? undefined : raws, this.logService);
    }
    createOverrideConfigurationModel(identifier) {
        const overrideContents = this.getContentsForOverrideIdentifer(identifier);
        if (!overrideContents || typeof overrideContents !== 'object' || !Object.keys(overrideContents).length) {
            // If there are no valid overrides, return self
            return this;
        }
        const contents = {};
        for (const key of arrays.distinct([...Object.keys(this.contents), ...Object.keys(overrideContents)])) {
            let contentsForKey = this.contents[key];
            const overrideContentsForKey = overrideContents[key];
            // If there are override contents for the key, clone and merge otherwise use base contents
            if (overrideContentsForKey) {
                // Clone and merge only if base contents and override contents are of type object otherwise just override
                if (typeof contentsForKey === 'object' && typeof overrideContentsForKey === 'object') {
                    contentsForKey = objects.deepClone(contentsForKey);
                    this.mergeContents(contentsForKey, overrideContentsForKey);
                }
                else {
                    contentsForKey = overrideContentsForKey;
                }
            }
            contents[key] = contentsForKey;
        }
        return new ConfigurationModel(contents, this.keys, this.overrides, undefined, this.logService);
    }
    mergeContents(source, target) {
        for (const key of Object.keys(target)) {
            if (key in source) {
                if (types.isObject(source[key]) && types.isObject(target[key])) {
                    this.mergeContents(source[key], target[key]);
                    continue;
                }
            }
            source[key] = objects.deepClone(target[key]);
        }
    }
    getContentsForOverrideIdentifer(identifier) {
        let contentsForIdentifierOnly = null;
        let contents = null;
        const mergeContents = (contentsToMerge) => {
            if (contentsToMerge) {
                if (contents) {
                    this.mergeContents(contents, contentsToMerge);
                }
                else {
                    contents = objects.deepClone(contentsToMerge);
                }
            }
        };
        for (const override of this.overrides) {
            if (override.identifiers.length === 1 && override.identifiers[0] === identifier) {
                contentsForIdentifierOnly = override.contents;
            }
            else if (override.identifiers.includes(identifier)) {
                mergeContents(override.contents);
            }
        }
        // Merge contents of the identifier only at the end to take precedence.
        mergeContents(contentsForIdentifierOnly);
        return contents;
    }
    toJSON() {
        return {
            contents: this.contents,
            overrides: this.overrides,
            keys: this.keys
        };
    }
    // Update methods
    addValue(key, value) {
        this.updateValue(key, value, true);
    }
    setValue(key, value) {
        this.updateValue(key, value, false);
    }
    removeValue(key) {
        const index = this.keys.indexOf(key);
        if (index === -1) {
            return;
        }
        this.keys.splice(index, 1);
        removeFromValueTree(this.contents, key);
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
            this.overrides.splice(this.overrides.findIndex(o => arrays.equals(o.identifiers, overrideIdentifiersFromKey(key))), 1);
        }
    }
    updateValue(key, value, add) {
        addToValueTree(this.contents, key, value, e => this.logService.error(e));
        add = add || this.keys.indexOf(key) === -1;
        if (add) {
            this.keys.push(key);
        }
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
            const overrideContents = this.contents[key];
            const identifiers = overrideIdentifiersFromKey(key);
            const override = {
                identifiers,
                keys: Object.keys(overrideContents),
                contents: toValuesTree(overrideContents, message => this.logService.error(message)),
            };
            const index = this.overrides.findIndex(o => arrays.equals(o.identifiers, identifiers));
            if (index !== -1) {
                this.overrides[index] = override;
            }
            else {
                this.overrides.push(override);
            }
        }
    }
}
export class ConfigurationModelParser {
    constructor(_name, logService) {
        this._name = _name;
        this.logService = logService;
        this._raw = null;
        this._configurationModel = null;
        this._restrictedConfigurations = [];
        this._parseErrors = [];
    }
    get configurationModel() {
        return this._configurationModel || ConfigurationModel.createEmptyModel(this.logService);
    }
    get restrictedConfigurations() {
        return this._restrictedConfigurations;
    }
    get errors() {
        return this._parseErrors;
    }
    parse(content, options) {
        if (!types.isUndefinedOrNull(content)) {
            const raw = this.doParseContent(content);
            this.parseRaw(raw, options);
        }
    }
    reparse(options) {
        if (this._raw) {
            this.parseRaw(this._raw, options);
        }
    }
    parseRaw(raw, options) {
        this._raw = raw;
        const { contents, keys, overrides, restricted, hasExcludedProperties } = this.doParseRaw(raw, options);
        this._configurationModel = new ConfigurationModel(contents, keys, overrides, hasExcludedProperties ? [raw] : undefined /* raw has not changed */, this.logService);
        this._restrictedConfigurations = restricted || [];
    }
    doParseContent(content) {
        let raw = {};
        let currentProperty = null;
        let currentParent = [];
        const previousParents = [];
        const parseErrors = [];
        function onValue(value) {
            if (Array.isArray(currentParent)) {
                currentParent.push(value);
            }
            else if (currentProperty !== null) {
                currentParent[currentProperty] = value;
            }
        }
        const visitor = {
            onObjectBegin: () => {
                const object = {};
                onValue(object);
                previousParents.push(currentParent);
                currentParent = object;
                currentProperty = null;
            },
            onObjectProperty: (name) => {
                currentProperty = name;
            },
            onObjectEnd: () => {
                currentParent = previousParents.pop();
            },
            onArrayBegin: () => {
                const array = [];
                onValue(array);
                previousParents.push(currentParent);
                currentParent = array;
                currentProperty = null;
            },
            onArrayEnd: () => {
                currentParent = previousParents.pop();
            },
            onLiteralValue: onValue,
            onError: (error, offset, length) => {
                parseErrors.push({ error, offset, length });
            }
        };
        if (content) {
            try {
                json.visit(content, visitor);
                raw = currentParent[0] || {};
            }
            catch (e) {
                this.logService.error(`Error while parsing settings file ${this._name}: ${e}`);
                this._parseErrors = [e];
            }
        }
        return raw;
    }
    doParseRaw(raw, options) {
        const registry = Registry.as(Extensions.Configuration);
        const configurationProperties = registry.getConfigurationProperties();
        const excludedConfigurationProperties = registry.getExcludedConfigurationProperties();
        const filtered = this.filter(raw, configurationProperties, excludedConfigurationProperties, true, options);
        raw = filtered.raw;
        const contents = toValuesTree(raw, message => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
        const keys = Object.keys(raw);
        const overrides = this.toOverrides(raw, message => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
        return { contents, keys, overrides, restricted: filtered.restricted, hasExcludedProperties: filtered.hasExcludedProperties };
    }
    filter(properties, configurationProperties, excludedConfigurationProperties, filterOverriddenProperties, options) {
        let hasExcludedProperties = false;
        if (!options?.scopes && !options?.skipRestricted && !options?.skipUnregistered && !options?.exclude?.length) {
            return { raw: properties, restricted: [], hasExcludedProperties };
        }
        const raw = {};
        const restricted = [];
        for (const key in properties) {
            if (OVERRIDE_PROPERTY_REGEX.test(key) && filterOverriddenProperties) {
                const result = this.filter(properties[key], configurationProperties, excludedConfigurationProperties, false, options);
                raw[key] = result.raw;
                hasExcludedProperties = hasExcludedProperties || result.hasExcludedProperties;
                restricted.push(...result.restricted);
            }
            else {
                const propertySchema = configurationProperties[key];
                if (propertySchema?.restricted) {
                    restricted.push(key);
                }
                if (this.shouldInclude(key, propertySchema, excludedConfigurationProperties, options)) {
                    raw[key] = properties[key];
                }
                else {
                    hasExcludedProperties = true;
                }
            }
        }
        return { raw, restricted, hasExcludedProperties };
    }
    shouldInclude(key, propertySchema, excludedConfigurationProperties, options) {
        if (options.exclude?.includes(key)) {
            return false;
        }
        if (options.include?.includes(key)) {
            return true;
        }
        if (options.skipRestricted && propertySchema?.restricted) {
            return false;
        }
        if (options.skipUnregistered && !propertySchema) {
            return false;
        }
        const schema = propertySchema ?? excludedConfigurationProperties[key];
        const scope = schema ? typeof schema.scope !== 'undefined' ? schema.scope : 4 /* ConfigurationScope.WINDOW */ : undefined;
        if (scope === undefined || options.scopes === undefined) {
            return true;
        }
        return options.scopes.includes(scope);
    }
    toOverrides(raw, conflictReporter) {
        const overrides = [];
        for (const key of Object.keys(raw)) {
            if (OVERRIDE_PROPERTY_REGEX.test(key)) {
                const overrideRaw = {};
                const rawKey = raw[key];
                for (const keyInOverrideRaw in rawKey) {
                    overrideRaw[keyInOverrideRaw] = rawKey[keyInOverrideRaw];
                }
                overrides.push({
                    identifiers: overrideIdentifiersFromKey(key),
                    keys: Object.keys(overrideRaw),
                    contents: toValuesTree(overrideRaw, conflictReporter)
                });
            }
        }
        return overrides;
    }
}
export class UserSettings extends Disposable {
    constructor(userSettingsResource, parseOptions, extUri, fileService, logService) {
        super();
        this.userSettingsResource = userSettingsResource;
        this.parseOptions = parseOptions;
        this.fileService = fileService;
        this.logService = logService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.parser = new ConfigurationModelParser(this.userSettingsResource.toString(), logService);
        this._register(this.fileService.watch(extUri.dirname(this.userSettingsResource)));
        // Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
        this._register(this.fileService.watch(this.userSettingsResource));
        this._register(Event.any(Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.userSettingsResource)), Event.filter(this.fileService.onDidRunOperation, e => (e.isOperation(0 /* FileOperation.CREATE */) || e.isOperation(3 /* FileOperation.COPY */) || e.isOperation(1 /* FileOperation.DELETE */) || e.isOperation(4 /* FileOperation.WRITE */)) && extUri.isEqual(e.resource, userSettingsResource)))(() => this._onDidChange.fire()));
    }
    async loadConfiguration() {
        try {
            const content = await this.fileService.readFile(this.userSettingsResource);
            this.parser.parse(content.value.toString() || '{}', this.parseOptions);
            return this.parser.configurationModel;
        }
        catch (e) {
            return ConfigurationModel.createEmptyModel(this.logService);
        }
    }
    reparse(parseOptions) {
        if (parseOptions) {
            this.parseOptions = parseOptions;
        }
        this.parser.reparse(this.parseOptions);
        return this.parser.configurationModel;
    }
    getRestrictedSettings() {
        return this.parser.restrictedConfigurations;
    }
}
class ConfigurationInspectValue {
    constructor(key, overrides, _value, overrideIdentifiers, defaultConfiguration, policyConfiguration, applicationConfiguration, userConfiguration, localUserConfiguration, remoteUserConfiguration, workspaceConfiguration, folderConfigurationModel, memoryConfigurationModel) {
        this.key = key;
        this.overrides = overrides;
        this._value = _value;
        this.overrideIdentifiers = overrideIdentifiers;
        this.defaultConfiguration = defaultConfiguration;
        this.policyConfiguration = policyConfiguration;
        this.applicationConfiguration = applicationConfiguration;
        this.userConfiguration = userConfiguration;
        this.localUserConfiguration = localUserConfiguration;
        this.remoteUserConfiguration = remoteUserConfiguration;
        this.workspaceConfiguration = workspaceConfiguration;
        this.folderConfigurationModel = folderConfigurationModel;
        this.memoryConfigurationModel = memoryConfigurationModel;
    }
    get value() {
        return freeze(this._value);
    }
    toInspectValue(inspectValue) {
        return inspectValue?.value !== undefined || inspectValue?.override !== undefined || inspectValue?.overrides !== undefined ? inspectValue : undefined;
    }
    get defaultInspectValue() {
        if (!this._defaultInspectValue) {
            this._defaultInspectValue = this.defaultConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
        }
        return this._defaultInspectValue;
    }
    get defaultValue() {
        return this.defaultInspectValue.merged;
    }
    get default() {
        return this.toInspectValue(this.defaultInspectValue);
    }
    get policyInspectValue() {
        if (this._policyInspectValue === undefined) {
            this._policyInspectValue = this.policyConfiguration ? this.policyConfiguration.inspect(this.key) : null;
        }
        return this._policyInspectValue;
    }
    get policyValue() {
        return this.policyInspectValue?.merged;
    }
    get policy() {
        return this.policyInspectValue?.value !== undefined ? { value: this.policyInspectValue.value } : undefined;
    }
    get applicationInspectValue() {
        if (this._applicationInspectValue === undefined) {
            this._applicationInspectValue = this.applicationConfiguration ? this.applicationConfiguration.inspect(this.key) : null;
        }
        return this._applicationInspectValue;
    }
    get applicationValue() {
        return this.applicationInspectValue?.merged;
    }
    get application() {
        return this.toInspectValue(this.applicationInspectValue);
    }
    get userInspectValue() {
        if (!this._userInspectValue) {
            this._userInspectValue = this.userConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
        }
        return this._userInspectValue;
    }
    get userValue() {
        return this.userInspectValue.merged;
    }
    get user() {
        return this.toInspectValue(this.userInspectValue);
    }
    get userLocalInspectValue() {
        if (!this._userLocalInspectValue) {
            this._userLocalInspectValue = this.localUserConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
        }
        return this._userLocalInspectValue;
    }
    get userLocalValue() {
        return this.userLocalInspectValue.merged;
    }
    get userLocal() {
        return this.toInspectValue(this.userLocalInspectValue);
    }
    get userRemoteInspectValue() {
        if (!this._userRemoteInspectValue) {
            this._userRemoteInspectValue = this.remoteUserConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
        }
        return this._userRemoteInspectValue;
    }
    get userRemoteValue() {
        return this.userRemoteInspectValue.merged;
    }
    get userRemote() {
        return this.toInspectValue(this.userRemoteInspectValue);
    }
    get workspaceInspectValue() {
        if (this._workspaceInspectValue === undefined) {
            this._workspaceInspectValue = this.workspaceConfiguration ? this.workspaceConfiguration.inspect(this.key, this.overrides.overrideIdentifier) : null;
        }
        return this._workspaceInspectValue;
    }
    get workspaceValue() {
        return this.workspaceInspectValue?.merged;
    }
    get workspace() {
        return this.toInspectValue(this.workspaceInspectValue);
    }
    get workspaceFolderInspectValue() {
        if (this._workspaceFolderInspectValue === undefined) {
            this._workspaceFolderInspectValue = this.folderConfigurationModel ? this.folderConfigurationModel.inspect(this.key, this.overrides.overrideIdentifier) : null;
        }
        return this._workspaceFolderInspectValue;
    }
    get workspaceFolderValue() {
        return this.workspaceFolderInspectValue?.merged;
    }
    get workspaceFolder() {
        return this.toInspectValue(this.workspaceFolderInspectValue);
    }
    get memoryInspectValue() {
        if (this._memoryInspectValue === undefined) {
            this._memoryInspectValue = this.memoryConfigurationModel.inspect(this.key, this.overrides.overrideIdentifier);
        }
        return this._memoryInspectValue;
    }
    get memoryValue() {
        return this.memoryInspectValue.merged;
    }
    get memory() {
        return this.toInspectValue(this.memoryInspectValue);
    }
}
export class Configuration {
    constructor(_defaultConfiguration, _policyConfiguration, _applicationConfiguration, _localUserConfiguration, _remoteUserConfiguration, _workspaceConfiguration, _folderConfigurations, _memoryConfiguration, _memoryConfigurationByResource, logService) {
        this._defaultConfiguration = _defaultConfiguration;
        this._policyConfiguration = _policyConfiguration;
        this._applicationConfiguration = _applicationConfiguration;
        this._localUserConfiguration = _localUserConfiguration;
        this._remoteUserConfiguration = _remoteUserConfiguration;
        this._workspaceConfiguration = _workspaceConfiguration;
        this._folderConfigurations = _folderConfigurations;
        this._memoryConfiguration = _memoryConfiguration;
        this._memoryConfigurationByResource = _memoryConfigurationByResource;
        this.logService = logService;
        this._workspaceConsolidatedConfiguration = null;
        this._foldersConsolidatedConfigurations = new ResourceMap();
        this._userConfiguration = null;
    }
    getValue(section, overrides, workspace) {
        const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(section, overrides, workspace);
        return consolidateConfigurationModel.getValue(section);
    }
    updateValue(key, value, overrides = {}) {
        let memoryConfiguration;
        if (overrides.resource) {
            memoryConfiguration = this._memoryConfigurationByResource.get(overrides.resource);
            if (!memoryConfiguration) {
                memoryConfiguration = ConfigurationModel.createEmptyModel(this.logService);
                this._memoryConfigurationByResource.set(overrides.resource, memoryConfiguration);
            }
        }
        else {
            memoryConfiguration = this._memoryConfiguration;
        }
        if (value === undefined) {
            memoryConfiguration.removeValue(key);
        }
        else {
            memoryConfiguration.setValue(key, value);
        }
        if (!overrides.resource) {
            this._workspaceConsolidatedConfiguration = null;
        }
    }
    inspect(key, overrides, workspace) {
        const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(key, overrides, workspace);
        const folderConfigurationModel = this.getFolderConfigurationModelForResource(overrides.resource, workspace);
        const memoryConfigurationModel = overrides.resource ? this._memoryConfigurationByResource.get(overrides.resource) || this._memoryConfiguration : this._memoryConfiguration;
        const overrideIdentifiers = new Set();
        for (const override of consolidateConfigurationModel.overrides) {
            for (const overrideIdentifier of override.identifiers) {
                if (consolidateConfigurationModel.getOverrideValue(key, overrideIdentifier) !== undefined) {
                    overrideIdentifiers.add(overrideIdentifier);
                }
            }
        }
        return new ConfigurationInspectValue(key, overrides, consolidateConfigurationModel.getValue(key), overrideIdentifiers.size ? [...overrideIdentifiers] : undefined, this._defaultConfiguration, this._policyConfiguration.isEmpty() ? undefined : this._policyConfiguration, this.applicationConfiguration.isEmpty() ? undefined : this.applicationConfiguration, this.userConfiguration, this.localUserConfiguration, this.remoteUserConfiguration, workspace ? this._workspaceConfiguration : undefined, folderConfigurationModel ? folderConfigurationModel : undefined, memoryConfigurationModel);
    }
    keys(workspace) {
        const folderConfigurationModel = this.getFolderConfigurationModelForResource(undefined, workspace);
        return {
            default: this._defaultConfiguration.keys.slice(0),
            policy: this._policyConfiguration.keys.slice(0),
            user: this.userConfiguration.keys.slice(0),
            workspace: this._workspaceConfiguration.keys.slice(0),
            workspaceFolder: folderConfigurationModel ? folderConfigurationModel.keys.slice(0) : []
        };
    }
    updateDefaultConfiguration(defaultConfiguration) {
        this._defaultConfiguration = defaultConfiguration;
        this._workspaceConsolidatedConfiguration = null;
        this._foldersConsolidatedConfigurations.clear();
    }
    updatePolicyConfiguration(policyConfiguration) {
        this._policyConfiguration = policyConfiguration;
    }
    updateApplicationConfiguration(applicationConfiguration) {
        this._applicationConfiguration = applicationConfiguration;
        this._workspaceConsolidatedConfiguration = null;
        this._foldersConsolidatedConfigurations.clear();
    }
    updateLocalUserConfiguration(localUserConfiguration) {
        this._localUserConfiguration = localUserConfiguration;
        this._userConfiguration = null;
        this._workspaceConsolidatedConfiguration = null;
        this._foldersConsolidatedConfigurations.clear();
    }
    updateRemoteUserConfiguration(remoteUserConfiguration) {
        this._remoteUserConfiguration = remoteUserConfiguration;
        this._userConfiguration = null;
        this._workspaceConsolidatedConfiguration = null;
        this._foldersConsolidatedConfigurations.clear();
    }
    updateWorkspaceConfiguration(workspaceConfiguration) {
        this._workspaceConfiguration = workspaceConfiguration;
        this._workspaceConsolidatedConfiguration = null;
        this._foldersConsolidatedConfigurations.clear();
    }
    updateFolderConfiguration(resource, configuration) {
        this._folderConfigurations.set(resource, configuration);
        this._foldersConsolidatedConfigurations.delete(resource);
    }
    deleteFolderConfiguration(resource) {
        this.folderConfigurations.delete(resource);
        this._foldersConsolidatedConfigurations.delete(resource);
    }
    compareAndUpdateDefaultConfiguration(defaults, keys) {
        const overrides = [];
        if (!keys) {
            const { added, updated, removed } = compare(this._defaultConfiguration, defaults);
            keys = [...added, ...updated, ...removed];
        }
        for (const key of keys) {
            for (const overrideIdentifier of overrideIdentifiersFromKey(key)) {
                const fromKeys = this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier);
                const toKeys = defaults.getKeysForOverrideIdentifier(overrideIdentifier);
                const keys = [
                    ...toKeys.filter(key => fromKeys.indexOf(key) === -1),
                    ...fromKeys.filter(key => toKeys.indexOf(key) === -1),
                    ...fromKeys.filter(key => !objects.equals(this._defaultConfiguration.override(overrideIdentifier).getValue(key), defaults.override(overrideIdentifier).getValue(key)))
                ];
                overrides.push([overrideIdentifier, keys]);
            }
        }
        this.updateDefaultConfiguration(defaults);
        return { keys, overrides };
    }
    compareAndUpdatePolicyConfiguration(policyConfiguration) {
        const { added, updated, removed } = compare(this._policyConfiguration, policyConfiguration);
        const keys = [...added, ...updated, ...removed];
        if (keys.length) {
            this.updatePolicyConfiguration(policyConfiguration);
        }
        return { keys, overrides: [] };
    }
    compareAndUpdateApplicationConfiguration(application) {
        const { added, updated, removed, overrides } = compare(this.applicationConfiguration, application);
        const keys = [...added, ...updated, ...removed];
        if (keys.length) {
            this.updateApplicationConfiguration(application);
        }
        return { keys, overrides };
    }
    compareAndUpdateLocalUserConfiguration(user) {
        const { added, updated, removed, overrides } = compare(this.localUserConfiguration, user);
        const keys = [...added, ...updated, ...removed];
        if (keys.length) {
            this.updateLocalUserConfiguration(user);
        }
        return { keys, overrides };
    }
    compareAndUpdateRemoteUserConfiguration(user) {
        const { added, updated, removed, overrides } = compare(this.remoteUserConfiguration, user);
        const keys = [...added, ...updated, ...removed];
        if (keys.length) {
            this.updateRemoteUserConfiguration(user);
        }
        return { keys, overrides };
    }
    compareAndUpdateWorkspaceConfiguration(workspaceConfiguration) {
        const { added, updated, removed, overrides } = compare(this.workspaceConfiguration, workspaceConfiguration);
        const keys = [...added, ...updated, ...removed];
        if (keys.length) {
            this.updateWorkspaceConfiguration(workspaceConfiguration);
        }
        return { keys, overrides };
    }
    compareAndUpdateFolderConfiguration(resource, folderConfiguration) {
        const currentFolderConfiguration = this.folderConfigurations.get(resource);
        const { added, updated, removed, overrides } = compare(currentFolderConfiguration, folderConfiguration);
        const keys = [...added, ...updated, ...removed];
        if (keys.length || !currentFolderConfiguration) {
            this.updateFolderConfiguration(resource, folderConfiguration);
        }
        return { keys, overrides };
    }
    compareAndDeleteFolderConfiguration(folder) {
        const folderConfig = this.folderConfigurations.get(folder);
        if (!folderConfig) {
            throw new Error('Unknown folder');
        }
        this.deleteFolderConfiguration(folder);
        const { added, updated, removed, overrides } = compare(folderConfig, undefined);
        return { keys: [...added, ...updated, ...removed], overrides };
    }
    get defaults() {
        return this._defaultConfiguration;
    }
    get applicationConfiguration() {
        return this._applicationConfiguration;
    }
    get userConfiguration() {
        if (!this._userConfiguration) {
            if (this._remoteUserConfiguration.isEmpty()) {
                this._userConfiguration = this._localUserConfiguration;
            }
            else {
                const merged = this._localUserConfiguration.merge(this._remoteUserConfiguration);
                this._userConfiguration = new ConfigurationModel(merged.contents, merged.keys, merged.overrides, undefined, this.logService);
            }
        }
        return this._userConfiguration;
    }
    get localUserConfiguration() {
        return this._localUserConfiguration;
    }
    get remoteUserConfiguration() {
        return this._remoteUserConfiguration;
    }
    get workspaceConfiguration() {
        return this._workspaceConfiguration;
    }
    get folderConfigurations() {
        return this._folderConfigurations;
    }
    getConsolidatedConfigurationModel(section, overrides, workspace) {
        let configurationModel = this.getConsolidatedConfigurationModelForResource(overrides, workspace);
        if (overrides.overrideIdentifier) {
            configurationModel = configurationModel.override(overrides.overrideIdentifier);
        }
        if (!this._policyConfiguration.isEmpty() && this._policyConfiguration.getValue(section) !== undefined) {
            // clone by merging
            configurationModel = configurationModel.merge();
            for (const key of this._policyConfiguration.keys) {
                configurationModel.setValue(key, this._policyConfiguration.getValue(key));
            }
        }
        return configurationModel;
    }
    getConsolidatedConfigurationModelForResource({ resource }, workspace) {
        let consolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();
        if (workspace && resource) {
            const root = workspace.getFolder(resource);
            if (root) {
                consolidateConfiguration = this.getFolderConsolidatedConfiguration(root.uri) || consolidateConfiguration;
            }
            const memoryConfigurationForResource = this._memoryConfigurationByResource.get(resource);
            if (memoryConfigurationForResource) {
                consolidateConfiguration = consolidateConfiguration.merge(memoryConfigurationForResource);
            }
        }
        return consolidateConfiguration;
    }
    getWorkspaceConsolidatedConfiguration() {
        if (!this._workspaceConsolidatedConfiguration) {
            this._workspaceConsolidatedConfiguration = this._defaultConfiguration.merge(this.applicationConfiguration, this.userConfiguration, this._workspaceConfiguration, this._memoryConfiguration);
        }
        return this._workspaceConsolidatedConfiguration;
    }
    getFolderConsolidatedConfiguration(folder) {
        let folderConsolidatedConfiguration = this._foldersConsolidatedConfigurations.get(folder);
        if (!folderConsolidatedConfiguration) {
            const workspaceConsolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();
            const folderConfiguration = this._folderConfigurations.get(folder);
            if (folderConfiguration) {
                folderConsolidatedConfiguration = workspaceConsolidateConfiguration.merge(folderConfiguration);
                this._foldersConsolidatedConfigurations.set(folder, folderConsolidatedConfiguration);
            }
            else {
                folderConsolidatedConfiguration = workspaceConsolidateConfiguration;
            }
        }
        return folderConsolidatedConfiguration;
    }
    getFolderConfigurationModelForResource(resource, workspace) {
        if (workspace && resource) {
            const root = workspace.getFolder(resource);
            if (root) {
                return this._folderConfigurations.get(root.uri);
            }
        }
        return undefined;
    }
    toData() {
        return {
            defaults: {
                contents: this._defaultConfiguration.contents,
                overrides: this._defaultConfiguration.overrides,
                keys: this._defaultConfiguration.keys,
            },
            policy: {
                contents: this._policyConfiguration.contents,
                overrides: this._policyConfiguration.overrides,
                keys: this._policyConfiguration.keys
            },
            application: {
                contents: this.applicationConfiguration.contents,
                overrides: this.applicationConfiguration.overrides,
                keys: this.applicationConfiguration.keys,
                raw: Array.isArray(this.applicationConfiguration.raw) ? undefined : this.applicationConfiguration.raw
            },
            userLocal: {
                contents: this.localUserConfiguration.contents,
                overrides: this.localUserConfiguration.overrides,
                keys: this.localUserConfiguration.keys,
                raw: Array.isArray(this.localUserConfiguration.raw) ? undefined : this.localUserConfiguration.raw
            },
            userRemote: {
                contents: this.remoteUserConfiguration.contents,
                overrides: this.remoteUserConfiguration.overrides,
                keys: this.remoteUserConfiguration.keys,
                raw: Array.isArray(this.remoteUserConfiguration.raw) ? undefined : this.remoteUserConfiguration.raw
            },
            workspace: {
                contents: this._workspaceConfiguration.contents,
                overrides: this._workspaceConfiguration.overrides,
                keys: this._workspaceConfiguration.keys
            },
            folders: [...this._folderConfigurations.keys()].reduce((result, folder) => {
                const { contents, overrides, keys } = this._folderConfigurations.get(folder);
                result.push([folder, { contents, overrides, keys }]);
                return result;
            }, [])
        };
    }
    allKeys() {
        const keys = new Set();
        this._defaultConfiguration.keys.forEach(key => keys.add(key));
        this.userConfiguration.keys.forEach(key => keys.add(key));
        this._workspaceConfiguration.keys.forEach(key => keys.add(key));
        this._folderConfigurations.forEach(folderConfiguration => folderConfiguration.keys.forEach(key => keys.add(key)));
        return [...keys.values()];
    }
    allOverrideIdentifiers() {
        const keys = new Set();
        this._defaultConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key));
        this.userConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key));
        this._workspaceConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key));
        this._folderConfigurations.forEach(folderConfiguration => folderConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key)));
        return [...keys.values()];
    }
    getAllKeysForOverrideIdentifier(overrideIdentifier) {
        const keys = new Set();
        this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
        this.userConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
        this._workspaceConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
        this._folderConfigurations.forEach(folderConfiguration => folderConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key)));
        return [...keys.values()];
    }
    static parse(data, logService) {
        const defaultConfiguration = this.parseConfigurationModel(data.defaults, logService);
        const policyConfiguration = this.parseConfigurationModel(data.policy, logService);
        const applicationConfiguration = this.parseConfigurationModel(data.application, logService);
        const userLocalConfiguration = this.parseConfigurationModel(data.userLocal, logService);
        const userRemoteConfiguration = this.parseConfigurationModel(data.userRemote, logService);
        const workspaceConfiguration = this.parseConfigurationModel(data.workspace, logService);
        const folders = data.folders.reduce((result, value) => {
            result.set(URI.revive(value[0]), this.parseConfigurationModel(value[1], logService));
            return result;
        }, new ResourceMap());
        return new Configuration(defaultConfiguration, policyConfiguration, applicationConfiguration, userLocalConfiguration, userRemoteConfiguration, workspaceConfiguration, folders, ConfigurationModel.createEmptyModel(logService), new ResourceMap(), logService);
    }
    static parseConfigurationModel(model, logService) {
        return new ConfigurationModel(model.contents, model.keys, model.overrides, model.raw, logService);
    }
}
export function mergeChanges(...changes) {
    if (changes.length === 0) {
        return { keys: [], overrides: [] };
    }
    if (changes.length === 1) {
        return changes[0];
    }
    const keysSet = new Set();
    const overridesMap = new Map();
    for (const change of changes) {
        change.keys.forEach(key => keysSet.add(key));
        change.overrides.forEach(([identifier, keys]) => {
            const result = getOrSet(overridesMap, identifier, new Set());
            keys.forEach(key => result.add(key));
        });
    }
    const overrides = [];
    overridesMap.forEach((keys, identifier) => overrides.push([identifier, [...keys.values()]]));
    return { keys: [...keysSet.values()], overrides };
}
export class ConfigurationChangeEvent {
    constructor(change, previous, currentConfiguraiton, currentWorkspace, logService) {
        this.change = change;
        this.previous = previous;
        this.currentConfiguraiton = currentConfiguraiton;
        this.currentWorkspace = currentWorkspace;
        this.logService = logService;
        this._marker = '\n';
        this._markerCode1 = this._marker.charCodeAt(0);
        this._markerCode2 = '.'.charCodeAt(0);
        this.affectedKeys = new Set();
        this._previousConfiguration = undefined;
        for (const key of change.keys) {
            this.affectedKeys.add(key);
        }
        for (const [, keys] of change.overrides) {
            for (const key of keys) {
                this.affectedKeys.add(key);
            }
        }
        // Example: '\nfoo.bar\nabc.def\n'
        this._affectsConfigStr = this._marker;
        for (const key of this.affectedKeys) {
            this._affectsConfigStr += key + this._marker;
        }
    }
    get previousConfiguration() {
        if (!this._previousConfiguration && this.previous) {
            this._previousConfiguration = Configuration.parse(this.previous.data, this.logService);
        }
        return this._previousConfiguration;
    }
    affectsConfiguration(section, overrides) {
        // we have one large string with all keys that have changed. we pad (marker) the section
        // and check that either find it padded or before a segment character
        const needle = this._marker + section;
        const idx = this._affectsConfigStr.indexOf(needle);
        if (idx < 0) {
            // NOT: (marker + section)
            return false;
        }
        const pos = idx + needle.length;
        if (pos >= this._affectsConfigStr.length) {
            return false;
        }
        const code = this._affectsConfigStr.charCodeAt(pos);
        if (code !== this._markerCode1 && code !== this._markerCode2) {
            // NOT: section + (marker | segment)
            return false;
        }
        if (overrides) {
            const value1 = this.previousConfiguration ? this.previousConfiguration.getValue(section, overrides, this.previous?.workspace) : undefined;
            const value2 = this.currentConfiguraiton.getValue(section, overrides, this.currentWorkspace);
            return !objects.equals(value1, value2);
        }
        return true;
    }
}
function compare(from, to) {
    const { added, removed, updated } = compareConfigurationContents(to?.rawConfiguration, from?.rawConfiguration);
    const overrides = [];
    const fromOverrideIdentifiers = from?.getAllOverrideIdentifiers() || [];
    const toOverrideIdentifiers = to?.getAllOverrideIdentifiers() || [];
    if (to) {
        const addedOverrideIdentifiers = toOverrideIdentifiers.filter(key => !fromOverrideIdentifiers.includes(key));
        for (const identifier of addedOverrideIdentifiers) {
            overrides.push([identifier, to.getKeysForOverrideIdentifier(identifier)]);
        }
    }
    if (from) {
        const removedOverrideIdentifiers = fromOverrideIdentifiers.filter(key => !toOverrideIdentifiers.includes(key));
        for (const identifier of removedOverrideIdentifiers) {
            overrides.push([identifier, from.getKeysForOverrideIdentifier(identifier)]);
        }
    }
    if (to && from) {
        for (const identifier of fromOverrideIdentifiers) {
            if (toOverrideIdentifiers.includes(identifier)) {
                const result = compareConfigurationContents({ contents: from.getOverrideValue(undefined, identifier) || {}, keys: from.getKeysForOverrideIdentifier(identifier) }, { contents: to.getOverrideValue(undefined, identifier) || {}, keys: to.getKeysForOverrideIdentifier(identifier) });
                overrides.push([identifier, [...result.added, ...result.removed, ...result.updated]]);
            }
        }
    }
    return { added, removed, updated, overrides };
}
function compareConfigurationContents(to, from) {
    const added = to
        ? from ? to.keys.filter(key => from.keys.indexOf(key) === -1) : [...to.keys]
        : [];
    const removed = from
        ? to ? from.keys.filter(key => to.keys.indexOf(key) === -1) : [...from.keys]
        : [];
    const updated = [];
    if (to && from) {
        for (const key of from.keys) {
            if (to.keys.indexOf(key) !== -1) {
                const value1 = getConfigurationValue(from.contents, key);
                const value2 = getConfigurationValue(to.contents, key);
                if (!objects.equals(value1, value2)) {
                    updated.push(key);
                }
            }
        }
    }
    return { added, removed, updated };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbk1vZGVscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25Nb2RlbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxnQ0FBZ0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sS0FBSyxJQUFJLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDcEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUUzRCxPQUFPLEtBQUssS0FBSyxNQUFNLCtCQUErQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBdUIscUJBQXFCLEVBQWlPLG1CQUFtQixFQUFFLFlBQVksRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2xXLE9BQU8sRUFBc0IsVUFBVSxFQUF3RCwwQkFBMEIsRUFBRSx1QkFBdUIsRUFBMEMsTUFBTSw0QkFBNEIsQ0FBQztBQUcvTixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHN0QsU0FBUyxNQUFNLENBQUksSUFBTztJQUN6QixPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNoRSxDQUFDO0FBSUQsTUFB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