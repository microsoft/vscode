/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../nls.js';
import * as objects from '../../../base/common/objects.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { ExtensionsRegistry } from '../../services/extensions/common/extensionsRegistry.js';
import { Extensions, validateProperty, OVERRIDE_PROPERTY_REGEX, configurationDefaultsSchemaId, getDefaultValue, getAllConfigurationProperties, parseScope, EXTENSION_UNIFICATION_EXTENSION_IDS, overrideIdentifiersFromKey } from '../../../platform/configuration/common/configurationRegistry.js';
import { Extensions as JSONExtensions } from '../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { workspaceSettingsSchemaId, launchSchemaId, tasksSchemaId, mcpSchemaId } from '../../services/configuration/common/configuration.js';
import { isObject, isUndefined } from '../../../base/common/types.js';
import { ExtensionIdentifierMap } from '../../../platform/extensions/common/extensions.js';
import { Extensions as ExtensionFeaturesExtensions } from '../../services/extensionManagement/common/extensionFeatures.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import product from '../../../platform/product/common/product.js';
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
const configurationRegistry = Registry.as(Extensions.Configuration);
const configurationEntrySchema = {
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
                            keywords: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: nls.localize('scope.keywords', 'A list of keywords that help users find this setting in the Settings editor. These are not shown to the user.')
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
let _configDelta;
// BEGIN VSCode extension point `configurationDefaults`
const defaultConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
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
        const removedDefaultConfigurations = removed.map(extension => ({ overrides: objects.deepClone(extension.value), source: { id: extension.description.identifier.value, displayName: extension.description.displayName } }));
        _configDelta.removedDefaults = removedDefaultConfigurations;
    }
    if (added.length) {
        const registeredProperties = configurationRegistry.getConfigurationProperties();
        const allowedScopes = [7 /* ConfigurationScope.MACHINE_OVERRIDABLE */, 4 /* ConfigurationScope.WINDOW */, 5 /* ConfigurationScope.RESOURCE */, 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */];
        const addedDefaultConfigurations = added.map(extension => {
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
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
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
const extensionConfigurations = new ExtensionIdentifierMap();
configurationExtPoint.setHandler((extensions, { added, removed }) => {
    // HIGHLY unlikely (only configuration but not defaultConfiguration EXT point changes)
    _configDelta ??= {};
    if (removed.length) {
        const removedConfigurations = [];
        for (const extension of removed) {
            removedConfigurations.push(...(extensionConfigurations.get(extension.description.identifier) || []));
            extensionConfigurations.delete(extension.description.identifier);
        }
        _configDelta.removedConfigurations = removedConfigurations;
    }
    const seenProperties = new Set();
    function handleConfiguration(node, extension) {
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
    function validateProperties(configuration, extension) {
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
                propertyConfiguration.scope = propertyConfiguration.scope ? parseScope(propertyConfiguration.scope.toString()) : 4 /* ConfigurationScope.WINDOW */;
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
        const addedConfigurations = [];
        for (const extension of added) {
            const configurations = [];
            const value = extension.value;
            if (Array.isArray(value)) {
                value.forEach(v => configurations.push(handleConfiguration(v, extension)));
            }
            else {
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
        settings: {}
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
class SettingsTableRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.configuration;
    }
    render(manifest) {
        const configuration = manifest.contributes?.configuration
            ? Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration]
            : [];
        const properties = getAllConfigurationProperties(configuration);
        const contrib = properties ? Object.keys(properties) : [];
        const headers = [nls.localize('setting name', "ID"), nls.localize('description', "Description"), nls.localize('default', "Default")];
        const rows = contrib.sort((a, b) => a.localeCompare(b))
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
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'configuration',
    label: nls.localize('settings', "Settings"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(SettingsTableRenderer),
});
class ConfigurationDefaultsTableRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.configurationDefaults;
    }
    render(manifest) {
        const configurationDefaults = manifest.contributes?.configurationDefaults ?? {};
        const headers = [nls.localize('language', "Languages"), nls.localize('setting', "Setting"), nls.localize('default override value', "Override Value")];
        const rows = [];
        for (const key of Object.keys(configurationDefaults).sort((a, b) => a.localeCompare(b))) {
            const value = configurationDefaults[key];
            if (OVERRIDE_PROPERTY_REGEX.test(key)) {
                const languages = overrideIdentifiersFromKey(key);
                const languageMarkdown = new MarkdownString().appendMarkdown(`${languages.join(', ')}`);
                for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
                    const row = [];
                    row.push(languageMarkdown);
                    row.push(new MarkdownString().appendMarkdown(`\`${key}\``));
                    row.push(new MarkdownString().appendCodeblock('json', JSON.stringify(value[key], null, 2)));
                    rows.push(row);
                }
            }
            else {
                const row = [];
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
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'configurationDefaults',
    label: nls.localize('settings default overrides', "Settings Default Overrides"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ConfigurationDefaultsTableRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbkV4dGVuc2lvblBvaW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vY29uZmlndXJhdGlvbkV4dGVuc2lvblBvaW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUJBQWlCLENBQUM7QUFDdkMsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFekUsT0FBTyxFQUFFLGtCQUFrQixFQUF1QixNQUFNLHdEQUF3RCxDQUFDO0FBQ2pILE9BQU8sRUFBOEMsVUFBVSxFQUFFLGdCQUFnQixFQUFzQix1QkFBdUIsRUFBMEIsNkJBQTZCLEVBQXVCLGVBQWUsRUFBRSw2QkFBNkIsRUFBRSxVQUFVLEVBQUUsbUNBQW1DLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNqWixPQUFPLEVBQTZCLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUMzSSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM3SSxPQUFPLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxzQkFBc0IsRUFBc0IsTUFBTSxtREFBbUQsQ0FBQztBQUUvRyxPQUFPLEVBQUUsVUFBVSxJQUFJLDJCQUEyQixFQUFtRyxNQUFNLGdFQUFnRSxDQUFDO0FBQzVOLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDdkYsT0FBTyxF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