/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { equalSets } from '../../../../../base/common/collections.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { derived, derivedOpts, IObservable, mapObservableArrayCached, observableFromEvent, ObservablePromise, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, CloudSandboxEnabledSettingId, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxCreatedSession } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IGitRepository, IGitService } from '../../../git/common/gitService.js';
import { getGitHubRemoteInfo, getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { ISCMService, ISCMViewService } from '../../../scm/common/scm.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatNewSessionItem, IChatNewSessionRequest, IChatSessionItemController, IChatSessionProviderOptionItem, IChatSessionsService, ReadonlyChatSessionOptionsMap, SessionType } from '../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { isUntitledChatSession } from '../../common/model/chatUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { CloudSandboxSessionContribution, ICloudSandboxSessionEnvironment } from './cloudSandboxSessionContribution.js';
import { CloudSandboxSessionListController } from './cloudSandboxSessionListController.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';

const DISCOVERY_SESSION_TYPE = 'cloud-sandbox';
const USE_SANDBOX_OPTION = 'githubSandbox';

export class EditorCloudSandboxSessionContribution extends CloudSandboxSessionContribution<CloudSandboxSessionListController> implements IChatSessionItemController {
	readonly items = [];
	readonly onDidChangeChatSessionItems = Event.None;

	private readonly _discoveryRegistration = this._register(new MutableDisposable<DisposableStore>());
	private readonly _workspaceRepositories: IObservable<ReadonlySet<string> | undefined>;
	private readonly _workspaceRepository: IObservable<string | undefined>;
	private readonly _createdDrafts = new ResourceMap<ICloudSandboxCreatedSession & { readonly provider: CloudSandboxSessionListController; readonly repoNwo: string }>();

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
		@ISCMViewService scmViewService: ISCMViewService,
		@IChatService chatService: IChatService,
		@IProgressService private readonly _progressService: IProgressService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super(cloudSandboxService, apiService, remoteAgentHostService, connectionCustomizations, configurationService, instantiationService, _editorChatSessionsService, _editorLogService, chatEntitlementService, hostService, storageService);
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
			({ root }) => ({ root, repository: ObservablePromise.fromFn(() => this._resolveRepository(root)).promiseResult }),
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
			for (const { repository } of repositories.read(reader)) {
				for (const remote of repository.read(reader)?.data?.state.read(reader).remotes ?? []) {
					const info = remote.fetchUrl ? getGitHubRepositoryFromRemoteUrl(remote.fetchUrl) : undefined;
					if (info) {
						names.add(`${info.owner}/${info.repo}`.toLowerCase());
					}
				}
			}
			return names;
		});
		this._workspaceRepository = derived(this, reader => {
			const candidates = repositories.read(reader);
			const activeRoot = scmViewService.activeRepository.read(reader)?.repository.provider.rootUri;
			const activeRepository = activeRoot && candidates.find(({ root }) => extUriBiasedIgnorePathCase.isEqual(root, activeRoot));
			const names = new Set<string>();
			for (const { repository } of activeRepository ? [activeRepository] : candidates) {
				const result = repository.read(reader);
				if (!result) {
					return undefined;
				}
				const state = result.data?.state.read(reader);
				const info = state && getGitHubRemoteInfo(state);
				if (info) {
					names.add(`${info.owner}/${info.repo}`.toLowerCase());
				}
			}
			return names.size === 1 ? names.values().next().value : undefined;
		});
		this._register(chatService.onDidDisposeSession(event => {
			for (const resource of event.sessionResources) {
				this._createdDrafts.delete(resource);
			}
		}));
		this._register(toDisposable(() => this._createdDrafts.clear()));
		this._register(this._editorChatSessionsService.registerChatSessionCreationHandler(SessionType.CopilotCloud, {
			when: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				IsSessionsWindowContext.negate(),
				ContextKeyExpr.equals(`config.${CloudSandboxEnabledSettingId}`, true),
				ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
			)!.serialize(),
			onDidChangeOption: Event.fromObservableLight(this._workspaceRepository),
			getOption: resource => {
				const hasRepository = !!this._getRepository(this._editorChatSessionsService.getSessionOptions(resource));
				const hasRequests = !!chatService.getSession(resource)?.getRequests().length;
				return {
					label: localize('cloudSandbox.creationOption', "Sandbox"),
					description: hasRequests
						? localize('cloudSandbox.newChatRequired', "Open a new Cloud chat to start a sandbox session.")
						: hasRepository
							? localize('cloudSandbox.creationDescription', "Run in a GitHub-managed sandbox")
							: localize('cloudSandbox.repositoryRequired', "A GitHub repository is required to run in a sandbox."),
					checked: this._editorChatSessionsService.getSessionOption(resource, USE_SANDBOX_OPTION) === 'true',
					enabled: this._isEnabled() && hasRepository && !hasRequests,
					setChecked: checked => {
						if (checked && chatService.getSession(resource)?.getRequests().length) {
							this._notificationService.warn(localize('cloudSandbox.newChatRequired', "Open a new Cloud chat to start a sandbox session."));
							return;
						}
						if (checked && (!this._isEnabled() || !this._getRepository(this._editorChatSessionsService.getSessionOptions(resource)))) {
							this._notificationService.warn(localize('cloudSandbox.creationUnavailable', "Enable GitHub sandboxes and choose a GitHub repository before starting a sandbox session."));
							return;
						}
						this._editorChatSessionsService.setSessionOption(resource, USE_SANDBOX_OPTION, String(checked));
					},
				};
			},
			createSession: (request, token) => this._createSandboxSession(request, token, chatService),
		}));
		this._updateRegistration();
	}

	private _getRepository(options: ReadonlyChatSessionOptionsMap | undefined): string | undefined {
		const selected = options?.get('repositories');
		const repository = typeof selected === 'string' ? selected : selected?.id;
		if (repository && repository !== '___vscode_repository_default___') {
			return /^[^/:\s]+\/[^/:\s]+$/.test(repository) ? repository : undefined;
		}
		return this._workspaceRepository.get();
	}

	private async _createSandboxSession(request: IChatNewSessionRequest, token: CancellationToken, chatService: IChatService): Promise<IChatNewSessionItem | undefined> {
		if (request.initialSessionOptions?.get(USE_SANDBOX_OPTION) !== 'true') {
			return undefined;
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const resource = request.untitledResource;
		const repoNwo = this._getRepository(request.initialSessionOptions);
		if (!this._isEnabled() || !repoNwo || !resource || !isUntitledChatSession(resource)) {
			throw new Error(localize('cloudSandbox.creationUnavailable', "Enable GitHub sandboxes and choose a GitHub repository before starting a sandbox session."));
		}
		if (chatService.getSession(resource)?.getRequests().length) {
			throw new Error(localize('cloudSandbox.newChatRequired', "Open a new Cloud chat to start a sandbox session."));
		}
		const selectedModel = this._editorChatSessionsService.getSessionOption(resource, 'models') ?? request.initialSessionOptions?.get('models');
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(token));
		store.add(chatService.onDidDisposeSession(event => {
			if (event.sessionResources.some(candidate => isEqual(candidate, resource))) {
				source.cancel();
			}
		}));
		try {
			return await this._progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('cloudSandbox.creating', "Starting GitHub Sandbox"),
				cancellable: true,
			}, async () => {
				if (source.token.isCancellationRequested) {
					throw new CancellationError();
				}
				let created = this._createdDrafts.get(resource);
				if (created) {
					if (created.repoNwo !== repoNwo || this._providerInstances.get(cloudSandboxAddress(created.environmentId)) !== created.provider) {
						throw new Error(localize('cloudSandbox.creationContextChanged', "The sandbox repository, account, or connection changed. Open a new Cloud chat to start another sandbox session."));
					}
					await raceCancellationError(this.connect({ ...created, name: repoNwo }), source.token);
				} else {
					const provisioned = await this._provisionSession({ repoNwo, prompt: request.prompt }, source.token, (allocated, provider) => {
						this._createdDrafts.set(resource, { ...allocated, provider, repoNwo });
					});
					created = { ...provisioned, repoNwo };
				}
				store.add(this._enabledCts.token.onCancellationRequested(() => source.cancel()));
				const sessionResource = URI.from({ scheme: created.provider.sessionType, path: `/${created.sessionId}` });
				const modelId = await this._resolveSandboxModel(created.provider.sessionType, selectedModel, source.token);
				if (source.token.isCancellationRequested || !this._isEnabled() || this._providerInstances.get(cloudSandboxAddress(created.environmentId)) !== created.provider) {
					throw new CancellationError();
				}
				return {
					resource: sessionResource,
					label: request.prompt.split('\n')[0],
					timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
					modelId,
				};
			}, () => source.cancel());
		} finally {
			store.dispose();
		}
	}

	private async _resolveSandboxModel(sessionType: string, selected: string | IChatSessionProviderOptionItem | undefined, token: CancellationToken): Promise<string | undefined> {
		const rawModelId = typeof selected === 'string' ? selected : selected?.modelMetadata?.id ?? selected?.id;
		if (!rawModelId || rawModelId === 'auto') {
			return undefined;
		}
		const store = new DisposableStore();
		try {
			const deadline = Date.now() + 5_000;
			for (;;) {
				const changed = Event.toPromise(this._languageModelsService.onDidChangeLanguageModels, store);
				const models = await raceCancellationError(this._languageModelsService.selectLanguageModels({ vendor: sessionType }), token);
				const modelId = models.find(id => this._languageModelsService.lookupLanguageModel(id)?.id === rawModelId);
				if (modelId) {
					return modelId;
				}
				const remaining = deadline - Date.now();
				if (models.length || remaining <= 0 || !await raceCancellationError(raceTimeout(changed.then(() => true), remaining), token)) {
					break;
				}
				store.clear();
			}
		} finally {
			store.dispose();
		}
		const label = typeof selected === 'string' ? selected : selected?.name ?? rawModelId;
		this._notificationService.warn(localize('cloudSandbox.modelUnavailable', "Couldn't use {0} in the sandbox. The agent's default model will be used instead.", label));
		return undefined;
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
			// Resolve the workspace repository even before the first sandbox is discovered.
			this._workspaceRepositories.recomputeInitiallyAndOnChange(store);
			this._workspaceRepository.recomputeInitiallyAndOnChange(store);
			store.add(this._editorChatSessionsService.registerChatSessionContribution({
				type: DISCOVERY_SESSION_TYPE,
				name: localize('cloudSandbox.discoveryName', "GitHub Sandboxes"),
				displayName: localize('cloudSandbox.discoveryName', "GitHub Sandboxes"),
				description: localize('cloudSandbox.discoveryDescription', "Existing cloud sandbox sessions."),
				sessionListGroup: SessionType.CopilotCloud,
				hideFromSessionTypePicker: true,
				when: ChatContextKeys.enabled.key,
				canDelegate: false,
				requiresCopilotSignIn: true,
				supportsDelegation: false,
			}));
			// Keep refresh available before discovery has found the first environment.
			store.add(this._editorChatSessionsService.registerChatSessionItemController(DISCOVERY_SESSION_TYPE, this));
		} else {
			void this._discoverAndSeed();
		}
	}

	protected override _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): CloudSandboxSessionListController {
		const address = cloudSandboxAddress(env.environmentId);
		const provider = store.add(this._instantiationService.createInstance(CloudSandboxSessionListController, address, this._workspaceRepositories));
		store.add(this._connectionsService.registerSessionResolutionPolicy(agentHostAuthority(address), {
			sessionSchemeAlias: { ui: CLOUD_SANDBOX_AGENT_PROVIDER, backend: CLOUD_SANDBOX_SESSION_SCHEME },
			defaultChangesetKind: ChangesetKind.Session,
		}));
		store.add(this._workingDirectoryResolver.registerResolver(provider.sessionType, resource => provider.resolveWorkingDirectory(resource), () => false));
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
