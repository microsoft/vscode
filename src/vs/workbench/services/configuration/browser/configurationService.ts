/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { equals } from '../../../../base/common/objects.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Queue, Barrier, Promises, Delayer, Throttler } from '../../../../base/common/async.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IWorkspaceContextService, Workspace as BaseWorkspace, WorkbenchState, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkspaceFolder, toWorkspaceFolder, isWorkspaceFolder, IWorkspaceFoldersWillChangeEvent, IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IWorkspaceIdentifier, IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { ConfigurationModel, ConfigurationChangeEvent, mergeChanges } from '../../../../platform/configuration/common/configurationModels.js';
import { IConfigurationChangeEvent, ConfigurationTarget, IConfigurationOverrides, isConfigurationOverrides, IConfigurationData, IConfigurationValue, IConfigurationChange, ConfigurationTargetToString, IConfigurationUpdateOverrides, isConfigurationUpdateOverrides, IConfigurationService, IConfigurationUpdateOptions } from '../../../../platform/configuration/common/configuration.js';
import { IPolicyConfiguration, NullPolicyConfiguration, PolicyConfiguration } from '../../../../platform/configuration/common/configurations.js';
import { Configuration } from '../common/configurationModels.js';
import { FOLDER_CONFIG_FOLDER_NAME, defaultSettingsSchemaId, userSettingsSchemaId, workspaceSettingsSchemaId, folderSettingsSchemaId, IConfigurationCache, machineSettingsSchemaId, LOCAL_MACHINE_SCOPES, IWorkbenchConfigurationService, RestrictedSettings, PROFILE_SCOPES, LOCAL_MACHINE_PROFILE_SCOPES, profileSettingsSchemaId, APPLY_ALL_PROFILES_SETTING, APPLICATION_SCOPES } from '../common/configuration.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions, allSettings, windowSettings, resourceSettings, applicationSettings, machineSettings, machineOverridableSettings, ConfigurationScope, IConfigurationPropertySchema, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_PATTERN, resourceLanguageSettingsSchemaId, configurationDefaultsSchemaId, applicationMachineSettings } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IStoredWorkspaceFolder, isStoredWorkspaceFolder, IWorkspaceFolderCreationData, getStoredWorkspaceFolder, toWorkspaceFolders } from '../../../../platform/workspaces/common/workspaces.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ConfigurationEditing, EditableConfigurationTarget } from '../common/configurationEditing.js';
import { WorkspaceConfiguration, FolderConfiguration, RemoteUserConfiguration, UserConfiguration, DefaultConfiguration, ApplicationConfiguration } from './configuration.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../base/common/jsonSchema.js';
import { mark } from '../../../../base/common/performance.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILifecycleService, LifecyclePhase } from '../../lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { delta, distinct, equals as arrayEquals } from '../../../../base/common/arrays.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IWorkbenchAssignmentService } from '../../assignment/common/assignmentService.js';
import { isUndefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IPolicyService, NullPolicyService } from '../../../../platform/policy/common/policy.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IJSONEditingService } from '../common/jsonEditing.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { runWhenWindowIdle } from '../../../../base/browser/dom.js';

function getLocalUserConfigurationScopes(userDataProfile: IUserDataProfile, hasRemote: boolean): ConfigurationScope[] | undefined {
	const isDefaultProfile = userDataProfile.isDefault || userDataProfile.useDefaultFlags?.settings;
	if (isDefaultProfile) {
		return hasRemote ? LOCAL_MACHINE_SCOPES : undefined;
	}
	return hasRemote ? LOCAL_MACHINE_PROFILE_SCOPES : PROFILE_SCOPES;
}

class Workspace extends BaseWorkspace {
	initialized: boolean = false;
}

export class WorkspaceService extends Disposable implements IWorkbenchConfigurationService, IWorkspaceContextService {

	public _serviceBrand: undefined;

	private workspace!: Workspace;
	private initRemoteUserConfigurationBarrier: Barrier;
	private completeWorkspaceBarrier: Barrier;
	private readonly configurationCache: IConfigurationCache;
	private _configuration: Configuration;
	private initialized: boolean = false;
	private readonly defaultConfiguration: DefaultConfiguration;
	private readonly policyConfiguration: IPolicyConfiguration;
	private applicationConfiguration: ApplicationConfiguration | null = null;
	private readonly applicationConfigurationDisposables: DisposableStore;
	private readonly localUserConfiguration: UserConfiguration;
	private readonly remoteUserConfiguration: RemoteUserConfiguration | null = null;
	private readonly workspaceConfiguration: WorkspaceConfiguration;
	private cachedFolderConfigs: ResourceMap<FolderConfiguration>;
	private readonly workspaceEditingQueue: Queue<void>;

	private readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	public readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	protected readonly _onWillChangeWorkspaceFolders: Emitter<IWorkspaceFoldersWillChangeEvent> = this._register(new Emitter<IWorkspaceFoldersWillChangeEvent>());
	public readonly onWillChangeWorkspaceFolders: Event<IWorkspaceFoldersWillChangeEvent> = this._onWillChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent> = this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	public readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = this._onDidChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkspaceName: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceName: Event<void> = this._onDidChangeWorkspaceName.event;

	private readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState> = this._register(new Emitter<WorkbenchState>());
	public readonly onDidChangeWorkbenchState: Event<WorkbenchState> = this._onDidChangeWorkbenchState.event;

	private isWorkspaceTrusted: boolean = true;

	private _restrictedSettings: RestrictedSettings = { default: [] };
	get restrictedSettings() { return this._restrictedSettings; }
	private readonly _onDidChangeRestrictedSettings = this._register(new Emitter<RestrictedSettings>());
	public readonly onDidChangeRestrictedSettings = this._onDidChangeRestrictedSettings.event;

	private readonly configurationRegistry: IConfigurationRegistry;

	private instantiationService: IInstantiationService | undefined;
	private configurationEditing: Promise<ConfigurationEditing> | undefined;

