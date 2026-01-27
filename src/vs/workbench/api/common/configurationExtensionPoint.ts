/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import * as objects from '../../../base/common/objects.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { ExtensionsRegistry, IExtensionPointUser } from '../../services/extensions/common/extensionsRegistry.js';
import { IConfigurationNode, IConfigurationRegistry, Extensions, validateProperty, ConfigurationScope, OVERRIDE_PROPERTY_REGEX, IConfigurationDefaults, configurationDefaultsSchemaId, IConfigurationDelta, getDefaultValue, getAllConfigurationProperties, parseScope, EXTENSION_UNIFICATION_EXTENSION_IDS, overrideIdentifiersFromKey } from '../../../platform/configuration/common/configurationRegistry.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { workspaceSettingsSchemaId, launchSchemaId, tasksSchemaId, mcpSchemaId } from '../../services/configuration/common/configuration.js';
import { isObject, isUndefined } from '../../../base/common/types.js';
import { ExtensionIdentifierMap, IExtensionManifest } from '../../../platform/extensions/common/extensions.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Extensions as ExtensionFeaturesExtensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from '../../services/extensionManagement/common/extensionFeatures.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import product from '../../../platform/product/common/product.js';

const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

const configurationEntrySchema: IJSONSchema = {
	type: 'object',
	defaultSnippets: [{ body: { title: '', properties: {} } }],
	properties: {
		title: {
			description: nls.localize('vscode.extension.contributes.configuration.title', 'A title for the current category of settings. This label will be rendered in the Settings editor as a subheading. If the title is the same as the extension display name, then the category will be grouped under the main extension heading.'),
			type: 'string'
		},
		order: {
			description: nls.localize('vscode.extension.contributes.configuration.order', 'When specified, gives the order of this category of settings relative to other categories.'),
			type: 'integer'
		},
		properties: {
			description: nls.localize('vscode.extension.contributes.configuration.properties', 'Description of the configuration properties.'),
			type: 'object',
			propertyNames: {
				pattern: '\\S+',
				patternErrorMessage: nls.localize('vscode.extension.contributes.configuration.property.empty', 'Property should not be empty.'),
			},
			additionalProperties: {
				anyOf: [
					{
						title: nls.localize('vscode.extension.contributes.configuration.properties.schema', 'Schema of the configuration property.'),
						$ref: 'http://json-schema.org/draft-07/schema#'
					},
					{
						type: 'object',
						properties: {
							scope: {
								type: 'string',
								enum: ['application', 'machine', 'window', 'resource', 'language-overridable', 'machine-overridable'],
								default: 'window',
								enumDescriptions: [
									nls.localize('scope.application.description', "Configuration that can be configured only in the user settings."),
									nls.localize('scope.machine.description', "Configuration that can be configured only in the user settings or only in the remote settings."),
									nls.localize('scope.window.description', "Configuration that can be configured in the user, remote or workspace settings."),
									nls.localize('scope.resource.description', "Configuration that can be configured in the user, remote, workspace or folder settings."),
									nls.localize('scope.language-overridable.description', "Resource configuration that can be configured in language specific settings."),
									nls.localize('scope.machine-overridable.description', "Machine configuration that can be configured also in workspace or folder settings.")
								],
								markdownDescription: nls.localize('scope.description', "Scope in which the configuration is applicable. Available scopes are `application`, `machine`, `window`, `resource`, and `machine-overridable`.")
							},
							enumDescriptions: {
								type: 'array',
								items: {
									type: 'string',
								},
								description: nls.localize('scope.enumDescriptions', 'Descriptions for enum values')
							},
							markdownEnumDescriptions: {
								type: 'array',
								items: {
									type: 'string',
								},
								description: nls.localize('scope.markdownEnumDescriptions', 'Descriptions for enum values in the markdown format.')
							},
							enumItemLabels: {
								type: 'array',
								items: {
									type: 'string'
								},
								markdownDescription: nls.localize('scope.enumItemLabels', 'Labels for enum values to be displayed in the Settings editor. When specified, the {0} values still show after the labels, but less prominently.', '`enum`')
							},
							markdownDescription: {
								type: 'string',
								description: nls.localize('scope.markdownDescription', 'The description in the markdown format.')
							},
							deprecationMessage: {
								type: 'string',
								description: nls.localize('scope.deprecationMessage', 'If set, the property is marked as deprecated and the given message is shown as an explanation.')
							},
							markdownDeprecationMessage: {
								type: 'string',
								description: nls.localize('scope.markdownDeprecationMessage', 'If set, the property is marked as deprecated and the given message is shown as an explanation in the markdown format.')
							},
							editPresentation: {
								type: 'string',
								enum: ['singlelineText', 'multilineText'],
								enumDescriptions: [
									nls.localize('scope.singlelineText.description', 'The value will be shown in an inputbox.'),
									nls.localize('scope.multilineText.description', 'The value will be shown in a textarea.')
								],
								default: 'singlelineText',
								description: nls.localize('scope.editPresentation', 'When specified, controls the presentation format of the string setting.')
							},
							order: {
								type: 'integer',
								description: nls.localize('scope.order', 'When specified, gives the order of this setting relative to other settings within the same category. Settings with an order property will be placed before settings without this property set.')
							},
							ignoreSync: {
								type: 'boolean',
								description: nls.localize('scope.ignoreSync', 'When enabled, Settings Sync will not sync the user value of this configuration by default.')
							},
							tags: {
								type: 'array',
								items: {
									type: 'string',
									enum: [
										'accessibility',
										'advanced',
										'experimental',
										'telemetry',
										'usesOnlineServices',
									],
									enumDescriptions: [
										nls.localize('accessibility', 'Accessibility settings'),
										nls.localize('advanced', 'Advanced settings are hidden by default in the Settings editor unless the user chooses to show advanced settings.'),
										nls.localize('experimental', 'Experimental settings are subject to change and may be removed in future releases.'),
										nls.localize('preview', 'Preview settings can be used to try out new features before they are finalized.'),
										nls.localize('telemetry', 'Telemetry settings'),
										nls.localize('usesOnlineServices', 'Settings that use online services')
									],
								},
								additionalItems: true,
								markdownDescription: nls.localize('scope.tags', 'A list of tags under which to place the setting. The tag can then be searched up in the Settings editor. For example, specifying the `experimental` tag allows one to find the setting by searching `@tag:experimental`.'),
							}
						}
					}
				]
			}
		}
	}
};

