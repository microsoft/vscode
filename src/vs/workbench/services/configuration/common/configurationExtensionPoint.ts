/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as objects from 'vs/base/common/objects';
import { Registry } from 'vs/platform/registry/common/platform';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionsRegistry, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IConfigurationNode, IConfigurationRegistry, Extensions, editorConfigurationSchemaId, IDefaultConfigurationExtension, validateProperty, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { workspaceSettingsSchemaId, launchSchemaId } from 'vs/workbench/services/configuration/common/configuration';
import { isObject } from 'vs/base/common/types';

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

const configurationEntrySchema: IJSONSchema = {
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
					{ $ref: 'http://json-schema.org/draft-07/schema#' },
					{
						type: 'object',
						properties: {
							isExecutable: {
								type: 'boolean',
								deprecationMessage: 'This property is deprecated. Instead use `scope` property and set it to `application` value.'
							},
							scope: {
								type: 'string',
								enum: ['application', 'window', 'resource'],
								default: 'window',
								enumDescriptions: [
									nls.localize('scope.application.description', "Application specific configuration, which can be configured only in User settings."),
									nls.localize('scope.window.description', "Window specific configuration, which can be configured in the User or Workspace settings."),
									nls.localize('scope.resource.description', "Resource specific configuration, which can be configured in the User, Workspace or Folder settings.")
								],
								description: nls.localize('scope.description', "Scope in which the configuration is applicable. Available scopes are `window` and `resource`.")
							},
							enumDescriptions: {
								type: 'array',
								items: {
									type: 'string',
								},
								description: nls.localize('scope.enumDescriptions', 'Descriptions for enum values')
							},
							markdownEnumDescription: {
								type: 'array',
								items: {
									type: 'string',
								},
								description: nls.localize('scope.markdownEnumDescription', 'Descriptions for enum values in the markdown format.')
							},
							markdownDescription: {
								type: 'string',
								description: nls.localize('scope.markdownDescription', 'The description in the markdown format.')
							},
							deprecationMessage: {
								type: 'string',
								description: nls.localize('scope.deprecationMessage', 'If set, the property is marked as deprecated and the given message is shown as an explanation.')
							}
						}
					}
				]
			}
		}
	}
};

let registeredDefaultConfigurations: IDefaultConfigurationExtension[] = [];

// BEGIN VSCode extension point `configurationDefaults`
const defaultConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IConfigurationNode>({
	extensionPoint: 'configurationDefaults',
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.defaultConfiguration', 'Contributes default editor configuration settings by language.'),
		type: 'object',
		defaultSnippets: [{ body: {} }],
		patternProperties: {
			'\\[.*\\]$': {
				type: 'object',
				default: {},
				$ref: editorConfigurationSchemaId,
			}
		}
	}
});
defaultConfigurationExtPoint.setHandler(extensions => {
	registeredDefaultConfigurations = extensions.map(extension => {
		const id = extension.description.identifier;
		const name = extension.description.name;
		const defaults = objects.deepClone(extension.value);
		return <IDefaultConfigurationExtension>{
			id, name, defaults
		};
	});
});
// END VSCode extension point `configurationDefaults`


// BEGIN VSCode extension point `configuration`
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IConfigurationNode>({
	extensionPoint: 'configuration',
	deps: [defaultConfigurationExtPoint],
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.configuration', 'Contributes configuration settings.'),
		oneOf: [
			configurationEntrySchema,
			{
				type: 'array',
				items: configurationEntrySchema
			}
		]
	}
});
configurationExtPoint.setHandler(extensions => {
	const configurations: IConfigurationNode[] = [];

	function handleConfiguration(node: IConfigurationNode, extension: IExtensionPointUser<any>) {
		let configuration = objects.deepClone(node);

		if (configuration.title && (typeof configuration.title !== 'string')) {
			extension.collector.error(nls.localize('invalid.title', "'configuration.title' must be a string"));
		}

		validateProperties(configuration, extension);

		configuration.id = node.id || extension.description.identifier.value;
		configuration.contributedByExtension = true;
		configuration.title = configuration.title || extension.description.displayName || extension.description.identifier.value;
		configurations.push(configuration);
	}

	for (let extension of extensions) {
		const value = <IConfigurationNode | IConfigurationNode[]>extension.value;
		if (!Array.isArray(value)) {
			handleConfiguration(value, extension);
		} else {
			value.forEach(v => handleConfiguration(v, extension));
		}
	}
	configurationRegistry.registerConfigurations(configurations, registeredDefaultConfigurations, false);
});
// END VSCode extension point `configuration`

