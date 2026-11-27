/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationData, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOptions, IConfigurationUpdateOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, IConfigurationNode } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../../nls.js';
import { Configuration as BaseConfiguration, ConfigurationChangeEvent } from '../../../../../platform/configuration/common/configurationModels.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IPolicyService } from '../../../../../platform/policy/common/policy.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAnyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspace, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, IWorkspaceFoldersWillChangeEvent, IWorkspaceIdentifier, WorkbenchMode, WorkbenchState, Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceFolderCreationData } from '../../../../../platform/workspaces/common/workspaces.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../environment/browser/environmentService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { IConfigurationCache, IEditableWorkspaceContextService, IWorkbenchConfigurationService, RestrictedSettings } from '../../common/configuration.js';
import { WorkspaceService } from '../configurationService.js';
import { AgentsConfigurationService } from './agentsConfigurationService.js';
import { AgentsWorkspaceContextService } from './agentsWorkspaceContextService.js';

/**
 * Setting that opts local editor windows into Agents mode. It is
 * read when the window starts, so changing it takes effect after a reload.
 */
export const AGENTS_MODE_ENABLED_SETTING = 'chat.agentsMode.enabled';

/**
 * Declares {@link AGENTS_MODE_ENABLED_SETTING}. Only desktop editor windows
 * register it, before they read it at startup, since only they support the mode.
 */
export const agentsModeEnabledConfiguration: IConfigurationNode = {
	id: 'chat',
	title: localize('chat.configurationTitle', "Chat"),
	properties: {
		[AGENTS_MODE_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('agentsMode.enabled', "Enable toggling Agents mode in a local editor window. A window with a folder or workspace gets its folders back when it leaves the mode. Takes effect in a window after it is reloaded."),
		}
	}
};

/**
 * Whether a window's workspace and configuration service should be able to
 * switch into Agents mode: only local editor windows that have a backup folder,
 * and only when the user opted in with {@link AGENTS_MODE_ENABLED_SETTING}.
 */
export function supportsAgentsMode(
	environmentService: Pick<IWorkbenchEnvironmentService, 'remoteAuthority' | 'isExtensionDevelopment' | 'isSessionsWindow'>,
	configurationService: Pick<IConfigurationService, 'getValue'>,
	hasBackupPath: boolean,
): boolean {
	return !environmentService.remoteAuthority
		&& !environmentService.isExtensionDevelopment
		&& !environmentService.isSessionsWindow
		&& hasBackupPath
		&& configurationService.getValue(AGENTS_MODE_ENABLED_SETTING) === true;
}

/**
 * Services the {@link AgentsModeWorkspaceService} needs to create the
 * Agents workspace and configuration services when entering the mode.
 */
export interface IAgentsModeServices {
	readonly userDataProfileService: IUserDataProfileService;
	readonly userDataProfilesService: IUserDataProfilesService;
	readonly uriIdentityService: IUriIdentityService;
	readonly fileService: IFileService;
	readonly policyService: IPolicyService;
	readonly logService: ILogService;
	readonly configurationCache: IConfigurationCache;
	readonly environmentService: IBrowserWorkbenchEnvironmentService;
}

interface IAgentsDelegates extends IDisposable {
	readonly configuration: AgentsConfigurationService;
	readonly active: ActiveWorkspace;
}

type ActiveWorkspace = IEditableWorkspaceContextService & IWorkbenchConfigurationService;

/**
 * The workspace and configuration service of a local editor window that can
 * switch in place into Agents mode.
 *
 * Outside the mode every call goes to the editor {@link WorkspaceService}. In the
 * mode, calls go to the Agents window's workspace and configuration services,
 * created for an empty workspace with the window's own workspace id. The window
 * keeps its workspace identity, storage and backups: nothing is entered or
 * reloaded, and a window's folders or `.code-workspace` file are never changed,
 * so leaving the mode gives them back as they were.
 */