// build up a delta across two ext points and only apply it once
let _configDelta: IConfigurationDelta | undefined;


// BEGIN VSCode extension point `configurationDefaults`
const defaultConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IStringDictionary<IStringDictionary<unknown>>>({
	extensionPoint: 'configurationDefaults',
	jsonSchema: {
		$ref: configurationDefaultsSchemaId,
	},
	canHandleResolver: true
});
defaultConfigurationExtPoint.setHandler((extensions, { added, removed }) => {

	if (_configDelta) {
		// HIGHLY unlikely, but just in case
		configurationRegistry.deltaConfiguration(_configDelta);
	}

	const configNow = _configDelta = {};
	// schedule a HIGHLY unlikely task in case only the default configurations EXT point changes
	queueMicrotask(() => {
		if (_configDelta === configNow) {
			configurationRegistry.deltaConfiguration(_configDelta);
			_configDelta = undefined;
		}
	});

	if (removed.length) {
		const removedDefaultConfigurations = removed.map<IConfigurationDefaults>(extension => ({ overrides: objects.deepClone(extension.value), source: { id: extension.description.identifier.value, displayName: extension.description.displayName } }));
		_configDelta.removedDefaults = removedDefaultConfigurations;
	}
	if (added.length) {
		const registeredProperties = configurationRegistry.getConfigurationProperties();
		const allowedScopes = [ConfigurationScope.MACHINE_OVERRIDABLE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE];
		const addedDefaultConfigurations = added.map<IConfigurationDefaults>(extension => {
			const overrides = objects.deepClone(extension.value);
			for (const key of Object.keys(overrides)) {
				const registeredPropertyScheme = registeredProperties[key];
				if (registeredPropertyScheme?.disallowConfigurationDefault) {
					extension.collector.warn(nls.localize('config.property.preventDefaultConfiguration.warning', "Cannot register configuration defaults for '{0}'. This setting does not allow contributing configuration defaults.", key));
					delete overrides[key];
					continue;
				}
				if (!OVERRIDE_PROPERTY_REGEX.test(key)) {
					if (registeredPropertyScheme?.scope && !allowedScopes.includes(registeredPropertyScheme.scope)) {
						extension.collector.warn(nls.localize('config.property.defaultConfiguration.warning', "Cannot register configuration defaults for '{0}'. Only defaults for machine-overridable, window, resource and language overridable scoped settings are supported.", key));
						delete overrides[key];
						continue;
					}
				}
			}
			return { overrides, source: { id: extension.description.identifier.value, displayName: extension.description.displayName } };
		});
		_configDelta.addedDefaults = addedDefaultConfigurations;
	}
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
	},
	canHandleResolver: true
});