function validateProperties(configuration: IConfigurationNode, extension: IExtensionPointUser<any>): void {
	let properties = configuration.properties;
	if (properties) {
		if (typeof properties !== 'object') {
			extension.collector.error(nls.localize('invalid.properties', "'configuration.properties' must be an object"));
			configuration.properties = {};
		}
		for (let key in properties) {
			const message = validateProperty(key);
			if (message) {
				delete properties[key];
				extension.collector.warn(message);
				continue;
			}
			const propertyConfiguration = properties[key];
			if (!isObject(propertyConfiguration)) {
				delete properties[key];
				extension.collector.error(nls.localize('invalid.property', "'configuration.property' must be an object"));
				continue;
			}
			if (propertyConfiguration.scope) {
				if (propertyConfiguration.scope.toString() === 'application') {
					propertyConfiguration.scope = ConfigurationScope.APPLICATION;
				} else if (propertyConfiguration.scope.toString() === 'resource') {
					propertyConfiguration.scope = ConfigurationScope.RESOURCE;
				} else {
					propertyConfiguration.scope = ConfigurationScope.WINDOW;
				}
			} else {
				propertyConfiguration.scope = ConfigurationScope.WINDOW;
			}
		}
	}
	let subNodes = configuration.allOf;
	if (subNodes) {
		extension.collector.error(nls.localize('invalid.allOf', "'configuration.allOf' is deprecated and should no longer be used. Instead, pass multiple configuration sections as an array to the 'configuration' contribution point."));
		for (let node of subNodes) {
			validateProperties(node, extension);
		}
	}
}

const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema('vscode://schemas/workspaceConfig', {
	allowComments: true,
	default: {
		folders: [
			{
				path: ''
			}
		],
		settings: {
		}
	},
	required: ['folders'],
	properties: {
		'folders': {
			minItems: 0,
			uniqueItems: true,
			description: nls.localize('workspaceConfig.folders.description', "List of folders to be loaded in the workspace."),
			items: {
				type: 'object',
				default: { path: '' },
				oneOf: [{
					properties: {
						path: {
							type: 'string',
							description: nls.localize('workspaceConfig.path.description', "A file path. e.g. `/root/folderA` or `./folderA` for a relative path that will be resolved against the location of the workspace file.")
						},
						name: {
							type: 'string',
							description: nls.localize('workspaceConfig.name.description', "An optional name for the folder. ")
						}
					},
					required: ['path']
				}, {
					properties: {
						uri: {
							type: 'string',
							description: nls.localize('workspaceConfig.uri.description', "URI of the folder")
						},
						name: {
							type: 'string',
							description: nls.localize('workspaceConfig.name.description', "An optional name for the folder. ")
						}
					},
					required: ['uri']
				}]
			}
		},
		'settings': {
			type: 'object',
			default: {},
			description: nls.localize('workspaceConfig.settings.description', "Workspace settings"),
			$ref: workspaceSettingsSchemaId
		},
		'launch': {
			type: 'object',
			default: { configurations: [], compounds: [] },
			description: nls.localize('workspaceConfig.launch.description', "Workspace launch configurations"),
			$ref: launchSchemaId
		},
		'extensions': {
			type: 'object',
			default: {},
			description: nls.localize('workspaceConfig.extensions.description', "Workspace extensions"),
			$ref: 'vscode://schemas/extensions'
		}
	},
	additionalProperties: false,
	errorMessage: nls.localize('unknownWorkspaceProperty', "Unknown workspace configuration property")
});
