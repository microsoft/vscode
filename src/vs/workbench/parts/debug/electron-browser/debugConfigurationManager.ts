/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import * as objects from 'vs/base/common/objects';
import uri from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import * as paths from 'vs/base/common/paths';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IModel, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { IEditor } from 'vs/platform/editor/common/editor';
import * as extensionsRegistry from 'vs/platform/extensions/common/extensionsRegistry';
import { Registry } from 'vs/platform/platform';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import * as debug from 'vs/workbench/parts/debug/common/debug';
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

// debuggers extension point
export const debuggersExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<debug.IRawAdapter[]>('debuggers', [], {
	description: nls.localize('vscode.extension.contributes.debuggers', 'Contributes debug adapters.'),
	type: 'array',
	defaultSnippets: [{ body: [{ type: '', extensions: [] }] }],
	items: {
		type: 'object',
		defaultSnippets: [{ body: { type: '', program: '', runtime: '', enableBreakpointsFor: { languageIds: [''] } } }],
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
				description: nls.localize('vscode.extension.contributes.debuggers.variables', "Mapping from interactive variables (e.g ${action.pickProcess}) in `launch.json` to a command."),
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
			adapterExecutableCommand: {
				description: nls.localize('vscode.extension.contributes.debuggers.adapterExecutableCommand', "If specified VS Code will call this command to determine the executable path of the debug adapter and the arguments to pass."),
				type: 'string'
			},
			startSessionCommand: {
				description: nls.localize('vscode.extension.contributes.debuggers.startSessionCommand', "If specified VS Code will call this command for the \"debug\" or \"run\" actions targeted for this extension."),
				type: 'string'
			},
			configurationSnippets: {
				description: nls.localize('vscode.extension.contributes.debuggers.configurationSnippets', "Snippets for adding new configurations in \'launch.json\'."),
				type: 'array'
			},
			configurationAttributes: {
				description: nls.localize('vscode.extension.contributes.debuggers.configurationAttributes', "JSON schema configurations for validating \'launch.json\'."),
				type: 'object'
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
				description: nls.localize('vscode.extension.contributes.debuggers.osx', "OS X specific settings."),
				type: 'object',
				properties: {
					runtime: {
						description: nls.localize('vscode.extension.contributes.debuggers.osx.runtime', "Runtime used for OSX."),
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
			}
		}
	}
});

interface IRawBreakpointContribution {
	language: string;
}

// breakpoints extension point #9037
const breakpointsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawBreakpointContribution[]>('breakpoints', [], {
	description: nls.localize('vscode.extension.contributes.breakpoints', 'Contributes breakpoints.'),
	type: 'array',
	defaultSnippets: [{ body: [{ language: '' }] }],
	items: {
		type: 'object',
		defaultSnippets: [{ body: { language: '' } }],
		properties: {
			language: {
				description: nls.localize('vscode.extension.contributes.breakpoints.language', "Allow breakpoints for this language."),
				type: 'string'
			},
		}
	}
});

// debug general schema

export const schemaId = 'vscode://schemas/launch';
const defaultCompound: debug.ICompound = { name: 'Compound', configurations: [] };
const schema: IJSONSchema = {
	id: schemaId,
	type: 'object',
	title: nls.localize('app.launch.json.title', "Launch"),
	required: ['version', 'configurations'],
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
					configurations: {
						type: 'array',
						default: [],
						items: {
							type: 'string'
						},
						description: nls.localize('app.launch.json.compounds.configurations', "Names of configurations that will be started as part of this compound.")
					}
				},
				default: defaultCompound
			},
			default: [
				defaultCompound
			]
		}
	}
};

