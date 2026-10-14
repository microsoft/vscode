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
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, mapObservableArrayCached, observableFromEvent, observableFromPromise, observableSignalFromEvent, waitForState } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgress, IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
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
import { ChatSessionStatus, IChatNewSessionRequest, IChatSession, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { isUntitledChatSession } from '../../common/model/chatUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { CloudSandboxSessionContribution, ICloudSandboxSessionEnvironment } from './cloudSandboxSessionContribution.js';
import { CloudSandboxSessionListController } from './cloudSandboxSessionListController.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';

/** Session type offered in the session type picker; creating a session provisions a new sandbox. */
export const CLOUD_SANDBOX_SESSION_TYPE = SessionType.CloudSandbox;
/** Option group letting the user choose which repository the sandbox clones. */
export const CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP = 'repository';
/** Opens the GitHub repository search and records the pick as the draft's repository option. */
export const CLOUD_SANDBOX_SEARCH_REPOSITORY_COMMAND_ID = 'workbench.action.chat.cloudSandbox.searchRepository';
/** The Copilot Chat extension's repository search, shared with the Agents window on desktop. */
const OPEN_REPOSITORY_COMMAND_ID = 'github.copilot.chat.cloudSessions.openRepository';
const NO_REPOSITORY_OPTION_ID = 'none';
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
	private readonly _hasWorkspaceFolders: IObservable<boolean>;
	private readonly _repositoryOptionGroups: IObservable<readonly IChatSessionProviderOptionGroup[]>;

	constructor(
		@ICloudSandboxAgentHostService cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService apiService: ICloudSandboxApiService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
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
		@IAgentHostService localAgentHostService: IAgentHostService,
		@IProgressService private readonly _progressService: IProgressService,
	) {
		super(cloudSandboxService, apiService, remoteAgentHostService, connectionCustomizations, configurationService, instantiationService, _editorChatSessionsService, _editorLogService, chatEntitlementService, hostService, storageService, workspaceTrustManagementService, localAgentHostService);
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
		this._hasWorkspaceFolders = derived(this, reader => {
			workspaceChanged.read(reader);
			return workspaceContextService.getWorkspace().folders.length > 0;
		});
		this._workspaceRepositories = derivedOpts<ReadonlySet<string> | undefined>({
			owner: this,
			equalsFn: (a, b) => a === b || (a !== undefined && b !== undefined && equalSets(a, b)),
		}, reader => {
			if (!this._hasWorkspaceFolders.read(reader)) {
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
		this._repositoryOptionGroups = derived(this, reader => {
			const choices = this._workspaceRepositoryChoices.read(reader);
			if (choices === undefined || choices.length === 1) {
				return [];
			}
			const hasWorkspaceFolders = this._hasWorkspaceFolders.read(reader);
			const items = choices.map((repoNwo, index): IChatSessionProviderOptionItem => ({
				id: repoNwo,
				name: repoNwo,
				icon: Codicon.repo,
				default: index === 0,
			}));
			if (!hasWorkspaceFolders) {
				items.push({
					id: NO_REPOSITORY_OPTION_ID,
					name: localize('cloudSandbox.noRepository', "No Repository"),
					description: localize('cloudSandbox.noRepositoryDescription', "Start in an empty sandbox"),
					icon: Codicon.circleSlash,
					default: true,
				});
			}
			return [{
				id: CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP,
				name: localize('cloudSandbox.repositoryGroup', "Repository"),
				description: items.length > 0
					? localize('cloudSandbox.repositoryGroupDescription', "The GitHub repository to clone into the sandbox")
					: localize('cloudSandbox.selectRepository', "Select Repository"),
				icon: Codicon.repo,
				items,
				commands: choices.length === 0
					? [{ command: CLOUD_SANDBOX_SEARCH_REPOSITORY_COMMAND_ID, title: localize('cloudSandbox.searchRepositories', "Search Repositories...") }]
					: undefined,
			}];
		});
		this._register(autorun(reader => {
			const groups = this._repositoryOptionGroups.read(reader);
			if (this._discoveryRegistration.value) {
				this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, groups);
			}
		}));
		this._updateRegistration();
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
				sessionListGroup: SessionType.CopilotCloud,
				hideFromSessionTypePicker: false,
				when: ChatContextKeys.enabled.key,
				icon: '$(cloud)',
				canDelegate: false,
				requiresCopilotSignIn: true,
				supportsDelegation: false,
			}));
			// New sessions are drafted under this type and rebound to the provisioned environment's
			// type on first send, so only the untitled draft ever needs content from here.
			store.add(this._editorChatSessionsService.registerChatSessionContentProvider(CLOUD_SANDBOX_SESSION_TYPE, {
				provideChatSessionContent: async (sessionResource: URI): Promise<IChatSession> => {
					if (!isUntitledChatSession(sessionResource)) {
						throw new Error(`Sandbox session ${sessionResource.toString()} is served by its environment's session type.`);
					}
					return { sessionResource, onWillDispose: Event.None, history: [], dispose: () => { } };
				},
			}));
			// Also keeps refresh available before discovery has found the first environment.
			store.add(this._editorChatSessionsService.registerChatSessionItemController(CLOUD_SANDBOX_SESSION_TYPE, this));
			store.add(CommandsRegistry.registerCommand(CLOUD_SANDBOX_SEARCH_REPOSITORY_COMMAND_ID, (accessor, sessionResource?: URI) =>
				this._searchRepository(accessor.get(ICommandService), accessor.get(INotificationService), sessionResource)));
			this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, this._repositoryOptionGroups.get());
			store.add(toDisposable(() => this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, undefined)));
		} else {
			void this._discoverAndSeed();
		}
	}

	/** Runs the extension's GitHub repository search and records the pick on the draft that invoked it. */
	private async _searchRepository(commandService: ICommandService, notificationService: INotificationService, sessionResource: URI | undefined): Promise<void> {
		try {
			// Without a resource the extension only returns the pick instead of also writing its own option.
			const repoNwo = await commandService.executeCommand<string>(OPEN_REPOSITORY_COMMAND_ID);
			if (repoNwo && URI.isUri(sessionResource)) {
				this._editorChatSessionsService.setSessionOption(sessionResource, CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP, { id: repoNwo, name: repoNwo, icon: Codicon.repo });
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				notificationService.error(error);
			}
		}
	}

	protected override _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): CloudSandboxSessionListController {
		const address = cloudSandboxAddress(env.environmentId);
		const provider = store.add(this._instantiationService.createInstance(CloudSandboxSessionListController, address, this._workspaceRepositories,
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
		return this._repositoryOptionGroups.get();
	}

	/**
	 * Provision a sandbox for the drafted first turn. The returned item lives under the new
	 * environment's own session type, so the chat infrastructure rebinds the draft to it and the
	 * environment's Agent Host handler creates the live session when the turn is dispatched.
	 */
	async newChatSessionItem(request: IChatNewSessionRequest, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		// The draft may be sent before a slow Git lookup has settled.
		await waitForState(this._workspaceRepositoryChoices, choices => choices !== undefined, undefined, token);
		const repoNwo = this._requestedRepository(request);
		const cts = new CancellationTokenSource(token);
		const store = new DisposableStore();
		store.add(cts);
		store.add(this._enabledCts.token.onCancellationRequested(() => cts.cancel()));
		try {
			return await this._progressService.withProgress<IChatSessionItem>({
				location: ProgressLocation.Notification,
				title: repoNwo
					? localize('cloudSandbox.creatingWithRepository', "Creating Cloud Session for {0}", repoNwo)
					: localize('cloudSandbox.creating', "Creating Cloud Session"),
				cancellable: true,
			}, async progress => {
				const stepProgress: IProgress<string> = { report: message => progress.report({ message }) };
				const provisioned = await this._provisionSandbox({ repoNwo, prompt: request.prompt }, cts.token, stepProgress);
				const { provider, address, sessionId, name } = provisioned;
				if (repoNwo) {
					store.add(this.trackSessionCreationProgress(provisioned.environmentId, repoNwo, stepProgress));
				}
				await this._whenSessionTypeResolvable(provider, address, cts.token);
				return {
					resource: URI.from({ scheme: provider.sessionType, path: `/${sessionId}` }),
					label: request.prompt.trim() || name,
					iconPath: Codicon.cloud,
					status: ChatSessionStatus.InProgress,
					timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
				};
			}, () => cts.cancel());
		} finally {
			store.dispose();
		}
	}

	private _requestedRepository(request: IChatNewSessionRequest): string | undefined {
		const selected = request.initialSessionOptions?.get(CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP);
		const selectedId = (typeof selected === 'string' ? selected : selected?.id)?.trim();
		if (selectedId === NO_REPOSITORY_OPTION_ID) {
			return undefined;
		}
		// A searched repository is not among the workspace choices, so any well-formed pick counts.
		if (selectedId && REPOSITORY_NWO_PATTERN.test(selectedId)) {
			return selectedId;
		}
		const choices = this._workspaceRepositoryChoices.get();
		if (choices?.length) {
			return choices[0];
		}
		if (this._hasWorkspaceFolders.get()) {
			throw new Error(localize('cloudSandbox.repositoryRequired', "Select a repository for the cloud sandbox session."));
		}
		return undefined;
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
