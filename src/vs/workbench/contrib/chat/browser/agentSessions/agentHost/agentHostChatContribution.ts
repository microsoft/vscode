/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { mark } from '../../../../../../base/common/performance.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { affectsAgentHostProviderPreference, IAgentHostService, protectedResourcesRequireGitHubCopilotSignIn, shouldSurfaceLocalAgentHostProvider, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { LOCAL_AGENT_HOST_AUTHORITY } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type AgentInfo, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID } from '../../../../../../platform/agentHost/common/agentModelSource.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionsService, isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { languageModelSourcePresentationRegistry } from '../../../common/languageModelSourcePresentation.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { AgentCustomizationItemProvider } from './agentCustomizationItemProvider.js';
import { agentHostProviderHasBuiltInGitHubMcpServer, COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID } from './agentHostMcpServerSupport.js';
import { AgentHostDownloadProgress } from './agentHostDownloadProgress.js';
import { authenticateAgentProtectedResourcesWithToken, authenticateProtectedResources, authenticateProtectedResourcesWithToken, AgentHostAuthenticationRecovery, AgentHostAuthTokenCache, resolveAuthenticationInteractively, revokeAuthenticationForRemovedSessions } from './agentHostAuth.js';
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from './agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from './agentHostSessionHandler.js';
import { AgentHostPromptCacheNotification } from './agentHostPromptCacheNotification.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { IAgentHostProtectedResourcesService } from './agentHostProtectedResourcesService.js';
import { AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';

const LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX = 'agent-host-';

languageModelSourcePresentationRegistry.register({
	ownerVendor: 'agent-host-codex',
	sourceId: CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID,
	label: localize('agentHostModelSource.chatGPT.label', "ChatGPT"),
	icon: Codicon.openai,
	description: localize('agentHostModelSource.chatGPT.description', "Models provided by your ChatGPT subscription"),
});

Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
	matchSessionType: sessionType => isLocalAgentHostTarget(sessionType),
	waitForActivation: waitForLocalAgentHostActivation,
});

async function waitForLocalAgentHostActivation(accessor: ServicesAccessor, sessionType: string): Promise<boolean> {
	const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
	const agentHostService = accessor.get(IAgentHostService);
	const configurationService = accessor.get(IConfigurationService);
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	if (!agentHostEnablementService.enabled.get()) {
		return false;
	}

	const provider = getLocalAgentHostProviderForSessionType(sessionType);
	if (!provider) {
		return false;
	}

	while (true) {
		const rootState = agentHostService.rootState.value;
		if (rootState instanceof Error) {
			return false;
		}
		if (rootState) {
			return rootState.agents.some(agent => agent.provider === provider && shouldSurfaceLocalAgentHostProvider(agent.provider, configurationService, environmentService.isSessionsWindow));
		}

		const changed = await Promise.race([
			Event.toPromise(agentHostService.rootState.onDidChange).then(() => true),
			Event.toPromise(agentHostService.onAgentHostExit).then(() => false),
		]);
		if (!changed) {
			return false;
		}
	}
}

function getLocalAgentHostProviderForSessionType(sessionType: string): AgentProvider | undefined {
	if (!isLocalAgentHostTarget(sessionType) || !sessionType.startsWith(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX)) {
		return undefined;
	}
	return sessionType.slice(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX.length) || undefined;
}

export { AgentHostSessionHandler } from './agentHostSessionHandler.js';

/**
 * Discovers available agents from the agent host process and dynamically
 * registers each one as a chat session type with its own session handler,
 * customization harness, and language model provider.
 *
 * Gated on Agent Host runtime availability.
 */
