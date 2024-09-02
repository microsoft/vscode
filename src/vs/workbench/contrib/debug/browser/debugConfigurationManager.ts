/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { sequence } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import * as json from '../../../../base/common/json.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { DisposableStore, IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import * as resources from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI as uri } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IEditorPane } from '../../../common/editor.js';
import { debugConfigure } from './debugIcons.js';
import { CONTEXT_DEBUG_CONFIGURATION_TYPE, DebugConfigurationProviderTriggerKind, IAdapterManager, ICompound, IConfig, IConfigPresentation, IConfigurationManager, IDebugConfigurationProvider, IGlobalConfig, ILaunch } from '../common/debug.js';
import { launchSchema } from '../common/debugSchemas.js';
import { getVisibleAndSorted } from '../common/debugUtils.js';
import { launchSchemaId } from '../../../services/configuration/common/configuration.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';

const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema(launchSchemaId, launchSchema);

const DEBUG_SELECTED_CONFIG_NAME_KEY = 'debug.selectedconfigname';
const DEBUG_SELECTED_ROOT = 'debug.selectedroot';
// Debug type is only stored if a dynamic configuration is used for better restore
const DEBUG_SELECTED_TYPE = 'debug.selectedtype';
const DEBUG_RECENT_DYNAMIC_CONFIGURATIONS = 'debug.recentdynamicconfigurations';

interface IDynamicPickItem { label: string; launch: ILaunch; config: IConfig }

export class ConfigurationManager implements IConfigurationManager {
	private launches!: ILaunch[];
	private selectedName: string | undefined;
	private selectedLaunch: ILaunch | undefined;
	private getSelectedConfig: () => Promise<IConfig | undefined> = () => Promise.resolve(undefined);
	private selectedType: string | undefined;
	private selectedDynamic = false;
	private toDispose: IDisposable[];
	private readonly _onDidSelectConfigurationName = new Emitter<void>();
	private configProviders: IDebugConfigurationProvider[];
	private debugConfigurationTypeContext: IContextKey<string>;
	private readonly _onDidChangeConfigurationProviders = new Emitter<void>();
	public readonly onDidChangeConfigurationProviders = this._onDidChangeConfigurationProviders.event;

	constructor(
		private readonly adapterManager: IAdapterManager,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
	) {
		this.configProviders = [];
		this.toDispose = [this._onDidChangeConfigurationProviders];
		this.initLaunches();
		this.setCompoundSchemaValues();
		this.registerListeners();
		const previousSelectedRoot = this.storageService.get(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
		const previousSelectedType = this.storageService.get(DEBUG_SELECTED_TYPE, StorageScope.WORKSPACE);
		const previousSelectedLaunch = this.launches.find(l => l.uri.toString() === previousSelectedRoot);
		const previousSelectedName = this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE);
		this.debugConfigurationTypeContext = CONTEXT_DEBUG_CONFIGURATION_TYPE.bindTo(contextKeyService);
		const dynamicConfig = previousSelectedType ? { type: previousSelectedType } : undefined;
		if (previousSelectedLaunch && previousSelectedLaunch.getConfigurationNames().length) {
			this.selectConfiguration(previousSelectedLaunch, previousSelectedName, undefined, dynamicConfig);
		} else if (this.launches.length > 0) {
			this.selectConfiguration(undefined, previousSelectedName, undefined, dynamicConfig);
		}
	}

	registerDebugConfigurationProvider(debugConfigurationProvider: IDebugConfigurationProvider): IDisposable {
		this.configProviders.push(debugConfigurationProvider);
		this._onDidChangeConfigurationProviders.fire();
		return {
			dispose: () => {
				this.unregisterDebugConfigurationProvider(debugConfigurationProvider);
				this._onDidChangeConfigurationProviders.fire();
			}
		};
	}

	unregisterDebugConfigurationProvider(debugConfigurationProvider: IDebugConfigurationProvider): void {
		const ix = this.configProviders.indexOf(debugConfigurationProvider);
		if (ix >= 0) {
			this.configProviders.splice(ix, 1);
		}
	}

