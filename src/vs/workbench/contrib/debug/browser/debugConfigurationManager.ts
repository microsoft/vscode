/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
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
import { IDebugConfigurationProvider, ICompound, IDebugConfiguration, IConfig, IGlobalConfig, IConfigurationManager, ILaunch, IDebugAdapterDescriptorFactory, IDebugAdapter, IDebugSession, IAdapterDescriptor, CONTEXT_DEBUG_CONFIGURATION_TYPE, IDebugAdapterFactory, IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { Debugger } from 'vs/workbench/contrib/debug/common/debugger';
import { IEditorService, ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { launchSchemaId } from 'vs/workbench/services/configuration/common/configuration';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { Registry } from 'vs/platform/registry/common/platform';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { launchSchema, debuggersExtPoint, breakpointsExtPoint } from 'vs/workbench/contrib/debug/common/debugSchemas';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { CancellationToken } from 'vs/base/common/cancellation';
import { withUndefinedAsNull } from 'vs/base/common/types';

const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema(launchSchemaId, launchSchema);

const DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';
const DEBUG_SELECTED_ROOT = 'debug.selectedroot';

export class ConfigurationManager implements IConfigurationManager {
	private debuggers: Debugger[];
	private breakpointModeIdsSet = new Set<string>();
	private launches!: ILaunch[];
	private selectedName: string | undefined;
	private selectedLaunch: ILaunch | undefined;
	private toDispose: IDisposable[];
	private _onDidSelectConfigurationName = new Emitter<void>();
	private configProviders: IDebugConfigurationProvider[];
	private adapterDescriptorFactories: IDebugAdapterDescriptorFactory[];
	private debugAdapterFactories = new Map<string, IDebugAdapterFactory>();
	private debugConfigurationTypeContext: IContextKey<string>;

	constructor(
		private debugService: IDebugService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.configProviders = [];
		this.adapterDescriptorFactories = [];
		this.debuggers = [];
		this.toDispose = [];
		this.initLaunches();
		this.registerListeners(lifecycleService);
		const previousSelectedRoot = this.storageService.get(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
		const previousSelectedLaunch = this.launches.filter(l => l.uri.toString() === previousSelectedRoot).pop();
		this.debugConfigurationTypeContext = CONTEXT_DEBUG_CONFIGURATION_TYPE.bindTo(contextKeyService);
		if (previousSelectedLaunch) {
			this.selectConfiguration(previousSelectedLaunch, this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE));
		}
	}

	// debuggers

	registerDebugAdapterFactory(debugTypes: string[], debugAdapterLauncher: IDebugAdapterFactory): IDisposable {
		debugTypes.forEach(debugType => this.debugAdapterFactories.set(debugType, debugAdapterLauncher));
		return {
			dispose: () => {
				debugTypes.forEach(debugType => this.debugAdapterFactories.delete(debugType));
			}
		};
	}

	createDebugAdapter(session: IDebugSession): IDebugAdapter | undefined {
		let dap = this.debugAdapterFactories.get(session.configuration.type);
		if (dap) {
			return dap.createDebugAdapter(session);
		}
		return undefined;
	}

	substituteVariables(debugType: string, folder: IWorkspaceFolder | undefined, config: IConfig): Promise<IConfig> {
		let dap = this.debugAdapterFactories.get(debugType);
		if (dap) {
			return dap.substituteVariables(folder, config);
		}
		return Promise.resolve(config);
	}

	runInTerminal(debugType: string, args: DebugProtocol.RunInTerminalRequestArguments): Promise<number | undefined> {
		let tl = this.debugAdapterFactories.get(debugType);
		if (tl) {
			return tl.runInTerminal(args);
		}
		return Promise.resolve(void 0);
	}

	// debug adapter

	registerDebugAdapterDescriptorFactory(debugAdapterProvider: IDebugAdapterDescriptorFactory): IDisposable {
		this.adapterDescriptorFactories.push(debugAdapterProvider);
		return {
			dispose: () => {
				this.unregisterDebugAdapterDescriptorFactory(debugAdapterProvider);
			}
		};
	}

	unregisterDebugAdapterDescriptorFactory(debugAdapterProvider: IDebugAdapterDescriptorFactory): void {
		const ix = this.adapterDescriptorFactories.indexOf(debugAdapterProvider);
		if (ix >= 0) {
			this.adapterDescriptorFactories.splice(ix, 1);
		}
	}

	getDebugAdapterDescriptor(session: IDebugSession): Promise<IAdapterDescriptor | undefined> {

		const config = session.configuration;

		// first try legacy proposed API: DebugConfigurationProvider.debugAdapterExecutable
		const providers0 = this.configProviders.filter(p => p.type === config.type && p.debugAdapterExecutable);
		if (providers0.length === 1 && providers0[0].debugAdapterExecutable) {
			return providers0[0].debugAdapterExecutable(session.root ? session.root.uri : undefined);
		} else {
			// TODO@AW handle n > 1 case
		}

		// new API
		const providers = this.adapterDescriptorFactories.filter(p => p.type === config.type && p.createDebugAdapterDescriptor);
		if (providers.length === 1) {
			return providers[0].createDebugAdapterDescriptor(session);
		} else {
			// TODO@AW handle n > 1 case
		}
		return Promise.resolve(undefined);
	}

	// debug configurations

	registerDebugConfigurationProvider(debugConfigurationProvider: IDebugConfigurationProvider): IDisposable {
		this.configProviders.push(debugConfigurationProvider);
		return {
			dispose: () => {
				this.unregisterDebugConfigurationProvider(debugConfigurationProvider);
			}
		};
	}

	unregisterDebugConfigurationProvider(debugConfigurationProvider: IDebugConfigurationProvider): void {
		const ix = this.configProviders.indexOf(debugConfigurationProvider);
		if (ix >= 0) {
			this.configProviders.splice(ix, 1);
		}
	}

	hasDebugConfigurationProvider(debugType: string): boolean {
		// check if there are providers for the given type that contribute a provideDebugConfigurations method
		const providers = this.configProviders.filter(p => p.provideDebugConfigurations && (p.type === debugType));
		return providers.length > 0;
	}

	resolveConfigurationByProviders(folderUri: uri | undefined, type: string | undefined, debugConfiguration: IConfig, token: CancellationToken): Promise<IConfig | null | undefined> {
		return this.activateDebuggers('onDebugResolve', type).then(() => {
			// pipe the config through the promises sequentially. Append at the end the '*' types
			const providers = this.configProviders.filter(p => p.type === type && p.resolveDebugConfiguration)
				.concat(this.configProviders.filter(p => p.type === '*' && p.resolveDebugConfiguration));

			return providers.reduce((promise, provider) => {
				return promise.then(config => {
					if (config) {
						return provider.resolveDebugConfiguration!(folderUri, config, token);
					} else {
						return Promise.resolve(config);
					}
				});
			}, Promise.resolve(debugConfiguration));
		});
	}

	provideDebugConfigurations(folderUri: uri | undefined, type: string, token: CancellationToken): Promise<any[]> {
		return this.activateDebuggers('onDebugInitialConfigurations')
			.then(() => Promise.all(this.configProviders.filter(p => p.type === type && p.provideDebugConfigurations).map(p => p.provideDebugConfigurations!(folderUri, token)))
				.then(results => results.reduce((first, second) => first.concat(second), [])));
	}

	private registerListeners(lifecycleService: ILifecycleService): void {
		debuggersExtPoint.setHandler((extensions, delta) => {
			delta.added.forEach(added => {
				added.value.forEach(rawAdapter => {
					if (!rawAdapter.type || (typeof rawAdapter.type !== 'string')) {
						added.collector.error(nls.localize('debugNoType', "Debugger 'type' can not be omitted and must be of type 'string'."));
					}
					if (rawAdapter.enableBreakpointsFor) {
						rawAdapter.enableBreakpointsFor.languageIds.forEach(modeId => {
							this.breakpointModeIdsSet.add(modeId);
						});
					}

					if (rawAdapter.type !== '*') {
						const existing = this.getDebugger(rawAdapter.type);
						if (existing) {
							existing.merge(rawAdapter, added.description);
						} else {
							this.debuggers.push(this.instantiationService.createInstance(Debugger, this, rawAdapter, added.description));
						}
					}
				});
			});

			// take care of all wildcard contributions
			extensions.forEach(extension => {
				extension.value.forEach(rawAdapter => {
					if (rawAdapter.type === '*') {
						this.debuggers.forEach(dbg => dbg.merge(rawAdapter, extension.description));
					}
				});
			});

			delta.removed.forEach(removed => {
				const removedTypes = removed.value.map(rawAdapter => rawAdapter.type);
				this.debuggers = this.debuggers.filter(d => removedTypes.indexOf(d.type) === -1);
				this.debugService.getModel().getSessions().forEach(s => {
					// Stop sessions if their debugger has been removed
					if (removedTypes.indexOf(s.configuration.type) >= 0) {
						this.debugService.stopSession(s).then(undefined, onUnexpectedError);
					}
				});
			});

			// update the schema to include all attributes, snippets and types from extensions.
			this.debuggers.forEach(adapter => {
				const items = (<IJSONSchema>launchSchema.properties!['configurations'].items);
				const schemaAttributes = adapter.getSchemaAttributes();
				if (schemaAttributes && items.oneOf) {
					items.oneOf.push(...schemaAttributes);
				}
				const configurationSnippets = adapter.configurationSnippets;
				if (configurationSnippets && items.defaultSnippets) {
					items.defaultSnippets.push(...configurationSnippets);
				}
			});

			this.setCompoundSchemaValues();
		});

		breakpointsExtPoint.setHandler((extensions, delta) => {
			delta.removed.forEach(removed => {
				removed.value.forEach(breakpoints => this.breakpointModeIdsSet.delete(breakpoints.language));
			});
			delta.added.forEach(added => {
				added.value.forEach(breakpoints => this.breakpointModeIdsSet.add(breakpoints.language));
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
	}

	private initLaunches(): void {
		this.launches = this.contextService.getWorkspace().folders.map(folder => this.instantiationService.createInstance(Launch, this, folder));
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			this.launches.push(this.instantiationService.createInstance(WorkspaceLaunch));
		}
		this.launches.push(this.instantiationService.createInstance(UserLaunch));

		if (this.selectedLaunch && this.launches.indexOf(this.selectedLaunch) === -1) {
			this.setSelectedLaunch(undefined);
		}
	}

	private setCompoundSchemaValues(): void {
		const compoundConfigurationsSchema = (<IJSONSchema>launchSchema.properties!['compounds'].items).properties!['configurations'];
		const launchNames = this.launches.map(l =>
			l.getConfigurationNames(false)).reduce((first, second) => first.concat(second), []);
		(<IJSONSchema>compoundConfigurationsSchema.items).oneOf![0].enum = launchNames;
		(<IJSONSchema>compoundConfigurationsSchema.items).oneOf![1].properties!.name.enum = launchNames;

		const folderNames = this.contextService.getWorkspace().folders.map(f => f.name);
		(<IJSONSchema>compoundConfigurationsSchema.items).oneOf![1].properties!.folder.enum = folderNames;

		jsonRegistry.registerSchema(launchSchemaId, launchSchema);
	}

	getLaunches(): ILaunch[] {
		return this.launches;
	}

	getLaunch(workspaceUri: uri | undefined): ILaunch | undefined {
		if (!uri.isUri(workspaceUri)) {
			return undefined;
		}

		return this.launches.filter(l => l.workspace && l.workspace.uri.toString() === workspaceUri.toString()).pop();
	}

	get selectedConfiguration(): { launch: ILaunch | undefined, name: string | undefined } {
		return {
			launch: this.selectedLaunch,
			name: this.selectedName
		};
	}

	get onDidSelectConfiguration(): Event<void> {
		return this._onDidSelectConfigurationName.event;
	}

	getWorkspaceLaunch(): ILaunch | undefined {
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			return this.launches[this.launches.length - 1];
		}

		return undefined;
	}

	selectConfiguration(launch: ILaunch | undefined, name?: string): void {
		const previousLaunch = this.selectedLaunch;
		const previousName = this.selectedName;

		this.setSelectedLaunch(launch);
		const names = launch ? launch.getConfigurationNames() : [];
		if (name && names.indexOf(name) >= 0) {
			this.setSelectedLaunchName(name);
		}
		if (!this.selectedName || names.indexOf(this.selectedName) === -1) {
			this.setSelectedLaunchName(names.length ? names[0] : undefined);
		}

		const configuration = this.selectedLaunch && this.selectedName ? this.selectedLaunch.getConfiguration(this.selectedName) : undefined;
		if (configuration) {
			this.debugConfigurationTypeContext.set(configuration.type);
		} else {
			this.debugConfigurationTypeContext.reset();
		}

		if (this.selectedLaunch !== previousLaunch || this.selectedName !== previousName) {
			this._onDidSelectConfigurationName.fire();
		}
	}

	canSetBreakpointsIn(model: ITextModel): boolean {
		const modeId = model.getLanguageIdentifier().language;
		if (!modeId || modeId === 'jsonc' || modeId === 'log') {
			// do not allow breakpoints in our settings files and output
			return false;
		}
		if (this.configurationService.getValue<IDebugConfiguration>('debug').allowBreakpointsEverywhere) {
			return true;
		}

		return this.breakpointModeIdsSet.has(modeId);
	}

	getDebugger(type: string): Debugger | undefined {
		return this.debuggers.filter(dbg => strings.equalsIgnoreCase(dbg.type, type)).pop();
	}

	guessDebugger(type?: string): Promise<Debugger | undefined> {
		if (type) {
			const adapter = this.getDebugger(type);
			return Promise.resolve(adapter);
		}

		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		let candidates: Promise<Debugger[]> | undefined;
		if (isCodeEditor(activeTextEditorWidget)) {
			const model = activeTextEditorWidget.getModel();
			const language = model ? model.getLanguageIdentifier().language : undefined;
			const adapters = this.debuggers.filter(a => language && a.languages && a.languages.indexOf(language) >= 0);
			if (adapters.length === 1) {
				return Promise.resolve(adapters[0]);
			}
			if (adapters.length > 1) {
				candidates = Promise.resolve(adapters);
			}
		}

		if (!candidates) {
			candidates = this.activateDebuggers('onDebugInitialConfigurations').then(() => this.debuggers.filter(dbg => dbg.hasInitialConfiguration() || dbg.hasConfigurationProvider()));
		}

		return candidates.then(debuggers => {
			debuggers.sort((first, second) => first.label.localeCompare(second.label));
			const picks = debuggers.map(c => ({ label: c.label, debugger: c }));
			return this.quickInputService.pick<{ label: string, debugger: Debugger | undefined }>([...picks, { type: 'separator' }, { label: 'More...', debugger: undefined }], { placeHolder: nls.localize('selectDebug', "Select Environment") })
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

	activateDebuggers(activationEvent: string, debugType?: string): Promise<void> {
		const thenables: Promise<any>[] = [
			this.extensionService.activateByEvent(activationEvent),
			this.extensionService.activateByEvent('onDebug')
		];
		if (debugType) {
			thenables.push(this.extensionService.activateByEvent(`${activationEvent}:${debugType}`));
		}
		return Promise.all(thenables).then(_ => {
			return undefined;
		});
	}

	private setSelectedLaunchName(selectedName: string | undefined): void {
		this.selectedName = selectedName;

		if (this.selectedName) {
			this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.selectedName, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE);
		}
	}

	private setSelectedLaunch(selectedLaunch: ILaunch | undefined): void {
		this.selectedLaunch = selectedLaunch;

		if (this.selectedLaunch) {
			this.storageService.store(DEBUG_SELECTED_ROOT, this.selectedLaunch.uri.toString(), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
		}
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

abstract class AbstractLaunch {
	protected abstract getConfig(): IGlobalConfig | undefined;

	getCompound(name: string): ICompound | undefined {
		const config = this.getConfig();
		if (!config || !config.compounds) {
			return undefined;
		}

		return config.compounds.filter(compound => compound.name === name).pop();
	}

	getConfigurationNames(includeCompounds = true): string[] {
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

	getConfiguration(name: string): IConfig | undefined {
		// We need to clone the configuration in order to be able to make changes to it #42198
		const config = objects.deepClone(this.getConfig());
		if (!config || !config.configurations) {
			return undefined;
		}

		return config.configurations.filter(config => config && config.name === name).shift();
	}

	get hidden(): boolean {
		return false;
	}
}

class Launch extends AbstractLaunch implements ILaunch {

	constructor(
		private configurationManager: ConfigurationManager,
		public workspace: IWorkspaceFolder,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	get uri(): uri {
		return resources.joinPath(this.workspace.uri, '/.vscode/launch.json');
	}

	get name(): string {
		return this.workspace.name;
	}

	protected getConfig(): IGlobalConfig | undefined {
		return this.configurationService.inspect<IGlobalConfig>('launch', { resource: this.workspace.uri }).workspaceFolder;
	}

	openConfigFile(sideBySide: boolean, preserveFocus: boolean, type?: string, token?: CancellationToken): Promise<{ editor: IEditor | null, created: boolean }> {
		const resource = this.uri;
		let created = false;

		return this.fileService.readFile(resource).then(content => content.value, err => {
			// launch.json not found: create one by collecting launch configs from debugConfigProviders
			return this.configurationManager.guessDebugger(type).then(adapter => {
				if (adapter) {
					return this.configurationManager.provideDebugConfigurations(this.workspace.uri, adapter.type, token || CancellationToken.None).then(initialConfigs => {
						return adapter.getInitialConfigurationContent(initialConfigs);
					});
				} else {
					return '';
				}
			}).then(content => {

				if (!content) {
					return '';
				}

				created = true; // pin only if config file is created #8727
				return this.textFileService.write(resource, content).then(() => content);
			});
		}).then(content => {
			if (!content) {
				return { editor: null, created: false };
			}
			const contentValue = content.toString();
			const index = contentValue.indexOf(`"${this.configurationManager.selectedConfiguration.name}"`);
			let startLineNumber = 1;
			for (let i = 0; i < index; i++) {
				if (contentValue.charAt(i) === '\n') {
					startLineNumber++;
				}
			}
			const selection = startLineNumber > 1 ? { startLineNumber, startColumn: 4 } : undefined;

			return Promise.resolve(this.editorService.openEditor({
				resource,
				options: {
					selection,
					preserveFocus,
					pinned: created,
					revealIfVisible: true
				},
			}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => ({ editor: withUndefinedAsNull(editor), created })));
		}, (error: Error) => {
			throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error.message));
		});
	}
}

class WorkspaceLaunch extends AbstractLaunch implements ILaunch {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) {
		super();
	}

	get workspace(): undefined {
		return undefined;
	}

	get uri(): uri {
		return this.contextService.getWorkspace().configuration!;
	}

	get name(): string {
		return nls.localize('workspace', "workspace");
	}

	protected getConfig(): IGlobalConfig | undefined {
		return this.configurationService.inspect<IGlobalConfig>('launch').workspace;
	}

	openConfigFile(sideBySide: boolean, preserveFocus: boolean, type?: string): Promise<{ editor: IEditor | null, created: boolean }> {
		return this.editorService.openEditor({
			resource: this.contextService.getWorkspace().configuration!,
			options: { preserveFocus }
		}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => ({ editor: withUndefinedAsNull(editor), created: false }));
	}
}

class UserLaunch extends AbstractLaunch implements ILaunch {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super();
	}

	get workspace(): undefined {
		return undefined;
	}

	get uri(): uri {
		return this.preferencesService.userSettingsResource;
	}

	get name(): string {
		return nls.localize('user settings', "user settings");
	}

	get hidden(): boolean {
		return true;
	}

	protected getConfig(): IGlobalConfig | undefined {
		return this.configurationService.inspect<IGlobalConfig>('launch').user;
	}

	openConfigFile(sideBySide: boolean, preserveFocus: boolean, type?: string): Promise<{ editor: IEditor | null, created: boolean }> {
		return this.preferencesService.openGlobalSettings(false, { preserveFocus }).then(editor => ({ editor: withUndefinedAsNull(editor), created: false }));
	}
}