	constructor(
		{ remoteAuthority, configurationCache }: { remoteAuthority?: string; configurationCache: IConfigurationCache },
		environmentService: IBrowserWorkbenchEnvironmentService,
		private readonly userDataProfileService: IUserDataProfileService,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly fileService: IFileService,
		private readonly remoteAgentService: IRemoteAgentService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly logService: ILogService,
		policyService: IPolicyService
	) {
		super();

		this.configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

		this.initRemoteUserConfigurationBarrier = new Barrier();
		this.completeWorkspaceBarrier = new Barrier();
		this.defaultConfiguration = this._register(new DefaultConfiguration(configurationCache, environmentService, logService));
		this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
		this.configurationCache = configurationCache;
		this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), ConfigurationModel.createEmptyModel(logService), new ResourceMap<ConfigurationModel>(), this.workspace, logService);
		this.applicationConfigurationDisposables = this._register(new DisposableStore());
		this.createApplicationConfiguration();
		this.localUserConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, { scopes: getLocalUserConfigurationScopes(userDataProfileService.currentProfile, !!remoteAuthority) }, fileService, uriIdentityService, logService));
		this.cachedFolderConfigs = new ResourceMap<FolderConfiguration>();
		this._register(this.localUserConfiguration.onDidChangeConfiguration(userConfiguration => this.onLocalUserConfigurationChanged(userConfiguration)));
		if (remoteAuthority) {
			const remoteUserConfiguration = this.remoteUserConfiguration = this._register(new RemoteUserConfiguration(remoteAuthority, configurationCache, fileService, uriIdentityService, remoteAgentService, logService));
			this._register(remoteUserConfiguration.onDidInitialize(remoteUserConfigurationModel => {
				this._register(remoteUserConfiguration.onDidChangeConfiguration(remoteUserConfigurationModel => this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel)));
				this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel);
				this.initRemoteUserConfigurationBarrier.open();
			}));
		} else {
			this.initRemoteUserConfigurationBarrier.open();
		}

		this.workspaceConfiguration = this._register(new WorkspaceConfiguration(configurationCache, fileService, uriIdentityService, logService));
		this._register(this.workspaceConfiguration.onDidUpdateConfiguration(fromCache => {
			this.onWorkspaceConfigurationChanged(fromCache).then(() => {
				this.workspace.initialized = this.workspaceConfiguration.initialized;
				this.checkAndMarkWorkspaceComplete(fromCache);
			});
		}));

		this._register(this.defaultConfiguration.onDidChangeConfiguration(({ properties, defaults }) => this.onDefaultConfigurationChanged(defaults, properties)));
		this._register(this.policyConfiguration.onDidChangeConfiguration(configurationModel => this.onPolicyConfigurationChanged(configurationModel)));
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => this.onUserDataProfileChanged(e)));

		this.workspaceEditingQueue = new Queue<void>();
	}

	private createApplicationConfiguration(): void {
		this.applicationConfigurationDisposables.clear();
		if (this.userDataProfileService.currentProfile.isDefault || this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
			this.applicationConfiguration = null;
		} else {
			this.applicationConfiguration = this.applicationConfigurationDisposables.add(this._register(new ApplicationConfiguration(this.userDataProfilesService, this.fileService, this.uriIdentityService, this.logService)));
			this.applicationConfigurationDisposables.add(this.applicationConfiguration.onDidChangeConfiguration(configurationModel => this.onApplicationConfigurationChanged(configurationModel)));
		}
	}

	// Workspace Context Service Impl

	public async getCompleteWorkspace(): Promise<Workspace> {
		await this.completeWorkspaceBarrier.wait();
		return this.getWorkspace();
	}

	public getWorkspace(): Workspace {
		return this.workspace;
	}

	public getWorkbenchState(): WorkbenchState {
		// Workspace has configuration file
		if (this.workspace.configuration) {
			return WorkbenchState.WORKSPACE;
		}

		// Folder has single root
		if (this.workspace.folders.length === 1) {
			return WorkbenchState.FOLDER;
		}

		// Empty
		return WorkbenchState.EMPTY;
	}

	public getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
		return this.workspace.getFolder(resource);
	}

	public addFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number): Promise<void> {
		return this.updateFolders(foldersToAdd, [], index);
	}

	public removeFolders(foldersToRemove: URI[]): Promise<void> {
		return this.updateFolders([], foldersToRemove);
	}

	public async updateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
		return this.workspaceEditingQueue.queue(() => this.doUpdateFolders(foldersToAdd, foldersToRemove, index));
	}

	public isInsideWorkspace(resource: URI): boolean {
		return !!this.getWorkspaceFolder(resource);
	}

	public isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean {
		switch (this.getWorkbenchState()) {
			case WorkbenchState.FOLDER: {
				let folderUri: URI | undefined = undefined;
				if (URI.isUri(workspaceIdOrFolder)) {
					folderUri = workspaceIdOrFolder;
				} else if (isSingleFolderWorkspaceIdentifier(workspaceIdOrFolder)) {
					folderUri = workspaceIdOrFolder.uri;
				}

				return URI.isUri(folderUri) && this.uriIdentityService.extUri.isEqual(folderUri, this.workspace.folders[0].uri);
			}
			case WorkbenchState.WORKSPACE:
				return isWorkspaceIdentifier(workspaceIdOrFolder) && this.workspace.id === workspaceIdOrFolder.id;
		}
		return false;
	}

	private async doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
		if (this.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
			return Promise.resolve(undefined); // we need a workspace to begin with
		}

		if (foldersToAdd.length + foldersToRemove.length === 0) {
			return Promise.resolve(undefined); // nothing to do
		}

		let foldersHaveChanged = false;

		// Remove first (if any)
		let currentWorkspaceFolders = this.getWorkspace().folders;
		let newStoredFolders: IStoredWorkspaceFolder[] = currentWorkspaceFolders.map(f => f.raw).filter((folder, index): folder is IStoredWorkspaceFolder => {
			if (!isStoredWorkspaceFolder(folder)) {
				return true; // keep entries which are unrelated
			}

			return !this.contains(foldersToRemove, currentWorkspaceFolders[index].uri); // keep entries which are unrelated
		});

		foldersHaveChanged = currentWorkspaceFolders.length !== newStoredFolders.length;

		// Add afterwards (if any)
		if (foldersToAdd.length) {

			// Recompute current workspace folders if we have folders to add
			const workspaceConfigPath = this.getWorkspace().configuration!;
			const workspaceConfigFolder = this.uriIdentityService.extUri.dirname(workspaceConfigPath);
			currentWorkspaceFolders = toWorkspaceFolders(newStoredFolders, workspaceConfigPath, this.uriIdentityService.extUri);
			const currentWorkspaceFolderUris = currentWorkspaceFolders.map(folder => folder.uri);

			const storedFoldersToAdd: IStoredWorkspaceFolder[] = [];

			for (const folderToAdd of foldersToAdd) {
				const folderURI = folderToAdd.uri;
				if (this.contains(currentWorkspaceFolderUris, folderURI)) {
					continue; // already existing
				}
				try {
					const result = await this.fileService.stat(folderURI);
					if (!result.isDirectory) {
						continue;
					}
				} catch (e) { /* Ignore */ }
				storedFoldersToAdd.push(getStoredWorkspaceFolder(folderURI, false, folderToAdd.name, workspaceConfigFolder, this.uriIdentityService.extUri));
			}

			// Apply to array of newStoredFolders
			if (storedFoldersToAdd.length > 0) {
				foldersHaveChanged = true;

				if (typeof index === 'number' && index >= 0 && index < newStoredFolders.length) {
					newStoredFolders = newStoredFolders.slice(0);
					newStoredFolders.splice(index, 0, ...storedFoldersToAdd);
				} else {
					newStoredFolders = [...newStoredFolders, ...storedFoldersToAdd];
				}
			}
		}

		// Set folders if we recorded a change
		if (foldersHaveChanged) {
			return this.setFolders(newStoredFolders);
		}

		return Promise.resolve(undefined);
	}

	private async setFolders(folders: IStoredWorkspaceFolder[]): Promise<void> {
		if (!this.instantiationService) {
			throw new Error('Cannot update workspace folders because workspace service is not yet ready to accept writes.');
		}

		await this.instantiationService.invokeFunction(accessor => this.workspaceConfiguration.setFolders(folders, accessor.get(IJSONEditingService)));
		return this.onWorkspaceConfigurationChanged(false);
	}

	private contains(resources: URI[], toCheck: URI): boolean {
		return resources.some(resource => this.uriIdentityService.extUri.isEqual(resource, toCheck));
	}

	// Workspace Configuration Service Impl

	getConfigurationData(): IConfigurationData {
		return this._configuration.toData();
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: unknown, arg2?: unknown): unknown {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
		return this._configuration.getValue(section, overrides);
	}

	updateValue(key: string, value: unknown): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	async updateValue(key: string, value: unknown, arg3?: unknown, arg4?: unknown, options?: IConfigurationUpdateOptions): Promise<void> {
		const overrides: IConfigurationUpdateOverrides | undefined = isConfigurationUpdateOverrides(arg3) ? arg3
			: isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : undefined } : undefined;
		const target: ConfigurationTarget | undefined = (overrides ? arg4 : arg3) as ConfigurationTarget | undefined;
		const targets: ConfigurationTarget[] = target ? [target] : [];

		if (overrides?.overrideIdentifiers) {
			overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
			overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : undefined;
		}

		if (!targets.length) {
			if (overrides?.overrideIdentifiers && overrides.overrideIdentifiers.length > 1) {
				throw new Error('Configuration Target is required while updating the value for multiple override identifiers');
			}
			const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : undefined });
			targets.push(...this.deriveConfigurationTargets(key, value, inspect));

			// Remove the setting, if the value is same as default value and is updated only in user target
			if (equals(value, inspect.defaultValue) && targets.length === 1 && (targets[0] === ConfigurationTarget.USER || targets[0] === ConfigurationTarget.USER_LOCAL)) {
				value = undefined;
			}
		}

		await Promises.settled(targets.map(target => this.writeConfigurationValue(key, value, target, overrides, options)));
	}

	async reloadConfiguration(target?: ConfigurationTarget | IWorkspaceFolder): Promise<void> {
		if (target === undefined) {
			this.reloadDefaultConfiguration();
			const application = await this.reloadApplicationConfiguration(true);
			const { local, remote } = await this.reloadUserConfiguration();
			await this.reloadWorkspaceConfiguration();
			await this.loadConfiguration(application, local, remote, true);
			return;
		}

		if (isWorkspaceFolder(target)) {
			await this.reloadWorkspaceFolderConfiguration(target);
			return;
		}

		switch (target) {
			case ConfigurationTarget.DEFAULT:
				this.reloadDefaultConfiguration();
				return;

			case ConfigurationTarget.USER: {
				const { local, remote } = await this.reloadUserConfiguration();
				await this.loadConfiguration(this._configuration.applicationConfiguration, local, remote, true);
				return;
			}
			case ConfigurationTarget.USER_LOCAL:
				await this.reloadLocalUserConfiguration();
				return;

			case ConfigurationTarget.USER_REMOTE:
				await this.reloadRemoteUserConfiguration();
				return;

			case ConfigurationTarget.WORKSPACE:
			case ConfigurationTarget.WORKSPACE_FOLDER:
				await this.reloadWorkspaceConfiguration();
				return;
		}
	}

	hasCachedConfigurationDefaultsOverrides(): boolean {
		return this.defaultConfiguration.hasCachedConfigurationDefaultsOverrides();
	}

	inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		return this._configuration.inspect<T>(key, overrides);
	}

	keys(): {
		default: string[];
		policy: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this._configuration.keys();
	}

	public async whenRemoteConfigurationLoaded(): Promise<void> {
		await this.initRemoteUserConfigurationBarrier.wait();
	}

	/**
	 * At present, all workspaces (empty, single-folder, multi-root) in local and remote
	 * can be initialized without requiring extension host except following case:
	 *
	 * A multi root workspace with .code-workspace file that has to be resolved by an extension.
	 * Because of readonly `rootPath` property in extension API we have to resolve multi root workspace
	 * before extension host starts so that `rootPath` can be set to first folder.
	 *
	 * This restriction is lifted partially for web in `MainThreadWorkspace`.
	 * In web, we start extension host with empty `rootPath` in this case.
	 *
	 * Related root path issue discussion is being tracked here - https://github.com/microsoft/vscode/issues/69335
	 */
	async initialize(arg: IAnyWorkspaceIdentifier): Promise<void> {
		mark('code/willInitWorkspaceService');

		const trigger = this.initialized;
		this.initialized = false;
		const workspace = await this.createWorkspace(arg);
		await this.updateWorkspaceAndInitializeConfiguration(workspace, trigger);
		this.checkAndMarkWorkspaceComplete(false);

		mark('code/didInitWorkspaceService');
	}

	updateWorkspaceTrust(trusted: boolean): void {
		if (this.isWorkspaceTrusted !== trusted) {
			this.isWorkspaceTrusted = trusted;
			const data = this._configuration.toData();
			const folderConfigurationModels: (ConfigurationModel | undefined)[] = [];
			for (const folder of this.workspace.folders) {
				const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
				let configurationModel: ConfigurationModel | undefined;
				if (folderConfiguration) {
					configurationModel = folderConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted);
					this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
				}
				folderConfigurationModels.push(configurationModel);
			}
			if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
				if (folderConfigurationModels[0]) {
					this._configuration.updateWorkspaceConfiguration(folderConfigurationModels[0]);
				}
			} else {
				this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted));
			}
			this.updateRestrictedSettings();

			let keys: string[] = [];
			if (this.restrictedSettings.userLocal) {
				keys.push(...this.restrictedSettings.userLocal);
			}
			if (this.restrictedSettings.userRemote) {
				keys.push(...this.restrictedSettings.userRemote);
			}
			if (this.restrictedSettings.workspace) {
				keys.push(...this.restrictedSettings.workspace);
			}
			this.restrictedSettings.workspaceFolder?.forEach((value) => keys.push(...value));
			keys = distinct(keys);
			if (keys.length) {
				this.triggerConfigurationChange({ keys, overrides: [] }, { data, workspace: this.workspace }, ConfigurationTarget.WORKSPACE);
			}
		}
	}

	acquireInstantiationService(instantiationService: IInstantiationService): void {
		this.instantiationService = instantiationService;
	}

	isSettingAppliedForAllProfiles(key: string): boolean {
		const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
		if (scope && APPLICATION_SCOPES.includes(scope)) {
			return true;
		}
		const allProfilesSettings = this.getValue<string[]>(APPLY_ALL_PROFILES_SETTING) ?? [];
		return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
	}

	private async createWorkspace(arg: IAnyWorkspaceIdentifier): Promise<Workspace> {
		if (isWorkspaceIdentifier(arg)) {
			return this.createMultiFolderWorkspace(arg);
		}

		if (isSingleFolderWorkspaceIdentifier(arg)) {
			return this.createSingleFolderWorkspace(arg);
		}

		return this.createEmptyWorkspace(arg);
	}

	private async createMultiFolderWorkspace(workspaceIdentifier: IWorkspaceIdentifier): Promise<Workspace> {
		await this.workspaceConfiguration.initialize({ id: workspaceIdentifier.id, configPath: workspaceIdentifier.configPath }, this.isWorkspaceTrusted);
		const workspaceConfigPath = workspaceIdentifier.configPath;
		const workspaceFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), workspaceConfigPath, this.uriIdentityService.extUri);
		const workspaceId = workspaceIdentifier.id;
		const workspace = new Workspace(workspaceId, workspaceFolders, this.workspaceConfiguration.isTransient(), workspaceConfigPath, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));
		workspace.initialized = this.workspaceConfiguration.initialized;
		return workspace;
	}

	private createSingleFolderWorkspace(singleFolderWorkspaceIdentifier: ISingleFolderWorkspaceIdentifier): Workspace {
		const workspace = new Workspace(singleFolderWorkspaceIdentifier.id, [toWorkspaceFolder(singleFolderWorkspaceIdentifier.uri)], false, null, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));
		workspace.initialized = true;
		return workspace;
	}

	private createEmptyWorkspace(emptyWorkspaceIdentifier: IEmptyWorkspaceIdentifier): Promise<Workspace> {
		const workspace = new Workspace(emptyWorkspaceIdentifier.id, [], false, null, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));
		workspace.initialized = true;
		return Promise.resolve(workspace);
	}

	private checkAndMarkWorkspaceComplete(fromCache: boolean): void {
		if (!this.completeWorkspaceBarrier.isOpen() && this.workspace.initialized) {
			this.completeWorkspaceBarrier.open();
			this.validateWorkspaceFoldersAndReload(fromCache);
		}
	}

	private async updateWorkspaceAndInitializeConfiguration(workspace: Workspace, trigger: boolean): Promise<void> {
		const hasWorkspaceBefore = !!this.workspace;
		let previousState: WorkbenchState | undefined;
		let previousWorkspacePath: string | undefined;
		let previousFolders: WorkspaceFolder[] = [];

		if (hasWorkspaceBefore) {
			previousState = this.getWorkbenchState();
			previousWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : undefined;
			previousFolders = this.workspace.folders;
			this.workspace.update(workspace);
		} else {
			this.workspace = workspace;
		}

		await this.initializeConfiguration(trigger);

		// Trigger changes after configuration initialization so that configuration is up to date.
		if (hasWorkspaceBefore) {
			const newState = this.getWorkbenchState();
			if (previousState && newState !== previousState) {
				this._onDidChangeWorkbenchState.fire(newState);
			}

			const newWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : undefined;
			if (previousWorkspacePath && newWorkspacePath !== previousWorkspacePath || newState !== previousState) {
				this._onDidChangeWorkspaceName.fire();
			}

			const folderChanges = this.compareFolders(previousFolders, this.workspace.folders);
			if (folderChanges && (folderChanges.added.length || folderChanges.removed.length || folderChanges.changed.length)) {
				await this.handleWillChangeWorkspaceFolders(folderChanges, false);
				this._onDidChangeWorkspaceFolders.fire(folderChanges);
			}
		}

		if (!this.localUserConfiguration.hasTasksLoaded) {
			// Reload local user configuration again to load user tasks
			this._register(runWhenWindowIdle(mainWindow, () => this.reloadLocalUserConfiguration(false, this._configuration.localUserConfiguration)));
		}
	}

	private compareFolders(currentFolders: IWorkspaceFolder[], newFolders: IWorkspaceFolder[]): IWorkspaceFoldersChangeEvent {
		const result: IWorkspaceFoldersChangeEvent = { added: [], removed: [], changed: [] };
		result.added = newFolders.filter(newFolder => !currentFolders.some(currentFolder => newFolder.uri.toString() === currentFolder.uri.toString()));
		for (let currentIndex = 0; currentIndex < currentFolders.length; currentIndex++) {
			const currentFolder = currentFolders[currentIndex];
			let newIndex = 0;
			for (newIndex = 0; newIndex < newFolders.length && currentFolder.uri.toString() !== newFolders[newIndex].uri.toString(); newIndex++) { }
			if (newIndex < newFolders.length) {
				if (currentIndex !== newIndex || currentFolder.name !== newFolders[newIndex].name) {
					result.changed.push(currentFolder);
				}
			} else {
				result.removed.push(currentFolder);
			}
		}
		return result;
	}

	private async initializeConfiguration(trigger: boolean): Promise<void> {
		await this.defaultConfiguration.initialize();

		const initPolicyConfigurationPromise = this.policyConfiguration.initialize();
		const initApplicationConfigurationPromise = this.applicationConfiguration ? this.applicationConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService));
		const initUserConfiguration = async () => {
			mark('code/willInitUserConfiguration');
			const result = await Promise.all([this.localUserConfiguration.initialize(), this.remoteUserConfiguration ? this.remoteUserConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService))]);
			if (this.applicationConfiguration) {
				const applicationConfigurationModel = await initApplicationConfigurationPromise;
				result[0] = this.localUserConfiguration.reparse({ exclude: applicationConfigurationModel.getValue(APPLY_ALL_PROFILES_SETTING) });
			}
			mark('code/didInitUserConfiguration');
			return result;
		};

		const [, application, [local, remote]] = await Promise.all([
			initPolicyConfigurationPromise,
			initApplicationConfigurationPromise,
			initUserConfiguration()
		]);

		mark('code/willInitWorkspaceConfiguration');
		await this.loadConfiguration(application, local, remote, trigger);
		mark('code/didInitWorkspaceConfiguration');
	}

	private reloadDefaultConfiguration(): void {
		this.onDefaultConfigurationChanged(this.defaultConfiguration.reload());
	}

	private async reloadApplicationConfiguration(donotTrigger?: boolean): Promise<ConfigurationModel> {
		if (!this.applicationConfiguration) {
			return ConfigurationModel.createEmptyModel(this.logService);
		}
		const model = await this.applicationConfiguration.loadConfiguration();
		if (!donotTrigger) {
			this.onApplicationConfigurationChanged(model);
		}
		return model;
	}

	private async reloadUserConfiguration(): Promise<{ local: ConfigurationModel; remote: ConfigurationModel }> {
		const [local, remote] = await Promise.all([this.reloadLocalUserConfiguration(true), this.reloadRemoteUserConfiguration(true)]);
		return { local, remote };
	}

	async reloadLocalUserConfiguration(donotTrigger?: boolean, settingsConfiguration?: ConfigurationModel): Promise<ConfigurationModel> {
		const model = await this.localUserConfiguration.reload(settingsConfiguration);
		if (!donotTrigger) {
			this.onLocalUserConfigurationChanged(model);
		}
		return model;
	}

	private async reloadRemoteUserConfiguration(donotTrigger?: boolean): Promise<ConfigurationModel> {
		if (this.remoteUserConfiguration) {
			const model = await this.remoteUserConfiguration.reload();
			if (!donotTrigger) {
				this.onRemoteUserConfigurationChanged(model);
			}
			return model;
		}
		return ConfigurationModel.createEmptyModel(this.logService);
	}

	private async reloadWorkspaceConfiguration(): Promise<void> {
		const workbenchState = this.getWorkbenchState();
		if (workbenchState === WorkbenchState.FOLDER) {
			return this.onWorkspaceFolderConfigurationChanged(this.workspace.folders[0]);
		}
		if (workbenchState === WorkbenchState.WORKSPACE) {
			return this.workspaceConfiguration.reload().then(() => this.onWorkspaceConfigurationChanged(false));
		}
	}

	private reloadWorkspaceFolderConfiguration(folder: IWorkspaceFolder): Promise<void> {
		return this.onWorkspaceFolderConfigurationChanged(folder);
	}

	private async loadConfiguration(applicationConfigurationModel: ConfigurationModel, userConfigurationModel: ConfigurationModel, remoteUserConfigurationModel: ConfigurationModel, trigger: boolean): Promise<void> {
		// reset caches
		this.cachedFolderConfigs = new ResourceMap<FolderConfiguration>();

		const folders = this.workspace.folders;
		const folderConfigurations = await this.loadFolderConfigurations(folders);

		const workspaceConfiguration = this.getWorkspaceConfigurationModel(folderConfigurations);
		const folderConfigurationModels = new ResourceMap<ConfigurationModel>();
		folderConfigurations.forEach((folderConfiguration, index) => folderConfigurationModels.set(folders[index].uri, folderConfiguration));

		const currentConfiguration = this._configuration;
		this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, applicationConfigurationModel, userConfigurationModel, remoteUserConfigurationModel, workspaceConfiguration, folderConfigurationModels, ConfigurationModel.createEmptyModel(this.logService), new ResourceMap<ConfigurationModel>(), this.workspace, this.logService);

		this.initialized = true;

		if (trigger) {
			const change = this._configuration.compare(currentConfiguration);
			this.triggerConfigurationChange(change, { data: currentConfiguration.toData(), workspace: this.workspace }, ConfigurationTarget.WORKSPACE);
		}

		this.updateRestrictedSettings();
	}

	private getWorkspaceConfigurationModel(folderConfigurations: ConfigurationModel[]): ConfigurationModel {
		switch (this.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return folderConfigurations[0];
			case WorkbenchState.WORKSPACE:
				return this.workspaceConfiguration.getConfiguration();
			default:
				return ConfigurationModel.createEmptyModel(this.logService);
		}
	}

	private onUserDataProfileChanged(e: DidChangeUserDataProfileEvent): void {
		e.join((async () => {
			const promises: Promise<ConfigurationModel>[] = [];
			promises.push(this.localUserConfiguration.reset(e.profile.settingsResource, e.profile.tasksResource, e.profile.mcpResource, { scopes: getLocalUserConfigurationScopes(e.profile, !!this.remoteUserConfiguration) }));
			if (e.previous.isDefault !== e.profile.isDefault
				|| !!e.previous.useDefaultFlags?.settings !== !!e.profile.useDefaultFlags?.settings) {
				this.createApplicationConfiguration();
				if (this.applicationConfiguration) {
					promises.push(this.reloadApplicationConfiguration(true));
				}
			}
			let [localUser, application] = await Promise.all(promises);
			application = application ?? this._configuration.applicationConfiguration;
			if (this.applicationConfiguration) {
				localUser = this.localUserConfiguration.reparse({ exclude: application.getValue(APPLY_ALL_PROFILES_SETTING) });
			}
			await this.loadConfiguration(application, localUser, this._configuration.remoteUserConfiguration, true);
		})());
	}

	private onDefaultConfigurationChanged(configurationModel: ConfigurationModel, properties?: string[]): void {
		if (this.workspace) {
			const previousData = this._configuration.toData();
			const change = this._configuration.compareAndUpdateDefaultConfiguration(configurationModel, properties);
			if (this.applicationConfiguration) {
				this._configuration.updateApplicationConfiguration(this.applicationConfiguration.reparse());
			}
			if (this.remoteUserConfiguration) {
				this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse());
				this._configuration.updateRemoteUserConfiguration(this.remoteUserConfiguration.reparse());
			}
			if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
				const folderConfiguration = this.cachedFolderConfigs.get(this.workspace.folders[0].uri);
				if (folderConfiguration) {
					this._configuration.updateWorkspaceConfiguration(folderConfiguration.reparse());
					this._configuration.updateFolderConfiguration(this.workspace.folders[0].uri, folderConfiguration.reparse());
				}
			} else {
				this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.reparseWorkspaceSettings());
				for (const folder of this.workspace.folders) {
					const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
					if (folderConfiguration) {
						this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
					}
				}
			}
			this.triggerConfigurationChange(change, { data: previousData, workspace: this.workspace }, ConfigurationTarget.DEFAULT);
			this.updateRestrictedSettings();
		}
	}

	private onPolicyConfigurationChanged(policyConfiguration: ConfigurationModel): void {
		const previous = { data: this._configuration.toData(), workspace: this.workspace };
		const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
		this.triggerConfigurationChange(change, previous, ConfigurationTarget.DEFAULT);
	}

	private onApplicationConfigurationChanged(applicationConfiguration: ConfigurationModel): void {
		const previous = { data: this._configuration.toData(), workspace: this.workspace };
		const previousAllProfilesSettings = this._configuration.applicationConfiguration.getValue<string[]>(APPLY_ALL_PROFILES_SETTING) ?? [];
		const change = this._configuration.compareAndUpdateApplicationConfiguration(applicationConfiguration);
		const currentAllProfilesSettings = this.getValue<string[]>(APPLY_ALL_PROFILES_SETTING) ?? [];
		const configurationProperties = this.configurationRegistry.getConfigurationProperties();
		const changedKeys: string[] = [];
		for (const changedKey of change.keys) {
			const scope = configurationProperties[changedKey]?.scope;
			if (scope && APPLICATION_SCOPES.includes(scope)) {
				changedKeys.push(changedKey);
				if (changedKey === APPLY_ALL_PROFILES_SETTING) {
					for (const previousAllProfileSetting of previousAllProfilesSettings) {
						if (!currentAllProfilesSettings.includes(previousAllProfileSetting)) {
							changedKeys.push(previousAllProfileSetting);
						}
					}
					for (const currentAllProfileSetting of currentAllProfilesSettings) {
						if (!previousAllProfilesSettings.includes(currentAllProfileSetting)) {
							changedKeys.push(currentAllProfileSetting);
						}
					}
				}
			}
			else if (currentAllProfilesSettings.includes(changedKey)) {
				changedKeys.push(changedKey);
			}
		}
		change.keys = changedKeys;
		if (change.keys.includes(APPLY_ALL_PROFILES_SETTING)) {
			this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse({ exclude: currentAllProfilesSettings }));
		}
		this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
	}

	private onLocalUserConfigurationChanged(userConfiguration: ConfigurationModel): void {
		const previous = { data: this._configuration.toData(), workspace: this.workspace };
		const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
		this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
	}

	private onRemoteUserConfigurationChanged(userConfiguration: ConfigurationModel): void {
		const previous = { data: this._configuration.toData(), workspace: this.workspace };
		const change = this._configuration.compareAndUpdateRemoteUserConfiguration(userConfiguration);
		this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
	}

	private async onWorkspaceConfigurationChanged(fromCache: boolean): Promise<void> {
		if (this.workspace && this.workspace.configuration) {
			let newFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), this.workspace.configuration, this.uriIdentityService.extUri);

			// Validate only if workspace is initialized
			if (this.workspace.initialized) {
				const { added, removed, changed } = this.compareFolders(this.workspace.folders, newFolders);

				/* If changed validate new folders */
				if (added.length || removed.length || changed.length) {
					newFolders = await this.toValidWorkspaceFolders(newFolders);
				}
				/* Otherwise use existing */
				else {
					newFolders = this.workspace.folders;
				}
			}

			await this.updateWorkspaceConfiguration(newFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
		}
	}

	private updateRestrictedSettings(): void {
		const changed: string[] = [];

		const allProperties = this.configurationRegistry.getConfigurationProperties();
		const defaultRestrictedSettings: string[] = Object.keys(allProperties).filter(key => allProperties[key].restricted).sort((a, b) => a.localeCompare(b));
		const defaultDelta = delta(defaultRestrictedSettings, this._restrictedSettings.default, (a, b) => a.localeCompare(b));
		changed.push(...defaultDelta.added, ...defaultDelta.removed);

		const application = (this.applicationConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
		const applicationDelta = delta(application, this._restrictedSettings.application || [], (a, b) => a.localeCompare(b));
		changed.push(...applicationDelta.added, ...applicationDelta.removed);

		const userLocal = this.localUserConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b));
		const userLocalDelta = delta(userLocal, this._restrictedSettings.userLocal || [], (a, b) => a.localeCompare(b));
		changed.push(...userLocalDelta.added, ...userLocalDelta.removed);

		const userRemote = (this.remoteUserConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
		const userRemoteDelta = delta(userRemote, this._restrictedSettings.userRemote || [], (a, b) => a.localeCompare(b));
		changed.push(...userRemoteDelta.added, ...userRemoteDelta.removed);

		const workspaceFolderMap = new ResourceMap<ReadonlyArray<string>>();
		for (const workspaceFolder of this.workspace.folders) {
			const cachedFolderConfig = this.cachedFolderConfigs.get(workspaceFolder.uri);
			const folderRestrictedSettings = (cachedFolderConfig?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
			if (folderRestrictedSettings.length) {
				workspaceFolderMap.set(workspaceFolder.uri, folderRestrictedSettings);
			}
			const previous = this._restrictedSettings.workspaceFolder?.get(workspaceFolder.uri) || [];
			const workspaceFolderDelta = delta(folderRestrictedSettings, previous, (a, b) => a.localeCompare(b));
			changed.push(...workspaceFolderDelta.added, ...workspaceFolderDelta.removed);
		}

		const workspace = this.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.workspaceConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b))
			: this.workspace.folders[0] ? (workspaceFolderMap.get(this.workspace.folders[0].uri) || []) : [];
		const workspaceDelta = delta(workspace, this._restrictedSettings.workspace || [], (a, b) => a.localeCompare(b));
		changed.push(...workspaceDelta.added, ...workspaceDelta.removed);

		if (changed.length) {
			this._restrictedSettings = {
				default: defaultRestrictedSettings,
				application: application.length ? application : undefined,
				userLocal: userLocal.length ? userLocal : undefined,
				userRemote: userRemote.length ? userRemote : undefined,
				workspace: workspace.length ? workspace : undefined,
				workspaceFolder: workspaceFolderMap.size ? workspaceFolderMap : undefined,
			};
			this._onDidChangeRestrictedSettings.fire(this.restrictedSettings);
		}
	}

	private async updateWorkspaceConfiguration(workspaceFolders: WorkspaceFolder[], configuration: ConfigurationModel, fromCache: boolean): Promise<void> {
		const previous = { data: this._configuration.toData(), workspace: this.workspace };
		const change = this._configuration.compareAndUpdateWorkspaceConfiguration(configuration);
		const changes = this.compareFolders(this.workspace.folders, workspaceFolders);
		if (changes.added.length || changes.removed.length || changes.changed.length) {
			this.workspace.folders = workspaceFolders;
			const change = await this.onFoldersChanged();
			await this.handleWillChangeWorkspaceFolders(changes, fromCache);
			this.triggerConfigurationChange(change, previous, ConfigurationTarget.WORKSPACE_FOLDER);
			this._onDidChangeWorkspaceFolders.fire(changes);
		} else {
			this.triggerConfigurationChange(change, previous, ConfigurationTarget.WORKSPACE);
		}
		this.updateRestrictedSettings();
	}

	private async handleWillChangeWorkspaceFolders(changes: IWorkspaceFoldersChangeEvent, fromCache: boolean): Promise<void> {
		const joiners: Promise<void>[] = [];
		this._onWillChangeWorkspaceFolders.fire({
			join(updateWorkspaceTrustStatePromise) {
				joiners.push(updateWorkspaceTrustStatePromise);
			},
			changes,
			fromCache
		});
		try { await Promises.settled(joiners); } catch (error) { /* Ignore */ }
	}

	private async onWorkspaceFolderConfigurationChanged(folder: IWorkspaceFolder): Promise<void> {
		const [folderConfiguration] = await this.loadFolderConfigurations([folder]);
		const previous = { data: this._configuration.toData(), workspace: this.workspace };
		const folderConfigurationChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderConfiguration);
		if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
			const workspaceConfigurationChange = this._configuration.compareAndUpdateWorkspaceConfiguration(folderConfiguration);
			this.triggerConfigurationChange(mergeChanges(folderConfigurationChange, workspaceConfigurationChange), previous, ConfigurationTarget.WORKSPACE);
		} else {
			this.triggerConfigurationChange(folderConfigurationChange, previous, ConfigurationTarget.WORKSPACE_FOLDER);
		}
		this.updateRestrictedSettings();
	}

	private async onFoldersChanged(): Promise<IConfigurationChange> {
		const changes: IConfigurationChange[] = [];

		// Remove the configurations of deleted folders
		for (const key of this.cachedFolderConfigs.keys()) {
			if (!this.workspace.folders.filter(folder => folder.uri.toString() === key.toString())[0]) {
				const folderConfiguration = this.cachedFolderConfigs.get(key);
				folderConfiguration!.dispose();
				this.cachedFolderConfigs.delete(key);
				changes.push(this._configuration.compareAndDeleteFolderConfiguration(key));
			}
		}

		const toInitialize = this.workspace.folders.filter(folder => !this.cachedFolderConfigs.has(folder.uri));
		if (toInitialize.length) {
			const folderConfigurations = await this.loadFolderConfigurations(toInitialize);
			folderConfigurations.forEach((folderConfiguration, index) => {
				changes.push(this._configuration.compareAndUpdateFolderConfiguration(toInitialize[index].uri, folderConfiguration));
			});
		}
		return mergeChanges(...changes);
	}

	private loadFolderConfigurations(folders: IWorkspaceFolder[]): Promise<ConfigurationModel[]> {
		return Promise.all([...folders.map(folder => {
			let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
			if (!folderConfiguration) {
				folderConfiguration = new FolderConfiguration(!this.initialized, folder, FOLDER_CONFIG_FOLDER_NAME, this.getWorkbenchState(), this.isWorkspaceTrusted, this.fileService, this.uriIdentityService, this.logService, this.configurationCache);
				this._register(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
				this.cachedFolderConfigs.set(folder.uri, this._register(folderConfiguration));
			}
			return folderConfiguration.loadConfiguration();
		})]);
	}

	private async validateWorkspaceFoldersAndReload(fromCache: boolean): Promise<void> {
		const validWorkspaceFolders = await this.toValidWorkspaceFolders(this.workspace.folders);
		const { removed } = this.compareFolders(this.workspace.folders, validWorkspaceFolders);
		if (removed.length) {
			await this.updateWorkspaceConfiguration(validWorkspaceFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
		}
	}

	// Filter out workspace folders which are files (not directories)
	// Workspace folders those cannot be resolved are not filtered because they are handled by the Explorer.
	private async toValidWorkspaceFolders(workspaceFolders: WorkspaceFolder[]): Promise<WorkspaceFolder[]> {
		const validWorkspaceFolders: WorkspaceFolder[] = [];
		for (const workspaceFolder of workspaceFolders) {
			try {
				const result = await this.fileService.stat(workspaceFolder.uri);
				if (!result.isDirectory) {
					continue;
				}
			} catch (e) {
				this.logService.warn(`Ignoring the error while validating workspace folder ${workspaceFolder.uri.toString()} - ${toErrorMessage(e)}`);
			}
			validWorkspaceFolders.push(workspaceFolder);
		}
		return validWorkspaceFolders;
	}

	private async writeConfigurationValue(key: string, value: unknown, target: ConfigurationTarget, overrides: IConfigurationUpdateOverrides | undefined, options?: IConfigurationUpdateOptions): Promise<void> {
		if (!this.instantiationService) {
			throw new Error('Cannot write configuration because the configuration service is not yet ready to accept writes.');
		}

		if (target === ConfigurationTarget.DEFAULT) {
			throw new Error('Invalid configuration target');
		}

		if (target === ConfigurationTarget.MEMORY) {
			const previous = { data: this._configuration.toData(), workspace: this.workspace };
			this._configuration.updateValue(key, value, overrides);
			this.triggerConfigurationChange({ keys: overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key], overrides: overrides?.overrideIdentifiers?.length ? overrides.overrideIdentifiers.map(overrideIdentifier => ([overrideIdentifier, [key]])) : [] }, previous, target);
			return;
		}

		const editableConfigurationTarget = this.toEditableConfigurationTarget(target, key);
		if (!editableConfigurationTarget) {
			throw new Error('Invalid configuration target');
		}

		if (editableConfigurationTarget === EditableConfigurationTarget.USER_REMOTE && !this.remoteUserConfiguration) {
			throw new Error('Invalid configuration target');
		}

		if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
			const configurationModel = this.getConfigurationModelForEditableConfigurationTarget(editableConfigurationTarget, overrides.resource);
			if (configurationModel) {
				const overrideIdentifiers = overrides.overrideIdentifiers.sort();
				const existingOverrides = configurationModel.overrides.find(override => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
				if (existingOverrides) {
					overrides.overrideIdentifiers = existingOverrides.identifiers;
				}
			}
		}

		// Use same instance of ConfigurationEditing to make sure all writes go through the same queue
		this.configurationEditing = this.configurationEditing ?? this.createConfigurationEditingService(this.instantiationService);
		await (await this.configurationEditing).writeConfiguration(editableConfigurationTarget, { key, value }, { scopes: overrides, ...options });
		switch (editableConfigurationTarget) {
			case EditableConfigurationTarget.USER_LOCAL:
				if (this.applicationConfiguration && this.isSettingAppliedForAllProfiles(key)) {
					await this.reloadApplicationConfiguration();
				} else {
					await this.reloadLocalUserConfiguration();
				}
				return;
			case EditableConfigurationTarget.USER_REMOTE:
				return this.reloadRemoteUserConfiguration().then(() => undefined);
			case EditableConfigurationTarget.WORKSPACE:
				return this.reloadWorkspaceConfiguration();
			case EditableConfigurationTarget.WORKSPACE_FOLDER: {
				const workspaceFolder = overrides && overrides.resource ? this.workspace.getFolder(overrides.resource) : null;
				if (workspaceFolder) {
					return this.reloadWorkspaceFolderConfiguration(workspaceFolder);
				}
			}
		}
	}

	private async createConfigurationEditingService(instantiationService: IInstantiationService): Promise<ConfigurationEditing> {
		const remoteSettingsResource = (await this.remoteAgentService.getEnvironment())?.settingsPath ?? null;
		return instantiationService.createInstance(ConfigurationEditing, remoteSettingsResource);
	}

	private getConfigurationModelForEditableConfigurationTarget(target: EditableConfigurationTarget, resource?: URI | null): ConfigurationModel | undefined {
		switch (target) {
			case EditableConfigurationTarget.USER_LOCAL: return this._configuration.localUserConfiguration;
			case EditableConfigurationTarget.USER_REMOTE: return this._configuration.remoteUserConfiguration;
			case EditableConfigurationTarget.WORKSPACE: return this._configuration.workspaceConfiguration;
			case EditableConfigurationTarget.WORKSPACE_FOLDER: return resource ? this._configuration.folderConfigurations.get(resource) : undefined;
		}
	}

	getConfigurationModel(target: ConfigurationTarget, resource?: URI | null): ConfigurationModel | undefined {
		switch (target) {
			case ConfigurationTarget.USER_LOCAL: return this._configuration.localUserConfiguration;
			case ConfigurationTarget.USER_REMOTE: return this._configuration.remoteUserConfiguration;
			case ConfigurationTarget.WORKSPACE: return this._configuration.workspaceConfiguration;
			case ConfigurationTarget.WORKSPACE_FOLDER: return resource ? this._configuration.folderConfigurations.get(resource) : undefined;
			default: return undefined;
		}
	}

	private deriveConfigurationTargets(key: string, value: unknown, inspect: IConfigurationValue<unknown>): ConfigurationTarget[] {
		if (equals(value, inspect.value)) {
			return [];
		}

		const definedTargets: ConfigurationTarget[] = [];
		if (inspect.workspaceFolderValue !== undefined) {
			definedTargets.push(ConfigurationTarget.WORKSPACE_FOLDER);
		}
		if (inspect.workspaceValue !== undefined) {
			definedTargets.push(ConfigurationTarget.WORKSPACE);
		}
		if (inspect.userRemoteValue !== undefined) {
			definedTargets.push(ConfigurationTarget.USER_REMOTE);
		}
		if (inspect.userLocalValue !== undefined) {
			definedTargets.push(ConfigurationTarget.USER_LOCAL);
		}
		if (inspect.applicationValue !== undefined) {
			definedTargets.push(ConfigurationTarget.APPLICATION);
		}

		if (value === undefined) {
			// Remove the setting in all defined targets
			return definedTargets;
		}

		return [definedTargets[0] || ConfigurationTarget.USER];
	}

	private triggerConfigurationChange(change: IConfigurationChange, previous: { data: IConfigurationData; workspace?: Workspace } | undefined, target: ConfigurationTarget): void {
		if (change.keys.length) {
			if (target !== ConfigurationTarget.DEFAULT) {
				this.logService.debug(`Configuration keys changed in ${ConfigurationTargetToString(target)} target`, ...change.keys);
			}
			const configurationChangeEvent = new ConfigurationChangeEvent(change, previous, this._configuration, this.workspace, this.logService);
			configurationChangeEvent.source = target;
			this._onDidChangeConfiguration.fire(configurationChangeEvent);
		}
	}

	private toEditableConfigurationTarget(target: ConfigurationTarget, key: string): EditableConfigurationTarget | null {
		if (target === ConfigurationTarget.APPLICATION) {
			return EditableConfigurationTarget.USER_LOCAL;
		}
		if (target === ConfigurationTarget.USER) {
			if (this.remoteUserConfiguration) {
				const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
				if (scope === ConfigurationScope.MACHINE || scope === ConfigurationScope.MACHINE_OVERRIDABLE || scope === ConfigurationScope.APPLICATION_MACHINE) {
					return EditableConfigurationTarget.USER_REMOTE;
				}
				if (this.inspect(key).userRemoteValue !== undefined) {
					return EditableConfigurationTarget.USER_REMOTE;
				}
			}
			return EditableConfigurationTarget.USER_LOCAL;
		}
		if (target === ConfigurationTarget.USER_LOCAL) {
			return EditableConfigurationTarget.USER_LOCAL;
		}
		if (target === ConfigurationTarget.USER_REMOTE) {
			return EditableConfigurationTarget.USER_REMOTE;
		}
		if (target === ConfigurationTarget.WORKSPACE) {
			return EditableConfigurationTarget.WORKSPACE;
		}
		if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
			return EditableConfigurationTarget.WORKSPACE_FOLDER;
		}
		return null;
	}
}

class RegisterConfigurationSchemasContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IExtensionService extensionService: IExtensionService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();

		extensionService.whenInstalledExtensionsRegistered().then(() => {
			this.registerConfigurationSchemas();

			const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
			const delayer = this._register(new Delayer<void>(50));
			this._register(Event.any(configurationRegistry.onDidUpdateConfiguration, configurationRegistry.onDidSchemaChange, workspaceTrustManagementService.onDidChangeTrust)(() =>
				delayer.trigger(() => this.registerConfigurationSchemas(), lifecycleService.phase === LifecyclePhase.Eventually ? undefined : 2500 /* delay longer in early phases */)));
		});
	}

	private registerConfigurationSchemas(): void {
		const allSettingsSchema: IJSONSchema = {
			properties: allSettings.properties,
			patternProperties: allSettings.patternProperties,
			additionalProperties: true,
			allowTrailingCommas: true,
			allowComments: true
		};

		const userSettingsSchema: IJSONSchema = this.environmentService.remoteAuthority ?
			{
				properties: Object.assign({},
					applicationSettings.properties,
					windowSettings.properties,
					resourceSettings.properties
				),
				patternProperties: allSettings.patternProperties,
				additionalProperties: true,
				allowTrailingCommas: true,
				allowComments: true
			}
			: allSettingsSchema;

		const profileSettingsSchema: IJSONSchema = {
			properties: Object.assign({},
				machineSettings.properties,
				machineOverridableSettings.properties,
				windowSettings.properties,
				resourceSettings.properties
			),
			patternProperties: allSettings.patternProperties,
			additionalProperties: true,
			allowTrailingCommas: true,
			allowComments: true
		};

		const machineSettingsSchema: IJSONSchema = {
			properties: Object.assign({},
				applicationMachineSettings.properties,
				machineSettings.properties,
				machineOverridableSettings.properties,
				windowSettings.properties,
				resourceSettings.properties
			),
			patternProperties: allSettings.patternProperties,
			additionalProperties: true,
			allowTrailingCommas: true,
			allowComments: true
		};

		const workspaceSettingsSchema: IJSONSchema = {
			properties: Object.assign({},
				this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties),
				this.checkAndFilterPropertiesRequiringTrust(windowSettings.properties),
				this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)
			),
			patternProperties: allSettings.patternProperties,
			additionalProperties: true,
			allowTrailingCommas: true,
			allowComments: true
		};

		const defaultSettingsSchema = {
			properties: Object.keys(allSettings.properties).reduce<IJSONSchemaMap>((result, key) => {
				result[key] = Object.assign({ deprecationMessage: undefined }, allSettings.properties[key]);
				return result;
			}, {}),
			patternProperties: Object.keys(allSettings.patternProperties).reduce<IJSONSchemaMap>((result, key) => {
				result[key] = Object.assign({ deprecationMessage: undefined }, allSettings.patternProperties[key]);
				return result;
			}, {}),
			additionalProperties: true,
			allowTrailingCommas: true,
			allowComments: true
		};

		const folderSettingsSchema: IJSONSchema = WorkbenchState.WORKSPACE === this.workspaceContextService.getWorkbenchState() ?
			{
				properties: Object.assign({},
					this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties),
					this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)
				),
				patternProperties: allSettings.patternProperties,
				additionalProperties: true,
				allowTrailingCommas: true,
				allowComments: true
			} : workspaceSettingsSchema;

		const configDefaultsSchema: IJSONSchema = {
			type: 'object',
			description: localize('configurationDefaults.description', 'Contribute defaults for configurations'),
			properties: Object.assign({},
				this.filterDefaultOverridableProperties(machineOverridableSettings.properties),
				this.filterDefaultOverridableProperties(windowSettings.properties),
				this.filterDefaultOverridableProperties(resourceSettings.properties)
			),
			patternProperties: {
				[OVERRIDE_PROPERTY_PATTERN]: {
					type: 'object',
					default: {},
					$ref: resourceLanguageSettingsSchemaId,
				}
			},
			additionalProperties: false
		};
		this.registerSchemas({
			defaultSettingsSchema,
			userSettingsSchema,
			profileSettingsSchema,
			machineSettingsSchema,
			workspaceSettingsSchema,
			folderSettingsSchema,
			configDefaultsSchema,
		});
	}

	private registerSchemas(schemas: {
		defaultSettingsSchema: IJSONSchema;
		userSettingsSchema: IJSONSchema;
		profileSettingsSchema: IJSONSchema;
		machineSettingsSchema: IJSONSchema;
		workspaceSettingsSchema: IJSONSchema;
		folderSettingsSchema: IJSONSchema;
		configDefaultsSchema: IJSONSchema;
	}): void {
		const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		jsonRegistry.registerSchema(defaultSettingsSchemaId, schemas.defaultSettingsSchema);
		jsonRegistry.registerSchema(userSettingsSchemaId, schemas.userSettingsSchema);
		jsonRegistry.registerSchema(profileSettingsSchemaId, schemas.profileSettingsSchema);
		jsonRegistry.registerSchema(machineSettingsSchemaId, schemas.machineSettingsSchema);
		jsonRegistry.registerSchema(workspaceSettingsSchemaId, schemas.workspaceSettingsSchema);
		jsonRegistry.registerSchema(folderSettingsSchemaId, schemas.folderSettingsSchema);
		jsonRegistry.registerSchema(configurationDefaultsSchemaId, schemas.configDefaultsSchema);
	}

	private checkAndFilterPropertiesRequiringTrust(properties: IStringDictionary<IConfigurationPropertySchema>): IStringDictionary<IConfigurationPropertySchema> {
		if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			return properties;
		}

		const result: IStringDictionary<IConfigurationPropertySchema> = {};
		Object.entries(properties).forEach(([key, value]) => {
			if (!value.restricted) {
				result[key] = value;
			}
		});
		return result;
	}

	private filterDefaultOverridableProperties(properties: IStringDictionary<IConfigurationPropertySchema>): IStringDictionary<IConfigurationPropertySchema> {
		const result: IStringDictionary<IConfigurationPropertySchema> = {};
		Object.entries(properties).forEach(([key, value]) => {
			if (!value.disallowConfigurationDefault) {
				result[key] = value;
			}
		});
		return result;
	}
}

class ConfigurationDefaultOverridesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.configurationDefaultOverridesContribution';

	private readonly processedExperimentalSettings = new Set<string>();
	private readonly autoExperimentalSettings = new Set<string>();
	private readonly configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	private readonly throttler = this._register(new Throttler());

	constructor(
		@IWorkbenchAssignmentService private readonly workbenchAssignmentService: IWorkbenchAssignmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IConfigurationService private readonly configurationService: WorkspaceService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.throttler.queue(() => this.updateDefaults());
		this._register(workbenchAssignmentService.onDidRefetchAssignments(() => this.throttler.queue(() => this.processExperimentalSettings(this.autoExperimentalSettings, true))));

		// When configuration is updated make sure to apply experimental configuration overrides
		this._register(this.configurationRegistry.onDidUpdateConfiguration(({ properties }) => this.processExperimentalSettings(properties, false)));
	}

	private async updateDefaults(): Promise<void> {
		this.logService.trace('ConfigurationService#updateDefaults: begin');
		try {
			// Check for experiments
			await this.processExperimentalSettings(Object.keys(this.configurationRegistry.getConfigurationProperties()), false);
		} finally {
			// Invalidate defaults cache after extensions have registered
			// and after the experiments have been resolved to prevent
			// resetting the overrides too early.
			await this.extensionService.whenInstalledExtensionsRegistered();
			this.logService.trace('ConfigurationService#updateDefaults: resetting the defaults');
			this.configurationService.reloadConfiguration(ConfigurationTarget.DEFAULT);
		}
	}

	private async processExperimentalSettings(properties: Iterable<string>, autoRefetch: boolean): Promise<void> {
		const overrides: IStringDictionary<unknown> = {};
		const allProperties = this.configurationRegistry.getConfigurationProperties();
		for (const property of properties) {
			const schema = allProperties[property];
			if (!schema?.experiment) {
				continue;
			}
			if (!autoRefetch && this.processedExperimentalSettings.has(property)) {
				continue;
			}
			this.processedExperimentalSettings.add(property);
			if (schema.experiment.mode === 'auto') {
				this.autoExperimentalSettings.add(property);
			}
			try {
				const value = await this.workbenchAssignmentService.getTreatment(schema.experiment.name ?? `config.${property}`);
				if (!isUndefined(value) && !equals(value, schema.default)) {
					overrides[property] = value;
				}
			} catch (error) {/*ignore */ }
		}
		if (Object.keys(overrides).length) {
			this.configurationRegistry.registerDefaultConfigurations([{ overrides }]);
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RegisterConfigurationSchemasContribution, LifecyclePhase.Restored);
registerWorkbenchContribution2(ConfigurationDefaultOverridesContribution.ID, ConfigurationDefaultOverridesContribution, WorkbenchPhase.BlockRestore);

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[APPLY_ALL_PROFILES_SETTING]: {
			'type': 'array',
			description: localize('setting description', "Configure settings to be applied for all profiles."),
			'default': [],
			'scope': ConfigurationScope.APPLICATION,
			additionalProperties: true,
			uniqueItems: true,
		}
	}
});