export class AgentsModeWorkspaceService extends Disposable implements IEditableWorkspaceContextService, IWorkbenchConfigurationService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private readonly _onDidChangeRestrictedSettings = this._register(new Emitter<RestrictedSettings>());
	readonly onDidChangeRestrictedSettings = this._onDidChangeRestrictedSettings.event;

	private readonly _onDidChangeWorkbenchState = this._register(new Emitter<WorkbenchState>());
	readonly onDidChangeWorkbenchState = this._onDidChangeWorkbenchState.event;

	private readonly _onDidChangeWorkbenchScope = this._register(new Emitter<URI | undefined>());
	readonly onDidChangeWorkbenchScope = this._onDidChangeWorkbenchScope.event;

	private readonly _onDidChangeWorkbenchMode = this._register(new Emitter<WorkbenchMode>());
	readonly onDidChangeWorkbenchMode = this._onDidChangeWorkbenchMode.event;

	private readonly _onDidChangeWorkspaceName = this._register(new Emitter<void>());
	readonly onDidChangeWorkspaceName = this._onDidChangeWorkspaceName.event;

	private readonly _onWillChangeWorkspaceFolders = this._register(new Emitter<IWorkspaceFoldersWillChangeEvent>());
	readonly onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkspaceFolders = this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;

	private readonly _onDidChangeAgentsMode = this._register(new Emitter<boolean>());
	/**
	 * Fires after the window entered or left Agents mode, and after
	 * the change events of the switch were fired.
	 */
	readonly onDidChangeAgentsMode = this._onDidChangeAgentsMode.event;

	/** Lives for the whole time in the mode, so its folders survive a profile change. */
	private readonly agentsWorkspace = this._register(new MutableDisposable<AgentsWorkspaceContextService>());
	/** Recreated when the profile changes, because it reads the profile's settings. */
	private readonly agents = this._register(new MutableDisposable<IAgentsDelegates>());
	private readonly switchQueue = this._register(new Queue<void>());
	private instantiationService: IInstantiationService | undefined;

	private _isAgentsMode = false;
	get isAgentsMode(): boolean { return this._isAgentsMode; }

	/** The folders of the window's own workspace, which it shows outside the mode. */
	get windowFolders(): readonly URI[] { return this.editor.getWorkspace().folders.map(folder => folder.uri); }

	constructor(
		private readonly editor: WorkspaceService,
		private readonly services: IAgentsModeServices,
	) {
		super();
		this.forwardEvents(editor, () => !this._isAgentsMode, this._store);
		this._register(services.userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.onDidChangeProfile())));
	}

	private get active(): ActiveWorkspace {
		const agents = this.agents.value;
		if (this._isAgentsMode && agents) {
			return agents.active;
		}
		return this.editor;
	}

	/**
	 * Enters or leaves Agents mode in place. Resolves once the switch
	 * was applied and its change events were fired. When entering, the mode's
	 * workspace takes `workspaceId`, by default the editor workspace's current id.
	 */
	setAgentsMode(enabled: boolean, workspaceId?: string): Promise<void> {
		return this.switchQueue.queue(async () => {
			if (enabled === this._isAgentsMode) {
				return;
			}
			if (enabled) {
				// The mode's workspace is empty, with the window's current id (it changes when the window enters a workspace), so its configuration and files never change
				const workspace = this.agentsWorkspace.value = new AgentsWorkspaceContextService({ id: workspaceId ?? this.editor.getWorkspace().id }, this.services.uriIdentityService);
				this.agents.value = await this.createAgentsDelegates(workspace);
			}
			this.switchDelegates(enabled);
			if (!enabled) {
				this.agents.clear();
				this.agentsWorkspace.clear();
			}
			this._onDidChangeAgentsMode.fire(enabled);
		});
	}

	private async createAgentsDelegates(workspace: AgentsWorkspaceContextService): Promise<IAgentsDelegates> {
		const { userDataProfileService, uriIdentityService, fileService, policyService, logService, configurationCache, environmentService } = this.services;
		const disposables = new DisposableStore();
		const configuration = disposables.add(new AgentsConfigurationService(userDataProfileService, workspace, uriIdentityService, fileService, policyService, logService, configurationCache, environmentService, { agentsMode: true, userDataProfilesService: this.services.userDataProfilesService }));
		try {
			await configuration.initialize();
		} catch (error) {
			onUnexpectedError(error);
		}
		if (this.instantiationService) {
			configuration.acquireInstantiationService(this.instantiationService);
		}
		const active = new ActiveAgentsWorkspace(workspace, configuration);
		const delegates: IAgentsDelegates = { configuration, active, dispose: () => disposables.dispose() };
		this.forwardEvents(active, () => this._isAgentsMode && this.agents.value === delegates, disposables);
		return delegates;
	}

	private switchDelegates(enabled: boolean): void {
		const from = this.active;
		const fromData = from.getConfigurationData();
		const fromState = from.getWorkbenchState();
		const fromScope = from.getWorkbenchScope();
		const fromMode = from.getWorkbenchMode();
		const fromWorkspace = from.getWorkspace();

		this._isAgentsMode = enabled;

		const to = this.active;
		const toWorkspace = to.getWorkspace();

		const folderChanges = this.compareFolders(fromWorkspace, toWorkspace);
		this.services.logService.trace(`[AgentsMode] switching ${enabled ? 'into' : 'out of'} the mode: scope ${fromScope} -> ${to.getWorkbenchScope()}, folders ${fromWorkspace.folders.length} -> ${toWorkspace.folders.length}`);
		if (fromState !== to.getWorkbenchState()) {
			this._onDidChangeWorkbenchState.fire(to.getWorkbenchState());
		}
		if (!isEqual(fromScope, to.getWorkbenchScope())) {
			this._onDidChangeWorkbenchScope.fire(to.getWorkbenchScope());
		}
		if (fromMode !== to.getWorkbenchMode()) {
			this._onDidChangeWorkbenchMode.fire(to.getWorkbenchMode());
		}
		if (fromWorkspace.configuration?.toString() !== toWorkspace.configuration?.toString()) {
			this._onDidChangeWorkspaceName.fire();
		}
		if (folderChanges) {
			this._onDidChangeWorkspaceFolders.fire(folderChanges);
		}

		const toData = to.getConfigurationData();
		if (fromData && toData) {
			this.fireConfigurationSwitch(fromData, fromWorkspace as Workspace, toData, toWorkspace as Workspace);
		}
		this._onDidChangeRestrictedSettings.fire(to.restrictedSettings);
	}

	private compareFolders(from: IWorkspace, to: IWorkspace): IWorkspaceFoldersChangeEvent | undefined {
		const extUri = this.services.uriIdentityService.extUri;
		const added = to.folders.filter(folder => !from.folders.some(existing => extUri.isEqual(existing.uri, folder.uri)));
		const removed = from.folders.filter(folder => !to.folders.some(existing => extUri.isEqual(existing.uri, folder.uri)));
		return added.length || removed.length ? { added, removed, changed: [] } : undefined;
	}

	private fireConfigurationSwitch(fromData: IConfigurationData, fromWorkspace: Workspace, toData: IConfigurationData, toWorkspace: Workspace): void {
		const logService = this.services.logService;
		const fromConfiguration = BaseConfiguration.parse(fromData, logService);
		const toConfiguration = BaseConfiguration.parse(toData, logService);
		const keys = new Set([...fromConfiguration.allKeys(), ...toConfiguration.allKeys()]);
		// Folder settings apply only to resources in their folder, so compare every folder of both workspaces too
		const overrides: IConfigurationOverrides[] = [{}, ...[...fromWorkspace.folders, ...toWorkspace.folders].map(folder => ({ resource: folder.uri }))];
		const changes = (candidates: Iterable<string>, overrideIdentifier?: string) => [...candidates].filter(key => overrides.some(override => {
			const languageOverride = overrideIdentifier ? { ...override, overrideIdentifier } : override;
			return !equals(fromConfiguration.getValue(key, languageOverride, fromWorkspace), toConfiguration.getValue(key, languageOverride, toWorkspace));
		}));
		const changedKeys = changes(keys);
		// Keys set only for a language (`[lang]` blocks) do not show in `allKeys`, so compare those per language too
		const languageKeys = getLanguageOverrideKeys(fromConfiguration);
		for (const [identifier, identifierKeys] of getLanguageOverrideKeys(toConfiguration)) {
			languageKeys.set(identifier, new Set([...languageKeys.get(identifier) ?? [], ...identifierKeys]));
		}
		const changedOverrides: [string, string[]][] = [];
		for (const [identifier, identifierKeys] of languageKeys) {
			const changed = changes(identifierKeys, identifier);
			if (changed.length) {
				changedOverrides.push([identifier, changed]);
			}
		}
		logService.trace(`[AgentsMode] settings that change with the switch: ${[...changedKeys, ...changedOverrides.map(([identifier, keys]) => `[${identifier}] ${keys.join(', ')}`)].join(', ')}`);
		if (!changedKeys.length && !changedOverrides.length) {
			return;
		}
		const event = new ConfigurationChangeEvent({ keys: changedKeys, overrides: changedOverrides }, { data: fromData, workspace: fromWorkspace }, toConfiguration, toWorkspace, logService);
		event.source = ConfigurationTarget.DEFAULT;
		this._onDidChangeConfiguration.fire(event);
	}

	private forwardEvents(source: ActiveWorkspace, isActive: () => boolean, disposables: DisposableStore): void {
		const forward = <T>(event: Event<T>, emitter: Emitter<T>) => disposables.add(event(e => {
			if (isActive()) {
				emitter.fire(e);
			}
		}));
		forward(source.onDidChangeConfiguration, this._onDidChangeConfiguration);
		forward(source.onDidChangeRestrictedSettings, this._onDidChangeRestrictedSettings);
		forward(source.onDidChangeWorkbenchState, this._onDidChangeWorkbenchState);
		forward(source.onDidChangeWorkbenchScope, this._onDidChangeWorkbenchScope);
		forward(source.onDidChangeWorkbenchMode, this._onDidChangeWorkbenchMode);
		forward(source.onDidChangeWorkspaceName, this._onDidChangeWorkspaceName);
		forward(source.onWillChangeWorkspaceFolders, this._onWillChangeWorkspaceFolders);
		forward(source.onDidChangeWorkspaceFolders, this._onDidChangeWorkspaceFolders);
	}

	private async onDidChangeProfile(): Promise<void> {
		// The Agents configuration reads the settings of the profile it was created for
		if (this._isAgentsMode) {
			await this.switchQueue.queue(async () => {
				const workspace = this.agentsWorkspace.value;
				if (!this._isAgentsMode || !workspace) {
					return;
				}
				const fromData = this.active.getConfigurationData();
				const fromWorkspace = this.active.getWorkspace() as Workspace;
				this.agents.value = await this.createAgentsDelegates(workspace);
				const toData = this.active.getConfigurationData();
				if (fromData && toData) {
					this.fireConfigurationSwitch(fromData, fromWorkspace, toData, this.active.getWorkspace() as Workspace);
				}
			});
		}
	}

	// #region IWorkspaceContextService

	getCompleteWorkspace(): Promise<IWorkspace> { return this.active.getCompleteWorkspace(); }
	getWorkspace(): IWorkspace { return this.active.getWorkspace(); }
	getWorkbenchState(): WorkbenchState { return this.active.getWorkbenchState(); }
	getWorkbenchScope(): URI | undefined { return this.active.getWorkbenchScope(); }
	getWorkbenchMode(): WorkbenchMode { return this.active.getWorkbenchMode(); }
	getWorkspaceFolder(resource: URI): IWorkspaceFolder | null { return this.active.getWorkspaceFolder(resource); }
	isInsideWorkspace(resource: URI): boolean { return this.active.isInsideWorkspace(resource); }
	isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean { return this.active.isCurrentWorkspace(workspaceIdOrFolder); }
	hasWorkspaceData(): boolean { return this.active.hasWorkspaceData(); }

	addFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number): Promise<void> { return this.active.addFolders(foldersToAdd, index); }
	removeFolders(foldersToRemove: URI[]): Promise<void> { return this.active.removeFolders(foldersToRemove); }
	updateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> { return this.active.updateFolders(foldersToAdd, foldersToRemove, index); }
	setFolderLocation(location: URI, options?: { readonly trusted?: boolean; readonly isCurrent?: () => boolean; readonly onApplied?: () => void; readonly folder?: URI }): Promise<boolean> { return this.active.setFolderLocation(location, options); }
	getFolderPrimaryLocation(folder: URI): URI | undefined { return this.active.getFolderPrimaryLocation?.(folder); }
	setFolderPrimaryLocation(folder: URI, primary: URI | undefined): void { this.active.setFolderPrimaryLocation?.(folder, primary); }
	setWorkbenchScope(scope: URI | undefined): void { this.active.setWorkbenchScope(scope); }
	resetWorkbenchScope(): void { this.active.resetWorkbenchScope(); }

	// #endregion

	// #region IWorkbenchConfigurationService

	get restrictedSettings(): RestrictedSettings { return this.active.restrictedSettings; }

	getConfigurationData(): IConfigurationData | null { return this.active.getConfigurationData(); }

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: unknown, arg2?: unknown): unknown {
		return (this.active.getValue as (arg1?: unknown, arg2?: unknown) => unknown)(arg1, arg2);
	}

	updateValue(key: string, value: unknown): Promise<void>;
	updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	updateValue(key: string, value: unknown, arg3?: unknown, arg4?: unknown, options?: IConfigurationUpdateOptions): Promise<void> {
		return (this.active.updateValue as (key: string, value: unknown, arg3?: unknown, arg4?: unknown, options?: IConfigurationUpdateOptions) => Promise<void>)(key, value, arg3, arg4, options);
	}

	inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<Readonly<T>> { return this.active.inspect<T>(key, overrides); }
	reloadConfiguration(target?: ConfigurationTarget | IWorkspaceFolder): Promise<void> { return this.active.reloadConfiguration(target); }
	keys() { return this.active.keys(); }
	whenRemoteConfigurationLoaded(): Promise<void> { return this.editor.whenRemoteConfigurationLoaded(); }
	isSettingAppliedForAllProfiles(setting: string): boolean { return this.active.isSettingAppliedForAllProfiles(setting); }

	/**
	 * Initializes the editor workspace service for another workspace, leaving
	 * Agents mode first so that the window serves the new workspace.
	 */
	async initialize(arg: IAnyWorkspaceIdentifier): Promise<void> {
		await this.setAgentsMode(false);
		return this.editor.initialize(arg);
	}

	hasCachedConfigurationDefaultsOverrides(): boolean {
		return this.agents.value && this._isAgentsMode ? this.agents.value.configuration.hasCachedConfigurationDefaultsOverrides() : this.editor.hasCachedConfigurationDefaultsOverrides();
	}

	updateWorkspaceTrust(trusted: boolean): void {
		this.editor.updateWorkspaceTrust(trusted);
	}

	acquireInstantiationService(instantiationService: IInstantiationService): void {
		this.instantiationService = instantiationService;
		this.editor.acquireInstantiationService(instantiationService);
		this.agents.value?.configuration.acquireInstantiationService(instantiationService);
	}

	// #endregion
}

