/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostEnabledSettingId, claudePreferAgentHostSettingId, IAgentHostService, shouldSurfaceLocalAgentHostProvider, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
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
import { authenticateProtectedResources, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from './agentHostAuth.js';
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from './agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from './agentHostSessionHandler.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';

const LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX = 'agent-host-';

Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
	matchSessionType: sessionType => isLocalAgentHostTarget(sessionType),
	waitForActivation: waitForLocalAgentHostActivation,
});

async function waitForLocalAgentHostActivation(accessor: ServicesAccessor, sessionType: string): Promise<boolean> {
	const configurationService = accessor.get(IConfigurationService);
	if (!configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
		return false;
	}

	const provider = getLocalAgentHostProviderForSessionType(sessionType);
	if (!provider) {
		return false;
	}

	const agentHostService = accessor.get(IAgentHostService);
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
	) {
		super();
		this._isSessionsWindow = environmentService.isSessionsWindow;
		this._enableSmokeTestDriver = !!environmentService.enableSmokeTestDriver;

		if (!this._configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
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

		// Process initial root state if already available
		const initialRootState = this._agentHostService.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(initialRootState);
		}

		// React to per-window preference flips for AH-vs-EH Claude. The
		// extension's `chatSessions` contribution gates the EH side declaratively
		// via its `when` clause; we mirror that on the AH side by toggling
		// registration of the `claude` provider inside this window. Flipping
		// the relevant setting unregisters / re-registers Claude live.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			const relevantSetting = claudePreferAgentHostSettingId(this._isSessionsWindow);
			if (!e.affectsConfiguration(relevantSetting)) {
				return;
			}
			const current = this._agentHostService.rootState.value;
			if (current && !(current instanceof Error)) {
				this._handleRootStateChange(current);
			}
		}));
	}

	/**
	 * Whether this window wants the given agent registered, given the
	 * per-window AH/EH preference settings. Today only the `claude` provider
	 * has dual implementations (EH from the Copilot extension, AH from inside
	 * the agent host process) and a corresponding preference; all other
	 * providers are AH-only and unconditionally allowed.
	 *
	 * Symmetric with the EH-side gate that lives in the extension's
	 * `chatSessions` contribution `when` clause:
	 *   - Agents Window  → `chat.agents.claude.preferAgentHost`
	 *   - Editor Window  → `chat.editor.claude.preferAgentHost`
	 *
	 * If the relevant setting is `false`, the EH Claude is the one that
	 * surfaces in this window, so the AH side suppresses its own registration
	 * to avoid Claude appearing twice in the same window.
	 */
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
			},
		}));

		const agentRegistration = store.add(this._activeClientService.registerForAgent(sessionType));
		const syncProvider = agentRegistration.syncProvider;

		const itemProvider = store.add(this._instantiationService.createInstance(AgentCustomizationItemProvider, 'local', undefined));
		// `[Agent Host]` suffix disambiguates from the extension-host Copilot CLI harness, which uses the same displayName.
		store.add(this._customizationHarnessService.registerExternalHarness({
			id: sessionType,
			label: localize('agentHostHarnessLabel.local', "{0} [Agent Host]", agent.displayName),
			icon: ThemeIcon.fromId(Codicon.server.id),
			// The Tools section is surfaced for the Copilot CLI agent host only.
			hiddenSections: agent.provider === 'copilotcli' ? [AICustomizationManagementSection.Prompts] : [AICustomizationManagementSection.Tools, AICustomizationManagementSection.Prompts],
			hideGenerateButton: true,
			getStorageSourceFilter: () => ({ sources: AICustomizationSources.all }),
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
			await authenticateProtectedResources(agents, {
				authTokenCache: this._authTokenCache,
				authenticationService: this._authenticationService,
				logPrefix: '[AgentHost]',
				logService: this._logService,
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
				await this._agentHostService.authenticate({ resource: resource.resource, token: testToken });
				this._authTokenCache.updateAndIsChanged(resource.resource, resource.scopes_supported, testToken);
			}
			return protectedResources.length > 0;
		}
		try {
			return await resolveAuthenticationInteractively(protectedResources, {
				authTokenCache: this._authTokenCache,
				authenticationService: this._authenticationService,
				logPrefix: '[AgentHost]',
				logService: this._logService,
				authenticate: request => this._agentHostService.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[AgentHost] Interactive authentication failed', err);
		}
		return false;
	}

	private async _seedTestToken(agents: readonly AgentInfo[], token: string): Promise<void> {
		for (const agent of agents) {
			for (const resource of agent.protectedResources ?? []) {
				if (!this._authTokenCache.updateAndIsChanged(resource.resource, resource.scopes_supported, token)) {
					continue;
				}
				try {
					await this._agentHostService.authenticate({ resource: resource.resource, token });
				} catch (err) {
					this._authTokenCache.clear(resource.resource);
					throw err;
				}
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
