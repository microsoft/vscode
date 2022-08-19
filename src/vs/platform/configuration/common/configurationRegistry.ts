/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as types from 'vs/base/common/types';
import * as nls from 'vs/nls';
import { getLanguageTagSettingPlainKey } from 'vs/platform/configuration/common/configuration';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { PolicyName } from 'vs/platform/policy/common/policy';
import { Registry } from 'vs/platform/registry/common/platform';

export enum EditPresentationTypes {
	Multiline = 'multilineText',
	Singleline = 'singlelineText'
}

export const Extensions = {
	Configuration: 'base.contributions.configuration'
};

export interface IConfigurationRegistry {

	/**
	 * Register a configuration to the registry.
	 */
	registerConfiguration(configuration: IConfigurationNode): void;

	/**
	 * Register multiple configurations to the registry.
	 */
	registerConfigurations(configurations: IConfigurationNode[], validate?: boolean): void;

	/**
	 * Deregister multiple configurations from the registry.
	 */
	deregisterConfigurations(configurations: IConfigurationNode[]): void;

	/**
	 * update the configuration registry by
	 * 	- registering the configurations to add
	 * 	- dereigstering the configurations to remove
	 */
	updateConfigurations(configurations: { add: IConfigurationNode[]; remove: IConfigurationNode[] }): void;

	/**
	 * Register multiple default configurations to the registry.
	 */
	registerDefaultConfigurations(defaultConfigurations: IConfigurationDefaults[]): void;

	/**
	 * Deregister multiple default configurations from the registry.
	 */
	deregisterDefaultConfigurations(defaultConfigurations: IConfigurationDefaults[]): void;

	/**
	 * Return the registered configuration defaults overrides
	 */
	getConfigurationDefaultsOverrides(): Map<string, IConfigurationDefaultOverride>;

	/**
	 * Signal that the schema of a configuration setting has changes. It is currently only supported to change enumeration values.
	 * Property or default value changes are not allowed.
	 */
	notifyConfigurationSchemaUpdated(...configurations: IConfigurationNode[]): void;

	/**
	 * Event that fires whenever a configuration has been
	 * registered.
	 */
	readonly onDidSchemaChange: Event<void>;

	/**
	 * Event that fires whenever a configuration has been
	 * registered.
	 */
	readonly onDidUpdateConfiguration: Event<{ properties: string[]; defaultsOverrides?: boolean }>;

	/**
	 * Returns all configuration nodes contributed to this registry.
	 */
	getConfigurations(): IConfigurationNode[];

	/**
	 * Returns all configurations settings of all configuration nodes contributed to this registry.
	 */
	getConfigurationProperties(): IStringDictionary<IRegisteredConfigurationPropertySchema>;

	/**
	 * Return all configurations by policy name
	 */
	getPolicyConfigurations(): Map<PolicyName, string>;

	/**
	 * Returns all excluded configurations settings of all configuration nodes contributed to this registry.
	 */
	getExcludedConfigurationProperties(): IStringDictionary<IRegisteredConfigurationPropertySchema>;

	/**
	 * Register the identifiers for editor configurations
	 */
	registerOverrideIdentifiers(identifiers: string[]): void;
}

export const enum ConfigurationScope {
	/**
	 * Application specific configuration, which can be configured only in local user settings.
	 */
	APPLICATION = 1,
	/**
	 * Machine specific configuration, which can be configured only in local and remote user settings.
	 */
	MACHINE,
	/**
	 * Window specific configuration, which can be configured in the user or workspace settings.
	 */
	WINDOW,
	/**
	 * Resource specific configuration, which can be configured in the user, workspace or folder settings.
	 */
	RESOURCE,
	/**
	 * Resource specific configuration that can be configured in language specific settings
	 */
	LANGUAGE_OVERRIDABLE,
	/**
	 * Machine specific configuration that can also be configured in workspace or folder settings.
	 */
	MACHINE_OVERRIDABLE,
}

export interface IPolicy {

	/**
	 * The policy name.
	 */
	readonly name: PolicyName;

	/**
	 * The Code version in which this policy was introduced.
	 */
	readonly minimumVersion: `${number}.${number}`;
}

export interface IConfigurationPropertySchema extends IJSONSchema {

	scope?: ConfigurationScope;

	/**
	 * When restricted, value of this configuration will be read only from trusted sources.
	 * For eg., If the workspace is not trusted, then the value of this configuration is not read from workspace settings file.
	 */
	restricted?: boolean;

	/**
	 * When `false` this property is excluded from the registry. Default is to include.
	 */
	included?: boolean;

