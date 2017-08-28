/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Event, { Emitter } from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/registry/common/platform';
import types = require('vs/base/common/types');
import * as strings from 'vs/base/common/strings';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';

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

	registerDefaultConfigurations(defaultConfigurations: IDefaultConfigurationExtension[]): void;

	/**
	 * Event that fires whenver a configuratio has been
	 * registered.
	 */
	onDidRegisterConfiguration: Event<IConfigurationRegistry>;

	/**
	 * Returns all configuration nodes contributed to this registry.
	 */
	getConfigurations(): IConfigurationNode[];

	/**
	 * Returns all configurations settings of all configuration nodes contributed to this registry.
	 */
	getConfigurationProperties(): { [qualifiedKey: string]: IConfigurationPropertySchema };

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

export const schemaId = 'vscode://schemas/settings';
export const editorConfigurationSchemaId = 'vscode://schemas/settings/editor';
export const resourceConfigurationSchemaId = 'vscode://schemas/settings/resource';
const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

class ConfigurationRegistry implements IConfigurationRegistry {
	private configurationContributors: IConfigurationNode[];
	private configurationProperties: { [qualifiedKey: string]: IJSONSchema };
	private configurationSchema: IJSONSchema;
	private editorConfigurationSchema: IJSONSchema;
	private resourceConfigurationSchema: IJSONSchema;
	private _onDidRegisterConfiguration: Emitter<IConfigurationRegistry>;
	private overrideIdentifiers: string[] = [];
	private overridePropertyPattern: string;

	constructor() {
		this.configurationContributors = [];
		this.configurationSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown configuration setting' };
		this.editorConfigurationSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown editor configuration setting' };
		this.resourceConfigurationSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Not a resource configuration setting' };
		this._onDidRegisterConfiguration = new Emitter<IConfigurationRegistry>();
		this.configurationProperties = {};
		this.computeOverridePropertyPattern();

		contributionRegistry.registerSchema(schemaId, this.configurationSchema);
		contributionRegistry.registerSchema(editorConfigurationSchemaId, this.editorConfigurationSchema);
		contributionRegistry.registerSchema(resourceConfigurationSchemaId, this.resourceConfigurationSchema);
	}

	public get onDidRegisterConfiguration() {
		return this._onDidRegisterConfiguration.event;
	}

	public registerConfiguration(configuration: IConfigurationNode, validate: boolean = true): void {
		this.registerConfigurations([configuration], validate);
	}

	public registerConfigurations(configurations: IConfigurationNode[], validate: boolean = true): void {
		configurations.forEach(configuration => {
			this.validateAndRegisterProperties(configuration, validate); // fills in defaults
			this.configurationContributors.push(configuration);
			this.registerJSONConfiguration(configuration);
			this.updateSchemaForOverrideSettingsConfiguration(configuration);
		});

		this._onDidRegisterConfiguration.fire(this);
	}

	public registerOverrideIdentifiers(overrideIdentifiers: string[]): void {
		this.overrideIdentifiers.push(...overrideIdentifiers);
		this.updateOverridePropertyPatternKey();
	}

	public registerDefaultConfigurations(defaultConfigurations: IDefaultConfigurationExtension[]): void {
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
		if (Object.keys(configurationNode.properties).length) {
			this.registerConfiguration(configurationNode, false);
		}
	}

	private validateAndRegisterProperties(configuration: IConfigurationNode, validate: boolean = true, scope: ConfigurationScope = ConfigurationScope.WINDOW, overridable: boolean = false) {
		scope = configuration.scope !== void 0 && configuration.scope !== null ? configuration.scope : scope;
		overridable = configuration.overridable || overridable;
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
				// add to properties map
				this.configurationProperties[key] = properties[key];
			}
		}
		let subNodes = configuration.allOf;
		if (subNodes) {
			for (let node of subNodes) {
				this.validateAndRegisterProperties(node, validate, scope, overridable);
			}
		}
	}

	validateProperty(property: string): boolean {
		return !OVERRIDE_PROPERTY_PATTERN.test(property) && this.getConfigurationProperties()[property] !== void 0;
	}

	getConfigurations(): IConfigurationNode[] {
		return this.configurationContributors;
	}

	getConfigurationProperties(): { [qualifiedKey: string]: IConfigurationPropertySchema } {
		return this.configurationProperties;
	}

	private registerJSONConfiguration(configuration: IConfigurationNode) {
		let configurationSchema = this.configurationSchema;
		function register(configuration: IConfigurationNode) {
			let properties = configuration.properties;
			if (properties) {
				for (let key in properties) {
					configurationSchema.properties[key] = properties[key];
				}
			}
			let subNodes = configuration.allOf;
			if (subNodes) {
				subNodes.forEach(register);
			}
		};
		register(configuration);
		contributionRegistry.registerSchema(schemaId, configurationSchema);
	}

	private updateSchemaForOverrideSettingsConfiguration(configuration: IConfigurationNode): void {
		if (configuration.id !== SETTINGS_OVERRRIDE_NODE_ID) {
			this.update(configuration);
			contributionRegistry.registerSchema(editorConfigurationSchemaId, this.editorConfigurationSchema);
			contributionRegistry.registerSchema(resourceConfigurationSchemaId, this.resourceConfigurationSchema);
		}
	}

	private updateOverridePropertyPatternKey(): void {
		let patternProperties: IJSONSchema = this.configurationSchema.patternProperties[this.overridePropertyPattern];
		if (!patternProperties) {
			patternProperties = {
				type: 'object',
				description: nls.localize('overrideSettings.defaultDescription', "Configure editor settings to be overridden for a language."),
				errorMessage: 'Unknown Identifier. Use language identifiers',
				$ref: editorConfigurationSchemaId
			};
		}
		delete this.configurationSchema.patternProperties[this.overridePropertyPattern];
		this.computeOverridePropertyPattern();
		this.configurationSchema.patternProperties[this.overridePropertyPattern] = patternProperties;
		contributionRegistry.registerSchema(schemaId, this.configurationSchema);
	}

	private update(configuration: IConfigurationNode): void {
		let properties = configuration.properties;
		if (properties) {
			for (let key in properties) {
				if (properties[key].overridable) {
					this.editorConfigurationSchema.properties[key] = this.getConfigurationProperties()[key];
				}
				switch (properties[key].scope) {
					case ConfigurationScope.RESOURCE:
						this.resourceConfigurationSchema.properties[key] = this.getConfigurationProperties()[key];
						break;
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