	/**
	 * if scope is not specified,a value of DebugConfigurationProvideTrigger.Initial is assumed.
	 */
	hasDebugConfigurationProvider(debugType: string, triggerKind?: DebugConfigurationProviderTriggerKind): boolean {
		if (triggerKind === undefined) {
			triggerKind = DebugConfigurationProviderTriggerKind.Initial;
		}
		// check if there are providers for the given type that contribute a provideDebugConfigurations method
		const provider = this.configProviders.find(p => p.provideDebugConfigurations && (p.type === debugType) && (p.triggerKind === triggerKind));
		return !!provider;
	}

	async resolveConfigurationByProviders(folderUri: uri | undefined, type: string | undefined, config: IConfig, token: CancellationToken): Promise<IConfig | null | undefined> {
		const resolveDebugConfigurationForType = async (type: string | undefined, config: IConfig | null | undefined) => {
			if (type !== '*') {
				await this.adapterManager.activateDebuggers('onDebugResolve', type);
			}

			for (const p of this.configProviders) {
				if (p.type === type && p.resolveDebugConfiguration && config) {
					config = await p.resolveDebugConfiguration(folderUri, config, token);
				}
			}

			return config;
		};

		let resolvedType = config.type ?? type;
		let result: IConfig | null | undefined = config;
		for (let seen = new Set(); result && !seen.has(resolvedType);) {
			seen.add(resolvedType);
			result = await resolveDebugConfigurationForType(resolvedType, result);
			result = await resolveDebugConfigurationForType('*', result);
			resolvedType = result?.type ?? type!;
		}

		return result;
	}

	async resolveDebugConfigurationWithSubstitutedVariables(folderUri: uri | undefined, type: string | undefined, config: IConfig, token: CancellationToken): Promise<IConfig | null | undefined> {
		// pipe the config through the promises sequentially. Append at the end the '*' types
		const providers = this.configProviders.filter(p => p.type === type && p.resolveDebugConfigurationWithSubstitutedVariables)
			.concat(this.configProviders.filter(p => p.type === '*' && p.resolveDebugConfigurationWithSubstitutedVariables));

		let result: IConfig | null | undefined = config;
		await sequence(providers.map(provider => async () => {
			// If any provider returned undefined or null make sure to respect that and do not pass the result to more resolver
			if (result) {
				result = await provider.resolveDebugConfigurationWithSubstitutedVariables!(folderUri, result, token);
			}
		}));

		return result;
	}

	async provideDebugConfigurations(folderUri: uri | undefined, type: string, token: CancellationToken): Promise<any[]> {
		await this.adapterManager.activateDebuggers('onDebugInitialConfigurations');
		const results = await Promise.all(this.configProviders.filter(p => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Initial && p.provideDebugConfigurations).map(p => p.provideDebugConfigurations!(folderUri, token)));

		return results.reduce((first, second) => first.concat(second), []);
	}

	async getDynamicProviders(): Promise<{ label: string; type: string; getProvider: () => Promise<IDebugConfigurationProvider | undefined>; pick: () => Promise<{ launch: ILaunch; config: IConfig } | undefined> }[]> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const onDebugDynamicConfigurationsName = 'onDebugDynamicConfigurations';
		const debugDynamicExtensionsTypes = this.extensionService.extensions.reduce((acc, e) => {
			if (!e.activationEvents) {
				return acc;
			}

			const explicitTypes: string[] = [];
			let hasGenericEvent = false;
			for (const event of e.activationEvents) {
				if (event === onDebugDynamicConfigurationsName) {
					hasGenericEvent = true;
				} else if (event.startsWith(`${onDebugDynamicConfigurationsName}:`)) {
					explicitTypes.push(event.slice(onDebugDynamicConfigurationsName.length + 1));
				}
			}

			if (explicitTypes.length) {
				explicitTypes.forEach(t => acc.add(t));
			} else if (hasGenericEvent) {
				const debuggerType = e.contributes?.debuggers?.[0].type;
				if (debuggerType) {
					acc.add(debuggerType);
				}
			}

			return acc;
		}, new Set<string>());

		for (const configProvider of this.configProviders) {
			if (configProvider.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic) {
				debugDynamicExtensionsTypes.add(configProvider.type);
			}
		}