	/**
	 * List of tags associated to the property.
	 *  - A tag can be used for filtering
	 *  - Use `experimental` tag for marking the setting as experimental. **Note:** Defaults of experimental settings can be changed by the running experiments.
	 */
	tags?: string[];

	/**
	 * When enabled this setting is ignored during sync and user can override this.
	 */
	ignoreSync?: boolean;

	/**
	 * When enabled this setting is ignored during sync and user cannot override this.
	 */
	disallowSyncIgnore?: boolean;

	/**
	 * Labels for enumeration items
	 */
	enumItemLabels?: string[];

	/**
	 * When specified, controls the presentation format of string settings.
	 * Otherwise, the presentation format defaults to `singleline`.
	 */
	editPresentation?: EditPresentationTypes;

	/**
	 * When specified, gives an order number for the setting
	 * within the settings editor. Otherwise, the setting is placed at the end.
	 */
	order?: number;

	/**
	 * When specified, this setting's value can always be overwritten by
	 * a system-wide policy.
	 */
	policy?: IPolicy;
}

export interface IExtensionInfo {
	id: string;
	displayName?: string;
}

export interface IConfigurationNode {
	id?: string;
	order?: number;
	type?: string | string[];
	title?: string;
	description?: string;
	properties?: IStringDictionary<IConfigurationPropertySchema>;
	allOf?: IConfigurationNode[];
	scope?: ConfigurationScope;
	extensionInfo?: IExtensionInfo;
	restrictedProperties?: string[];
}

export interface IConfigurationDefaults {
	overrides: IStringDictionary<any>;
	source?: IExtensionInfo | string;
}

export type IRegisteredConfigurationPropertySchema = IConfigurationPropertySchema & {
	defaultDefaultValue?: any;
	source?: IExtensionInfo; // Source of the Property
	defaultValueSource?: IExtensionInfo | string; // Source of the Default Value
};

export type IConfigurationDefaultOverride = {
	readonly value: any;
	readonly source?: IExtensionInfo | string;  // Source of the default override
	readonly valuesSources?: Map<string, IExtensionInfo | string>; // Source of each value in default language overrides
};

export const allSettings: { properties: IStringDictionary<IConfigurationPropertySchema>; patternProperties: IStringDictionary<IConfigurationPropertySchema> } = { properties: {}, patternProperties: {} };
export const applicationSettings: { properties: IStringDictionary<IConfigurationPropertySchema>; patternProperties: IStringDictionary<IConfigurationPropertySchema> } = { properties: {}, patternProperties: {} };
export const machineSettings: { properties: IStringDictionary<IConfigurationPropertySchema>; patternProperties: IStringDictionary<IConfigurationPropertySchema> } = { properties: {}, patternProperties: {} };
export const machineOverridableSettings: { properties: IStringDictionary<IConfigurationPropertySchema>; patternProperties: IStringDictionary<IConfigurationPropertySchema> } = { properties: {}, patternProperties: {} };
export const windowSettings: { properties: IStringDictionary<IConfigurationPropertySchema>; patternProperties: IStringDictionary<IConfigurationPropertySchema> } = { properties: {}, patternProperties: {} };
export const resourceSettings: { properties: IStringDictionary<IConfigurationPropertySchema>; patternProperties: IStringDictionary<IConfigurationPropertySchema> } = { properties: {}, patternProperties: {} };

export const resourceLanguageSettingsSchemaId = 'vscode://schemas/settings/resourceLanguage';
export const configurationDefaultsSchemaId = 'vscode://schemas/settings/configurationDefaults';

const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

class ConfigurationRegistry implements IConfigurationRegistry {

	private readonly configurationDefaultsOverrides: Map<string, IConfigurationDefaultOverride>;
	private readonly defaultLanguageConfigurationOverridesNode: IConfigurationNode;
	private readonly configurationContributors: IConfigurationNode[];
	private readonly configurationProperties: IStringDictionary<IRegisteredConfigurationPropertySchema>;
	private readonly policyConfigurations: Map<PolicyName, string>;
	private readonly excludedConfigurationProperties: IStringDictionary<IRegisteredConfigurationPropertySchema>;
	private readonly resourceLanguageSettingsSchema: IJSONSchema;
	private readonly overrideIdentifiers = new Set<string>();

	private readonly _onDidSchemaChange = new Emitter<void>();
	readonly onDidSchemaChange: Event<void> = this._onDidSchemaChange.event;

	private readonly _onDidUpdateConfiguration = new Emitter<{ properties: string[]; defaultsOverrides?: boolean }>();
	readonly onDidUpdateConfiguration = this._onDidUpdateConfiguration.event;

