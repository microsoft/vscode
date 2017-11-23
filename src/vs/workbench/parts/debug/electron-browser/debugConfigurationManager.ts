/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import { first } from 'vs/base/common/arrays';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import * as objects from 'vs/base/common/objects';
import uri from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IModel } from 'vs/editor/common/editorCommon';
import { IEditor } from 'vs/platform/editor/common/editor';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import * as extensionsRegistry from 'vs/platform/extensions/common/extensionsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDebugConfigurationProvider, IRawAdapter, ICompound, IDebugConfiguration, IConfig, IEnvConfig, IGlobalConfig, IConfigurationManager, ILaunch } from 'vs/workbench/parts/debug/common/debug';
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';

// debuggers extension point
export const debuggersExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawAdapter[]>('debuggers', [], {
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
const defaultCompound: ICompound = { name: 'Compound', configurations: [] };
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
const DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';
const DEBUG_SELECTED_ROOT = 'debug.selectedroot';

export class ConfigurationManager implements IConfigurationManager {
	private adapters: Adapter[];
	private breakpointModeIdsSet = new Set<string>();
	private launches: ILaunch[];
	private _selectedName: string;
	private _selectedLaunch: ILaunch;
	private toDispose: IDisposable[];
	private _onDidSelectConfigurationName = new Emitter<void>();
	private providers: IDebugConfigurationProvider[];

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommandService private commandService: ICommandService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		this.providers = [];
		this.adapters = [];
		this.toDispose = [];
		this.registerListeners(lifecycleService);
		this.initLaunches();
		const previousSelectedRoot = this.storageService.get(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
		const filtered = this.launches.filter(l => l.workspace.uri.toString() === previousSelectedRoot);
		this.selectConfiguration(filtered.length ? filtered[0] : undefined, this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE));
	}

	public registerDebugConfigurationProvider(handle: number, debugConfigurationProvider: IDebugConfigurationProvider): void {
		if (!debugConfigurationProvider) {
			return;
		}

		debugConfigurationProvider.handle = handle;
		this.providers = this.providers.filter(p => p.handle !== handle);
		this.providers.push(debugConfigurationProvider);
		const adapter = this.getAdapter(debugConfigurationProvider.type);
		// Check if the provider contributes provideDebugConfigurations method
		if (adapter && debugConfigurationProvider.provideDebugConfigurations) {
			adapter.hasConfigurationProvider = true;
		}
	}

	public unregisterDebugConfigurationProvider(handle: number): void {
		this.providers = this.providers.filter(p => p.handle !== handle);
	}

	public resolveConfigurationByProviders(folderUri: uri | undefined, type: string | undefined, debugConfiguration: IConfig): TPromise<IConfig> {
		// pipe the config through the promises sequentially. append at the end the '*' types
		const providers = this.providers.filter(p => p.type === type && p.resolveDebugConfiguration)
			.concat(this.providers.filter(p => p.type === '*' && p.resolveDebugConfiguration));

		return providers.reduce((promise, provider) => {
			return promise.then(config => {
				if (config) {
					return provider.resolveDebugConfiguration(folderUri, config);
				} else {
					return Promise.resolve(config);
				}
			});
		}, TPromise.as(debugConfiguration));
	}

	public provideDebugConfigurations(folderUri: uri | undefined, type: string): TPromise<any[]> {
		return TPromise.join(this.providers.filter(p => p.type === type && p.provideDebugConfigurations).map(p => p.provideDebugConfigurations(folderUri)))
			.then(results => results.reduce((first, second) => first.concat(second), []));
	}

	private registerListeners(lifecycleService: ILifecycleService): void {
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
						this.adapters.push(new Adapter(rawAdapter, extension.description, this.configurationService, this.commandService));
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

		this.toDispose.push(this.contextService.onDidChangeWorkspaceFolders(() => {
			this.initLaunches();
			this.selectConfiguration();
		}));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('launch')) {
				this.selectConfiguration();
			}
		}));

		this.toDispose.push(lifecycleService.onShutdown(this.store, this));
	}

	private initLaunches(): void {
		this.launches = this.contextService.getWorkspace().folders.map(folder => this.instantiationService.createInstance(Launch, this, folder));
		if (this.launches.indexOf(this._selectedLaunch) === -1) {
			this._selectedLaunch = undefined;
		}
	}

	public getLaunches(): ILaunch[] {
		return this.launches;
	}

	public get selectedLaunch(): ILaunch {
		return this._selectedLaunch;
	}

	public get selectedName(): string {
		return this._selectedName;
	}

	public get onDidSelectConfiguration(): Event<void> {
		return this._onDidSelectConfigurationName.event;
	}

	public selectConfiguration(launch?: ILaunch, name?: string, debugStarted?: boolean): void {
		const previousLaunch = this._selectedLaunch;
		const previousName = this._selectedName;

		if (!launch) {
			launch = this.selectedLaunch && this.selectedLaunch.getConfigurationNames().length ? this.selectedLaunch : first(this.launches, l => !!l.getConfigurationNames().length, this.launches.length ? this.launches[0] : undefined);
		}

		this._selectedLaunch = launch;
		const names = launch ? launch.getConfigurationNames() : [];
		if (name && names.indexOf(name) >= 0) {
			this._selectedName = name;
		}
		if (names.indexOf(this.selectedName) === -1) {
			this._selectedName = names.length ? names[0] : undefined;
		}

		if (this.selectedLaunch !== previousLaunch || this.selectedName !== previousName) {
			this._onDidSelectConfigurationName.fire();
		}
	}

	public canSetBreakpointsIn(model: IModel): boolean {
		const modeId = model ? model.getLanguageIdentifier().language : null;
		if (!modeId || modeId === 'json') {
			// do not allow breakpoints in our settings files
			return false;
		}
		if (this.configurationService.getValue<IDebugConfiguration>('debug').allowBreakpointsEverywhere) {
			return true;
		}

		return this.breakpointModeIdsSet.has(modeId);
	}

	public getAdapter(type: string): Adapter {
		return this.adapters.filter(adapter => strings.equalsIgnoreCase(adapter.type, type)).pop();
	}

	public guessAdapter(type?: string): TPromise<Adapter> {
		if (type) {
			const adapter = this.getAdapter(type);
			return TPromise.as(adapter);
		}

		const editor = this.editorService.getActiveEditor();
		if (editor) {
			const codeEditor = editor.getControl();
			if (isCodeEditor(codeEditor)) {
				const model = codeEditor.getModel();
				const language = model ? model.getLanguageIdentifier().language : undefined;
				const adapters = this.adapters.filter(a => a.languages && a.languages.indexOf(language) >= 0);
				if (adapters.length === 1) {
					return TPromise.as(adapters[0]);
				}
			}
		}

		return this.quickOpenService.pick([...this.adapters.filter(a => a.hasInitialConfiguration() || a.hasConfigurationProvider), { label: 'More...', separator: { border: true } }], { placeHolder: nls.localize('selectDebug', "Select Environment") })
			.then(picked => {
				if (picked instanceof Adapter) {
					return picked;
				}
				if (picked) {
					this.commandService.executeCommand('debug.installAdditionalDebuggers');
				}
				return undefined;
			});
	}

	private store(): void {
		this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.selectedName, StorageScope.WORKSPACE);
		if (this._selectedLaunch) {
			this.storageService.store(DEBUG_SELECTED_ROOT, this._selectedLaunch.workspace.uri.toString(), StorageScope.WORKSPACE);
		}
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

