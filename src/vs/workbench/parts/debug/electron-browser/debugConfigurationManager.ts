/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import * as objects from 'vs/base/common/objects';
import { URI as uri } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ITextModel } from 'vs/editor/common/model';
import { IEditor } from 'vs/workbench/common/editor';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDebugConfigurationProvider, ICompound, IDebugConfiguration, IConfig, IGlobalConfig, IConfigurationManager, ILaunch, IDebugAdapterProvider, IDebugAdapter, ITerminalSettings, ITerminalLauncher, IDebugSession, IAdapterDescriptor, CONTEXT_DEBUG_CONFIGURATION_TYPE } from 'vs/workbench/parts/debug/common/debug';
import { Debugger } from 'vs/workbench/parts/debug/node/debugger';
import { IEditorService, ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { launchSchemaId } from 'vs/workbench/services/configuration/common/configuration';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { TerminalLauncher } from 'vs/workbench/parts/debug/electron-browser/terminalSupport';
import { Registry } from 'vs/platform/registry/common/platform';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { launchSchema, debuggersExtPoint, breakpointsExtPoint } from 'vs/workbench/parts/debug/common/debugSchemas';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';

const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema(launchSchemaId, launchSchema);

const DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';
const DEBUG_SELECTED_ROOT = 'debug.selectedroot';

export class ConfigurationManager implements IConfigurationManager {
	private debuggers: Debugger[];
	private breakpointModeIdsSet = new Set<string>();
	private launches: ILaunch[];
	private selectedName: string;
	private selectedLaunch: ILaunch;
	private toDispose: IDisposable[];
	private _onDidSelectConfigurationName = new Emitter<void>();
	private providers: IDebugConfigurationProvider[];
	private debugAdapterProviders: Map<string, IDebugAdapterProvider>;
	private terminalLauncher: ITerminalLauncher;
	private debugConfigurationTypeContext: IContextKey<string>;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEditorService private editorService: IEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IQuickInputService private quickInputService: IQuickInputService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommandService private commandService: ICommandService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IExtensionService private extensionService: IExtensionService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.providers = [];
		this.debuggers = [];
		this.toDispose = [];
		this.registerListeners(lifecycleService);
		this.initLaunches();
		const previousSelectedRoot = this.storageService.get(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
		const previousSelectedLaunch = this.launches.filter(l => l.uri.toString() === previousSelectedRoot).pop();
		this.debugConfigurationTypeContext = CONTEXT_DEBUG_CONFIGURATION_TYPE.bindTo(contextKeyService);
		this.debugAdapterProviders = new Map<string, IDebugAdapterProvider>();
		if (previousSelectedLaunch) {
			this.selectConfiguration(previousSelectedLaunch, this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE));
		}
	}

	public registerDebugConfigurationProvider(handle: number, debugConfigurationProvider: IDebugConfigurationProvider): void {
		if (!debugConfigurationProvider) {
			return;
		}

		debugConfigurationProvider.handle = handle;
		this.providers = this.providers.filter(p => p.handle !== handle);
		this.providers.push(debugConfigurationProvider);
		const dbg = this.getDebugger(debugConfigurationProvider.type);
		// Check if the provider contributes provideDebugConfigurations method
		if (dbg && debugConfigurationProvider.provideDebugConfigurations) {
			dbg.hasConfigurationProvider = true;
		}
	}

	public needsToRunInExtHost(debugType: string): boolean {
		// if the given debugType matches any registered provider that has a provideTracker method, we need to run the DA in the EH
		const providers = this.providers.filter(p => p.hasTracker && (p.type === debugType || p.type === '*'));
		return providers.length > 0;
	}

	public unregisterDebugConfigurationProvider(handle: number): void {
		this.providers = this.providers.filter(p => p.handle !== handle);
	}

	public resolveConfigurationByProviders(folderUri: uri | undefined, type: string | undefined, debugConfiguration: IConfig): TPromise<IConfig> {
		return this.activateDebuggers(`onDebugResolve:${type}`).then(() => {
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
			}, Promise.resolve(debugConfiguration));
		});
	}

	public provideDebugConfigurations(folderUri: uri | undefined, type: string): TPromise<any[]> {
		return this.activateDebuggers('onDebugInitialConfigurations')
			.then(() => Promise.all(this.providers.filter(p => p.type === type && p.provideDebugConfigurations).map(p => p.provideDebugConfigurations(folderUri)))
				.then(results => results.reduce((first, second) => first.concat(second), [])));
	}

	public provideDebugAdapter(session: IDebugSession, folderUri: uri | undefined, config: IConfig): TPromise<IAdapterDescriptor | undefined> {
		const providers = this.providers.filter(p => p.type === config.type && p.provideDebugAdapter);
		if (providers.length === 1) {
			return providers[0].provideDebugAdapter(session, folderUri, config);
		} else {
			// TODO@AW handle n > 1 case
		}
		return Promise.resolve(undefined);
	}

	public registerDebugAdapterProvider(debugTypes: string[], debugAdapterLauncher: IDebugAdapterProvider): IDisposable {
		debugTypes.forEach(debugType => this.debugAdapterProviders.set(debugType, debugAdapterLauncher));
		return {
			dispose: () => {
				debugTypes.forEach(debugType => this.debugAdapterProviders.delete(debugType));
			}
		};
	}

	private getDebugAdapterProvider(type: string): IDebugAdapterProvider | undefined {
		return this.debugAdapterProviders.get(type);
	}

	public createDebugAdapter(session: IDebugSession, folder: IWorkspaceFolder, config: IConfig): IDebugAdapter {
		let dap = this.getDebugAdapterProvider(config.type);
		if (dap) {
			return dap.createDebugAdapter(session, folder, config);
		}
		return undefined;
	}

	public substituteVariables(debugType: string, folder: IWorkspaceFolder, config: IConfig): TPromise<IConfig> {
		let dap = this.getDebugAdapterProvider(debugType);
		if (dap) {
			return dap.substituteVariables(folder, config);
		}
		return Promise.resolve(config);
	}

	public runInTerminal(debugType: string, args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {

		let tl: ITerminalLauncher = this.getDebugAdapterProvider(debugType);
		if (!tl) {
			if (!this.terminalLauncher) {
				this.terminalLauncher = this.instantiationService.createInstance(TerminalLauncher);
			}
			tl = this.terminalLauncher;
		}
		return tl.runInTerminal(args, config);
	}

	private registerListeners(lifecycleService: ILifecycleService): void {
		debuggersExtPoint.setHandler((extensions) => {
			extensions.forEach(extension => {
				extension.value.forEach(rawAdapter => {
					if (!rawAdapter.type || (typeof rawAdapter.type !== 'string')) {
						extension.collector.error(nls.localize('debugNoType', "Debugger 'type' can not be omitted and must be of type 'string'."));
					}
					if (rawAdapter.enableBreakpointsFor) {
						rawAdapter.enableBreakpointsFor.languageIds.forEach(modeId => {
							this.breakpointModeIdsSet.add(modeId);
						});
					}

					const duplicate = this.getDebugger(rawAdapter.type);
					if (duplicate) {
						duplicate.merge(rawAdapter, extension.description);
					} else {
						this.debuggers.push(this.instantiationService.createInstance(Debugger, this, rawAdapter, extension.description));
					}
				});
			});

			// update the schema to include all attributes, snippets and types from extensions.
			this.debuggers.forEach(adapter => {
				const items = (<IJSONSchema>launchSchema.properties['configurations'].items);
				const schemaAttributes = adapter.getSchemaAttributes();
				if (schemaAttributes) {
					items.oneOf.push(...schemaAttributes);
				}
				const configurationSnippets = adapter.configurationSnippets;
				if (configurationSnippets) {
					items.defaultSnippets.push(...configurationSnippets);
				}
			});

			this.setCompoundSchemaValues();
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
			this.selectConfiguration(this.selectedLaunch);
			this.setCompoundSchemaValues();
		}));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('launch')) {
				this.selectConfiguration(this.selectedLaunch);
				this.setCompoundSchemaValues();
			}
		}));

		this.toDispose.push(this.storageService.onWillSaveState(this.saveState, this));
	}

	private initLaunches(): void {
		this.launches = this.contextService.getWorkspace().folders.map(folder => this.instantiationService.createInstance(Launch, this, folder));
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			this.launches.push(this.instantiationService.createInstance(WorkspaceLaunch, this));
		}
		this.launches.push(this.instantiationService.createInstance(UserLaunch, this));

		if (this.launches.indexOf(this.selectedLaunch) === -1) {
			this.selectedLaunch = undefined;
		}
	}

	private setCompoundSchemaValues(): void {
		const compoundConfigurationsSchema = (<IJSONSchema>launchSchema.properties['compounds'].items).properties['configurations'];
		const launchNames = this.launches.map(l =>
			l.getConfigurationNames(false)).reduce((first, second) => first.concat(second), []);
		(<IJSONSchema>compoundConfigurationsSchema.items).oneOf[0].enum = launchNames;
		(<IJSONSchema>compoundConfigurationsSchema.items).oneOf[1].properties.name.enum = launchNames;

		const folderNames = this.contextService.getWorkspace().folders.map(f => f.name);
		(<IJSONSchema>compoundConfigurationsSchema.items).oneOf[1].properties.folder.enum = folderNames;

		jsonRegistry.registerSchema(launchSchemaId, launchSchema);
	}

	public getLaunches(): ILaunch[] {
		return this.launches;
	}

	public getLaunch(workspaceUri: uri): ILaunch {
		if (!uri.isUri(workspaceUri)) {
			return undefined;
		}

		return this.launches.filter(l => l.workspace && l.workspace.uri.toString() === workspaceUri.toString()).pop();
	}

	public get selectedConfiguration(): { launch: ILaunch, name: string } {
		return {
			launch: this.selectedLaunch,
			name: this.selectedName
		};
	}

	public get onDidSelectConfiguration(): Event<void> {
		return this._onDidSelectConfigurationName.event;
	}

	public getWorkspaceLaunch(): ILaunch {
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			return this.launches[this.launches.length - 1];
		}

		return undefined;
	}

	public selectConfiguration(launch: ILaunch, name?: string): void {
		const previousLaunch = this.selectedLaunch;
		const previousName = this.selectedName;

		this.selectedLaunch = launch;
		const names = launch ? launch.getConfigurationNames() : [];
		if (name && names.indexOf(name) >= 0) {
			this.selectedName = name;
		}
		if (names.indexOf(this.selectedName) === -1) {
			this.selectedName = names.length ? names[0] : undefined;
		}
		if (this.selectedLaunch && this.selectedName) {
			const configuration = this.selectedLaunch.getConfiguration(this.selectedName);
			this.debugConfigurationTypeContext.set(configuration ? configuration.type : undefined);
		} else {
			this.debugConfigurationTypeContext.reset();
		}

		if (this.selectedLaunch !== previousLaunch || this.selectedName !== previousName) {
			this._onDidSelectConfigurationName.fire();
		}
	}

	public canSetBreakpointsIn(model: ITextModel): boolean {
		const modeId = model ? model.getLanguageIdentifier().language : null;
		if (!modeId || modeId === 'jsonc' || modeId === 'log') {
			// do not allow breakpoints in our settings files and output
			return false;
		}
		if (this.configurationService.getValue<IDebugConfiguration>('debug').allowBreakpointsEverywhere) {
			return true;
		}

		return this.breakpointModeIdsSet.has(modeId);
	}

	public getDebugger(type: string): Debugger {
		return this.debuggers.filter(dbg => strings.equalsIgnoreCase(dbg.type, type)).pop();
	}

	public guessDebugger(type?: string): TPromise<Debugger> {
		if (type) {
			const adapter = this.getDebugger(type);
			return Promise.resolve(adapter);
		}

		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		let candidates: TPromise<Debugger[]>;
		if (isCodeEditor(activeTextEditorWidget)) {
			const model = activeTextEditorWidget.getModel();
			const language = model ? model.getLanguageIdentifier().language : undefined;
			const adapters = this.debuggers.filter(a => a.languages && a.languages.indexOf(language) >= 0);
			if (adapters.length === 1) {
				return Promise.resolve(adapters[0]);
			}
			if (adapters.length > 1) {
				candidates = Promise.resolve(adapters);
			}
		}

		if (!candidates) {
			candidates = this.activateDebuggers('onDebugInitialConfigurations').then(() => this.debuggers.filter(a => a.hasInitialConfiguration() || a.hasConfigurationProvider));
		}

		return candidates.then(debuggers => {
			debuggers.sort((first, second) => first.label.localeCompare(second.label));
			const picks = debuggers.map(c => ({ label: c.label, debugger: c }));
			return this.quickInputService.pick<(typeof picks)[0]>([...picks, { type: 'separator' }, { label: 'More...', debugger: undefined }], { placeHolder: nls.localize('selectDebug', "Select Environment") })
				.then(picked => {
					if (picked && picked.debugger) {
						return picked.debugger;
					}
					if (picked) {
						this.commandService.executeCommand('debug.installAdditionalDebuggers');
					}
					return undefined;
				});
		});
	}

	private activateDebuggers(activationEvent: string): TPromise<void> {
		return this.extensionService.activateByEvent(activationEvent).then(() => this.extensionService.activateByEvent('onDebug'));
	}

	private saveState(): void {
		this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.selectedName, StorageScope.WORKSPACE);
		if (this.selectedLaunch) {
			this.storageService.store(DEBUG_SELECTED_ROOT, this.selectedLaunch.uri.toString(), StorageScope.WORKSPACE);
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
		@IEditorService protected editorService: IEditorService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
	) {
		// noop
	}

	public get uri(): uri {
		return resources.joinPath(this.workspace.uri, '/.vscode/launch.json');
	}

	public get name(): string {
		return this.workspace.name;
	}

	public get hidden(): boolean {
		return false;
	}

	protected getConfig(): IGlobalConfig {
		return this.configurationService.inspect<IGlobalConfig>('launch', { resource: this.workspace.uri }).workspaceFolder;
	}

	public getCompound(name: string): ICompound {
		const config = this.getConfig();
		if (!config || !config.compounds) {
			return null;
		}

		return config.compounds.filter(compound => compound.name === name).pop();
	}

	public getConfigurationNames(includeCompounds = true): string[] {
		const config = this.getConfig();
		if (!config || !config.configurations || !Array.isArray(config.configurations)) {
			return [];
		} else {
			const names = config.configurations.filter(cfg => cfg && typeof cfg.name === 'string').map(cfg => cfg.name);
			if (includeCompounds && config.compounds) {
				if (config.compounds) {
					names.push(...config.compounds.filter(compound => typeof compound.name === 'string' && compound.configurations && compound.configurations.length)
						.map(compound => compound.name));
				}
			}

			return names;
		}
	}

	public getConfiguration(name: string): IConfig {
		// We need to clone the configuration in order to be able to make changes to it #42198
		const config = objects.deepClone(this.getConfig());
		if (!config || !config.configurations) {
			return null;
		}

		return config.configurations.filter(config => config && config.name === name).shift();
	}

	public openConfigFile(sideBySide: boolean, preserveFocus: boolean, type?: string): TPromise<{ editor: IEditor, created: boolean }> {
		const resource = this.uri;
		let created = false;

		return this.fileService.resolveContent(resource).then(content => content.value, err => {
			// launch.json not found: create one by collecting launch configs from debugConfigProviders
			return this.configurationManager.guessDebugger(type).then(adapter => {
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

				created = true; // pin only if config file is created #8727
				return this.fileService.updateContent(resource, content).then(() => {
					// convert string into IContent; see #32135
					return content;
				});
			});
		}).then(content => {
			if (!content) {
				return { editor: undefined, created: false };
			}
			const index = content.indexOf(`"${this.configurationManager.selectedConfiguration.name}"`);
			let startLineNumber = 1;
			for (let i = 0; i < index; i++) {
				if (content.charAt(i) === '\n') {
					startLineNumber++;
				}
			}
			const selection = startLineNumber > 1 ? { startLineNumber, startColumn: 4 } : undefined;

			return this.editorService.openEditor({
				resource,
				options: {
					selection,
					preserveFocus,
					pinned: created,
					revealIfVisible: true
				},
			}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => ({ editor, created }));
		}, (error) => {
			throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error));
		});
	}
}