	constructor() {
		this.configurationDefaultsOverrides = new Map<string, IConfigurationDefaultOverride>();
		this.defaultLanguageConfigurationOverridesNode = {
			id: 'defaultOverrides',
			title: nls.localize('defaultLanguageConfigurationOverrides.title', "Default Language Configuration Overrides"),
			properties: {}
		};
		this.configurationContributors = [this.defaultLanguageConfigurationOverridesNode];
		this.resourceLanguageSettingsSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown editor configuration setting', allowTrailingCommas: true, allowComments: true };
		this.configurationProperties = {};
		this.policyConfigurations = new Map<PolicyName, string>();
		this.excludedConfigurationProperties = {};

		contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
		this.registerOverridePropertyPatternKey();
	}

	public registerConfiguration(configuration: IConfigurationNode, validate: boolean = true): void {
		this.registerConfigurations([configuration], validate);
	}

	public registerConfigurations(configurations: IConfigurationNode[], validate: boolean = true): void {
		const properties = this.doRegisterConfigurations(configurations, validate);

		contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire({ properties });
	}

	public deregisterConfigurations(configurations: IConfigurationNode[]): void {
		const properties = this.doDeregisterConfigurations(configurations);

		contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire({ properties });
	}

	public updateConfigurations({ add, remove }: { add: IConfigurationNode[]; remove: IConfigurationNode[] }): void {
		const properties = [];
		properties.push(...this.doDeregisterConfigurations(remove));
		properties.push(...this.doRegisterConfigurations(add, false));

		contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire({ properties: distinct(properties) });
	}

	public registerDefaultConfigurations(configurationDefaults: IConfigurationDefaults[]): void {
		const properties: string[] = [];
		const overrideIdentifiers: string[] = [];

		for (const { overrides, source } of configurationDefaults) {
			for (const key in overrides) {
				properties.push(key);

				if (OVERRIDE_PROPERTY_REGEX.test(key)) {
					const configurationDefaultOverride = this.configurationDefaultsOverrides.get(key);
					const valuesSources = configurationDefaultOverride?.valuesSources ?? new Map<string, IExtensionInfo | string>();
					if (source) {
						for (const configuration of Object.keys(overrides[key])) {
							valuesSources.set(configuration, source);
						}
					}
					const defaultValue = { ...(configurationDefaultOverride?.value || {}), ...overrides[key] };
					this.configurationDefaultsOverrides.set(key, { source, value: defaultValue, valuesSources });
					const plainKey = getLanguageTagSettingPlainKey(key);
					const property: IRegisteredConfigurationPropertySchema = {
						type: 'object',
						default: defaultValue,
						description: nls.localize('defaultLanguageConfiguration.description', "Configure settings to be overridden for the {0} language.", plainKey),
						$ref: resourceLanguageSettingsSchemaId,
						defaultDefaultValue: defaultValue,
						source: types.isString(source) ? undefined : source,
						defaultValueSource: source
					};
					overrideIdentifiers.push(...overrideIdentifiersFromKey(key));
					this.configurationProperties[key] = property;
					this.defaultLanguageConfigurationOverridesNode.properties![key] = property;
				} else {
					this.configurationDefaultsOverrides.set(key, { value: overrides[key], source });
					const property = this.configurationProperties[key];
					if (property) {
						this.updatePropertyDefaultValue(key, property);
						this.updateSchema(key, property);
					}
				}
			}
		}

		this.registerOverrideIdentifiers(overrideIdentifiers);
		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
	}

	public deregisterDefaultConfigurations(defaultConfigurations: IConfigurationDefaults[]): void {
		const properties: string[] = [];
		for (const { overrides, source } of defaultConfigurations) {
			for (const key in overrides) {
				const configurationDefaultsOverride = this.configurationDefaultsOverrides.get(key);
				const id = types.isString(source) ? source : source?.id;
				const configurationDefaultsOverrideSourceId = types.isString(configurationDefaultsOverride?.source) ? configurationDefaultsOverride?.source : configurationDefaultsOverride?.source?.id;
				if (id !== configurationDefaultsOverrideSourceId) {
					continue;
				}
				properties.push(key);
				this.configurationDefaultsOverrides.delete(key);
				if (OVERRIDE_PROPERTY_REGEX.test(key)) {
					delete this.configurationProperties[key];
					delete this.defaultLanguageConfigurationOverridesNode.properties![key];
				} else {
					const property = this.configurationProperties[key];
					if (property) {
						this.updatePropertyDefaultValue(key, property);
						this.updateSchema(key, property);
					}
				}
			}
		}

		this.updateOverridePropertyPatternKey();
		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
	}