class Launch implements ILaunch {

	constructor(
		private configurationManager: ConfigurationManager,
		public workspace: IWorkspaceFolder,
		@IFileService private fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationResolverService private configurationResolverService: IConfigurationResolverService,
		@IExtensionService private extensionService: IExtensionService
	) {
		// noop
	}

	public getCompound(name: string): ICompound {
		const config = this.configurationService.getValue<IGlobalConfig>('launch', { resource: this.workspace.uri });
		if (!config || !config.compounds) {
			return null;
		}

		return config.compounds.filter(compound => compound.name === name).pop();
	}

	public getConfigurationNames(): string[] {
		const config = this.configurationService.getValue<IGlobalConfig>('launch', { resource: this.workspace.uri });
		if (!config || !config.configurations || !Array.isArray(config.configurations)) {
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

	public getConfiguration(name: string): IConfig {
		const config = objects.deepClone(this.configurationService.getValue<IGlobalConfig>('launch', { resource: this.workspace.uri }));
		if (!config || !config.configurations) {
			return null;
		}

		return config.configurations.filter(config => config && config.name === name).shift();
	}

	public resolveConfiguration(config: IConfig): TPromise<IConfig> {
		const result = objects.deepClone(config) as IConfig;
		// Set operating system specific properties #1873
		const setOSProperties = (flag: boolean, osConfig: IEnvConfig) => {
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
			result[key] = this.configurationResolverService.resolveAny(this.workspace, result[key]);
		});

		const adapter = this.configurationManager.getAdapter(result.type);
		return this.configurationResolverService.resolveInteractiveVariables(result, adapter ? adapter.variables : null);
	}

	public get uri(): uri {
		return this.workspace.uri.with({ path: paths.join(this.workspace.uri.path, '/.vscode/launch.json') });
	}

	public openConfigFile(sideBySide: boolean, type?: string): TPromise<IEditor> {
		return this.extensionService.activateByEvent('onDebug').then(() => {
			const resource = this.uri;
			let configFileCreated = false;

			return this.fileService.resolveContent(resource).then(content => content, err => {

				// launch.json not found: create one by collecting launch configs from debugConfigProviders

				return this.configurationManager.guessAdapter(type).then(adapter => {
					if (adapter) {
						return this.configurationManager.provideDebugConfigurations(this.workspace.uri, adapter.type).then(initialConfigs => {
							return adapter.getInitialConfigurationContent(initialConfigs);
						});
					} else {
						return undefined;
					}
				}).then(content => {

					if (!content) {
						return undefined;
					}

					configFileCreated = true;
					return this.fileService.updateContent(resource, content).then(() => {
						// convert string into IContent; see #32135
						return { value: content };
					});
				});
			}).then(content => {
				if (!content) {
					return undefined;
				}
				const index = content.value.indexOf(`"${this.configurationManager.selectedName}"`);
				let startLineNumber = 1;
				for (let i = 0; i < index; i++) {
					if (content.value.charAt(i) === '\n') {
						startLineNumber++;
					}
				}
				const selection = startLineNumber > 1 ? { startLineNumber, startColumn: 4 } : undefined;

				return this.editorService.openEditor({
					resource: resource,
					options: {
						forceOpen: true,
						selection,
						pinned: configFileCreated, // pin only if config file is created #8727
						revealIfVisible: true
					},
				}, sideBySide);
			}, (error) => {
				throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error));
			});
		});
	}
}