const jsonRegistry = <IJSONContributionRegistry>Registry.as(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema(schemaId, schema);

export class ConfigurationManager implements debug.IConfigurationManager {
	private adapters: Adapter[];
	private breakpointModeIdsSet: Set<string>;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationResolverService private configurationResolverService: IConfigurationResolverService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IViewletService private viewletService: IViewletService
	) {
		this.adapters = [];
		this.registerListeners();
		this.breakpointModeIdsSet = new Set<string>();
	}

	private registerListeners(): void {
		debuggersExtPoint.setHandler((extensions) => {
			extensions.forEach(extension => {
				extension.value.forEach(rawAdapter => {
					if (!rawAdapter.type || (typeof rawAdapter.type !== 'string')) {
						extension.collector.error(nls.localize('debugNoType', "Debug adapter 'type' can not be omitted and must be of type 'string'."));
					}
					if (rawAdapter.enableBreakpointsFor) {
						rawAdapter.enableBreakpointsFor.languageIds.forEach(modeId => {
							this.breakpointModeIdsSet.add(modeId);
						});
					}

					const duplicate = this.adapters.filter(a => a.type === rawAdapter.type).pop();
					if (duplicate) {
						duplicate.merge(rawAdapter, extension.description);
					} else {
						this.adapters.push(this.instantiationService.createInstance(Adapter, rawAdapter, extension.description));
					}
				});
			});

			// update the schema to include all attributes, snippets and types from extensions.
			this.adapters.forEach(adapter => {
				const items = (<IJSONSchema>schema.properties['configurations'].items);
				const schemaAttributes = adapter.getSchemaAttributes();
				if (schemaAttributes) {
					items.oneOf.push(...schemaAttributes);
				}
				const configurationSnippets = adapter.configurationSnippets;
				if (configurationSnippets) {
					items.defaultSnippets.push(...configurationSnippets);
				}
			});
		});

		breakpointsExtPoint.setHandler(extensions => {
			extensions.forEach(ext => {
				ext.value.forEach(breakpoints => {
					this.breakpointModeIdsSet.add(breakpoints.language);
				});
			});
		});
	}

	public getAdapter(type: string): Adapter {
		return this.adapters.filter(adapter => strings.equalsIgnoreCase(adapter.type, type)).pop();
	}

	public getCompound(name: string): debug.ICompound {
		if (!this.contextService.getWorkspace()) {
			return null;
		}

		const config = this.configurationService.getConfiguration<debug.IGlobalConfig>('launch');
		if (!config || !config.compounds) {
			return null;
		}

		return config.compounds.filter(compound => compound.name === name).pop();
	}

	public getConfigurationNames(): string[] {
		const config = this.configurationService.getConfiguration<debug.IGlobalConfig>('launch');
		if (!config || !config.configurations) {
			return [];
		} else {
			const names = config.configurations.filter(cfg => cfg && typeof cfg.name === 'string').map(cfg => cfg.name);
			if (names.length > 0 && config.compounds) {
				if (config.compounds) {
					names.push(...config.compounds.filter(compound => typeof compound.name === 'string' && compound.configurations && compound.configurations.length)
						.map(compound => compound.name));
				}
			}

			return names;
		}
	}

	public getConfiguration(name: string): debug.IConfig {
		if (!this.contextService.getWorkspace()) {
			return null;
		}

		const config = this.configurationService.getConfiguration<debug.IGlobalConfig>('launch');
		if (!config || !config.configurations) {
			return null;
		}

		return config.configurations.filter(config => config && config.name === name).pop();
	}

	public resloveConfiguration(config: debug.IConfig): TPromise<debug.IConfig> {
		if (!this.contextService.getWorkspace()) {
			return TPromise.as(config);
		}

		const result = objects.deepClone(config) as debug.IConfig;
		// Set operating system specific properties #1873
		const setOSProperties = (flag: boolean, osConfig: debug.IEnvConfig) => {
			if (flag && osConfig) {
				Object.keys(osConfig).forEach(key => {
					result[key] = osConfig[key];
				});
			}
		};
		setOSProperties(isWindows, result.windows);
		setOSProperties(isMacintosh, result.osx);
		setOSProperties(isLinux, result.linux);

		// massage configuration attributes - append workspace path to relatvie paths, substitute variables in paths.
		Object.keys(result).forEach(key => {
			result[key] = this.configurationResolverService.resolveAny(result[key]);
		});

		const adapter = this.getAdapter(result.type);
		return this.configurationResolverService.resolveInteractiveVariables(result, adapter ? adapter.variables : null);
	}

	public openConfigFile(sideBySide: boolean, type?: string): TPromise<IEditor> {
		const resource = uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, '/.vscode/launch.json'));
		let configFileCreated = false;

		return this.fileService.resolveContent(resource).then(content => true, err =>
			this.guessAdapter(type).then(adapter => adapter ? adapter.getInitialConfigurationContent() : undefined)
				.then(content => {
					if (!content) {
						return false;
					}

					configFileCreated = true;
					return this.fileService.updateContent(resource, content).then(() => true);
				}))
			.then(errorFree => {
				if (!errorFree) {
					return undefined;
				}
				this.telemetryService.publicLog('debugConfigure');

				return this.editorService.openEditor({
					resource: resource,
					options: {
						forceOpen: true,
						pinned: configFileCreated, // pin only if config file is created #8727
						revealIfVisible: true
					},
				}, sideBySide);
			}, (error) => {
				throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error));
			});
	}

	public getStartSessionCommand(type?: string): TPromise<{ command: string, type: string }> {
		return this.guessAdapter(type).then(adapter => {
			if (adapter) {
				return {
					command: adapter.startSessionCommand,
					type: adapter.type
				};
			}
			return undefined;
		});
	}

	private guessAdapter(type?: string): TPromise<Adapter> {
		if (type) {
			const adapter = this.getAdapter(type);
			return TPromise.as(adapter);
		}

		const editor = this.editorService.getActiveEditor();
		if (editor) {
			const codeEditor = <ICommonCodeEditor>editor.getControl();
			const model = codeEditor ? codeEditor.getModel() : undefined;
			const language = model ? model.getLanguageIdentifier().language : undefined;
			const adapters = this.adapters.filter(a => a.languages && a.languages.indexOf(language) >= 0);
			if (adapters.length === 1) {
				return TPromise.as(adapters[0]);
			}
		}

		return this.quickOpenService.pick([...this.adapters.filter(a => a.hasInitialConfiguration()), { label: 'More...' }], { placeHolder: nls.localize('selectDebug', "Select Environment") })
			.then(picked => {
				if (picked instanceof Adapter) {
					return picked;
				}
				if (picked) {
					return this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true)
						.then(viewlet => viewlet as IExtensionsViewlet)
						.then(viewlet => {
							viewlet.search('tag:debuggers');
							viewlet.focus();
						});
				}
				return undefined;
			});
	}

	public canSetBreakpointsIn(model: IModel): boolean {
		if (model.uri.scheme !== Schemas.file && model.uri.scheme !== debug.DEBUG_SCHEME) {
			return false;
		}
		if (this.configurationService.getConfiguration<debug.IDebugConfiguration>('debug').allowBreakpointsEverywhere) {
			return true;
		}

		const modeId = model ? model.getLanguageIdentifier().language : null;

		return this.breakpointModeIdsSet.has(modeId);
	}
}