	public notifyConfigurationSchemaUpdated(...configurations: IConfigurationNode[]) {
		this._onDidSchemaChange.fire();
	}

	public registerOverrideIdentifiers(overrideIdentifiers: string[]): void {
		for (const overrideIdentifier of overrideIdentifiers) {
			this.overrideIdentifiers.add(overrideIdentifier);
		}
		this.updateOverridePropertyPatternKey();
	}

	private doRegisterConfigurations(configurations: IConfigurationNode[], validate: boolean): string[] {
		const properties: string[] = [];
		configurations.forEach(configuration => {
			properties.push(...this.validateAndRegisterProperties(configuration, validate, configuration.extensionInfo, configuration.restrictedProperties)); // fills in defaults
			this.configurationContributors.push(configuration);
			this.registerJSONConfiguration(configuration);
		});
		return properties;
	}

	private doDeregisterConfigurations(configurations: IConfigurationNode[]): string[] {
		const properties: string[] = [];
		const deregisterConfiguration = (configuration: IConfigurationNode) => {
			if (configuration.properties) {
				for (const key in configuration.properties) {
					properties.push(key);
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
		return properties;
	}

	private validateAndRegisterProperties(configuration: IConfigurationNode, validate: boolean = true, extensionInfo: IExtensionInfo | undefined, restrictedProperties: string[] | undefined, scope: ConfigurationScope = ConfigurationScope.WINDOW): string[] {
		scope = types.isUndefinedOrNull(configuration.scope) ? scope : configuration.scope;
		const propertyKeys: string[] = [];
		const properties = configuration.properties;
		if (properties) {
			for (const key in properties) {
				const property: IRegisteredConfigurationPropertySchema = properties[key];
				if (validate && validateProperty(key, property)) {
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
				} else {
					property.scope = types.isUndefinedOrNull(property.scope) ? scope : property.scope;
					property.restricted = types.isUndefinedOrNull(property.restricted) ? !!restrictedProperties?.includes(key) : property.restricted;
				}

				// Add to properties maps
				// Property is included by default if 'included' is unspecified
				if (properties[key].hasOwnProperty('included') && !properties[key].included) {
					this.excludedConfigurationProperties[key] = properties[key];
					delete properties[key];
					continue;
				} else {
					this.configurationProperties[key] = properties[key];
					if (properties[key].policy?.name) {
						this.policyConfigurations.set(properties[key].policy!.name, key);
					}
				}

				if (!properties[key].deprecationMessage && properties[key].markdownDeprecationMessage) {
					// If not set, default deprecationMessage to the markdown source
					properties[key].deprecationMessage = properties[key].markdownDeprecationMessage;
				}

				propertyKeys.push(key);
			}
		}
		const subNodes = configuration.allOf;
		if (subNodes) {
			for (const node of subNodes) {
				propertyKeys.push(...this.validateAndRegisterProperties(node, validate, extensionInfo, restrictedProperties, scope));
			}
		}
		return propertyKeys;
	}

	// TODO: @sandy081 - Remove this method and include required info in getConfigurationProperties
	getConfigurations(): IConfigurationNode[] {
		return this.configurationContributors;
	}

	getConfigurationProperties(): IStringDictionary<IRegisteredConfigurationPropertySchema> {
		return this.configurationProperties;
	}

	getPolicyConfigurations(): Map<PolicyName, string> {
		return this.policyConfigurations;
	}

	getExcludedConfigurationProperties(): IStringDictionary<IRegisteredConfigurationPropertySchema> {
		return this.excludedConfigurationProperties;
	}

	getConfigurationDefaultsOverrides(): Map<string, IConfigurationDefaultOverride> {
		return this.configurationDefaultsOverrides;
	}

	private registerJSONConfiguration(configuration: IConfigurationNode) {
		const register = (configuration: IConfigurationNode) => {
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

	private updateSchema(key: string, property: IConfigurationPropertySchema): void {
		allSettings.properties[key] = property;
		switch (property.scope) {
			case ConfigurationScope.APPLICATION:
				applicationSettings.properties[key] = property;
				break;
			case ConfigurationScope.MACHINE:
				machineSettings.properties[key] = property;
				break;
			case ConfigurationScope.MACHINE_OVERRIDABLE:
				machineOverridableSettings.properties[key] = property;
				break;
			case ConfigurationScope.WINDOW:
				windowSettings.properties[key] = property;
				break;
			case ConfigurationScope.RESOURCE:
				resourceSettings.properties[key] = property;
				break;
			case ConfigurationScope.LANGUAGE_OVERRIDABLE:
				resourceSettings.properties[key] = property;
				this.resourceLanguageSettingsSchema.properties![key] = property;
				break;
		}
	}

	private removeFromSchema(key: string, property: IConfigurationPropertySchema): void {
		delete allSettings.properties[key];
		switch (property.scope) {
			case ConfigurationScope.APPLICATION:
				delete applicationSettings.properties[key];
				break;
			case ConfigurationScope.MACHINE:
				delete machineSettings.properties[key];
				break;
			case ConfigurationScope.MACHINE_OVERRIDABLE:
				delete machineOverridableSettings.properties[key];
				break;
			case ConfigurationScope.WINDOW:
				delete windowSettings.properties[key];
				break;
			case ConfigurationScope.RESOURCE:
			case ConfigurationScope.LANGUAGE_OVERRIDABLE:
				delete resourceSettings.properties[key];
				delete this.resourceLanguageSettingsSchema.properties![key];
				break;
		}
	}

	private updateOverridePropertyPatternKey(): void {
		for (const overrideIdentifier of this.overrideIdentifiers.values()) {
			const overrideIdentifierProperty = `[${overrideIdentifier}]`;
			const resourceLanguagePropertiesSchema: IJSONSchema = {
				type: 'object',
				description: nls.localize('overrideSettings.defaultDescription', "Configure editor settings to be overridden for a language."),
				errorMessage: nls.localize('overrideSettings.errorMessage', "This setting does not support per-language configuration."),
				$ref: resourceLanguageSettingsSchemaId,
			};
			this.updatePropertyDefaultValue(overrideIdentifierProperty, resourceLanguagePropertiesSchema);
			allSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
			applicationSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
			machineSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
			machineOverridableSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
			windowSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
			resourceSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
		}
		this._onDidSchemaChange.fire();
	}

	private registerOverridePropertyPatternKey(): void {
		const resourceLanguagePropertiesSchema: IJSONSchema = {
			type: 'object',
			description: nls.localize('overrideSettings.defaultDescription', "Configure editor settings to be overridden for a language."),
			errorMessage: nls.localize('overrideSettings.errorMessage', "This setting does not support per-language configuration."),
			$ref: resourceLanguageSettingsSchemaId,
		};
		allSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
		applicationSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
		machineSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
		machineOverridableSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
		windowSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
		resourceSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
		this._onDidSchemaChange.fire();
	}

	private updatePropertyDefaultValue(key: string, property: IRegisteredConfigurationPropertySchema): void {
		const configurationdefaultOverride = this.configurationDefaultsOverrides.get(key);
		let defaultValue = configurationdefaultOverride?.value;
		let defaultSource = configurationdefaultOverride?.source;
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

export function overrideIdentifiersFromKey(key: string): string[] {
	const identifiers: string[] = [];
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

export function keyFromOverrideIdentifiers(overrideIdentifiers: string[]): string {
	return overrideIdentifiers.reduce((result, overrideIdentifier) => `${result}[${overrideIdentifier}]`, '');
}

export function getDefaultValue(type: string | string[] | undefined): any {
	const t = Array.isArray(type) ? (<string[]>type)[0] : <string>type;
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

export function validateProperty(property: string, schema: IRegisteredConfigurationPropertySchema): string | null {
	if (!property.trim()) {
		return nls.localize('config.property.empty', "Cannot register an empty property");
	}
	if (OVERRIDE_PROPERTY_REGEX.test(property)) {
		return nls.localize('config.property.languageDefault', "Cannot register '{0}'. This matches property pattern '\\\\[.*\\\\]$' for describing language specific editor settings. Use 'configurationDefaults' contribution.", property);
	}
	if (configurationRegistry.getConfigurationProperties()[property] !== undefined) {
		return nls.localize('config.property.duplicate', "Cannot register '{0}'. This property is already registered.", property);
	}
	if (schema.policy?.name && configurationRegistry.getPolicyConfigurations().get(schema.policy?.name) !== undefined) {
		return nls.localize('config.policy.duplicate', "Cannot register '{0}'. The associated policy {1} is already registered with {2}.", property, schema.policy?.name, configurationRegistry.getPolicyConfigurations().get(schema.policy?.name));
	}
	return null;
}

export function getScopes(): [string, ConfigurationScope | undefined][] {
	const scopes: [string, ConfigurationScope | undefined][] = [];
	const configurationProperties = configurationRegistry.getConfigurationProperties();
	for (const key of Object.keys(configurationProperties)) {
		scopes.push([key, configurationProperties[key].scope]);
	}
	scopes.push(['launch', ConfigurationScope.RESOURCE]);
	scopes.push(['task', ConfigurationScope.RESOURCE]);
	return scopes;
}
