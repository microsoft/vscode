/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/registry/common/platform';
import * as types from 'vs/base/common/types';
import * as strings from 'vs/base/common/strings';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

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
	 * Register multiple default configurations to the registry.
	 */
	registerDefaultConfigurations(defaultConfigurations: IDefaultConfigurationExtension[]): void;

	/**
	 * Deregister multiple default configurations from the registry.
	 */
	deregisterDefaultConfigurations(defaultConfigurations: IDefaultConfigurationExtension[]): void;

	/**
	 * Signal that the schema of a configuration setting has changes. It is currently only supported to change enumeration values.
	 * Property or default value changes are not allowed.
	 */
	notifyConfigurationSchemaUpdated(...configurations: IConfigurationNode[]): void;

	/**
	 * Event that fires whenver a configuration has been
	 * registered.
	 */
	onDidSchemaChange: Event<void>;

	/**
	 * Event that fires whenver a configuration has been
	 * registered.
	 */
	onDidUpdateConfiguration: Event<string[]>;

	/**
	 * Returns all configuration nodes contributed to this registry.
	 */
	getConfigurations(): IConfigurationNode[];

	/**
	 * Returns all configurations settings of all configuration nodes contributed to this registry.
	 */
	getConfigurationProperties(): { [qualifiedKey: string]: IConfigurationPropertySchema };

	/**
	 * Returns all excluded configurations settings of all configuration nodes contributed to this registry.
	 */
	getExcludedConfigurationProperties(): { [qualifiedKey: string]: IConfigurationPropertySchema };

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
	 * Machine specific configuration that can also be configured in workspace or folder settings.
	 */
	MACHINE_OVERRIDABLE,
}

export interface IConfigurationPropertySchema extends IJSONSchema {
	overridable?: boolean;
	scope?: ConfigurationScope;
	included?: boolean;
	tags?: string[];
}

export interface IConfigurationExtensionInfo {
	id: string;
}

export interface IConfigurationNode {
	id?: string;
	order?: number;
	type?: string | string[];
	title?: string;
	description?: string;
	properties?: { [path: string]: IConfigurationPropertySchema; };
	allOf?: IConfigurationNode[];
	overridable?: boolean;
	scope?: ConfigurationScope;
	extensionInfo?: IConfigurationExtensionInfo;
}

export interface IDefaultConfigurationExtension {
	id: ExtensionIdentifier;
	name: string;
	defaults: { [key: string]: {} };
}

type SettingProperties = { [key: string]: any };

export const allSettings: { properties: SettingProperties, patternProperties: SettingProperties } = { properties: {}, patternProperties: {} };
export const applicationSettings: { properties: SettingProperties, patternProperties: SettingProperties } = { properties: {}, patternProperties: {} };
export const machineSettings: { properties: SettingProperties, patternProperties: SettingProperties } = { properties: {}, patternProperties: {} };
export const windowSettings: { properties: SettingProperties, patternProperties: SettingProperties } = { properties: {}, patternProperties: {} };
export const resourceSettings: { properties: SettingProperties, patternProperties: SettingProperties } = { properties: {}, patternProperties: {} };

export const editorConfigurationSchemaId = 'vscode://schemas/settings/editor';
const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

class ConfigurationRegistry implements IConfigurationRegistry {

	private readonly defaultOverridesConfigurationNode: IConfigurationNode;
	private readonly configurationContributors: IConfigurationNode[];
	private readonly configurationProperties: { [qualifiedKey: string]: IJSONSchema };
	private readonly excludedConfigurationProperties: { [qualifiedKey: string]: IJSONSchema };
	private readonly editorConfigurationSchema: IJSONSchema;
	private readonly overrideIdentifiers: string[] = [];
	private overridePropertyPattern: string;

	private readonly _onDidSchemaChange = new Emitter<void>();
	readonly onDidSchemaChange: Event<void> = this._onDidSchemaChange.event;

	private readonly _onDidUpdateConfiguration: Emitter<string[]> = new Emitter<string[]>();
	readonly onDidUpdateConfiguration: Event<string[]> = this._onDidUpdateConfiguration.event;

	constructor() {
		this.defaultOverridesConfigurationNode = {
			id: 'defaultOverrides',
			title: nls.localize('defaultConfigurations.title', "Default Configuration Overrides"),
			properties: {}
		};
		this.configurationContributors = [this.defaultOverridesConfigurationNode];
		this.editorConfigurationSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown editor configuration setting' };
		this.configurationProperties = {};
		this.excludedConfigurationProperties = {};
		this.computeOverridePropertyPattern();

		contributionRegistry.registerSchema(editorConfigurationSchemaId, this.editorConfigurationSchema);
	}

	public registerConfiguration(configuration: IConfigurationNode, validate: boolean = true): void {
		this.registerConfigurations([configuration], validate);
	}

