/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../../base/common/arrays.js';
import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { equalSets } from '../../../../../base/common/collections.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, derived, derivedOpts, IObservable, ISettableObservable, mapObservableArrayCached, observableFromEvent, observableFromPromise, observableSignalFromEvent, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxDraftPreparationService, isRetryableCloudSandboxError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { GitRemote, IGitRepository, IGitService } from '../../../git/common/gitService.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { ISCMService } from '../../../scm/common/scm.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatProgress, IChatService } from '../../common/chatService/chatService.js';
import { IChatSession, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsService, ReadonlyChatSessionOptionsMap, SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { IChatRequestModel } from '../../common/model/chatModel.js';
import { isUntitledChatSession } from '../../common/model/chatUri.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../common/participants/chatAgents.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { commitChatSession } from '../chatSessions/chatSessionCommit.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { CLOUD_SANDBOX_INPUT_PLACEHOLDER } from './cloudSandboxConnectionCustomization.js';
import { CloudSandboxModels } from './cloudSandboxModels.js';
import { CloudSandboxRepositoryPicker } from './cloudSandboxRepositoryPicker.js';
import { createCloudSandboxDraftOptionGroups, createCloudSandboxSessionConfig, readCloudSandboxDraftConfig, resolveCloudSandboxSessionConfig, validateCloudSandboxModelConfig } from './cloudSandboxSessionConfig.js';
import { CloudSandboxSessionContribution, ICloudSandboxSessionEnvironment } from './cloudSandboxSessionContribution.js';
import { CloudSandboxSessionListController } from './cloudSandboxSessionListController.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { CloudSandboxStartupError } from './cloudSandboxStartupError.js';

/** Session type offered in the session type picker; creating a session provisions a new sandbox. */
export const CLOUD_SANDBOX_SESSION_TYPE = SessionType.CloudSandbox;
/** Option group letting the user choose which repository the sandbox clones. */
export const CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP = 'repository';
/** Opens the GitHub repository picker and records the pick as the draft's repository option. */
export const CLOUD_SANDBOX_SELECT_REPOSITORY_COMMAND_ID = 'workbench.action.chat.cloudSandbox.selectRepository';
/** Pre-selected while no repository is known; a slash-free id so it can never be mistaken for a pick. */
const SELECT_REPOSITORY_PLACEHOLDER_ID = 'select-repository';
const REPOSITORY_NWO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/** The repository a folder tracks: its `origin` when that is on GitHub, otherwise its first GitHub remote. */
function trackedGitHubRepository(remotes: readonly GitRemote[]): string | undefined {
	const ordered = [...remotes].sort((a, b) => Number(b.name === 'origin') - Number(a.name === 'origin'));
	for (const remote of ordered) {
		const info = remote.fetchUrl ? getGitHubRepositoryFromRemoteUrl(remote.fetchUrl) : undefined;
		if (info) {
			return `${info.owner}/${info.repo}`;
		}
	}
	return undefined;
}

export class EditorCloudSandboxSessionContribution extends CloudSandboxSessionContribution<CloudSandboxSessionListController> implements IChatSessionItemController {
	readonly items = [];
	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private readonly _discoveryRegistration = this._register(new MutableDisposable<DisposableStore>());
	/** Every GitHub remote of every workspace repository, lower-cased; scopes which existing sandboxes this window lists. */
	private readonly _workspaceRepositories: IObservable<ReadonlySet<string> | undefined>;
	/** The repository each workspace root tracks, in workspace order; `undefined` until every root has resolved. */
	private readonly _workspaceRepositoryChoices: IObservable<readonly string[] | undefined>;
	private readonly _repositoryOptionGroups: IObservable<readonly IChatSessionProviderOptionGroup[]>;
	/** Mode and approvals vocabulary for drafts, until a provisioned host supplies its own schema. */
	private readonly _draftConfig: IObservable<ResolveSessionConfigResult>;
	/** Repository, mode and approvals pickers offered on a draft. */
	private readonly _draftOptionGroups: IObservable<readonly IChatSessionProviderOptionGroup[]>;
	/** Models offered on a draft, from the shared cloud catalog; alive while the creation type is registered. */
	private readonly _draftModels = this._register(new MutableDisposable<CloudSandboxModels>());
	private readonly _repositoryPicker = this._register(new MutableDisposable<CloudSandboxRepositoryPicker>());
	/** Whether each open draft may send, keyed by draft resource; blocked while its first turn provisions. */
	private readonly _draftInputBlocked = new ResourceMap<ISettableObservable<boolean>>();

	constructor(
		@ICloudSandboxAgentHostService cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService apiService: ICloudSandboxApiService,
		@ICloudSandboxDraftPreparationService draftPreparationService: ICloudSandboxDraftPreparationService,
		@IRemoteAgentHostService private readonly _remoteService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatSessionsService private readonly _editorChatSessionsService: IChatSessionsService,
		@ILogService private readonly _editorLogService: ILogService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IHostService hostService: IHostService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IGitService private readonly _gitService: IGitService,
		@ISCMService scmService: ISCMService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super(cloudSandboxService, apiService, draftPreparationService, _remoteService, connectionCustomizations, configurationService, instantiationService, _editorChatSessionsService, _editorLogService, chatEntitlementService, hostService, storageService, workspaceTrustManagementService);
		const enabled = observableFromEvent(this, Event.any(configurationService.onDidChangeConfiguration, chatEntitlementService.onDidChangeSentiment), () => this._isEnabled());
		const workspaceChanged = observableSignalFromEvent(this, workspaceContextService.onDidChangeWorkspaceFolders);
		const repositoriesChanged = observableSignalFromEvent(this, Event.any(scmService.onDidAddRepository, scmService.onDidRemoveRepository));
		const repositoryRoots = derived(this, reader => {
			if (!enabled.read(reader)) {
				return [];
			}
			workspaceChanged.read(reader);
			repositoriesChanged.read(reader);
			const folders = workspaceContextService.getWorkspace().folders;
			const folderIndex = (root: URI) => folders.findIndex(folder =>
				extUriBiasedIgnorePathCase.isEqualOrParent(root, folder.uri) || extUriBiasedIgnorePathCase.isEqualOrParent(folder.uri, root));
			const roots = Array.from(scmService.repositories).flatMap(repository => {
				const root = repository.provider.rootUri;
				return repository.provider.providerId === 'git' && root && folderIndex(root) >= 0 ? [{ root, key: repository }] : [];
			});
			const unresolvedFolders = folders.filter(folder => !roots.some(({ root }) =>
				extUriBiasedIgnorePathCase.isEqualOrParent(root, folder.uri) || extUriBiasedIgnorePathCase.isEqualOrParent(folder.uri, root)));
			// Workspace order, so the picker lists roots the way the explorer shows them.
			return [
				...roots,
				...unresolvedFolders.map(folder => ({ root: folder.uri, key: extUriBiasedIgnorePathCase.getComparisonKey(folder.uri) })),
			].sort((a, b) => folderIndex(a.root) - folderIndex(b.root));
		});
		// Wrapped so a root that resolved to no repository stays distinguishable from a pending lookup.
		const repositories = mapObservableArrayCached(this, repositoryRoots,
			({ root }) => observableFromPromise(this._resolveRepository(root).then(repository => ({ repository }))),
			({ key }) => key);
		this._workspaceRepositories = derivedOpts<ReadonlySet<string> | undefined>({
			owner: this,
			equalsFn: (a, b) => a === b || (a !== undefined && b !== undefined && equalSets(a, b)),
		}, reader => {
			workspaceChanged.read(reader);
			if (workspaceContextService.getWorkspace().folders.length === 0) {
				return undefined;
			}
			const names = new Set<string>();
			for (const repository of repositories.read(reader)) {
				for (const remote of repository.read(reader).value?.repository?.state.read(reader).remotes ?? []) {
					const info = remote.fetchUrl ? getGitHubRepositoryFromRemoteUrl(remote.fetchUrl) : undefined;
					if (info) {
						names.add(`${info.owner}/${info.repo}`.toLowerCase());
					}
				}
			}
			return names;
		});
		this._workspaceRepositoryChoices = derivedOpts<readonly string[] | undefined>({ owner: this, equalsFn: equals }, reader => {
			const resolved = repositories.read(reader).map(repository => repository.read(reader).value);
			if (resolved.some(entry => entry === undefined)) {
				return undefined;
			}
			const choices = new Map<string, string>();
			for (const entry of resolved) {
				const repoNwo = entry?.repository ? trackedGitHubRepository(entry.repository.state.read(reader).remotes) : undefined;
				if (repoNwo && !choices.has(repoNwo.toLowerCase())) {
					choices.set(repoNwo.toLowerCase(), repoNwo);
				}
			}
			return [...choices.values()];
		});
		// Mirrors the cloud agent's picker: a single tracked repository needs no question, several
		// roots offer only those roots, and a window that cannot supply one lets the user search.
		// Leaving the "Select repository..." placeholder in place starts an empty sandbox.
		this._repositoryOptionGroups = derived(this, reader => {
			const choices = this._workspaceRepositoryChoices.read(reader);
			if (choices === undefined || choices.length === 1) {
				return [];
			}
			const items = choices.map((repoNwo, index): IChatSessionProviderOptionItem => ({
				id: repoNwo,
				name: repoNwo,
				icon: Codicon.repo,
				default: index === 0,
			}));
			if (items.length > 0) {
				return [{
					id: CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP,
					name: localize('cloudSandbox.repositoryGroup', "Repository"),
					description: localize('cloudSandbox.repositoryGroupDescription', "Select repository..."),
					icon: Codicon.repo,
					items,
				}];
			}
			// The picker only renders once the draft holds a value, so the placeholder is pre-selected
			// without being offered as a choice; the dropdown then holds just the pick command.
			return [{
				id: CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP,
				name: localize('cloudSandbox.repositoryGroup', "Repository"),
				description: localize('cloudSandbox.repositoryGroupDescription', "Select repository..."),
				icon: Codicon.repo,
				selected: {
					id: SELECT_REPOSITORY_PLACEHOLDER_ID,
					name: localize('cloudSandbox.selectRepository', "Select repository..."),
					icon: Codicon.repo,
				},
				items,
				commands: [{ command: CLOUD_SANDBOX_SELECT_REPOSITORY_COMMAND_ID, title: localize('cloudSandbox.selectRepository', "Select repository...") }],
			}];
		});
		const draftConfigChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration,
			e => e.affectsConfiguration(ChatConfiguration.DefaultConfiguration) || e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)));
		this._draftConfig = derived(this, reader => {
			draftConfigChanged.read(reader);
			return createCloudSandboxSessionConfig(configurationService);
		});
		this._draftOptionGroups = derived(this, reader => [
			...this._repositoryOptionGroups.read(reader),
			...createCloudSandboxDraftOptionGroups(this._draftConfig.read(reader)),
		]);
		this._register(autorun(reader => {
			const groups = this._draftOptionGroups.read(reader);
			if (this._discoveryRegistration.value) {
				this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, groups);
			}
		}));
		this._updateRegistration();
		const widgetListeners = this._register(new DisposableMap<IChatWidget, DisposableStore>());
		for (const widget of this._chatWidgetService.getAllWidgets()) {
			widgetListeners.set(widget, this._watchDraftInput(widget));
		}
		this._register(this._chatWidgetService.onDidAddWidget(widget => widgetListeners.set(widget, this._watchDraftInput(widget))));
		this._register(this._chatWidgetService.onDidRemoveWidget(widget => widgetListeners.deleteAndDispose(widget)));
		this._register(this._chatWidgetService.onDidBackgroundSession(resource => {
			if (resource.scheme === CLOUD_SANDBOX_SESSION_TYPE && isUntitledChatSession(resource)) {
				void this._draftPreparationService.discard(resource);
			}
		}));
		this._register(this._chatService.onDidDisposeSession(event => {
			for (const resource of event.sessionResources) {
				if (resource.scheme === CLOUD_SANDBOX_SESSION_TYPE && isUntitledChatSession(resource)) {
					void this._draftPreparationService.forget(resource);
				}
			}
		}));
	}

	private _watchDraftInput(widget: IChatWidget): DisposableStore {
		const store = new DisposableStore();
		const changed = observableSignalFromEvent(store, Event.any(
			widget.onDidChangeParsedInput, widget.onDidShow,
			Event.map(widget.onDidChangeViewModel, () => undefined),
			Event.map(this._editorChatSessionsService.onDidChangeSessionOptions, () => undefined),
		));
		store.add(autorun(reader => {
			changed.read(reader);
			const choices = this._workspaceRepositoryChoices.read(reader);
			const model = widget.viewModel?.model;
			if (!model || model.sessionResource.scheme !== CLOUD_SANDBOX_SESSION_TYPE || !isUntitledChatSession(model.sessionResource)) {
				return;
			}
			if (choices === undefined) {
				return;
			}
			const repoNwo = this._requestedRepository(this._editorChatSessionsService.getSessionOptions(model.sessionResource));
			this._draftPreparationService.updateRepository(model.sessionResource, repoNwo);
			if (widget.visible && !model.hasRequests && widget.getInput().trim()) {
				this._draftPreparationService.prepare(model.sessionResource, repoNwo);
			}
		}));
		return store;
	}

	private async _resolveRepository(root: URI): Promise<IGitRepository | undefined> {
		try {
			const repository = Array.from(this._gitService.repositories).find(repository => extUriBiasedIgnorePathCase.isEqual(repository.rootUri, root))
				?? await this._gitService.openRepository(root);
			if (repository && !extUriBiasedIgnorePathCase.isEqualOrParent(root, repository.rootUri)) {
				this._editorLogService.warn('[CloudSandbox] Ignoring repository outside the requested workspace folder', root.toString(), repository.rootUri.toString());
				return undefined;
			}
			return repository;
		} catch (error) {
			this._editorLogService.warn('[CloudSandbox] Failed to resolve workspace repository', root.toString(), error);
			return undefined;
		}
	}

	protected override _updateRegistration(): void {
		if (!this._isEnabled()) {
			this._discoveryRegistration.clear();
		} else if (!this._discoveryRegistration.value) {
			const store = new DisposableStore();
			this._discoveryRegistration.value = store;
			store.add(this._editorChatSessionsService.registerChatSessionContribution({
				type: CLOUD_SANDBOX_SESSION_TYPE,
				name: localize('cloudSandbox.sessionName', "Cloud"),
				displayName: localize('cloudSandbox.sessionName', "Cloud"),
				description: localize('cloudSandbox.creationDescription', "Run the agent in a new cloud sandbox."),
				inputPlaceholder: CLOUD_SANDBOX_INPUT_PLACEHOLDER,
				sessionListGroup: SessionType.CopilotCloud,
				hideFromSessionTypePicker: false,
				when: ChatContextKeys.enabled.key,
				icon: '$(cloud)',
				canDelegate: false,
				requiresCopilotSignIn: true,
				supportsDelegation: false,
				requiresCustomModels: true,
				supportsAutoModel: true,
			}));
			// Drafts pick from the shared cloud catalog under this type's own identifiers; the
			// environment they bind to accepts those identifiers as aliases of its own.
			const draftModels = this._draftModels.value = this._instantiationService.createInstance(CloudSandboxModels, CLOUD_SANDBOX_SESSION_TYPE, CLOUD_SANDBOX_SESSION_TYPE, undefined);
			store.add(toDisposable(() => this._draftModels.clear()));
			// New sessions are drafted under this type and rebound to the provisioned environment's
			// type on first send, so only the untitled draft ever needs content from here.
			store.add(this._editorChatSessionsService.registerChatSessionContentProvider(CLOUD_SANDBOX_SESSION_TYPE, {
				provideChatSessionContent: async (sessionResource: URI): Promise<IChatSession> => {
					if (!isUntitledChatSession(sessionResource)) {
						throw new Error(`Sandbox session ${sessionResource.toString()} is served by its environment's session type.`);
					}
					draftModels.load();
					// Blocked while the first turn provisions, so no follow-up can queue on a draft that is
					// about to be replaced; the Agents window keeps its placeholder read-only the same way.
					const isInputBlocked = observableValue(this, false);
					this._draftInputBlocked.set(sessionResource, isInputBlocked);
					return { sessionResource, onWillDispose: Event.None, history: [], isInputBlocked, dispose: () => { this._draftInputBlocked.delete(sessionResource); } };
				},
			}));
			// Also keeps refresh available before discovery has found the first environment.
			store.add(this._editorChatSessionsService.registerChatSessionItemController(CLOUD_SANDBOX_SESSION_TYPE, this));
			// The draft's first turn is served by a participant of its own, like the Copilot cloud
			// agent's drafts: the chat widget locks drafts to the participant named after their type.
			const agentData: IChatAgentData = {
				id: CLOUD_SANDBOX_SESSION_TYPE,
				name: CLOUD_SANDBOX_SESSION_TYPE,
				fullName: localize('cloudSandbox.sessionName', "Cloud"),
				description: localize('cloudSandbox.creationDescription', "Run the agent in a new cloud sandbox."),
				extensionId: new ExtensionIdentifier('vscode.cloud-sandbox'),
				extensionVersion: undefined,
				extensionPublisherId: 'vscode',
				extensionDisplayName: localize('cloudSandbox.sessionName', "Cloud"),
				isDefault: false,
				isDynamic: true,
				isCore: true,
				metadata: { themeIcon: Codicon.cloud },
				slashCommands: [],
				locations: [ChatAgentLocation.Chat],
				modes: [ChatModeKind.Agent, ChatModeKind.Ask],
				disambiguation: [],
			};
			const agentImpl: IChatAgentImplementation = {
				invoke: (request, progress, _history, token) => this._startSession(request, progress, token),
			};
			store.add(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));
			store.add(CommandsRegistry.registerCommand(CLOUD_SANDBOX_SELECT_REPOSITORY_COMMAND_ID, (accessor, sessionResource?: URI) =>
				this._selectRepository(accessor.get(INotificationService), sessionResource)));
			this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, this._draftOptionGroups.get());
			store.add(toDisposable(() => this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, undefined)));
		} else {
			void this._discoverAndSeed();
		}
	}

	/** Records the picked repository on the draft that invoked the picker. */
	private async _selectRepository(notificationService: INotificationService, sessionResource: URI | undefined): Promise<void> {
		try {
			const repoNwo = await this._pickRepository();
			if (repoNwo && URI.isUri(sessionResource)) {
				this._editorChatSessionsService.setSessionOption(sessionResource, CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP, { id: repoNwo, name: repoNwo, icon: Codicon.repo });
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				notificationService.error(error);
			}
		}
	}

	/** Searches the signed-in account's GitHub repositories in the renderer; no extension host is involved. */
	protected _pickRepository(): Promise<string | undefined> {
		const picker = this._repositoryPicker.value ??= this._instantiationService.createInstance(CloudSandboxRepositoryPicker);
		return picker.pick();
	}

	protected override _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): CloudSandboxSessionListController {
		const address = cloudSandboxAddress(env.environmentId);
		const provider = store.add(this._instantiationService.createInstance(CloudSandboxSessionListController, address, this._workspaceRepositories,
			rawId => this._ownsSandboxSession(address, rawId),
			async (rawId, token) => {
				if (!this._ownsSandboxSession(address, rawId)) {
					return false;
				}
				await this._deleteSandboxSession(address, [rawId], id => provider.removeDeletedSession(id), token);
				return true;
			},
			async (rawId, archived, token) => {
				if (!this._ownsSandboxSession(address, rawId)) {
					return false;
				}
				await this._setSandboxSessionArchived(address, rawId, archived, token);
				return true;
			}));
		store.add(this._connectionsService.registerSessionResolutionPolicy(agentHostAuthority(address), {
			connectionAddress: address,
			sessionSchemeAlias: { ui: CLOUD_SANDBOX_AGENT_PROVIDER, backend: CLOUD_SANDBOX_SESSION_SCHEME },
			defaultChangesetKind: ChangesetKind.Session,
		}));
		store.add(this._workingDirectoryResolver.registerResolver(provider.sessionType, resource => provider.resolveWorkingDirectory(resource), resource => provider.isNewSession(resource)));
		store.add(this._editorChatSessionsService.registerChatSessionContribution({
			type: provider.sessionType,
			name: localize('cloudSandbox.sessionName', "Cloud"),
			displayName: localize('cloudSandbox.sessionName', "Cloud"),
			description: env.name,
			inputPlaceholder: CLOUD_SANDBOX_INPUT_PLACEHOLDER,
			sessionListGroup: SessionType.CopilotCloud,
			hideFromSessionTypePicker: true,
			when: ChatContextKeys.enabled.key,
			icon: '$(cloud)',
			canDelegate: false,
			requiresCopilotSignIn: true,
			supportsDelegation: false,
			requiresCustomModels: true,
			supportsAutoModel: true,
			agentHostProviderId: CLOUD_SANDBOX_AGENT_PROVIDER,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
				supportsImageAttachments: true,
				get terminalCommandPrefix() { return provider.terminalCommandPrefix; },
			},
		}));
		store.add(this._editorChatSessionsService.registerChatSessionItemController(provider.sessionType, provider));
		return provider;
	}

	async refresh(token: CancellationToken): Promise<void> {
		if (!token.isCancellationRequested) {
			await this._discoverAndSeed();
		}
	}

	async getNewChatSessionInputState(): Promise<readonly IChatSessionProviderOptionGroup[] | undefined> {
		this._draftModels.value?.load();
		return this._draftOptionGroups.get();
	}

	/**
	 * Serve the first turn of a draft: provision a sandbox while reporting each step in the draft's
	 * transcript, commit the draft to the provisioned environment's session and re-send the turn
	 * there, where the environment's Agent Host handler runs it.
	 */
	private async _startSession(request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {
		const draftResource = request.sessionResource;
		if (!isUntitledChatSession(draftResource)) {
			throw new Error(`Sandbox session ${draftResource.toString()} is served by its environment's session type.`);
		}
		// The draft may be sent before a slow Git lookup has settled.
		await waitForState(this._workspaceRepositoryChoices, choices => choices !== undefined, undefined, token);
		const draftOptions = this._editorChatSessionsService.getSessionOptions(draftResource);
		const repoNwo = this._requestedRepository(draftOptions);
		const title = repoNwo
			? localize('cloudSandbox.creatingWithRepository', "Creating Cloud Session for {0}", repoNwo)
			: localize('cloudSandbox.creating', "Creating Cloud Session");
		// One progress line, updated in place as creation advances.
		const report = (step?: string) => progress([{
			kind: 'progressMessage',
			id: 'cloudSandbox.creation',
			shimmer: true,
			content: new MarkdownString(step ? localize('cloudSandbox.creationStep', "{0}: {1}", title, step) : title),
		}]);
		report();
		const inputBlocked = this._draftInputBlocked.get(draftResource);
		inputBlocked?.set(true, undefined);
		try {
			const { sessionResource, sessionType } = await this._provisionForDraft(draftResource, repoNwo, request.message, readCloudSandboxDraftConfig(draftOptions, this._draftConfig.get()), { report }, token, request);
			// Session-option lookups for the new session resolve to the draft's picks.
			this._editorChatSessionsService.registerSessionResourceAlias(draftResource, sessionResource);
			const draftRequest = this._chatService.getSession(draftResource)?.getRequests().find(candidate => candidate.id === request.requestId);
			await this._commitDraft(draftResource, sessionResource);
			// Stopping the draft while it was being committed must not start remote work.
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			await this._sendFirstTurn(sessionResource, sessionType, request, draftRequest);
			return {};
		} catch (error) {
			if (error instanceof CloudSandboxStartupError && !token.isCancellationRequested) {
				progress([error.detailsCommand]);
			}
			throw error;
		} finally {
			inputBlocked?.set(false, undefined);
		}
	}

	/** Provision a sandbox and confirm the draft's config with it; resolves to the session it hosts. */
	private async _provisionForDraft(draftResource: URI, repoNwo: string | undefined, prompt: string, draftConfig: Record<string, unknown>, stepProgress: IProgress<string>, token: CancellationToken, request: IChatAgentRequest): Promise<{ sessionResource: URI; sessionType: string }> {
		const cts = new CancellationTokenSource(token);
		const store = new DisposableStore();
		store.add(cts);
		store.add(this._enabledCts.token.onCancellationRequested(() => cts.cancel()));
		try {
			const provisioned = await this._provisionSandbox({ repoNwo, prompt }, cts.token, stepProgress, draftResource);
			const { provider, address, sessionId } = provisioned;
			if (repoNwo) {
				store.add(this.trackSessionCreationProgress(provisioned.environmentId, repoNwo, stepProgress));
			}
			await this._whenSessionTypeResolvable(provider, address, cts.token);
			const connection = this._remoteService.getConnection(address);
			if (!connection) {
				throw new Error(localize('cloudSandbox.connectionUnavailable', "The connection to the cloud sandbox is no longer available."));
			}
			const sessionConfig = await resolveCloudSandboxSessionConfig(connection, draftConfig, cts.token);
			if (request.modelConfiguration && Object.keys(request.modelConfiguration).length) {
				const model = this._draftModels.value?.models.find(model => model.identifier === request.userSelectedModelId);
				if (!model) {
					throw new Error(localize('cloudSandbox.draftModelUnavailable', "The selected Cloud model is no longer available. Your prompt was not sent."));
				}
				await validateCloudSandboxModelConfig(connection, model.metadata.id, request.modelConfiguration, cts.token);
			}
			if (Object.keys(sessionConfig).length > 0) {
				provider.setProvisionalSessionConfig(sessionId, sessionConfig);
			}
			// Name the task after the prompt, as the Agents window does, so discovery lists the session the
			// way it was seeded instead of under Mission Control's default name. A transient failure must
			// not block the first turn.
			try {
				await raceCancellationError(this._renameSandboxSession(address, sessionId, provisioned.title), cts.token);
			} catch (error) {
				if (isCancellationError(error) || !isRetryableCloudSandboxError(error)) {
					throw error;
				}
				this._editorLogService.warn('[CloudSandbox] Failed to name the task after the first prompt; continuing with the first turn', error);
			}
			return { sessionResource: URI.from({ scheme: provider.sessionType, path: `/${sessionId}` }), sessionType: provider.sessionType };
		} finally {
			// Stops progress before the transcript it reports to is replaced.
			store.dispose();
		}
	}

	/** Swaps whatever shows the draft to the committed session and carries the draft's state over. */
	protected _commitDraft(draftResource: URI, sessionResource: URI): Promise<void> {
		return this._instantiationService.invokeFunction(commitChatSession, CLOUD_SANDBOX_SESSION_TYPE, draftResource, sessionResource);
	}

	/** Re-send the draft's turn on the committed session, where the environment's Agent Host handler runs it. */
	private async _sendFirstTurn(sessionResource: URI, sessionType: string, request: IChatAgentRequest, draftRequest: IChatRequestModel | undefined): Promise<void> {
		// The editor or view that took over the draft usually holds the session already; this
		// reference keeps it loaded until the turn is on it when nothing shows the session.
		const ref = await this._chatService.acquireOrLoadSession(sessionResource, request.location, CancellationToken.None);
		if (!ref) {
			throw new Error(localize('cloudSandbox.sessionUnavailable', "The cloud session could not be opened."));
		}
		try {
			const message = draftRequest?.message.text ?? request.message;
			const attachedContext = draftRequest?.attachedContext ?? [];
			const result = await this._chatService.sendRequest(sessionResource, message, {
				agentIdSilent: sessionType,
				location: request.location,
				modeInfo: draftRequest?.modeInfo,
				userSelectedModelId: request.userSelectedModelId,
				userSelectedModelConfiguration: request.modelConfiguration,
				attachedContext,
				// Images the widget expanded from directory attachments only exist on the resolved request.
				resolvedVariables: request.variables.variables.filter(entry => isImageVariableEntry(entry) && !attachedContext.some(attached => attached.id === entry.id)),
			});
			if (result.kind === 'rejected') {
				const error = localize('cloudSandbox.requestRejected', "The cloud session did not accept the request: {0}", result.reason);
				// The draft that would have shown this is already replaced, so the committed session shows it.
				this._chatService.addCompleteRequest(sessionResource, message, undefined, undefined, { message: [], result: { errorDetails: { message: error } } });
				throw new Error(error);
			}
			if (result.kind === 'sent') {
				await result.data.responseCreatedPromise;
			}
		} finally {
			ref.dispose();
		}
	}

	/** The repository to clone: an explicit pick, else the single implied workspace repository, else none. */
	private _requestedRepository(draftOptions: ReadonlyChatSessionOptionsMap | undefined): string | undefined {
		const selected = draftOptions?.get(CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP);
		const selectedId = (typeof selected === 'string' ? selected : selected?.id)?.trim();
		// A searched repository is not among the workspace choices, so any well-formed pick counts.
		if (selectedId && REPOSITORY_NWO_PATTERN.test(selectedId)) {
			return selectedId;
		}
		return this._workspaceRepositoryChoices.get()?.[0];
	}

	/** Wait until the environment's agent registered its chat session content provider. */
	private async _whenSessionTypeResolvable(provider: CloudSandboxSessionListController, address: string, token: CancellationToken): Promise<void> {
		const isResolvable = () => this._editorChatSessionsService.getContentProviderSchemes().includes(provider.sessionType);
		if (isResolvable()) {
			return;
		}
		const store = new DisposableStore();
		try {
			await raceCancellationError(new Promise<void>((resolve, reject) => {
				store.add(this._editorChatSessionsService.onDidChangeContentProviderSchemes(() => {
					if (isResolvable()) {
						resolve();
					}
				}));
				store.add(autorun(reader => {
					const status = provider.connectionStatus.read(reader);
					if (this._providerInstances.get(address) !== provider) {
						reject(new CancellationError());
					} else if (RemoteAgentHostConnectionStatus.isDisconnected(status) || RemoteAgentHostConnectionStatus.isIncompatible(status)) {
						reject(new Error(localize('cloudSandbox.connectionLost', "The connection to the cloud sandbox was lost before the session could start.")));
					}
				}));
			}), token);
		} finally {
			store.dispose();
		}
	}
}

export class EditorCloudSandboxContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.editorCloudSandbox';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		if (!environmentService.isSessionsWindow) {
			this._register(instantiationService.createInstance(EditorCloudSandboxSessionContribution));
		}
	}
}
