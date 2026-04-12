/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { distinct } from '../../../base/common/arrays.js';
import { Emitter } from '../../../base/common/event.js';
import * as types from '../../../base/common/types.js';
import * as nls from '../../../nls.js';
import { getLanguageTagSettingPlainKey } from './configuration.js';
import { Extensions as JSONExtensions } from '../../jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import product from '../../product/common/product.js';
export var EditPresentationTypes;
(function (EditPresentationTypes) {
    EditPresentationTypes["Multiline"] = "multilineText";
    EditPresentationTypes["Singleline"] = "singlelineText";
})(EditPresentationTypes || (EditPresentationTypes = {}));
export const Extensions = {
    Configuration: 'base.contributions.configuration'
};
export var ConfigurationScope;
(function (ConfigurationScope) {
    /**
     * Application specific configuration, which can be configured only in default profile user settings.
     */
    ConfigurationScope[ConfigurationScope["APPLICATION"] = 1] = "APPLICATION";
    /**
     * Machine specific configuration, which can be configured only in local and remote user settings.
     */
    ConfigurationScope[ConfigurationScope["MACHINE"] = 2] = "MACHINE";
    /**
     * An application machine specific configuration, which can be configured only in default profile user settings and remote user settings.
     */
    ConfigurationScope[ConfigurationScope["APPLICATION_MACHINE"] = 3] = "APPLICATION_MACHINE";
    /**
     * Window specific configuration, which can be configured in the user or workspace settings.
     */
    ConfigurationScope[ConfigurationScope["WINDOW"] = 4] = "WINDOW";
    /**
     * Resource specific configuration, which can be configured in the user, workspace or folder settings.
     */
    ConfigurationScope[ConfigurationScope["RESOURCE"] = 5] = "RESOURCE";
    /**
     * Resource specific configuration that can be configured in language specific settings
     */
    ConfigurationScope[ConfigurationScope["LANGUAGE_OVERRIDABLE"] = 6] = "LANGUAGE_OVERRIDABLE";
    /**
     * Machine specific configuration that can also be configured in workspace or folder settings.
     */
    ConfigurationScope[ConfigurationScope["MACHINE_OVERRIDABLE"] = 7] = "MACHINE_OVERRIDABLE";
})(ConfigurationScope || (ConfigurationScope = {}));
export function isConfigurationDefaultSourceEquals(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    if (typeof a === 'string' || typeof b === 'string') {
        return a === b;
    }
    return a.id === b.id;
}
export const allSettings = { properties: {}, patternProperties: {} };
export const applicationSettings = { properties: {}, patternProperties: {} };
export const applicationMachineSettings = { properties: {}, patternProperties: {} };
export const machineSettings = { properties: {}, patternProperties: {} };
export const machineOverridableSettings = { properties: {}, patternProperties: {} };
export const windowSettings = { properties: {}, patternProperties: {} };
export const resourceSettings = { properties: {}, patternProperties: {} };
export const resourceLanguageSettingsSchemaId = 'vscode://schemas/settings/resourceLanguage';
export const configurationDefaultsSchemaId = 'vscode://schemas/settings/configurationDefaults';
const contributionRegistry = Registry.as(JSONExtensions.JSONContribution);
class ConfigurationRegistry extends Disposable {
    constructor() {
        super();
        this.registeredConfigurationDefaults = [];
        this.overrideIdentifiers = new Set();
        this._onDidSchemaChange = this._register(new Emitter());
        this.onDidSchemaChange = this._onDidSchemaChange.event;
        this._onDidUpdateConfiguration = this._register(new Emitter());
        this.onDidUpdateConfiguration = this._onDidUpdateConfiguration.event;
        this.configurationDefaultsOverrides = new Map();
        this.defaultLanguageConfigurationOverridesNode = {
            id: 'defaultOverrides',
            title: nls.localize('defaultLanguageConfigurationOverrides.title', "Default Language Configuration Overrides"),
            properties: {}
        };
        this.configurationContributors = [this.defaultLanguageConfigurationOverridesNode];
        this.resourceLanguageSettingsSchema = {
            properties: {},
            patternProperties: {},
            additionalProperties: true,
            allowTrailingCommas: true,
            allowComments: true
        };
        this.configurationProperties = {};
        this.policyConfigurations = new Map();
        this.excludedConfigurationProperties = {};
        contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
        this.registerOverridePropertyPatternKey();
    }
    registerConfiguration(configuration, validate = true) {
        this.registerConfigurations([configuration], validate);
        return configuration;
    }
    registerConfigurations(configurations, validate = true) {
        const properties = new Set();
        this.doRegisterConfigurations(configurations, validate, properties);
        contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
        this._onDidSchemaChange.fire();
        this._onDidUpdateConfiguration.fire({ properties });
    }
    deregisterConfigurations(configurations) {
        const properties = new Set();
        this.doDeregisterConfigurations(configurations, properties);
        contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
        this._onDidSchemaChange.fire();
        this._onDidUpdateConfiguration.fire({ properties });
    }
    updateConfigurations({ add, remove }) {
        const properties = new Set();
        this.doDeregisterConfigurations(remove, properties);
        this.doRegisterConfigurations(add, false, properties);
        contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
        this._onDidSchemaChange.fire();
        this._onDidUpdateConfiguration.fire({ properties });
    }
    registerDefaultConfigurations(configurationDefaults) {
        const properties = new Set();
        this.doRegisterDefaultConfigurations(configurationDefaults, properties);
        this._onDidSchemaChange.fire();
        this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
    }
    doRegisterDefaultConfigurations(configurationDefaults, bucket) {
        this.registeredConfigurationDefaults.push(...configurationDefaults);
        const overrideIdentifiers = [];
        for (const { overrides, source } of configurationDefaults) {
            for (const key in overrides) {
                bucket.add(key);
                const configurationDefaultOverridesForKey = this.configurationDefaultsOverrides.get(key)
                    ?? this.configurationDefaultsOverrides.set(key, { configurationDefaultOverrides: [] }).get(key);
                const value = overrides[key];
                configurationDefaultOverridesForKey.configurationDefaultOverrides.push({ value, source });
                // Configuration defaults for Override Identifiers
                if (OVERRIDE_PROPERTY_REGEX.test(key)) {
                    const newDefaultOverride = this.mergeDefaultConfigurationsForOverrideIdentifier(key, value, source, configurationDefaultOverridesForKey.configurationDefaultOverrideValue);
                    if (!newDefaultOverride) {
                        continue;
                    }
                    configurationDefaultOverridesForKey.configurationDefaultOverrideValue = newDefaultOverride;
                    this.updateDefaultOverrideProperty(key, newDefaultOverride, source);
                    overrideIdentifiers.push(...overrideIdentifiersFromKey(key));
                }
                // Configuration defaults for Configuration Properties
                else {
                    const newDefaultOverride = this.mergeDefaultConfigurationsForConfigurationProperty(key, value, source, configurationDefaultOverridesForKey.configurationDefaultOverrideValue);
                    if (!newDefaultOverride) {
                        continue;
                    }
                    configurationDefaultOverridesForKey.configurationDefaultOverrideValue = newDefaultOverride;
                    const property = this.configurationProperties[key];
                    if (property) {
                        this.updatePropertyDefaultValue(key, property);
                        this.updateSchema(key, property);
                    }
                }
            }
        }
        this.doRegisterOverrideIdentifiers(overrideIdentifiers);
    }
    deregisterDefaultConfigurations(defaultConfigurations) {
        const properties = new Set();
        this.doDeregisterDefaultConfigurations(defaultConfigurations, properties);
        this._onDidSchemaChange.fire();
        this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
    }
    doDeregisterDefaultConfigurations(defaultConfigurations, bucket) {
        for (const defaultConfiguration of defaultConfigurations) {
            const index = this.registeredConfigurationDefaults.indexOf(defaultConfiguration);
            if (index !== -1) {
                this.registeredConfigurationDefaults.splice(index, 1);
            }
        }
        for (const { overrides, source } of defaultConfigurations) {
            for (const key in overrides) {
                const configurationDefaultOverridesForKey = this.configurationDefaultsOverrides.get(key);
                if (!configurationDefaultOverridesForKey) {
                    continue;
                }
                const index = configurationDefaultOverridesForKey.configurationDefaultOverrides
                    .findIndex(configurationDefaultOverride => source ? isConfigurationDefaultSourceEquals(configurationDefaultOverride.source, source) : configurationDefaultOverride.value === overrides[key]);
                if (index === -1) {
                    continue;
                }
                configurationDefaultOverridesForKey.configurationDefaultOverrides.splice(index, 1);
                if (configurationDefaultOverridesForKey.configurationDefaultOverrides.length === 0) {
                    this.configurationDefaultsOverrides.delete(key);
                }
                if (OVERRIDE_PROPERTY_REGEX.test(key)) {
                    let configurationDefaultOverrideValue;
                    for (const configurationDefaultOverride of configurationDefaultOverridesForKey.configurationDefaultOverrides) {
                        configurationDefaultOverrideValue = this.mergeDefaultConfigurationsForOverrideIdentifier(key, configurationDefaultOverride.value, configurationDefaultOverride.source, configurationDefaultOverrideValue);
                    }
                    if (configurationDefaultOverrideValue && !types.isEmptyObject(configurationDefaultOverrideValue.value)) {
                        configurationDefaultOverridesForKey.configurationDefaultOverrideValue = configurationDefaultOverrideValue;
                        this.updateDefaultOverrideProperty(key, configurationDefaultOverrideValue, source);
                    }
                    else {
                        this.configurationDefaultsOverrides.delete(key);
                        delete this.configurationProperties[key];
                        delete this.defaultLanguageConfigurationOverridesNode.properties[key];
                    }
                }
                else {
                    let configurationDefaultOverrideValue;
                    for (const configurationDefaultOverride of configurationDefaultOverridesForKey.configurationDefaultOverrides) {
                        configurationDefaultOverrideValue = this.mergeDefaultConfigurationsForConfigurationProperty(key, configurationDefaultOverride.value, configurationDefaultOverride.source, configurationDefaultOverrideValue);
                    }
                    configurationDefaultOverridesForKey.configurationDefaultOverrideValue = configurationDefaultOverrideValue;
                    const property = this.configurationProperties[key];
                    if (property) {
                        this.updatePropertyDefaultValue(key, property);
                        this.updateSchema(key, property);
                    }
                }
                bucket.add(key);
            }
        }
        this.updateOverridePropertyPatternKey();
    }
    updateDefaultOverrideProperty(key, newDefaultOverride, source) {
        const property = {
            section: {
                id: this.defaultLanguageConfigurationOverridesNode.id,
                title: this.defaultLanguageConfigurationOverridesNode.title,
                order: this.defaultLanguageConfigurationOverridesNode.order,
                extensionInfo: this.defaultLanguageConfigurationOverridesNode.extensionInfo
            },
            type: 'object',
            default: newDefaultOverride.value,
            description: nls.localize('defaultLanguageConfiguration.description', "Configure settings to be overridden for {0}.", getLanguageTagSettingPlainKey(key)),
            $ref: resourceLanguageSettingsSchemaId,
            defaultDefaultValue: newDefaultOverride.value,
            source,
            defaultValueSource: source
        };
        this.configurationProperties[key] = property;
        this.defaultLanguageConfigurationOverridesNode.properties[key] = property;
    }
    mergeDefaultConfigurationsForOverrideIdentifier(overrideIdentifier, configurationValueObject, valueSource, existingDefaultOverride) {
        const defaultValue = existingDefaultOverride?.value || {};
        const source = existingDefaultOverride?.source ?? new Map();
        // This should not happen
        if (!(source instanceof Map)) {
            console.error('objectConfigurationSources is not a Map');
            return undefined;
        }
        for (const propertyKey of Object.keys(configurationValueObject)) {
            const propertyDefaultValue = configurationValueObject[propertyKey];
            const isObjectSetting = types.isObject(propertyDefaultValue) &&
                (types.isUndefined(defaultValue[propertyKey]) || types.isObject(defaultValue[propertyKey]));
            // If the default value is an object, merge the objects and store the source of each keys
            if (isObjectSetting) {
                defaultValue[propertyKey] = { ...(defaultValue[propertyKey] ?? {}), ...propertyDefaultValue };
                // Track the source of each value in the object
                if (valueSource) {
                    for (const objectKey in propertyDefaultValue) {
                        source.set(`${propertyKey}.${objectKey}`, valueSource);
                    }
                }
            }
            // Primitive values are overridden
            else {
                defaultValue[propertyKey] = propertyDefaultValue;
                if (valueSource) {
                    source.set(propertyKey, valueSource);
                }
                else {
                    source.delete(propertyKey);
                }
            }
        }
        return { value: defaultValue, source };
    }
    mergeDefaultConfigurationsForConfigurationProperty(propertyKey, value, valuesSource, existingDefaultOverride) {
        const property = this.configurationProperties[propertyKey];
        const existingDefaultValue = existingDefaultOverride?.value ?? property?.defaultDefaultValue;
        let source = valuesSource;
        const isObjectSetting = types.isObject(value) &&
            (property !== undefined && property.type === 'object' ||
                property === undefined && (types.isUndefined(existingDefaultValue) || types.isObject(existingDefaultValue)));
        // If the default value is an object, merge the objects and store the source of each keys
        if (isObjectSetting) {
            source = existingDefaultOverride?.source ?? new Map();
            // This should not happen
            if (!(source instanceof Map)) {
                console.error('defaultValueSource is not a Map');
                return undefined;
            }
            for (const objectKey in value) {
                if (valuesSource) {
                    source.set(`${propertyKey}.${objectKey}`, valuesSource);
                }
            }
            value = { ...(types.isObject(existingDefaultValue) ? existingDefaultValue : {}), ...value };
        }
        return { value, source };
    }
    deltaConfiguration(delta) {
        // defaults: remove
        let defaultsOverrides = false;
        const properties = new Set();
        if (delta.removedDefaults) {
            this.doDeregisterDefaultConfigurations(delta.removedDefaults, properties);
            defaultsOverrides = true;
        }
        // defaults: add
        if (delta.addedDefaults) {
            this.doRegisterDefaultConfigurations(delta.addedDefaults, properties);
            defaultsOverrides = true;
        }
        // configurations: remove
        if (delta.removedConfigurations) {
            this.doDeregisterConfigurations(delta.removedConfigurations, properties);
        }
        // configurations: add
        if (delta.addedConfigurations) {
            this.doRegisterConfigurations(delta.addedConfigurations, false, properties);
        }
        this._onDidSchemaChange.fire();
        this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides });
    }
    notifyConfigurationSchemaUpdated(...configurations) {
        this._onDidSchemaChange.fire();
    }
    registerOverrideIdentifiers(overrideIdentifiers) {
        this.doRegisterOverrideIdentifiers(overrideIdentifiers);
        this._onDidSchemaChange.fire();
    }
    doRegisterOverrideIdentifiers(overrideIdentifiers) {
        for (const overrideIdentifier of overrideIdentifiers) {
            this.overrideIdentifiers.add(overrideIdentifier);
        }
        this.updateOverridePropertyPatternKey();
    }
    doRegisterConfigurations(configurations, validate, bucket) {
        configurations.forEach(configuration => {
            this.validateAndRegisterProperties(configuration, validate, configuration.extensionInfo, configuration.restrictedProperties, undefined, bucket);
            this.configurationContributors.push(configuration);
            this.registerJSONConfiguration(configuration);
        });
    }
    doDeregisterConfigurations(configurations, bucket) {
        const deregisterConfiguration = (configuration) => {
            if (configuration.properties) {
                for (const key in configuration.properties) {
                    bucket.add(key);
                    const property = this.configurationProperties[key];
                    if (property?.policy?.name) {
                        this.policyConfigurations.delete(property.policy.name);
                    }
                    delete this.configurationProperties[key];
                    this.removeFromSchema(key, configuration.properties[key]);
                }
            }
            configuration.allOf?.forEach(node => deregisterConfiguration(node));
        };
        for (const configuration of configurations) {
            deregisterConfiguration(configuration);
            const index = this.configurationContributors.indexOf(configuration);
            if (index !== -1) {
                this.configurationContributors.splice(index, 1);
            }
        }
    }
    validateAndRegisterProperties(configuration, validate = true, extensionInfo, restrictedProperties, scope = 4 /* ConfigurationScope.WINDOW */, bucket) {
        scope = types.isUndefinedOrNull(configuration.scope) ? scope : configuration.scope;
        const properties = configuration.properties;
        if (properties) {
            for (const key in properties) {
                const property = properties[key];
                property.section = {
                    id: configuration.id,
                    title: configuration.title,
                    order: configuration.order,
                    extensionInfo: configuration.extensionInfo
                };
                if (validate && validateProperty(key, property, extensionInfo?.id)) {
                    delete properties[key];
                    continue;
                }
                property.source = extensionInfo;
                // update default value
                property.defaultDefaultValue = properties[key].default;
                this.updatePropertyDefaultValue(key, property);
                // update scope
                if (OVERRIDE_PROPERTY_REGEX.test(key)) {
                    property.scope = undefined; // No scope for overridable properties `[${identifier}]`
                }
                else {
                    property.scope = types.isUndefinedOrNull(property.scope) ? scope : property.scope;
                    property.restricted = types.isUndefinedOrNull(property.restricted) ? !!restrictedProperties?.includes(key) : property.restricted;
                }
                if (property.experiment) {
                    if (!property.tags?.some(tag => tag.toLowerCase() === 'onexp')) {
                        property.tags = property.tags ?? [];
                        property.tags.push('onExP');
                    }
                }
                else if (property.tags?.some(tag => tag.toLowerCase() === 'onexp')) {
                    console.error(`Invalid tag 'onExP' found for property '${key}'. Please use 'experiment' property instead.`);
                    property.experiment = { mode: 'startup' };
                }
                const excluded = properties[key].hasOwnProperty('included') && !properties[key].included;
                const policyName = properties[key].policy?.name;
                if (excluded) {
                    this.excludedConfigurationProperties[key] = properties[key];
                    if (policyName) {
                        this.policyConfigurations.set(policyName, key);
                        bucket.add(key);
                    }
                    delete properties[key];
                }
                else {
                    bucket.add(key);
                    if (policyName) {
                        this.policyConfigurations.set(policyName, key);
                    }
                    this.configurationProperties[key] = properties[key];
                    if (!properties[key].deprecationMessage && properties[key].markdownDeprecationMessage) {
                        // If not set, default deprecationMessage to the markdown source
                        properties[key].deprecationMessage = properties[key].markdownDeprecationMessage;
                    }
                }
            }
        }
        const subNodes = configuration.allOf;
        if (subNodes) {
            for (const node of subNodes) {
                this.validateAndRegisterProperties(node, validate, extensionInfo, restrictedProperties, scope, bucket);
            }
        }
    }
    // Only for tests
    getConfigurations() {
        return this.configurationContributors;
    }
    getConfigurationProperties() {
        return this.configurationProperties;
    }
    getPolicyConfigurations() {
        return this.policyConfigurations;
    }
    getExcludedConfigurationProperties() {
        return this.excludedConfigurationProperties;
    }
    getRegisteredDefaultConfigurations() {
        return [...this.registeredConfigurationDefaults];
    }
    getConfigurationDefaultsOverrides() {
        const configurationDefaultsOverrides = new Map();
        for (const [key, value] of this.configurationDefaultsOverrides) {
            if (value.configurationDefaultOverrideValue) {
                configurationDefaultsOverrides.set(key, value.configurationDefaultOverrideValue);
            }
        }
        return configurationDefaultsOverrides;
    }
    registerJSONConfiguration(configuration) {
        const register = (configuration) => {
            const properties = configuration.properties;
            if (properties) {
                for (const key in properties) {
                    this.updateSchema(key, properties[key]);
                }
            }
            const subNodes = configuration.allOf;
            subNodes?.forEach(register);
        };
        register(configuration);
    }
    updateSchema(key, property) {
        allSettings.properties[key] = property;
        switch (property.scope) {
            case 1 /* ConfigurationScope.APPLICATION */:
                applicationSettings.properties[key] = property;
                break;
            case 2 /* ConfigurationScope.MACHINE */:
                machineSettings.properties[key] = property;
                break;
            case 3 /* ConfigurationScope.APPLICATION_MACHINE */:
                applicationMachineSettings.properties[key] = property;
                break;
            case 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */:
                machineOverridableSettings.properties[key] = property;
                break;
            case 4 /* ConfigurationScope.WINDOW */:
                windowSettings.properties[key] = property;
                break;
            case 5 /* ConfigurationScope.RESOURCE */:
                resourceSettings.properties[key] = property;
                break;
            case 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */:
                resourceSettings.properties[key] = property;
                this.resourceLanguageSettingsSchema.properties[key] = property;
                break;
        }
    }
    removeFromSchema(key, property) {
        delete allSettings.properties[key];
        switch (property.scope) {
            case 1 /* ConfigurationScope.APPLICATION */:
                delete applicationSettings.properties[key];
                break;
            case 2 /* ConfigurationScope.MACHINE */:
                delete machineSettings.properties[key];
                break;
            case 3 /* ConfigurationScope.APPLICATION_MACHINE */:
                delete applicationMachineSettings.properties[key];
                break;
            case 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */:
                delete machineOverridableSettings.properties[key];
                break;
            case 4 /* ConfigurationScope.WINDOW */:
                delete windowSettings.properties[key];
                break;
            case 5 /* ConfigurationScope.RESOURCE */:
            case 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */:
                delete resourceSettings.properties[key];
                delete this.resourceLanguageSettingsSchema.properties[key];
                break;
        }
    }
    updateOverridePropertyPatternKey() {
        for (const overrideIdentifier of this.overrideIdentifiers.values()) {
            const overrideIdentifierProperty = `[${overrideIdentifier}]`;
            const resourceLanguagePropertiesSchema = {
                type: 'object',
                description: nls.localize('overrideSettings.defaultDescription', "Configure editor settings to be overridden for a language."),
                errorMessage: nls.localize('overrideSettings.errorMessage', "This setting does not support per-language configuration."),
                $ref: resourceLanguageSettingsSchemaId,
            };
            this.updatePropertyDefaultValue(overrideIdentifierProperty, resourceLanguagePropertiesSchema);
            allSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
            applicationSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
            applicationMachineSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
            machineSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
            machineOverridableSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
            windowSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
            resourceSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
        }
    }
    registerOverridePropertyPatternKey() {
        const resourceLanguagePropertiesSchema = {
            type: 'object',
            description: nls.localize('overrideSettings.defaultDescription', "Configure editor settings to be overridden for a language."),
            errorMessage: nls.localize('overrideSettings.errorMessage', "This setting does not support per-language configuration."),
            $ref: resourceLanguageSettingsSchemaId,
        };
        allSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
        applicationSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
        applicationMachineSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
        machineSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
        machineOverridableSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
        windowSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
        resourceSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
        this._onDidSchemaChange.fire();
    }
    updatePropertyDefaultValue(key, property) {
        const configurationdefaultOverride = this.configurationDefaultsOverrides.get(key)?.configurationDefaultOverrideValue;
        let defaultValue = undefined;
        let defaultSource = undefined;
        if (configurationdefaultOverride
            && (!property.disallowConfigurationDefault || !configurationdefaultOverride.source) // Prevent overriding the default value if the property is disallowed to be overridden by configuration defaults from extensions
        ) {
            defaultValue = configurationdefaultOverride.value;
            defaultSource = configurationdefaultOverride.source;
        }
        if (types.isUndefined(defaultValue)) {
            defaultValue = property.defaultDefaultValue;
            defaultSource = undefined;
        }
        if (types.isUndefined(defaultValue)) {
            defaultValue = getDefaultValue(property.type);
        }
        property.default = defaultValue;
        property.defaultValueSource = defaultSource;
    }
}
const OVERRIDE_IDENTIFIER_PATTERN = `\\[([^\\]]+)\\]`;
const OVERRIDE_IDENTIFIER_REGEX = new RegExp(OVERRIDE_IDENTIFIER_PATTERN, 'g');
export const OVERRIDE_PROPERTY_PATTERN = `^(${OVERRIDE_IDENTIFIER_PATTERN})+$`;
export const OVERRIDE_PROPERTY_REGEX = new RegExp(OVERRIDE_PROPERTY_PATTERN);
export function overrideIdentifiersFromKey(key) {
    const identifiers = [];
    if (OVERRIDE_PROPERTY_REGEX.test(key)) {
        let matches = OVERRIDE_IDENTIFIER_REGEX.exec(key);
        while (matches?.length) {
            const identifier = matches[1].trim();
            if (identifier) {
                identifiers.push(identifier);
            }
            matches = OVERRIDE_IDENTIFIER_REGEX.exec(key);
        }
    }
    return distinct(identifiers);
}
export function keyFromOverrideIdentifiers(overrideIdentifiers) {
    return overrideIdentifiers.reduce((result, overrideIdentifier) => `${result}[${overrideIdentifier}]`, '');
}
export function getDefaultValue(type) {
    const t = Array.isArray(type) ? type[0] : type;
    switch (t) {
        case 'boolean':
            return false;
        case 'integer':
        case 'number':
            return 0;
        case 'string':
            return '';
        case 'array':
            return [];
        case 'object':
            return {};
        default:
            return null;
    }
}
const configurationRegistry = new ConfigurationRegistry();
Registry.add(Extensions.Configuration, configurationRegistry);
export function validateProperty(property, schema, extensionId) {
    if (!property.trim()) {
        return nls.localize('config.property.empty', "Cannot register an empty property");
    }
    if (OVERRIDE_PROPERTY_REGEX.test(property)) {
        return nls.localize('config.property.languageDefault', "Cannot register '{0}'. This matches property pattern '\\\\[.*\\\\]$' for describing language specific editor settings. Use 'configurationDefaults' contribution.", property);
    }
    if (configurationRegistry.getConfigurationProperties()[property] !== undefined && (!extensionId || !EXTENSION_UNIFICATION_EXTENSION_IDS.has(extensionId.toLowerCase()))) {
        return nls.localize('config.property.duplicate', "Cannot register '{0}'. This property is already registered.", property);
    }
    if (schema.policy?.name && configurationRegistry.getPolicyConfigurations().get(schema.policy?.name) !== undefined) {
        return nls.localize('config.policy.duplicate', "Cannot register '{0}'. The associated policy {1} is already registered with {2}.", property, schema.policy?.name, configurationRegistry.getPolicyConfigurations().get(schema.policy?.name));
    }
    return null;
}
export function getScopes() {
    const scopes = [];
    const configurationProperties = configurationRegistry.getConfigurationProperties();
    for (const key of Object.keys(configurationProperties)) {
        scopes.push([key, configurationProperties[key].scope]);
    }
    scopes.push(['launch', 5 /* ConfigurationScope.RESOURCE */]);
    scopes.push(['task', 5 /* ConfigurationScope.RESOURCE */]);
    return scopes;
}
export function getAllConfigurationProperties(configurationNode) {
    const result = {};
    for (const configuration of configurationNode) {
        const properties = configuration.properties;
        if (types.isObject(properties)) {
            for (const key in properties) {
                result[key] = properties[key];
            }
        }
        if (configuration.allOf) {
            Object.assign(result, getAllConfigurationProperties(configuration.allOf));
        }
    }
    return result;
}
export function parseScope(scope) {
    switch (scope) {
        case 'application':
            return 1 /* ConfigurationScope.APPLICATION */;
        case 'machine':
            return 2 /* ConfigurationScope.MACHINE */;
        case 'resource':
            return 5 /* ConfigurationScope.RESOURCE */;
        case 'machine-overridable':
            return 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */;
        case 'language-overridable':
            return 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */;
        default:
            return 4 /* ConfigurationScope.WINDOW */;
    }
}
// Used for extension unification. Should be removed when complete.
export const EXTENSION_UNIFICATION_EXTENSION_IDS = new Set(product.defaultChatAgent ? [product.defaultChatAgent.extensionId, product.defaultChatAgent.chatExtensionId].map(id => id.toLowerCase()) : []);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUxRCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFFL0QsT0FBTyxLQUFLLEtBQUssTUFBTSwrQkFBK0IsQ0FBQztBQUN2RCxPQUFPLEtBQUssR0FBRyxNQUFNLGlCQUFpQixDQUFDO0FBQ3ZDLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ25FLE9BQU8sRUFBRSxVQUFVLElBQUksY0FBYyxFQUE2QixNQUFNLHNEQUFzRCxDQUFDO0FBQy9ILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxPQUFPLE1BQU0saUNBQWlDLENBQUM7QUFFdEQsTUFBTSxDQUFOLElBQVkscUJBR1g7QUFIRCxXQUFZLHFCQUFxQjtJQUNoQyxvREFBMkIsQ0FBQTtJQUMzQixzREFBNkIsQ0FBQTtBQUM5QixDQUFDLEVBSFcscUJBQXFCLEtBQXJCLHFCQUFxQixRQUdoQztBQUVELE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRztJQUN6QixhQUFhLEVBQUUsa0NBQWtDO0NBQ2pELENBQUM7QUF1R0YsTUFBTSxDQUFOLElBQWtCLGtCQTZCakI7QUE3QkQsV0FBa0Isa0JBQWtCO0lBQ25DOztPQUVHO0lBQ0gseUVBQWUsQ0FBQTtJQUNmOztPQUVHO0lBQ0gsaUVBQU8sQ0FBQTtJQUNQOztPQUVHO0lBQ0gseUZB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