	public registerConfigurations(configurations: IConfigurationNode[], validate: boolean = true): void {
		const properties: string[] = [];
		configurations.forEach(configuration => {
			properties.push(...this.validateAndRegisterProperties(configuration, validate)); // fills in defaults
			this.configurationContributors.push(configuration);
			this.registerJSONConfiguration(configuration);
			this.updateSchemaForOverrideSettingsConfiguration(configuration);
		});

		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire(properties);
	}

	public deregisterConfigurations(configurations: IConfigurationNode[]): void {
		const properties: string[] = [];
		const deregisterConfiguration = (configuration: IConfigurationNode) => {
			if (configuration.properties) {
				for (const key in configuration.properties) {
					properties.push(key);

					delete this.configurationProperties[key];
					delete this.editorConfigurationSchema.properties![key];

					// Delete from schema
					delete allSettings.properties[key];
					switch (configuration.properties[key].scope) {
						case ConfigurationScope.APPLICATION:
							delete applicationSettings.properties[key];
							break;
						case ConfigurationScope.MACHINE:
							delete machineSettings.properties[key];
							break;
						case ConfigurationScope.WINDOW:
							delete windowSettings.properties[key];
							break;
						case ConfigurationScope.RESOURCE:
							delete resourceSettings.properties[key];
							break;
					}
				}
			}
			if (configuration.allOf) {
				configuration.allOf.forEach(node => deregisterConfiguration(node));
			}
		};
		for (const configuration of configurations) {
			deregisterConfiguration(configuration);
			const index = this.configurationContributors.indexOf(configuration);
			if (index !== -1) {
				this.configurationContributors.splice(index, 1);
			}
		}

		contributionRegistry.registerSchema(editorConfigurationSchemaId, this.editorConfigurationSchema);
		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire(properties);
	}

	public registerDefaultConfigurations(defaultConfigurations: IDefaultConfigurationExtension[]): void {
		const properties: string[] = [];

		for (const defaultConfiguration of defaultConfigurations) {
			for (const key in defaultConfiguration.defaults) {
				const defaultValue = defaultConfiguration.defaults[key];
				if (OVERRIDE_PROPERTY_PATTERN.test(key) && typeof defaultValue === 'object') {
					const propertySchema: IConfigurationPropertySchema = {
						type: 'object',
						default: defaultValue,
						description: nls.localize('overrideSettings.description', "Configure editor settings to be overridden for {0} language.", key),
						$ref: editorConfigurationSchemaId
					};
					allSettings.properties[key] = propertySchema;
					this.defaultOverridesConfigurationNode.properties![key] = propertySchema;
					this.configurationProperties[key] = propertySchema;
					properties.push(key);
				}
			}
		}

		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire(properties);
	}

	public deregisterDefaultConfigurations(defaultConfigurations: IDefaultConfigurationExtension[]): void {
		const properties: string[] = [];
		for (const defaultConfiguration of defaultConfigurations) {
			for (const key in defaultConfiguration.defaults) {
				properties.push(key);
				delete allSettings.properties[key];
				delete this.defaultOverridesConfigurationNode.properties![key];
				delete this.configurationProperties[key];
			}
		}
		this._onDidSchemaChange.fire();
		this._onDidUpdateConfiguration.fire(properties);
	}

	public notifyConfigurationSchemaUpdated(...configurations: IConfigurationNode[]) {
		this._onDidSchemaChange.fire();
	}

	public registerOverrideIdentifiers(overrideIdentifiers: string[]): void {
		this.overrideIdentifiers.push(...overrideIdentifiers);
		this.updateOverridePropertyPatternKey();
	}

	private validateAndRegisterProperties(configuration: IConfigurationNode, validate: boolean = true, scope: ConfigurationScope = ConfigurationScope.WINDOW, overridable: boolean = false): string[] {
		scope = types.isUndefinedOrNull(configuration.scope) ? scope : configuration.scope;
		overridable = configuration.overridable || overridable;
		let propertyKeys: string[] = [];
		let properties = configuration.properties;
		if (properties) {
			for (let key in properties) {
				let message;
				if (validate && (message = validateProperty(key))) {
					console.warn(message);
					delete properties[key];
					continue;
				}
				// fill in default values
				let property = properties[key];
				let defaultValue = property.default;
				if (types.isUndefined(defaultValue)) {
					property.default = getDefaultValue(property.type);
				}
				// Inherit overridable property from parent
				if (overridable) {
					property.overridable = true;
				}

				if (OVERRIDE_PROPERTY_PATTERN.test(key)) {
					property.scope = undefined; // No scope for overridable properties `[${identifier}]`
				} else {
					property.scope = types.isUndefinedOrNull(property.scope) ? scope : property.scope;
				}

				// Add to properties maps
				// Property is included by default if 'included' is unspecified
				if (properties[key].hasOwnProperty('included') && !properties[key].included) {
					this.excludedConfigurationProperties[key] = properties[key];
					delete properties[key];
					continue;
				} else {
					this.configurationProperties[key] = properties[key];
				}

				propertyKeys.push(key);
			}
		}
		let subNodes = configuration.allOf;
		if (subNodes) {
			for (let node of subNodes) {
				propertyKeys.push(...this.validateAndRegisterProperties(node, validate, scope, overridable));
			}
		}
		return propertyKeys;
	}