export class AgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostContribution';

	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	/** Model providers keyed by agent provider, for pushing model updates. */
	private readonly _modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();

	/** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
	private readonly _authTokenCache = new AgentHostAuthTokenCache();
	private readonly _authRecovery = new AgentHostAuthenticationRecovery();

	private readonly _isSessionsWindow: boolean;
	private readonly _enableSmokeTestDriver: boolean;
	private _initialized = false;
	private readonly _enablementStore = this._register(new MutableDisposable<DisposableStore>());
	private _authenticationGeneration = 0;
	private _didStartInitialAuthentication = false;
	private _promptCacheNotification: AgentHostPromptCacheNotification | undefined;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostFileSystemService private readonly _agentHostFileSystemService: IAgentHostFileSystemService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAgentHostActiveClientService private readonly _activeClientService: IAgentHostActiveClientService,
		@IAgentHostProtectedResourcesService private readonly _protectedResourcesService: IAgentHostProtectedResourcesService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();
		this._isSessionsWindow = environmentService.isSessionsWindow;
		this._enableSmokeTestDriver = !!environmentService.enableSmokeTestDriver;

		this._register(autorun(reader => {
			const enabled = this._agentHostEnablementService.enabled.read(reader);
			if (enabled) {
				const wasInitialized = this._initialized;
				this._initialize();
				this._enable();
				const current = this._agentHostService.rootState.value;
				if (wasInitialized && current && !(current instanceof Error)) {
					this._handleRootStateChange(current);
				}
			} else {
				this._authenticationGeneration++;
				this._authTokenCache.clear();
				this._authRecovery.clear();
				this._enablementStore.clear();
				this._agentHostService.setAuthenticationPending(false);
				this._agentRegistrations.clearAndDisposeAll();
				this._modelProviders.clear();
			}
		}));
	}

	private _initialize(): void {
		if (this._initialized) {
			return;
		}
		this._initialized = true;
		this._promptCacheNotification = this._register(this._instantiationService.createInstance(AgentHostPromptCacheNotification));
		this._register(this._agentHostFileSystemService.registerAuthority(LOCAL_AGENT_HOST_AUTHORITY, this._agentHostService));

		// React to root state changes (agent discovery / removal)
		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._handleRootStateChange(rootState);
		}));

		// Process initial root state if already available
		const initialRootState = this._agentHostService.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(initialRootState);
		}

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (!affectsAgentHostProviderPreference(e, this._isSessionsWindow)) {
				return;
			}
			const current = this._agentHostService.rootState.value;
			if (current && !(current instanceof Error)) {
				this._handleRootStateChange(current);
			}
		}));
	}

	private _enable(): void {
		if (this._enablementStore.value) {
			return;
		}
		const store = new DisposableStore();
		store.add(this._agentHostService.onDidNotification(notification => {
			if (notification.type !== NotificationType.AuthRequired) {
				return;
			}
			this._authenticateNotificationResource(notification.resource);
		}));
		store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => {
			this._authenticateWithServer(this._getRootAgents()).catch(() => { /* best-effort */ });
		}));
		store.add(this._authenticationService.onDidRegisterAuthenticationProvider(() => {
			this._authenticateWithServer(this._getRootAgents()).catch(() => { /* best-effort */ });
		}));
		store.add(this._authenticationService.onDidChangeSessions(event => {
			void this._handleAuthenticationSessionsChanged(event.providerId, event.event.removed ?? []);
		}));

		// Surface the agent host's lazy, first-use SDK download as a progress
		// notification. The Agents window renders this via its own sessions
		// provider (`BaseAgentHostSessionsProvider`), so only wire it up here
		// for regular editor windows to avoid duplicate notifications (this
		// contribution runs in both windows). The matching `createSession`
		// opt-in (`progressToken`) lives in the editor-window session handlers.
		if (!this._isSessionsWindow) {
			const downloadProgress = store.add(this._instantiationService.createInstance(AgentHostDownloadProgress));
			store.add(this._agentHostService.onDidNotification(n => {
				if (n.type === NotificationType.Progress) {
					downloadProgress.handleProgress(n);
				}
			}));
		}
		this._enablementStore.value = store;
	}

	private _shouldRegisterAgent(provider: AgentProvider): boolean {
		return shouldSurfaceLocalAgentHostProvider(provider, this._configurationService, this._isSessionsWindow);
	}

	private _handleRootStateChange(rootState: RootState): void {
		if (!this._agentHostEnablementService.enabled.get()) {
			return;
		}
		const allowed = rootState.agents.filter(a => this._shouldRegisterAgent(a.provider));
		const incoming = new Set(allowed.map(a => a.provider));

		// Remove agents that are no longer present OR no longer allowed
		for (const [provider] of this._agentRegistrations) {
			if (!incoming.has(provider)) {
				this._agentRegistrations.deleteAndDispose(provider);
				this._modelProviders.delete(provider);
			}
		}

		// Authenticate using protectedResources from agent info. Only auth the
		// allowed agents so a suppressed provider (e.g. EH-preferred Claude in
		// this window) doesn't trigger token resolution work for an
		// implementation we're not going to bridge.
		this._authenticateWithServer(allowed)
			.catch(() => { /* best-effort */ });

		// Register new agents and push model updates to existing ones
		for (const agent of allowed) {
			if (!this._agentRegistrations.has(agent.provider)) {
				this._registerAgent(agent);
			} else {
				// Push updated models to existing model provider
				const modelProvider = this._modelProviders.get(agent.provider);
				modelProvider?.updateModels(agent.models);
			}
		}
	}

	private _registerAgent(agent: AgentInfo): void {
		const store = new DisposableStore();
		this._agentRegistrations.set(agent.provider, store);
		const sessionType = `agent-host-${agent.provider}`;
		const agentId = sessionType;
		const vendor = sessionType;
		const ahService = this._agentHostService;

		// Chat session contribution.
		store.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName: agent.displayName,
			description: agent.description,
			locations: agent.provider === 'copilotcli' ? [ChatAgentLocation.Chat, ChatAgentLocation.Terminal, ChatAgentLocation.EditorInline] : undefined,
			customAgentTarget: this._isSessionsWindow ? undefined : Target.GitHubCopilot,
			canDelegate: true,
			requiresCustomModels: true,
			supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
			// Derived live from the agent's currently-advertised protected resources
			// (via the protected-resources service): an agent that marks the GitHub
			// Copilot resource `required: false` (Claude in native mode, Codex on
			// OpenAI) is usable without signing in. Falls back to "required" until the
			// agent host resolves. The paired `onDidChangeRequiresCopilotSignIn` lets
			// the sessions service re-evaluate this when the set changes.
			requiresCopilotSignIn: () => {
				const resources = this._protectedResourcesService.getProtectedResources(agent.provider);
				return resources !== undefined ? protectedResourcesRequireGitHubCopilotSignIn(resources) : true;
			},
			onDidChangeRequiresCopilotSignIn: Event.signal(Event.filter(this._protectedResourcesService.onDidChange, provider => provider === agent.provider, store)),
			agentHostProviderId: agent.provider,
			supportsDelegation: false,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
				supportsImageAttachments: true,
				get terminalCommandPrefix() {
					return ahService.initializeResult.get()?.terminalCommandPrefix;
				}
			},
		}));

		const syncProvider = this._activeClientService.getSyncProvider(sessionType);
		// The management UI remains ambient while individual sessions use their working-directory scopes.
		const ambientScope = store.add(this._activeClientService.acquireScope(sessionType, []));

		const itemProvider = store.add(this._instantiationService.createInstance(AgentCustomizationItemProvider, 'local', undefined,
			syncedUri => this._activeClientService.getOrigin(syncedUri)));
		itemProvider.setDraftCustomAgents(ambientScope.customAgents);
		itemProvider.setDraftCustomizations(ambientScope.customizations);
		store.add(this._customizationHarnessService.registerExternalHarness({
			id: sessionType,
			label: agent.displayName,
			icon: ThemeIcon.fromId(Codicon.server.id),
			// The Tools section is surfaced for the Copilot CLI agent host only.
			hiddenSections: agent.provider === 'copilotcli' ? [AICustomizationManagementSection.Prompts] : [AICustomizationManagementSection.Tools, AICustomizationManagementSection.Prompts],
			hideGenerateButton: true,
			syncProvider,
			itemProvider,
			hiddenMcpServerCollectionIds: agentHostProviderHasBuiltInGitHubMcpServer(agent.provider) ? [COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID] : undefined,
		}));

		// Session handler
		const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: agent.displayName,
			description: agent.description,
			connection: this._agentHostService,
			connectionAuthority: LOCAL_AGENT_HOST_AUTHORITY,
			onSessionMaterialized: resource => this._chatSessionsService.notifySessionMaterialized?.(resource),
			resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(resources),
			promptCacheNotification: this._promptCacheNotification,
		}));
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider.
		// Order matters: `updateModels` must be called after
		// `registerLanguageModelProvider` so the initial `onDidChange` is observed.
		// One vendor descriptor for this harness. Claude's `anthropic`/`copilot`
		// model groups (per-session provider selection) resolve their display names
		// from the Copilot extension's pre-existing vendors, so registering them
		// here would add nothing and risk clobbering those shared vendors on dispose.
		const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor, this._languageModelsService));
		this._modelProviders.set(agent.provider, modelProvider);
		store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
		store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
		modelProvider.updateModels(agent.models);

	}

	private async _handleAuthenticationSessionsChanged(providerId: string, removedSessions: readonly AuthenticationSession[]): Promise<void> {
		const agents = this._getRootAgents();
		if (removedSessions.length > 0) {
			const generation = this._authenticationGeneration;
			try {
				await this._instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, providerId, removedSessions, {
					authTokenCache: this._authTokenCache,
					logPrefix: '[AgentHost]',
					isCurrent: () => this._isAuthenticationCurrent(generation),
					authenticate: request => this._authenticateIfCurrent(request, generation),
				});
			} catch (error) {
				if (!isCancellationError(error)) {
					this._logService.error('[AgentHost] Failed to revoke removed authentication session', error);
				}
			}
		}
		await this._authenticateWithServer(agents);
	}

	private _getRootAgents(): readonly AgentInfo[] {
		const rootState = this._agentHostService.rootState.value;
		const agents = (rootState && !(rootState instanceof Error)) ? rootState.agents : [];
		return agents.filter(a => this._shouldRegisterAgent(a.provider));
	}

	/**
	 * Authenticate using protectedResources from agent info in root state.
	 * Resolves tokens via the standard VS Code authentication service.
	 */
	private async _authenticateWithServer(agents: readonly AgentInfo[]): Promise<void> {
		const generation = this._authenticationGeneration;
		if (!this._isAuthenticationCurrent(generation)) {
			return;
		}
		const isInitialAuthentication = agents.length > 0 && !this._didStartInitialAuthentication;
		if (isInitialAuthentication) {
			this._didStartInitialAuthentication = true;
			mark('code/agentHost/willAuthenticate');
		}
		this._agentHostService.setAuthenticationPending(true);
		try {
			const testToken = this._getScenarioAutomationToken();
			if (testToken !== undefined) {
				await authenticateAgentProtectedResourcesWithToken(agents, testToken, {
					authTokenCache: this._authTokenCache,
					isCurrent: () => this._isAuthenticationCurrent(generation),
					authenticate: request => this._authenticateIfCurrent(request, generation),
				});
				return;
			}
			await this._instantiationService.invokeFunction(authenticateProtectedResources, agents, {
				authTokenCache: this._authTokenCache,
				logPrefix: '[AgentHost]',
				isCurrent: () => this._isAuthenticationCurrent(generation),
				authenticate: request => this._authenticateIfCurrent(request, generation),
			});
		} catch (err) {
			if (!isCancellationError(err)) {
				this._logService.error('[AgentHost] Failed to authenticate with server', err);
			}
		} finally {
			if (this._isAuthenticationCurrent(generation)) {
				this._agentHostService.setAuthenticationPending(false);
			}
			if (isInitialAuthentication) {
				mark('code/agentHost/didAuthenticate');
			}
		}
	}

	private _authenticateNotificationResource(protectedResource: ProtectedResourceMetadata): void {
		const generation = this._authenticationGeneration;
		if (!this._isAuthenticationCurrent(generation)) {
			return;
		}
		this._agentHostService.setAuthenticationPending(true);
		this._instantiationService.invokeFunction(accessor => this._authRecovery.recover(accessor, protectedResource, {
			authTokenCache: this._authTokenCache,
			logPrefix: '[AgentHost]',
			isCurrent: () => this._isAuthenticationCurrent(generation),
			authenticate: request => this._authenticateIfCurrent(request, generation),
		}))
			.catch(err => {
				if (!isCancellationError(err)) {
					this._logService.error(`[AgentHost] Failed to authenticate notified resource ${protectedResource.resource}`, err);
				}
			})
			.finally(() => {
				if (this._isAuthenticationCurrent(generation)) {
					this._agentHostService.setAuthenticationPending(false);
				}
			});
	}

	/**
	 * Interactively prompt the user to authenticate when the server requires it.
	 * Uses protectedResources from root state, resolves the auth provider,
	 * creates a session (which triggers the login UI), and pushes the token
	 * to the server. Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(protectedResources: ProtectedResourceMetadata[]): Promise<boolean> {
		const generation = this._authenticationGeneration;
		if (!this._isAuthenticationCurrent(generation)) {
			return false;
		}
		const testToken = this._getScenarioAutomationToken();
		if (testToken !== undefined) {
			await authenticateProtectedResourcesWithToken(protectedResources, testToken, {
				authTokenCache: this._authTokenCache,
				isCurrent: () => this._isAuthenticationCurrent(generation),
				authenticate: request => this._authenticateIfCurrent(request, generation),
			});
			return protectedResources.length > 0;
		}
		return this._instantiationService.invokeFunction(resolveAuthenticationInteractively, protectedResources, {
			authTokenCache: this._authTokenCache,
			logPrefix: '[AgentHost]',
			isCurrent: () => this._isAuthenticationCurrent(generation),
			authenticate: request => this._authenticateIfCurrent(request, generation),
		});
	}

	private _getScenarioAutomationToken(): string | undefined {
		// Smoke-test escape hatch.
		if (!this._enableSmokeTestDriver) {
			return undefined;
		}
		const token = this._configurationService.getValue('chat.agentHost.unsafeTestToken');
		return typeof token === 'string' && token.length > 0 ? token : undefined;
	}

	private _isAuthenticationCurrent(generation: number): boolean {
		return generation === this._authenticationGeneration && this._agentHostEnablementService.enabled.get();
	}

	private _authenticateIfCurrent(request: { resource: string; scopes?: readonly string[]; token: string }, generation: number): Promise<unknown> {
		if (!this._isAuthenticationCurrent(generation)) {
			return Promise.reject(new CancellationError());
		}
		return this._agentHostService.authenticate(request);
	}
}