const extensionConfigurations: ExtensionIdentifierMap<IConfigurationNode[]> = new ExtensionIdentifierMap<IConfigurationNode[]>();

configurationExtPoint.setHandler((extensions, { added, removed }) => {

	// HIGHLY unlikely (only configuration but not defaultConfiguration EXT point changes)
	_configDelta ??= {};

	if (removed.length) {
		const removedConfigurations: IConfigurationNode[] = [];
		for (const extension of removed) {
			removedConfigurations.push(...(extensionConfigurations.get(extension.description.identifier) || []));
			extensionConfigurations.delete(extension.description.identifier);
		}
		_configDelta.removedConfigurations = removedConfigurations;
	}

	const seenProperties = new Set<string>();

	function handleConfiguration(node: IConfigurationNode, extension: IExtensionPointUser<unknown>): IConfigurationNode {
		const configuration = objects.deepClone(node);

		if (configuration.title && (typeof configuration.title !== 'string')) {
			extension.collector.error(nls.localize('invalid.title', "'configuration.title' must be a string"));
		}

		validateProperties(configuration, extension);

		configuration.id = node.id || extension.description.identifier.value;
		configuration.extensionInfo = { id: extension.description.identifier.value, displayName: extension.description.displayName };
		configuration.restrictedProperties = extension.description.capabilities?.untrustedWorkspaces?.supported === 'limited' ? extension.description.capabilities?.untrustedWorkspaces.restrictedConfigurations : undefined;
		configuration.title = configuration.title || extension.description.displayName || extension.description.identifier.value;
		return configuration;
	}

	function validateProperties(configuration: IConfigurationNode, extension: IExtensionPointUser<unknown>): void {
		const properties = configuration.properties;
		const extensionConfigurationPolicy = product.extensionConfigurationPolicy;
		if (properties) {
			if (typeof properties !== 'object') {
				extension.collector.error(nls.localize('invalid.properties', "'configuration.properties' must be an object"));
				configuration.properties = {};
			}
			for (const key in properties) {
				const propertyConfiguration = properties[key];
				const message = validateProperty(key, propertyConfiguration, extension.description.identifier.value);
				if (message) {
					delete properties[key];
					extension.collector.warn(message);
					continue;
				}
				if (seenProperties.has(key) && !EXTENSION_UNIFICATION_EXTENSION_IDS.has(extension.description.identifier.value.toLowerCase())) {
					delete properties[key];
					extension.collector.warn(nls.localize('config.property.duplicate', "Cannot register '{0}'. This property is already registered.", key));
					continue;
				}
				if (!isObject(propertyConfiguration)) {
					delete properties[key];
					extension.collector.error(nls.localize('invalid.property', "configuration.properties property '{0}' must be an object", key));
					continue;
				}
				if (extensionConfigurationPolicy?.[key]) {
					propertyConfiguration.policy = extensionConfigurationPolicy?.[key];
				}
				if (propertyConfiguration.tags?.some(tag => tag.toLowerCase() === 'onexp')) {
					propertyConfiguration.experiment = {
						mode: 'startup'
					};
				}
				seenProperties.add(key);
				propertyConfiguration.scope = propertyConfiguration.scope ? parseScope(propertyConfiguration.scope.toString()) : ConfigurationScope.WINDOW;
			}
		}
		const subNodes = configuration.allOf;
		if (subNodes) {
			extension.collector.error(nls.localize('invalid.allOf', "'configuration.allOf' is deprecated and should no longer be used. Instead, pass multiple configuration sections as an array to the 'configuration' contribution point."));
			for (const node of subNodes) {
				validateProperties(node, extension);
			}
		}
	}

	if (added.length) {
		const addedConfigurations: IConfigurationNode[] = [];
		for (const extension of added) {
			const configurations: IConfigurationNode[] = [];
			const value = <IConfigurationNode | IConfigurationNode[]>extension.value;
			if (Array.isArray(value)) {
				value.forEach(v => configurations.push(handleConfiguration(v, extension)));
			} else {
				configurations.push(handleConfiguration(value, extension));
			}
			extensionConfigurations.set(extension.description.identifier, configurations);
			addedConfigurations.push(...configurations);
		}

		_configDelta.addedConfigurations = addedConfigurations;
	}

	configurationRegistry.deltaConfiguration(_configDelta);
	_configDelta = undefined;
});
// END VSCode extension point `configuration`

