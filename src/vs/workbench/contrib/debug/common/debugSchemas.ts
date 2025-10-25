/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extensionsRegistry from '../../../services/extensions/common/extensionsRegistry.js';
import * as nls from '../../../../nls.js';
import { IDebuggerContribution, ICompound, IBreakpointContribution } from './debug.js';
import { launchSchemaId } from '../../../services/configuration/common/configuration.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { inputsSchema } from '../../../services/configurationResolver/common/configurationResolverSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

// debuggers extension point
export const debuggersExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IDebuggerContribution[]>({
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
export const breakpointsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IBreakpointContribution[]>({
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

export const presentationSchema: IJSONSchema = {
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
const defaultCompound: ICompound = { name: 'Compound', configurations: [] };
export const launchSchema: IJSONSchema = {
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
		inputs: inputsSchema.definitions!.inputs
	}
};

class DebuggersDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.debuggers;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contrib = manifest.contributes?.debuggers || [];
		if (!contrib.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			nls.localize('debugger name', "Name"),
			nls.localize('debugger type', "Type"),
		];

		const rows: IRowData[][] = contrib.map(d => {
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

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'debuggers',
	label: nls.localize('debuggers', "Debuggers"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(DebuggersDataRenderer),
});

