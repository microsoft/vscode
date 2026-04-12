/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as extensionsRegistry from '../../../services/extensions/common/extensionsRegistry.js';
import * as nls from '../../../../nls.js';
import { launchSchemaId } from '../../../services/configuration/common/configuration.js';
import { inputsSchema } from '../../../services/configurationResolver/common/configurationResolverSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
// debuggers extension point
export const debuggersExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'debuggers',
    defaultExtensionKind: ['workspace'],
    jsonSchema: {
        description: nls.localize('vscode.extension.contributes.debuggers', 'Contributes debug adapters.'),
        type: 'array',
        defaultSnippets: [{ body: [{ type: '' }] }],
        items: {
            additionalProperties: false,
            type: 'object',
            defaultSnippets: [{ body: { type: '', program: '', runtime: '' } }],
            properties: {
                type: {
                    description: nls.localize('vscode.extension.contributes.debuggers.type', "Unique identifier for this debug adapter."),
                    type: 'string'
                },
                label: {
                    description: nls.localize('vscode.extension.contributes.debuggers.label', "Display name for this debug adapter."),
                    type: 'string'
                },
                program: {
                    description: nls.localize('vscode.extension.contributes.debuggers.program', "Path to the debug adapter program. Path is either absolute or relative to the extension folder."),
                    type: 'string'
                },
                args: {
                    description: nls.localize('vscode.extension.contributes.debuggers.args', "Optional arguments to pass to the adapter."),
                    type: 'array'
                },
                runtime: {
                    description: nls.localize('vscode.extension.contributes.debuggers.runtime', "Optional runtime in case the program attribute is not an executable but requires a runtime."),
                    type: 'string'
                },
                runtimeArgs: {
                    description: nls.localize('vscode.extension.contributes.debuggers.runtimeArgs', "Optional runtime arguments."),
                    type: 'array'
                },
                variables: {
                    description: nls.localize('vscode.extension.contributes.debuggers.variables', "Mapping from interactive variables (e.g. ${action.pickProcess}) in `launch.json` to a command."),
                    type: 'object'
                },
                initialConfigurations: {
                    description: nls.localize('vscode.extension.contributes.debuggers.initialConfigurations', "Configurations for generating the initial \'launch.json\'."),
                    type: ['array', 'string'],
                },
                languages: {
                    description: nls.localize('vscode.extension.contributes.debuggers.languages', "List of languages for which the debug extension could be considered the \"default debugger\"."),
                    type: 'array'
                },
                configurationSnippets: {
                    description: nls.localize('vscode.extension.contributes.debuggers.configurationSnippets', "Snippets for adding new configurations in \'launch.json\'."),
                    type: 'array'
                },
                configurationAttributes: {
                    description: nls.localize('vscode.extension.contributes.debuggers.configurationAttributes', "JSON schema configurations for validating \'launch.json\'."),
                    type: 'object'
                },
                when: {
                    description: nls.localize('vscode.extension.contributes.debuggers.when', "Condition which must be true to enable this type of debugger. Consider using 'shellExecutionSupported', 'virtualWorkspace', 'resourceScheme' or an extension-defined context key as appropriate for this."),
                    type: 'string',
                    default: ''
                },
                hiddenWhen: {
                    description: nls.localize('vscode.extension.contributes.debuggers.hiddenWhen', "When this condition is true, this debugger type is hidden from the debugger list, but is still enabled."),
                    type: 'string',
                    default: ''
                },
                deprecated: {
                    description: nls.localize('vscode.extension.contributes.debuggers.deprecated', "Optional message to mark this debug type as being deprecated."),
                    type: 'string',
                    default: ''
                },
                windows: {
                    description: nls.localize('vscode.extension.contributes.debuggers.windows', "Windows specific settings."),
                    type: 'object',
                    properties: {
                        runtime: {
                            description: nls.localize('vscode.extension.contributes.debuggers.windows.runtime', "Runtime used for Windows."),
                            type: 'string'
                        }
                    }
                },
                osx: {
                    description: nls.localize('vscode.extension.contributes.debuggers.osx', "macOS specific settings."),
                    type: 'object',
                    properties: {
                        runtime: {
                            description: nls.localize('vscode.extension.contributes.debuggers.osx.runtime', "Runtime used for macOS."),
                            type: 'string'
                        }
                    }
                },
                linux: {
                    description: nls.localize('vscode.extension.contributes.debuggers.linux', "Linux specific settings."),
                    type: 'object',
                    properties: {
                        runtime: {
                            description: nls.localize('vscode.extension.contributes.debuggers.linux.runtime', "Runtime used for Linux."),
                            type: 'string'
                        }
                    }
                },
                strings: {
                    description: nls.localize('vscode.extension.contributes.debuggers.strings', "UI strings contributed by this debug adapter."),
                    type: 'object',
                    properties: {
                        unverifiedBreakpoints: {
                            description: nls.localize('vscode.extension.contributes.debuggers.strings.unverifiedBreakpoints', "When there are unverified breakpoints in a language supported by this debug adapter, this message will appear on the breakpoint hover and in the breakpoints view. Markdown and command links are supported."),
                            type: 'string'
                        }
                    }
                }
            }
        }
    }
});
// breakpoints extension point #9037
export const breakpointsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'breakpoints',
    jsonSchema: {
        description: nls.localize('vscode.extension.contributes.breakpoints', 'Contributes breakpoints.'),
        type: 'array',
        defaultSnippets: [{ body: [{ language: '' }] }],
        items: {
            type: 'object',
            additionalProperties: false,
            defaultSnippets: [{ body: { language: '' } }],
            properties: {
                language: {
                    description: nls.localize('vscode.extension.contributes.breakpoints.language', "Allow breakpoints for this language."),
                    type: 'string'
                },
                when: {
                    description: nls.localize('vscode.extension.contributes.breakpoints.when', "Condition which must be true to enable breakpoints in this language. Consider matching this to the debugger when clause as appropriate."),
                    type: 'string',
                    default: ''
                }
            }
        }
    }
});
// debug general schema
export const presentationSchema = {
    type: 'object',
    description: nls.localize('presentation', "Presentation options on how to show this configuration in the debug configuration dropdown and the command palette."),
    properties: {
        hidden: {
            type: 'boolean',
            default: false,
            description: nls.localize('presentation.hidden', "Controls if this configuration should be shown in the configuration dropdown and the command palette.")
        },
        group: {
            type: 'string',
            default: '',
            description: nls.localize('presentation.group', "Group that this configuration belongs to. Used for grouping and sorting in the configuration dropdown and the command palette.")
        },
        order: {
            type: 'number',
            default: 1,
            description: nls.localize('presentation.order', "Order of this configuration within a group. Used for grouping and sorting in the configuration dropdown and the command palette.")
        }
    },
    default: {
        hidden: false,
        group: '',
        order: 1
    }
};
const defaultCompound = { name: 'Compound', configurations: [] };
export const launchSchema = {
    id: launchSchemaId,
    type: 'object',
    title: nls.localize('app.launch.json.title', "Launch"),
    allowTrailingCommas: true,
    allowComments: true,
    required: [],
    default: { version: '0.2.0', configurations: [], compounds: [] },
    properties: {
        version: {
            type: 'string',
            description: nls.localize('app.launch.json.version', "Version of this file format."),
            default: '0.2.0'
        },
        configurations: {
            type: 'array',
            description: nls.localize('app.launch.json.configurations', "List of configurations. Add new configurations or edit existing ones by using IntelliSense."),
            items: {
                defaultSnippets: [],
                'type': 'object',
                oneOf: []
            }
        },
        compounds: {
            type: 'array',
            description: nls.localize('app.launch.json.compounds', "List of compounds. Each compound references multiple configurations which will get launched together."),
            items: {
                type: 'object',
                required: ['name', 'configurations'],
                properties: {
                    name: {
                        type: 'string',
                        description: nls.localize('app.launch.json.compound.name', "Name of compound. Appears in the launch configuration drop down menu.")
                    },
                    presentation: presentationSchema,
                    configurations: {
                        type: 'array',
                        default: [],
                        items: {
                            oneOf: [{
                                    enum: [],
                                    description: nls.localize('useUniqueNames', "Please use unique configuration names.")
                                }, {
                                    type: 'object',
                                    required: ['name'],
                                    properties: {
                                        name: {
                                            enum: [],
                                            description: nls.localize('app.launch.json.compound.name', "Name of compound. Appears in the launch configuration drop down menu.")
                                        },
                                        folder: {
                                            enum: [],
                                            description: nls.localize('app.launch.json.compound.folder', "Name of folder in which the compound is located.")
                                        }
                                    }
                                }]
                        },
                        description: nls.localize('app.launch.json.compounds.configurations', "Names of configurations that will be started as part of this compound.")
                    },
                    stopAll: {
                        type: 'boolean',
                        default: false,
                        description: nls.localize('app.launch.json.compound.stopAll', "Controls whether manually terminating one session will stop all of the compound sessions.")
                    },
                    preLaunchTask: {
                        type: 'string',
                        default: '',
                        description: nls.localize('compoundPrelaunchTask', "Task to run before any of the compound configurations start.")
                    }
                },
                default: defaultCompound
            },
            default: [
                defaultCompound
            ]
        },
        inputs: inputsSchema.definitions.inputs
    }
};
class DebuggersDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.debuggers;
    }
    render(manifest) {
        const contrib = manifest.contributes?.debuggers || [];
        if (!contrib.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            nls.localize('debugger name', "Name"),
            nls.localize('debugger type', "Type"),
        ];
        const rows = contrib.map(d => {
            return [
                d.label ?? '',
                d.type
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
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'debuggers',
    label: nls.localize('debuggers', "Debuggers"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(DebuggersDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTY2hlbWFzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnU2NoZW1hcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssa0JBQWtCLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFekYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFtRyxNQUFNLG1FQUFtRSxDQUFDO0FBRWhNLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFNUUsNEJBQTRCO0FBQzVCLE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLHNCQUFzQixDQUEwQjtJQUN0SCxjQUFjLEVBQUUsV0FBVztJQUMzQixvQkFBb0IsRUFBRSxDQUFDLFdBQVcsQ0FBQztJQUNuQyxVQUFVLEVBQUU7UUFDWCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSw2QkFBNkIsQ0FBQztRQUNsRyxJQUFJLEVBQUUsT0FBTztRQUNiLGVBQWUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQzNDLEtBQUssRUFBRTtZQUNOLG9CQUFvQixFQUFFLEtBQUs7WUFDM0IsSUFBSSxFQUFFLFFB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