/**
 * Presents the Agents workspace and configuration services as one
 * {@link ActiveWorkspace}, with the editor's folder editing signatures.
 */
class ActiveAgentsWorkspace implements ActiveWorkspace {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly workspace: AgentsWorkspaceContextService,
		private readonly configuration: AgentsConfigurationService,
	) { }

	get onDidChangeConfiguration() { return this.configuration.onDidChangeConfiguration; }
	get onDidChangeRestrictedSettings() { return this.configuration.onDidChangeRestrictedSettings; }
	get onDidChangeWorkbenchState() { return this.workspace.onDidChangeWorkbenchState; }
	get onDidChangeWorkbenchScope() { return this.workspace.onDidChangeWorkbenchScope; }
	get onDidChangeWorkbenchMode() { return this.workspace.onDidChangeWorkbenchMode; }
	get onDidChangeWorkspaceName() { return this.workspace.onDidChangeWorkspaceName; }
	get onWillChangeWorkspaceFolders() { return this.workspace.onWillChangeWorkspaceFolders; }
	get onDidChangeWorkspaceFolders() { return this.workspace.onDidChangeWorkspaceFolders; }
	get restrictedSettings() { return this.configuration.restrictedSettings; }

	getCompleteWorkspace() { return this.workspace.getCompleteWorkspace(); }
	getWorkspace() { return this.workspace.getWorkspace(); }
	getWorkbenchState() { return this.workspace.getWorkbenchState(); }
	getWorkbenchScope() { return this.workspace.getWorkbenchScope(); }
	getWorkbenchMode() { return this.workspace.getWorkbenchMode(); }
	getWorkspaceFolder(resource: URI) { return this.workspace.getWorkspaceFolder(resource); }
	isInsideWorkspace(resource: URI) { return this.workspace.isInsideWorkspace(resource); }
	isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI) { return this.workspace.isCurrentWorkspace(workspaceIdOrFolder); }
	hasWorkspaceData() { return this.workspace.hasWorkspaceData(); }

	addFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number) { return this.workspace.applyFolderChanges(foldersToAdd, [], index); }
	removeFolders(foldersToRemove: URI[]) { return this.workspace.removeFolders(foldersToRemove); }
	updateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number) { return this.workspace.applyFolderChanges(foldersToAdd, foldersToRemove, index); }
	async setFolderLocation(location: URI, options?: { readonly onApplied?: () => void; readonly folder?: URI }): Promise<boolean> {
		const moved = await this.workspace.moveFolder(location, options);
		if (moved) {
			options?.onApplied?.();
		}
		return moved;
	}
	getFolderPrimaryLocation(folder: URI) { return this.workspace.getPrimaryLocation(folder); }
	setFolderPrimaryLocation(folder: URI, primary: URI | undefined) { this.workspace.setPrimaryLocation(folder, primary); }
	setWorkbenchScope(scope: URI | undefined) { this.workspace.setWorkbenchScope(scope); }
	resetWorkbenchScope() { this.workspace.resetWorkbenchScope(); }

	getConfigurationData() { return this.configuration.getConfigurationData(); }
	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: unknown, arg2?: unknown): unknown {
		return (this.configuration.getValue as (arg1?: unknown, arg2?: unknown) => unknown)(arg1, arg2);
	}
	updateValue(key: string, value: unknown): Promise<void>;
	updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	updateValue(key: string, value: unknown, arg3?: unknown, arg4?: unknown, options?: IConfigurationUpdateOptions): Promise<void> {
		return (this.configuration.updateValue as (key: string, value: unknown, arg3?: unknown, arg4?: unknown, options?: IConfigurationUpdateOptions) => Promise<void>)(key, value, arg3, arg4, options);
	}
	inspect<T>(key: string, overrides?: IConfigurationOverrides) { return this.configuration.inspect<T>(key, overrides); }
	reloadConfiguration(target?: ConfigurationTarget | IWorkspaceFolder) { return this.configuration.reloadConfiguration(target); }
	keys() { return this.configuration.keys(); }
	whenRemoteConfigurationLoaded() { return this.configuration.whenRemoteConfigurationLoaded(); }
	initialize() { return this.configuration.initialize(); }
	isSettingAppliedForAllProfiles(setting: string) { return this.configuration.isSettingAppliedForAllProfiles(setting); }
}

/** The keys each language identifier of `configuration` sets in a `[lang]` block, across all its configuration models. */
function getLanguageOverrideKeys(configuration: BaseConfiguration): Map<string, Set<string>> {
	const result = new Map<string, Set<string>>();
	const models = [configuration.defaults, configuration.applicationConfiguration, configuration.localUserConfiguration, configuration.remoteUserConfiguration, configuration.workspaceConfiguration, ...configuration.folderConfigurations.values()];
	for (const model of models) {
		for (const identifier of model.getAllOverrideIdentifiers()) {
			let keys = result.get(identifier);
			if (!keys) {
				result.set(identifier, keys = new Set());
			}
			for (const key of model.getKeysForOverrideIdentifier(identifier)) {
				keys.add(key);
			}
		}
	}
	return result;
}
