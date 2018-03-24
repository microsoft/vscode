/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/registry/common/platform';
import * as types from 'vs/base/common/types';
import * as strings from 'vs/base/common/strings';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { deepClone } from 'vs/base/common/objects';

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
	registerConfigurations(configurations: IConfigurationNode[], defaultConfigurations: IDefaultConfigurationExtension[], validate?: boolean): void;

	/**
	 * Signal that the schema of a configuration setting has changes. It is currently only supported to change enumeration values.
	 * Property or default value changes are not allowed.
	 */
	notifyConfigurationSchemaUpdated(configuration: IConfigurationNode): void;

	/**
	 * Event that fires whenver a configuration has been
	 * registered.
	 */
	onDidRegisterConfiguration: Event<string[]>;

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

export enum ConfigurationScope {
	WINDOW = 1,
	RESOURCE
}

export interface IConfigurationPropertySchema extends IJSONSchema {
	overridable?: boolean;
	isExecutable?: boolean;
	scope?: ConfigurationScope;
	notMultiRootAdopted?: boolean;
	included?: boolean;
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
}

export interface IDefaultConfigurationExtension {
	id: string;
	name: string;
	defaults: { [key: string]: {} };
}

export const settingsSchema: IJSONSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown configuration setting' };
export const resourceSettingsSchema: IJSONSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown configuration setting' };

export const editorConfigurationSchemaId = 'vscode://schemas/settings/editor';
const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

class ConfigurationRegistry implements IConfigurationRegistry {

	private configurationContributors: IConfigurationNode[];
	private configurationProperties: { [qualifiedKey: string]: IJSONSchema };
	private excludedConfigurationProperties: { [qualifiedKey: string]: IJSONSchema };
	private editorConfigurationSchema: IJSONSchema;
	private overrideIdentifiers: string[] = [];
	private overridePropertyPattern: string;

	private readonly _onDidRegisterConfiguration: Emitter<string[]> = new Emitter<string[]>();
	readonly onDidRegisterConfiguration: Event<string[]> = this._onDidRegisterConfiguration.event;

	constructor() {
		this.configurationContributors = [];
		this.editorConfigurationSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown editor configuration setting' };
		this.configurationProperties = {};
		this.excludedConfigurationProperties = {};
		this.computeOverridePropertyPattern();

		contributionRegistry.registerSchema(editorConfigurationSchemaId, this.editorConfigurationSchema);
	}

	public registerConfiguration(configuration: IConfigurationNode, validate: boolean = true): void {
		this.registerConfigurations([configuration], [], validate);
	}

	public registerConfigurations(configurations: IConfigurationNode[], defaultConfigurations: IDefaultConfigurationExtension[], validate: boolean = true): void {
		const configurationNode = this.toConfiguration(defaultConfigurations);
		if (configurationNode) {
			configurations.push(configurationNode);
		}

		const properties: string[] = [];
		configurations.forEach(configuration => {
			properties.push(...this.validateAndRegisterProperties(configuration, validate)); // fills in defaults
			this.configurationContributors.push(configuration);
			this.registerJSONConfiguration(configuration);
			this.updateSchemaForOverrideSettingsConfiguration(configuration);
		});

		this._onDidRegisterConfiguration.fire(properties);
	}

	public notifyConfigurationSchemaUpdated(configuration: IConfigurationNode) {
		contributionRegistry.notifySchemaChanged(editorConfigurationSchemaId);
	}

	public registerOverrideIdentifiers(overrideIdentifiers: string[]): void {
		this.overrideIdentifiers.push(...overrideIdentifiers);
		this.updateOverridePropertyPatternKey();
	}

	private toConfiguration(defaultConfigurations: IDefaultConfigurationExtension[]): IConfigurationNode {
		const configurationNode: IConfigurationNode = {
			id: 'defaultOverrides',
			title: nls.localize('defaultConfigurations.title', "Default Configuration Overrides"),
			properties: {}
		};
		for (const defaultConfiguration of defaultConfigurations) {
			for (const key in defaultConfiguration.defaults) {
				const defaultValue = defaultConfiguration.defaults[key];
				if (OVERRIDE_PROPERTY_PATTERN.test(key) && typeof defaultValue === 'object') {
					configurationNode.properties[key] = {
						type: 'object',
						default: defaultValue,
						description: nls.localize('overrideSettings.description', "Configure editor settings to be overridden for {0} language.", key),
						$ref: editorConfigurationSchemaId
					};
				}
			}
		}
		return Object.keys(configurationNode.properties).length ? configurationNode : null;
	}

	private validateAndRegisterProperties(configuration: IConfigurationNode, validate: boolean = true, scope: ConfigurationScope = ConfigurationScope.WINDOW, overridable: boolean = false): string[] {
		scope = configuration.scope !== void 0 && configuration.scope !== null ? configuration.scope : scope;
		overridable = configuration.overridable || overridable;
		let propertyKeys = [];
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
				if (property.scope === void 0) {
					property.scope = scope;
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
				for (let key in properties) {
					settingsSchema.properties[key] = properties[key];
					resourceSettingsSchema.properties[key] = deepClone(properties[key]);
					if (properties[key].scope !== ConfigurationScope.RESOURCE) {
						resourceSettingsSchema.properties[key].doNotSuggest = true;
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
		let patternProperties: IJSONSchema = settingsSchema.patternProperties[this.overridePropertyPattern];
		if (!patternProperties) {
			patternProperties = {
				type: 'object',
				description: nls.localize('overrideSettings.defaultDescription', "Configure editor settings to be overridden for a language."),
				errorMessage: 'Unknown Identifier. Use language identifiers',
				$ref: editorConfigurationSchemaId
			};
		}
		delete settingsSchema.patternProperties[this.overridePropertyPattern];
		this.computeOverridePropertyPattern();

		settingsSchema.patternProperties[this.overridePropertyPattern] = patternProperties;
		resourceSettingsSchema.patternProperties[this.overridePropertyPattern] = patternProperties;
	}

	private update(configuration: IConfigurationNode): void {
		let properties = configuration.properties;
		if (properties) {
			for (let key in properties) {
				if (properties[key].overridable) {
					this.editorConfigurationSchema.properties[key] = this.getConfigurationProperties()[key];
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

function getDefaultValue(type: string | string[]): any {
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

export function validateProperty(property: string): string {
	if (OVERRIDE_PROPERTY_PATTERN.test(property)) {
		return nls.localize('config.property.languageDefault', "Cannot register '{0}'. This matches property pattern '\\\\[.*\\\\]$' for describing language specific editor settings. Use 'configurationDefaults' contribution.", property);
	}
	if (configurationRegistry.getConfigurationProperties()[property] !== void 0) {
		return nls.localize('config.property.duplicate', "Cannot register '{0}'. This property is already registered.", property);
	}
	return null;
}

export function getScopes(): { [key: string]: ConfigurationScope } {
	const scopes = {};
	const configurationProperties = configurationRegistry.getConfigurationProperties();
	for (const key of Object.keys(configurationProperties)) {
		scopes[key] = configurationProperties[key].scope;
	}
	scopes['launch'] = ConfigurationScope.RESOURCE;
	scopes['task'] = ConfigurationScope.RESOURCE;
	return scopes;
}