	getConfigurations(): IConfigurationNode[] {
		return this.configurationContributors;
	}

	getConfigurationProperties(): { [qualifiedKey: string]: IConfigurationPropertySchema } {
		return this.configurationProperties;
	}

	getExcludedConfigurationProperties(): { [qualifiedKey: string]: IConfigurationPropertySchema } {
		return this.excludedConfigurationProperties;
	}

	private registerJSONConfiguration(configuration: IConfigurationNode) {
		function register(configuration: IConfigurationNode) {
			let properties = configuration.properties;
			if (properties) {
				for (const key in properties) {
					allSettings.properties[key] = properties[key];
					switch (properties[key].scope) {
						case ConfigurationScope.APPLICATION:
							applicationSettings.properties[key] = properties[key];
							break;
						case ConfigurationScope.MACHINE:
							machineSettings.properties[key] = properties[key];
							break;
						case ConfigurationScope.WINDOW:
							windowSettings.properties[key] = properties[key];
							break;
						case ConfigurationScope.RESOURCE:
							resourceSettings.properties[key] = properties[key];
							break;
					}
				}
			}
			let subNodes = configuration.allOf;
			if (subNodes) {
				subNodes.forEach(register);
			}
		}
		register(configuration);
	}

	private updateSchemaForOverrideSettingsConfiguration(configuration: IConfigurationNode): void {
		if (configuration.id !== SETTINGS_OVERRRIDE_NODE_ID) {
			this.update(configuration);
			contributionRegistry.registerSchema(editorConfigurationSchemaId, this.editorConfigurationSchema);
		}
	}

	private updateOverridePropertyPatternKey(): void {
		let patternProperties: IJSONSchema = allSettings.patternProperties[this.overridePropertyPattern];
		if (!patternProperties) {
			patternProperties = {
				type: 'object',
				description: nls.localize('overrideSettings.defaultDescription', "Configure editor settings to be overridden for a language."),
				errorMessage: 'Unknown Identifier. Use language identifiers',
				$ref: editorConfigurationSchemaId
			};
		}

		delete allSettings.patternProperties[this.overridePropertyPattern];
		delete applicationSettings.patternProperties[this.overridePropertyPattern];
		delete machineSettings.patternProperties[this.overridePropertyPattern];
		delete windowSettings.patternProperties[this.overridePropertyPattern];
		delete resourceSettings.patternProperties[this.overridePropertyPattern];

		this.computeOverridePropertyPattern();

		allSettings.patternProperties[this.overridePropertyPattern] = patternProperties;
		applicationSettings.patternProperties[this.overridePropertyPattern] = patternProperties;
		machineSettings.patternProperties[this.overridePropertyPattern] = patternProperties;
		windowSettings.patternProperties[this.overridePropertyPattern] = patternProperties;
		resourceSettings.patternProperties[this.overridePropertyPattern] = patternProperties;

		this._onDidSchemaChange.fire();
	}

	private update(configuration: IConfigurationNode): void {
		let properties = configuration.properties;
		if (properties) {
			for (let key in properties) {
				if (properties[key].overridable) {
					this.editorConfigurationSchema.properties![key] = this.getConfigurationProperties()[key];
				}
			}
		}
		let subNodes = configuration.allOf;
		if (subNodes) {
			subNodes.forEach(subNode => this.update(subNode));
		}
	}

	private computeOverridePropertyPattern(): void {
		this.overridePropertyPattern = this.overrideIdentifiers.length ? OVERRIDE_PATTERN_WITH_SUBSTITUTION.replace('${0}', this.overrideIdentifiers.map(identifier => strings.createRegExp(identifier, false).source).join('|')) : OVERRIDE_PROPERTY;
	}
}

const SETTINGS_OVERRRIDE_NODE_ID = 'override';
const OVERRIDE_PROPERTY = '\\[.*\\]$';
const OVERRIDE_PATTERN_WITH_SUBSTITUTION = '\\[(${0})\\]$';
export const OVERRIDE_PROPERTY_PATTERN = new RegExp(OVERRIDE_PROPERTY);

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

export function validateProperty(property: string): string | null {
	if (OVERRIDE_PROPERTY_PATTERN.test(property)) {
		return nls.localize('config.property.languageDefault', "Cannot register '{0}'. This matches property pattern '\\\\[.*\\\\]$' for describing language specific editor settings. Use 'configurationDefaults' contribution.", property);
	}
	if (configurationRegistry.getConfigurationProperties()[property] !== undefined) {
		return nls.localize('config.property.duplicate', "Cannot register '{0}'. This property is already registered.", property);
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