class WorkspaceLaunch extends Launch implements ILaunch {

	constructor(
		configurationManager: ConfigurationManager,
		@IFileService fileService: IFileService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
	) {
		super(configurationManager, undefined, fileService, editorService, configurationService, contextService);
	}

	get uri(): uri {
		return this.contextService.getWorkspace().configuration;
	}

	get name(): string {
		return nls.localize('workspace', "workspace");
	}

	protected getConfig(): IGlobalConfig {
		return this.configurationService.inspect<IGlobalConfig>('launch').workspace;
	}

	openConfigFile(sideBySide: boolean, preserveFocus: boolean, type?: string): TPromise<{ editor: IEditor, created: boolean }> {
		return this.editorService.openEditor({
			resource: this.contextService.getWorkspace().configuration,
			options: { preserveFocus }
		}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => ({ editor, created: false }));
	}
}

class UserLaunch extends Launch implements ILaunch {

	constructor(
		configurationManager: ConfigurationManager,
		@IFileService fileService: IFileService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(configurationManager, undefined, fileService, editorService, configurationService, contextService);
	}

	get uri(): uri {
		return this.preferencesService.userSettingsResource;
	}

	get name(): string {
		return nls.localize('user settings', "user settings");
	}

	public get hidden(): boolean {
		return true;
	}

	protected getConfig(): IGlobalConfig {
		return this.configurationService.inspect<IGlobalConfig>('launch').user;
	}

	openConfigFile(sideBySide: boolean, preserveFocus: boolean, type?: string): TPromise<{ editor: IEditor, created: boolean }> {
		return this.preferencesService.openGlobalSettings(false, { preserveFocus }).then(editor => ({ editor, created: false }));
	}
}
