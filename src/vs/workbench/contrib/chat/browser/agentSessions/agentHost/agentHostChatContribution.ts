/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { affectsAgentHostProviderPreference, IAgentHostService, shouldSurfaceLocalAgentHostProvider, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type AgentInfo, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionsService, isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { AgentCustomizationItemProvider } from './agentCustomizationItemProvider.js';
import { AgentHostDownloadProgress } from './agentHostDownloadProgress.js';
import { authenticateProtectedResources, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from './agentHostAuth.js';
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from './agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from './agentHostSessionHandler.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';

const LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX = 'agent-host-';

Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
	matchSessionType: sessionType => isLocalAgentHostTarget(sessionType),
	waitForActivation: waitForLocalAgentHostActivation,
});

async function waitForLocalAgentHostActivation(accessor: ServicesAccessor, sessionType: string): Promise<boolean> {
	const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
	if (!agentHostEnablementService.enabled) {
		return false;
	}

	const provider = getLocalAgentHostProviderForSessionType(sessionType);
	if (!provider) {
		return false;
	}

	const agentHostService = accessor.get(IAgentHostService);
	const configurationService = accessor.get(IConfigurationService);
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
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
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostContribution';

	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	/** Model providers keyed by agent provider, for pushing model updates. */
	private readonly _modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();

	/** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
	private readonly _authTokenCache = new AgentHostAuthTokenCache();

	private readonly _isSessionsWindow: boolean;
	private readonly _enableSmokeTestDriver: boolean;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostFileSystemService _agentHostFileSystemService: IAgentHostFileSystemService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAgentHostActiveClientService private readonly _activeClientService: IAgentHostActiveClientService,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();
		this._isSessionsWindow = environmentService.isSessionsWindow;
		this._enableSmokeTestDriver = !!environmentService.enableSmokeTestDriver;

		if (!agentHostEnablementService.enabled) {
			return;
		}

		this._register(_agentHostFileSystemService.registerAuthority('local', this._agentHostService));

		// React to root state changes (agent discovery / removal)
		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._handleRootStateChange(rootState);
		}));

		// Clear the auth cache whenever the local agent host (re)starts so the
		// first post-restart authenticate RPC is never skipped as "unchanged".
		this._register(this._agentHostService.onAgentHostStart(() => {
			this._authTokenCache.clear();
		}));

		// Surface the agent host's lazy, first-use SDK download as a progress
		// notification. The Agents window renders this via its own sessions
		// provider (`BaseAgentHostSessionsProvider`), so only wire it up here
		// for regular editor windows to avoid duplicate notifications (this
		// contribution runs in both windows). The matching `createSession`
		// opt-in (`progressToken`) lives in the editor-window session handlers.
		if (!this._isSessionsWindow) {
			const downloadProgress = this._register(this._instantiationService.createInstance(AgentHostDownloadProgress));
			this._register(this._agentHostService.onDidNotification(n => {
				if (n.type === NotificationType.Progress) {
					downloadProgress.handleProgress(n);
				}
			}));
		}

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

	private _shouldRegisterAgent(provider: AgentProvider): boolean {
		return shouldSurfaceLocalAgentHostProvider(provider, this._configurationService, this._isSessionsWindow);
	}

	private _handleRootStateChange(rootState: RootState): void {
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
		// Keep the delegation picker available for local agent host sessions in
		// both VS Code and the Agents app so users can hand off (continue) their
		// conversation to any other agent host session or remote target.
		store.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName: agent.displayName,
			description: agent.description,
			customAgentTarget: this._isSessionsWindow ? undefined : Target.GitHubCopilot,
			canDelegate: true,
			requiresCustomModels: true,
			supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
			requiresCopilotSignIn: true,
			agentHostProviderId: agent.provider,
			supportsDelegation: true,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
				supportsImageAttachments: true,
				get terminalCommandPrefix() {
					return ahService.initializeResult.get()?.terminalCommandPrefix;
				}
			},
		}));

		const agentRegistration = store.add(this._activeClientService.registerForAgent(sessionType));
		const syncProvider = agentRegistration.syncProvider;

		const itemProvider = store.add(this._instantiationService.createInstance(AgentCustomizationItemProvider, 'local', undefined,
			syncedUri => agentRegistration.bundler.getOrigin(syncedUri)));
		// `[Agent Host]` suffix disambiguates from the extension-host Copilot CLI harness, which uses the same displayName.
		store.add(this._customizationHarnessService.registerExternalHarness({
			id: sessionType,
			label: localize('agentHostHarnessLabel.local', "{0} [Agent Host]", agent.displayName),
			icon: ThemeIcon.fromId(Codicon.server.id),
			// The Tools section is surfaced for the Copilot CLI agent host only.
			hiddenSections: agent.provider === 'copilotcli' ? [AICustomizationManagementSection.Prompts] : [AICustomizationManagementSection.Tools, AICustomizationManagementSection.Prompts],
			hideGenerateButton: true,
			syncProvider,
			itemProvider,
		}));

		// Session handler
		const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: agent.displayName,
			description: agent.description,
			connection: this._agentHostService,
			connectionAuthority: 'local',
			resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(resources),
		}));
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider.
		// Order matters: `updateModels` must be called after
		// `registerLanguageModelProvider` so the initial `onDidChange` is observed.
		const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		this._modelProviders.set(agent.provider, modelProvider);
		store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
		store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
		modelProvider.updateModels(agent.models);

		// Re-authenticate when credentials change
		store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => {
			const agents = this._getRootAgents();
			this._authenticateWithServer(agents).catch(() => { /* best-effort */ });
		}));
		store.add(this._authenticationService.onDidChangeSessions(() => {
			const agents = this._getRootAgents();
			this._authenticateWithServer(agents).catch(() => { /* best-effort */ });
		}));
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
		this._agentHostService.setAuthenticationPending(true);
		try {
			const testToken = this._getScenarioAutomationToken();
			if (testToken !== undefined) {
				await this._seedTestToken(agents, testToken);
				return;
			}
			await this._instantiationService.invokeFunction(authenticateProtectedResources, agents, {
				authTokenCache: this._authTokenCache,
				logPrefix: '[AgentHost]',
				authenticate: request => this._agentHostService.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[AgentHost] Failed to authenticate with server', err);
		} finally {
			this._agentHostService.setAuthenticationPending(false);
		}
	}

	/**
	 * Interactively prompt the user to authenticate when the server requires it.
	 * Uses protectedResources from root state, resolves the auth provider,
	 * creates a session (which triggers the login UI), and pushes the token
	 * to the server. Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(protectedResources: ProtectedResourceMetadata[]): Promise<boolean> {
		const testToken = this._getScenarioAutomationToken();
		if (testToken !== undefined) {
			for (const resource of protectedResources) {
				await this._authTokenCache.authenticate(
					resource.resource,
					resource.scopes_supported,
					testToken,
					() => this._agentHostService.authenticate({ resource: resource.resource, token: testToken }),
				);
			}
			return protectedResources.length > 0;
		}
		return this._instantiationService.invokeFunction(resolveAuthenticationInteractively, protectedResources, {
			authTokenCache: this._authTokenCache,
			logPrefix: '[AgentHost]',
			authenticate: request => this._agentHostService.authenticate(request),
		});
	}

	private async _seedTestToken(agents: readonly AgentInfo[], token: string): Promise<void> {
		for (const agent of agents) {
			for (const resource of agent.protectedResources ?? []) {
				await this._authTokenCache.authenticate(
					resource.resource,
					resource.scopes_supported,
					token,
					() => this._agentHostService.authenticate({ resource: resource.resource, token }),
				);
			}
		}
	}

	private _getScenarioAutomationToken(): string | undefined {
		// Smoke-test escape hatch.
		if (!this._enableSmokeTestDriver) {
			return undefined;
		}
		const token = this._configurationService.getValue('chat.agentHost.unsafeTestToken');
		return typeof token === 'string' && token.length > 0 ? token : undefined;
	}
}
