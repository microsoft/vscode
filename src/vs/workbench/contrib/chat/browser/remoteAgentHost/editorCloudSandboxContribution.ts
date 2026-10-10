/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { equalSets } from '../../../../../base/common/collections.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, mapObservableArrayCached, observableFromEvent, observableFromPromise, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProgress, IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IGitRepository, IGitService } from '../../../git/common/gitService.js';
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
export const CLOUD_SANDBOX_SESSION_TYPE = 'cloud-sandbox';
/** Option group letting the user choose which workspace repository the sandbox clones. */
export const CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP = 'repository';
const NO_REPOSITORY_OPTION_ID = 'none';

export class EditorCloudSandboxSessionContribution extends CloudSandboxSessionContribution<CloudSandboxSessionListController> implements IChatSessionItemController {
	readonly items = [];
	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private readonly _discoveryRegistration = this._register(new MutableDisposable<DisposableStore>());
	private readonly _workspaceRepositories: IObservable<ReadonlySet<string> | undefined>;
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
			const roots = Array.from(scmService.repositories).flatMap(repository => {
				const root = repository.provider.rootUri;
				return repository.provider.providerId === 'git' && root && folders.some(folder =>
					extUriBiasedIgnorePathCase.isEqualOrParent(root, folder.uri) || extUriBiasedIgnorePathCase.isEqualOrParent(folder.uri, root))
					? [{ root, key: repository }] : [];
			});
			const unresolvedFolders = folders.filter(folder => !roots.some(({ root }) =>
				extUriBiasedIgnorePathCase.isEqualOrParent(root, folder.uri) || extUriBiasedIgnorePathCase.isEqualOrParent(folder.uri, root)));
			return [
				...roots,
				...unresolvedFolders.map(folder => ({ root: folder.uri, key: extUriBiasedIgnorePathCase.getComparisonKey(folder.uri) })),
			];
		});
		const repositories = mapObservableArrayCached(this, repositoryRoots,
			({ root }) => observableFromPromise(this._resolveRepository(root)),
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
				for (const remote of repository.read(reader).value?.state.read(reader).remotes ?? []) {
					const info = remote.fetchUrl ? getGitHubRepositoryFromRemoteUrl(remote.fetchUrl) : undefined;
					if (info) {
						names.add(`${info.owner}/${info.repo}`.toLowerCase());
					}
				}
			}
			return names;
		});
		this._repositoryOptionGroups = derived(this, reader => {
			const repositories = [...this._workspaceRepositories.read(reader) ?? []].sort();
			const items: IChatSessionProviderOptionItem[] = [
				...repositories.map((repoNwo, index): IChatSessionProviderOptionItem => ({
					id: repoNwo,
					name: repoNwo,
					icon: Codicon.repo,
					default: index === 0,
				})),
				{
					id: NO_REPOSITORY_OPTION_ID,
					name: localize('cloudSandbox.noRepository', "No Repository"),
					description: localize('cloudSandbox.noRepositoryDescription', "Start in an empty sandbox"),
					icon: Codicon.cloud,
					default: repositories.length === 0,
				},
			];
			return [{
				id: CLOUD_SANDBOX_REPOSITORY_OPTION_GROUP,
				name: localize('cloudSandbox.repositoryGroup', "Repository"),
				description: localize('cloudSandbox.repositoryGroupDescription', "The GitHub repository to clone into the sandbox"),
				icon: Codicon.repo,
				items,
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
				name: localize('cloudSandbox.sessionName', "GitHub Sandbox"),
				displayName: localize('cloudSandbox.sessionName', "GitHub Sandbox"),
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
			this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, this._repositoryOptionGroups.get());
			store.add(toDisposable(() => this._editorChatSessionsService.setOptionGroupsForSessionType(CLOUD_SANDBOX_SESSION_TYPE, 0, undefined)));
		} else {
			void this._discoverAndSeed();
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
			name: localize('cloudSandbox.sessionName', "GitHub Sandbox"),
			displayName: localize('cloudSandbox.sessionName', "GitHub Sandbox"),
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
		const repoNwo = this._requestedRepository(request);
		const cts = new CancellationTokenSource(token);
		const store = new DisposableStore();
		store.add(cts);
		store.add(this._enabledCts.token.onCancellationRequested(() => cts.cancel()));
		try {
			return await this._progressService.withProgress<IChatSessionItem>({
				location: ProgressLocation.Notification,
				title: repoNwo
					? localize('cloudSandbox.creatingWithRepository', "Creating GitHub Sandbox for {0}", repoNwo)
					: localize('cloudSandbox.creating', "Creating GitHub Sandbox"),
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
		const selectedId = typeof selected === 'string' ? selected : selected?.id;
		if (selectedId === NO_REPOSITORY_OPTION_ID) {
			return undefined;
		}
		const repositories = this._workspaceRepositories.get();
		if (selectedId && repositories?.has(selectedId.toLowerCase())) {
			return selectedId;
		}
		return repositories ? [...repositories].sort()[0] : undefined;
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
						reject(new Error(localize('cloudSandbox.connectionLost', "The connection to the GitHub Sandbox was lost before the session could start.")));
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