jsonRegistry.registerSchema('vscode://schemas/workspaceConfig', {
	allowComments: true,
	allowTrailingCommas: true,
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
				defaultSnippets: [{ body: { path: '$1' } }],
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
		'tasks': {
			type: 'object',
			default: { version: '2.0.0', tasks: [] },
			description: nls.localize('workspaceConfig.tasks.description', "Workspace task configurations"),
			$ref: tasksSchemaId
		},
		'mcp': {
			type: 'object',
			default: {
				inputs: [],
				servers: {
					'mcp-server-time': {
						command: 'uvx',
						args: ['mcp_server_time', '--local-timezone=America/Los_Angeles']
					}
				}
			},
			description: nls.localize('workspaceConfig.mcp.description', "Model Context Protocol server configurations"),
			$ref: mcpSchemaId
		},
		'extensions': {
			type: 'object',
			default: {},
			description: nls.localize('workspaceConfig.extensions.description', "Workspace extensions"),
			$ref: 'vscode://schemas/extensions'
		},
		'remoteAuthority': {
			type: 'string',
			doNotSuggest: true,
			description: nls.localize('workspaceConfig.remoteAuthority', "The remote server where the workspace is located."),
		},
		'transient': {
			type: 'boolean',
			doNotSuggest: true,
			description: nls.localize('workspaceConfig.transient', "A transient workspace will disappear when restarting or reloading."),
		}
	},
	errorMessage: nls.localize('unknownWorkspaceProperty', "Unknown workspace configuration property")
});


class SettingsTableRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.configuration;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const configuration: IConfigurationNode[] = manifest.contributes?.configuration
			? Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration]
			: [];

		const properties = getAllConfigurationProperties(configuration);

		const contrib = properties ? Object.keys(properties) : [];
		const headers = [nls.localize('setting name', "ID"), nls.localize('description', "Description"), nls.localize('default', "Default")];
		const rows: IRowData[][] = contrib.sort((a, b) => a.localeCompare(b))
			.map(key => {
				return [
					new MarkdownString().appendMarkdown(`\`${key}\``),
					properties[key].markdownDescription ? new MarkdownString(properties[key].markdownDescription, false) : properties[key].description ?? '',
					new MarkdownString().appendCodeblock('json', JSON.stringify(isUndefined(properties[key].default) ? getDefaultValue(properties[key].type) : properties[key].default, null, 2)),
				];
			});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'configuration',
	label: nls.localize('settings', "Settings"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(SettingsTableRenderer),
});

class ConfigurationDefaultsTableRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.configurationDefaults;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const configurationDefaults = manifest.contributes?.configurationDefaults ?? {};

		const headers = [nls.localize('language', "Languages"), nls.localize('setting', "Setting"), nls.localize('default override value', "Override Value")];
		const rows: IRowData[][] = [];

		for (const key of Object.keys(configurationDefaults).sort((a, b) => a.localeCompare(b))) {
			const value = configurationDefaults[key];
			if (OVERRIDE_PROPERTY_REGEX.test(key)) {
				const languages = overrideIdentifiersFromKey(key);
				const languageMarkdown = new MarkdownString().appendMarkdown(`${languages.join(', ')}`);
				for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
					const row: IRowData[] = [];
					row.push(languageMarkdown);
					row.push(new MarkdownString().appendMarkdown(`\`${key}\``));
					row.push(new MarkdownString().appendCodeblock('json', JSON.stringify(value[key], null, 2)));
					rows.push(row);
				}
			} else {
				const row: IRowData[] = [];
				row.push('');
				row.push(new MarkdownString().appendMarkdown(`\`${key}\``));
				row.push(new MarkdownString().appendCodeblock('json', JSON.stringify(value, null, 2)));
				rows.push(row);
			}
		}

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'configurationDefaults',
	label: nls.localize('settings default overrides', "Settings Default Overrides"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ConfigurationDefaultsTableRenderer),
});