		return [...debugDynamicExtensionsTypes].map(type => {
			return {
				label: this.adapterManager.getDebuggerLabel(type)!,
				getProvider: async () => {
					await this.adapterManager.activateDebuggers(onDebugDynamicConfigurationsName, type);
					return this.configProviders.find(p => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
				},
				type,
				pick: async () => {
					// Do a late 'onDebugDynamicConfigurationsName' activation so extensions are not activated too early #108578
					await this.adapterManager.activateDebuggers(onDebugDynamicConfigurationsName, type);

					const token = new CancellationTokenSource();
					const picks: Promise<IDynamicPickItem[]>[] = [];
					const provider = this.configProviders.find(p => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
					this.getLaunches().forEach(launch => {
						if (launch.workspace && provider) {
							picks.push(provider.provideDebugConfigurations!(launch.workspace.uri, token.token).then(configurations => configurations.map(config => ({
								label: config.name,
								description: launch.name,
								config,
								buttons: [{
									iconClass: ThemeIcon.asClassName(debugConfigure),
									tooltip: nls.localize('editLaunchConfig', "Edit Debug Configuration in launch.json")
								}],
								launch
							}))));
						}
					});

					const disposables = new DisposableStore();
					const input = disposables.add(this.quickInputService.createQuickPick<IDynamicPickItem>());
					input.busy = true;
					input.placeholder = nls.localize('selectConfiguration', "Select Launch Configuration");

					const chosenPromise = new Promise<IDynamicPickItem | undefined>(resolve => {
						disposables.add(input.onDidAccept(() => resolve(input.activeItems[0])));
						disposables.add(input.onDidTriggerItemButton(async (context) => {
							resolve(undefined);
							const { launch, config } = context.item;
							await launch.openConfigFile({ preserveFocus: false, type: config.type, suppressInitialConfigs: true });
							// Only Launch have a pin trigger button
							await (launch as Launch).writeConfiguration(config);
							await this.selectConfiguration(launch, config.name);
							this.removeRecentDynamicConfigurations(config.name, config.type);
						}));
						disposables.add(input.onDidHide(() => resolve(undefined)));
					});

					let nestedPicks: IDynamicPickItem[][];
					try {
						// This await invokes the extension providers, which might fail due to several reasons,
						// therefore we gate this logic under a try/catch to prevent leaving the Debug Tab
						// selector in a borked state.
						nestedPicks = await Promise.all(picks);
					} catch (err) {
						this.logService.error(err);
						disposables.dispose();
						return;
					}

					const items = nestedPicks.flat();

					input.items = items;
					input.busy = false;
					input.show();
					const chosen = await chosenPromise;

					disposables.dispose();

					if (!chosen) {
						// User canceled quick input we should notify the provider to cancel computing configurations
						token.cancel();
						return;
					}

					return chosen;
				}
			};
		});
	}

	getAllConfigurations(): { launch: ILaunch; name: string; presentation?: IConfigPresentation }[] {
		const all: { launch: ILaunch; name: string; presentation?: IConfigPresentation }[] = [];
		for (const l of this.launches) {
			for (const name of l.getConfigurationNames()) {
				const config = l.getConfiguration(name) || l.getCompound(name);
				if (config) {
					all.push({ launch: l, name, presentation: config.presentation });
				}
			}
		}

		return getVisibleAndSorted(all);
	}

	removeRecentDynamicConfigurations(name: string, type: string) {
		const remaining = this.getRecentDynamicConfigurations().filter(c => c.name !== name || c.type !== type);
		this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(remaining), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		if (this.selectedConfiguration.name === name && this.selectedType === type && this.selectedDynamic) {
			this.selectConfiguration(undefined, undefined);
		} else {
			this._onDidSelectConfigurationName.fire();
		}
	}

	getRecentDynamicConfigurations(): { name: string; type: string }[] {
		return JSON.parse(this.storageService.get(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, StorageScope.WORKSPACE, '[]'));
	}

	private registerListeners(): void {
		this.toDispose.push(Event.any<IWorkspaceFoldersChangeEvent | WorkbenchState>(this.contextService.onDidChangeWorkspaceFolders, this.contextService.onDidChangeWorkbenchState)(() => {
			this.initLaunches();
			this.selectConfiguration(undefined);
			this.setCompoundSchemaValues();
		}));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('launch')) {
				// A change happen in the launch.json. If there is already a launch configuration selected, do not change the selection.
				await this.selectConfiguration(undefined);
				this.setCompoundSchemaValues();
			}
		}));
		this.toDispose.push(this.adapterManager.onDidDebuggersExtPointRead(() => {
			this.setCompoundSchemaValues();
		}));
	}

	private initLaunches(): void {
		this.launches = this.contextService.getWorkspace().folders.map(folder => this.instantiationService.createInstance(Launch, this, this.adapterManager, folder));
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			this.launches.push(this.instantiationService.createInstance(WorkspaceLaunch, this, this.adapterManager));
		}
		this.launches.push(this.instantiationService.createInstance(UserLaunch, this, this.adapterManager));

		if (this.selectedLaunch && this.launches.indexOf(this.selectedLaunch) === -1) {
			this.selectConfiguration(undefined);
		}
	}

	private setCompoundSchemaValues(): void {
		const compoundConfigurationsSchema = (<IJSONSchema>launchSchema.properties!['compounds'].items).properties!['configurations'];
		const launchNames = this.launches.map(l =>
			l.getConfigurationNames(true)).reduce((first, second) => first.concat(second), []);
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

		return this.launches.find(l => l.workspace && this.uriIdentityService.extUri.isEqual(l.workspace.uri, workspaceUri));
	}

	get selectedConfiguration(): { launch: ILaunch | undefined; name: string | undefined; getConfig: () => Promise<IConfig | undefined>; type: string | undefined } {
		return {
			launch: this.selectedLaunch,
			name: this.selectedName,
			getConfig: this.getSelectedConfig,
			type: this.selectedType
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

	async selectConfiguration(launch: ILaunch | undefined, name?: string, config?: IConfig, dynamicConfig?: { type?: string }): Promise<void> {
		if (typeof launch === 'undefined') {
			const rootUri = this.historyService.getLastActiveWorkspaceRoot();
			launch = this.getLaunch(rootUri);
			if (!launch || launch.getConfigurationNames().length === 0) {
				launch = this.launches.find(l => !!(l && l.getConfigurationNames().length)) || launch || this.launches[0];
			}
		}

		const previousLaunch = this.selectedLaunch;
		const previousName = this.selectedName;
		const previousSelectedDynamic = this.selectedDynamic;
		this.selectedLaunch = launch;

		if (this.selectedLaunch) {
			this.storageService.store(DEBUG_SELECTED_ROOT, this.selectedLaunch.uri.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
		}

		const names = launch ? launch.getConfigurationNames() : [];
		this.getSelectedConfig = () => {
			const selected = this.selectedName ? launch?.getConfiguration(this.selectedName) : undefined;
			return Promise.resolve(selected || config);
		};

		let type = config?.type;
		if (name && names.indexOf(name) >= 0) {
			this.setSelectedLaunchName(name);
		} else if (dynamicConfig && dynamicConfig.type) {
			// We could not find the previously used name and config is not passed. We should get all dynamic configurations from providers
			// And potentially auto select the previously used dynamic configuration #96293
			type = dynamicConfig.type;
			if (!config) {
				const providers = (await this.getDynamicProviders()).filter(p => p.type === type);
				this.getSelectedConfig = async () => {
					const activatedProviders = await Promise.all(providers.map(p => p.getProvider()));
					const provider = activatedProviders.length > 0 ? activatedProviders[0] : undefined;
					if (provider && launch && launch.workspace) {
						const token = new CancellationTokenSource();
						const dynamicConfigs = await provider.provideDebugConfigurations!(launch.workspace.uri, token.token);
						const dynamicConfig = dynamicConfigs.find(c => c.name === name);
						if (dynamicConfig) {
							return dynamicConfig;
						}
					}

					return undefined;
				};
			}
			this.setSelectedLaunchName(name);

			let recentDynamicProviders = this.getRecentDynamicConfigurations();
			if (name && dynamicConfig.type) {
				// We need to store the recently used dynamic configurations to be able to show them in UI #110009
				recentDynamicProviders.unshift({ name, type: dynamicConfig.type });
				recentDynamicProviders = distinct(recentDynamicProviders, t => `${t.name} : ${t.type}`);
				this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(recentDynamicProviders), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
		} else if (!this.selectedName || names.indexOf(this.selectedName) === -1) {
			// We could not find the configuration to select, pick the first one, or reset the selection if there is no launch configuration
			const nameToSet = names.length ? names[0] : undefined;
			this.setSelectedLaunchName(nameToSet);
		}

		if (!config && launch && this.selectedName) {
			config = launch.getConfiguration(this.selectedName);
			type = config?.type;
		}

		this.selectedType = dynamicConfig?.type || config?.type;
		this.selectedDynamic = !!dynamicConfig;
		// Only store the selected type if we are having a dynamic configuration. Otherwise restoring this configuration from storage might be misindentified as a dynamic configuration
		this.storageService.store(DEBUG_SELECTED_TYPE, dynamicConfig ? this.selectedType : undefined, StorageScope.WORKSPACE, StorageTarget.MACHINE);

		if (type) {
			this.debugConfigurationTypeContext.set(type);
		} else {
			this.debugConfigurationTypeContext.reset();
		}

		if (this.selectedLaunch !== previousLaunch || this.selectedName !== previousName || previousSelectedDynamic !== this.selectedDynamic) {
			this._onDidSelectConfigurationName.fire();
		}
	}

	private setSelectedLaunchName(selectedName: string | undefined): void {
		this.selectedName = selectedName;

		if (this.selectedName) {
			this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.selectedName, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE);
		}
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

abstract class AbstractLaunch implements ILaunch {
	abstract readonly uri: uri;
	abstract readonly name: string;
	abstract readonly workspace: IWorkspaceFolder | undefined;
	protected abstract getConfig(): IGlobalConfig | undefined;
	abstract openConfigFile(options: { preserveFocus: boolean; type?: string | undefined; suppressInitialConfigs?: boolean | undefined }, token?: CancellationToken | undefined): Promise<{ editor: IEditorPane | null; created: boolean }>;

	constructor(
		protected configurationManager: ConfigurationManager,
		private readonly adapterManager: IAdapterManager
	) { }

	getCompound(name: string): ICompound | undefined {
		const config = this.getConfig();
		if (!config || !config.compounds) {
			return undefined;
		}

		return config.compounds.find(compound => compound.name === name);
	}

	getConfigurationNames(ignoreCompoundsAndPresentation = false): string[] {
		const config = this.getConfig();
		if (!config || (!Array.isArray(config.configurations) && !Array.isArray(config.compounds))) {
			return [];
		} else {
			const configurations: (IConfig | ICompound)[] = [];
			if (config.configurations) {
				configurations.push(...config.configurations.filter(cfg => cfg && typeof cfg.name === 'string'));
			}

			if (ignoreCompoundsAndPresentation) {
				return configurations.map(c => c.name);
			}

			if (config.compounds) {
				configurations.push(...config.compounds.filter(compound => typeof compound.name === 'string' && compound.configurations && compound.configurations.length));
			}
			return getVisibleAndSorted(configurations).map(c => c.name);
		}
	}

	getConfiguration(name: string): IConfig | undefined {
		// We need to clone the configuration in order to be able to make changes to it #42198
		const config = objects.deepClone(this.getConfig());
		if (!config || !config.configurations) {
			return undefined;
		}
		const configuration = config.configurations.find(config => config && config.name === name);
		if (configuration) {
			if (this instanceof UserLaunch) {
				configuration.__configurationTarget = ConfigurationTarget.USER;
			} else if (this instanceof WorkspaceLaunch) {
				configuration.__configurationTarget = ConfigurationTarget.WORKSPACE;
			} else {
				configuration.__configurationTarget = ConfigurationTarget.WORKSPACE_FOLDER;
			}
		}
		return configuration;
	}

	async getInitialConfigurationContent(folderUri?: uri, type?: string, useInitialConfigs?: boolean, token?: CancellationToken): Promise<string> {
		let content = '';
		const adapter = type ? this.adapterManager.getEnabledDebugger(type) : await this.adapterManager.guessDebugger(true);
		if (adapter) {
			const initialConfigs = useInitialConfigs ?
				await this.configurationManager.provideDebugConfigurations(folderUri, adapter.type, token || CancellationToken.None) :
				[];
			content = await adapter.getInitialConfigurationContent(initialConfigs);
		}
		return content;
	}

	get hidden(): boolean {
		return false;
	}
}

class Launch extends AbstractLaunch implements ILaunch {

	constructor(
		configurationManager: ConfigurationManager,
		adapterManager: IAdapterManager,
		public workspace: IWorkspaceFolder,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(configurationManager, adapterManager);
	}

	get uri(): uri {
		return resources.joinPath(this.workspace.uri, '/.vscode/launch.json');
	}

	get name(): string {
		return this.workspace.name;
	}

	protected getConfig(): IGlobalConfig | undefined {
		return this.configurationService.inspect<IGlobalConfig>('launch', { resource: this.workspace.uri }).workspaceFolderValue;
	}

	async openConfigFile({ preserveFocus, type, suppressInitialConfigs }: { preserveFocus: boolean; type?: string; suppressInitialConfigs?: boolean }, token?: CancellationToken): Promise<{ editor: IEditorPane | null; created: boolean }> {
		const resource = this.uri;
		let created = false;
		let content = '';
		try {
			const fileContent = await this.fileService.readFile(resource);
			content = fileContent.value.toString();
		} catch {
			// launch.json not found: create one by collecting launch configs from debugConfigProviders
			content = await this.getInitialConfigurationContent(this.workspace.uri, type, !suppressInitialConfigs, token);
			if (!content) {
				// Cancelled
				return { editor: null, created: false };
			}

			created = true; // pin only if config file is created #8727
			try {
				await this.textFileService.write(resource, content);
			} catch (error) {
				throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error.message));
			}
		}

		const index = content.indexOf(`"${this.configurationManager.selectedConfiguration.name}"`);
		let startLineNumber = 1;
		for (let i = 0; i < index; i++) {
			if (content.charAt(i) === '\n') {
				startLineNumber++;
			}
		}
		const selection = startLineNumber > 1 ? { startLineNumber, startColumn: 4 } : undefined;

		const editor = await this.editorService.openEditor({
			resource,
			options: {
				selection,
				preserveFocus,
				pinned: created,
				revealIfVisible: true
			},
		}, ACTIVE_GROUP);

		return ({
			editor: editor ?? null,
			created
		});
	}

	async writeConfiguration(configuration: IConfig): Promise<void> {
		const fullConfig = objects.deepClone(this.getConfig()!);
		if (!fullConfig.configurations) {
			fullConfig.configurations = [];
		}
		fullConfig.configurations.push(configuration);
		await this.configurationService.updateValue('launch', fullConfig, { resource: this.workspace.uri }, ConfigurationTarget.WORKSPACE_FOLDER);
	}
}

class WorkspaceLaunch extends AbstractLaunch implements ILaunch {
	constructor(
		configurationManager: ConfigurationManager,
		adapterManager: IAdapterManager,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) {
		super(configurationManager, adapterManager);
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
		return this.configurationService.inspect<IGlobalConfig>('launch').workspaceValue;
	}

	async openConfigFile({ preserveFocus, type, useInitialConfigs }: { preserveFocus: boolean; type?: string; useInitialConfigs?: boolean }, token?: CancellationToken): Promise<{ editor: IEditorPane | null; created: boolean }> {
		const launchExistInFile = !!this.getConfig();
		if (!launchExistInFile) {
			// Launch property in workspace config not found: create one by collecting launch configs from debugConfigProviders
			const content = await this.getInitialConfigurationContent(undefined, type, useInitialConfigs, token);
			if (content) {
				await this.configurationService.updateValue('launch', json.parse(content), ConfigurationTarget.WORKSPACE);
			} else {
				return { editor: null, created: false };
			}
		}

		const editor = await this.editorService.openEditor({
			resource: this.contextService.getWorkspace().configuration!,
			options: { preserveFocus }
		}, ACTIVE_GROUP);

		return ({
			editor: editor ?? null,
			created: false
		});
	}
}

class UserLaunch extends AbstractLaunch implements ILaunch {

	constructor(
		configurationManager: ConfigurationManager,
		adapterManager: IAdapterManager,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(configurationManager, adapterManager);
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

	override get hidden(): boolean {
		return true;
	}

	protected getConfig(): IGlobalConfig | undefined {
		return this.configurationService.inspect<IGlobalConfig>('launch').userValue;
	}

	async openConfigFile({ preserveFocus, type, useInitialContent }: { preserveFocus: boolean; type?: string; useInitialContent?: boolean }): Promise<{ editor: IEditorPane | null; created: boolean }> {
		const editor = await this.preferencesService.openUserSettings({ jsonEditor: true, preserveFocus, revealSetting: { key: 'launch' } });
		return ({
			editor: editor ?? null,
			created: false
		});
	}
}
