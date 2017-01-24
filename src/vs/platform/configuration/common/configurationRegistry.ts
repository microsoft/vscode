/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Event, { Emitter } from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/platform';
import objects = require('vs/base/common/objects');
import types = require('vs/base/common/types');
import { ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';

export const Extensions = {
	Configuration: 'base.contributions.configuration'
};

// Locally extend IJSONSchema with the vscode-specific `isExecutable` property
declare module 'vs/base/common/jsonSchema' {
	export interface IJSONSchema {
		isExecutable?: boolean;
	}
}

export interface IConfigurationRegistry {

	/**
	 * Register a configuration to the registry.
	 */
	registerConfiguration(configuration: IConfigurationNode): void;

	/**
	 * Register multiple configurations to the registry.
	 */
	registerConfigurations(configurations: IConfigurationNode[]): void;

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

	registerOverrideIdentifiers(identifiers: string[]): void;
}

export interface IConfigurationPropertySchema extends IJSONSchema {
	overridable?: boolean;
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
}

const schemaId = 'vscode://schemas/settings';
const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

class ConfigurationRegistry implements IConfigurationRegistry {
	private configurationContributors: IConfigurationNode[];
	private configurationProperties: { [qualifiedKey: string]: IJSONSchema };
	private configurationSchema: IJSONSchema;
	private _onDidRegisterConfiguration: Emitter<IConfigurationRegistry>;
	private overrideIdentifiers: string[] = [];
	private overridePropertyPattern: string;

	constructor() {
		this.configurationContributors = [];
		this.configurationSchema = { properties: {}, patternProperties: {}, additionalProperties: false, errorMessage: 'Unknown configuration setting' };
		this._onDidRegisterConfiguration = new Emitter<IConfigurationRegistry>();
		this.configurationProperties = {};
		this.computeOverridePropertyPattern();

		contributionRegistry.registerSchema(schemaId, this.configurationSchema);
		this.registerOverrideSettingsConfiguration();
	}

	public get onDidRegisterConfiguration() {
		return this._onDidRegisterConfiguration.event;
	}

	public registerConfiguration(configuration: IConfigurationNode): void {
		this.registerConfigurations([configuration]);
	}

	public registerConfigurations(configurations: IConfigurationNode[]): void {
		configurations.forEach(configuration => {
			this.registerProperties(configuration); // fills in defaults
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

	private registerProperties(configuration: IConfigurationNode, overridable: boolean = false) {
		overridable = configuration.overridable || overridable;
		let properties = configuration.properties;
		if (properties) {
			for (let key in properties) {
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
				// add to properties map
				this.configurationProperties[key] = properties[key];
			}
		}
		let subNodes = configuration.allOf;
		if (subNodes) {
			for (let node of subNodes) {
				this.registerProperties(node, overridable);
			}
		}
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
		if (configuration.id === SETTINGS_OVERRRIDE_NODE_ID) {
			configurationSchema.patternProperties[this.overridePropertyPattern] = objects.clone(configuration.properties['[]']);
		} else {
			register(configuration);
		}
		contributionRegistry.registerSchema(schemaId, configurationSchema);
	}

	private updateSchemaForOverrideSettingsConfiguration(configuration: IConfigurationNode): void {
		if (configuration.id !== SETTINGS_OVERRRIDE_NODE_ID) {
			let patternProperties = this.configurationSchema.patternProperties[this.overridePropertyPattern];
			if (patternProperties) {
				if (!patternProperties.properties) {
					patternProperties.properties = {};
				}
				this.update(configuration, patternProperties);
				contributionRegistry.registerSchema(schemaId, this.configurationSchema);
			}
		}
	}

	private updateOverridePropertyPatternKey(): void {
		let patternProperties = this.configurationSchema.patternProperties[this.overridePropertyPattern];
		if (patternProperties) {
			delete this.configurationSchema.patternProperties[this.overridePropertyPattern];
			this.computeOverridePropertyPattern();
			this.configurationSchema.patternProperties[this.overridePropertyPattern] = patternProperties;
			contributionRegistry.registerSchema(schemaId, this.configurationSchema);
		}
	}

	private update(configuration: IConfigurationNode, overridePropertiesSchema: IJSONSchema): void {
		let properties = configuration.properties;
		if (properties) {
			for (let key in properties) {
				if (properties[key].overridable) {
					overridePropertiesSchema.properties[key] = this.getConfigurationProperties()[key];
				}
			}
		}
		let subNodes = configuration.allOf;
		if (subNodes) {
			subNodes.forEach(subNode => this.update(subNode, overridePropertiesSchema));
		}
	}

	private computeOverridePropertyPattern(): void {
		this.overridePropertyPattern = this.overrideIdentifiers.length ? OVERRIDE_PATTERN_WITH_SUBSTITUTION.replace('${0}', this.overrideIdentifiers.join('|')) : OVERRIDE_PROPERTY;
	}

	private registerOverrideSettingsConfiguration(): void {
		const properties = {
			'[]': {
				type: 'object',
				description: nls.localize('overrideSettings.description', "Configure settings to be overridden for a set of language identifiers."),
				additionalProperties: false,
				errorMessage: 'Unknown Identifier. Use language identifiers'
			}
		};
		this.registerConfiguration({
			id: SETTINGS_OVERRRIDE_NODE_ID,
			type: 'object',
			title: nls.localize('overrideSettings.title', "Override Settings"),
			properties
		});
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

export interface ISecurityConfiguration {
	security: {
		workspacesTrustedToSpecifyExecutables: { [path: string]: boolean }
	};
}

configurationRegistry.registerConfiguration({
	'id': 'Security',
	'order': 5,
	'title': nls.localize('securityConfigurationTitle', "Security"),
	'type': 'object',
	'properties': {
		'security.workspacesTrustedToSpecifyExecutables': {
			'type': 'object',
			'description': nls.localize('security.workspacesTrustedToSpecifyExecutables', "Specifes which workspaces are trusted to specify executables in their settings. This option can only configured in the user settings."),
			'default': {},
			defaultSnippets: [{ body: '${1:workspace_path} : ${2:true}' }],
			'additionalProperties': {
				'type': 'boolean',
				'description': nls.localize('exclude.boolean', "Path to a workspaces. Set to true or false to trust or distrust a workspace."),
			}
		}
	}

});

const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IConfigurationNode>('configuration', [], {
	description: nls.localize('vscode.extension.contributes.configuration', 'Contributes configuration settings.'),
	type: 'object',
	defaultSnippets: [{ body: { title: '', properties: {} } }],
	properties: {
		title: {
			description: nls.localize('vscode.extension.contributes.configuration.title', 'A summary of the settings. This label will be used in the settings file as separating comment.'),
			type: 'string'
		},
		properties: {
			description: nls.localize('vscode.extension.contributes.configuration.properties', 'Description of the configuration properties.'),
			type: 'object',
			additionalProperties: {
				anyOf: [
					{ $ref: 'http://json-schema.org/draft-04/schema#' },
					{
						type: 'object',
						properties: {
							isExecutable: {
								type: 'boolean'
							}
						}
					}
				]
			}
		},
	}
});

configurationExtPoint.setHandler(extensions => {
	const configurations: IConfigurationNode[] = [];

	for (let i = 0; i < extensions.length; i++) {
		const configuration = <IConfigurationNode>extensions[i].value;
		const collector = extensions[i].collector;

		if (configuration.type && configuration.type !== 'object') {
			collector.warn(nls.localize('invalid.type', "if set, 'configuration.type' must be set to 'object"));
		} else {
			configuration.type = 'object';
		}

		if (configuration.title && (typeof configuration.title !== 'string')) {
			collector.error(nls.localize('invalid.title', "'configuration.title' must be a string"));
		}

		if (configuration.properties && (typeof configuration.properties !== 'object')) {
			collector.error(nls.localize('invalid.properties', "'configuration.properties' must be an object"));
			return;
		}

		const clonedConfiguration = objects.clone(configuration);
		clonedConfiguration.id = extensions[i].description.id;
		configurations.push(clonedConfiguration);
	}

	configurationRegistry.registerConfigurations(configurations);
});