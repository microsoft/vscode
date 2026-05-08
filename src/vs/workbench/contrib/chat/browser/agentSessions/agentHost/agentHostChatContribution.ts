/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostEnabledSettingId, IAgentHostService, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo, type CustomizationRef, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { AgentCustomizationSyncProvider } from './agentCustomizationSyncProvider.js';
import { LocalAgentHostCustomizationItemProvider, resolveCustomizationRefs } from './agentHostLocalCustomizations.js';
import { authenticateProtectedResources, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from './agentHostAuth.js';
import { AgentHostLanguageModelProvider } from './agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from './agentHostSessionHandler.js';
import { AgentHostSessionListController } from './agentHostSessionListController.js';
import { LoggingAgentConnection } from './loggingAgentConnection.js';
import { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';

export { AgentHostSessionHandler } from './agentHostSessionHandler.js';
export { AgentHostSessionListController } from './agentHostSessionListController.js';

/**
 * Discovers available agents from the agent host process and dynamically
 * registers each one as a chat session type with its own session handler,
 * list controller, and language model provider.
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostContribution';

	private _loggedConnection: LoggingAgentConnection | undefined;

	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	/** Model providers keyed by agent provider, for pushing model updates. */
	private readonly _modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();
	/** List controllers keyed by agent provider, for cache resets on reconnect. */
	private readonly _listControllers = new Map<AgentProvider, AgentHostSessionListController>();

	/** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
	private readonly _authTokenCache = new AgentHostAuthTokenCache();

	private readonly _isSessionsWindow: boolean;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostFileSystemService _agentHostFileSystemService: IAgentHostFileSystemService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._isSessionsWindow = environmentService.isSessionsWindow;

		if (!configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		// Wrap the agent host service with logging to a dedicated output channel
		this._loggedConnection = this._register(this._instantiationService.createInstance(
			LoggingAgentConnection,
			this._agentHostService,
			`agenthost.${this._agentHostService.clientId}`,
			'Agent Host (Local)'));

		this._register(_agentHostFileSystemService.registerAuthority('local', this._agentHostService));

		// React to root state changes (agent discovery / removal)
		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._handleRootStateChange(rootState);
		}));

		// Clear the auth cache whenever the local agent host (re)starts so the
		// first post-restart authenticate RPC is never skipped as "unchanged".
		// Also reset each list controller's session cache so the next refresh
		// re-fetches via listSessions() rather than serving a stale in-memory list.
		this._register(this._agentHostService.onAgentHostStart(() => {
			this._authTokenCache.clear();
			for (const controller of this._listControllers.values()) {
				controller.resetCache();
			}
		}));

		// Process initial root state if already available
		const initialRootState = this._agentHostService.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(initialRootState);
		}
	}

	private _handleRootStateChange(rootState: RootState): void {
		const incoming = new Set(rootState.agents.map(a => a.provider));

		// Remove agents that are no longer present
		for (const [provider] of this._agentRegistrations) {
			if (!incoming.has(provider)) {
				this._agentRegistrations.deleteAndDispose(provider);
				this._modelProviders.delete(provider);
			}
		}

		// Authenticate using protectedResources from agent info
		this._authenticateWithServer(rootState.agents)
			.catch(() => { /* best-effort */ });

		// Register new agents and push model updates to existing ones
		for (const agent of rootState.agents) {
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

		// In the Agents app, the agent-host displayName is unambiguous because
		// only agent-host sessions exist there. In VS Code, the same picker
		// also lists the extension-host harness with the same displayName
		// (e.g. "Copilot CLI"), so suffix with "- Agent Host" to disambiguate.
		const displayName = this._isSessionsWindow
			? agent.displayName
			: localize('agentHost.displayName', "{0} - Agent Host", agent.displayName);

		// Chat session contribution.
		// In the Agents app, hide the delegation picker for local agent host
		// sessions (matches behavior of remote agent host sessions). In VS Code,
		// keep the picker available so users can hand off to other targets.
		store.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
			supportsDelegation: !this._isSessionsWindow,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
			},
		}));

		// Session list controller
		const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider, this._loggedConnection!, undefined, 'local'));
		this._listControllers.set(agent.provider, listController);
		store.add({ dispose: () => this._listControllers.delete(agent.provider) });
		store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));

		// Customization disable provider + item provider + bundler + observable
		const syncProvider = store.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
		const itemProvider = store.add(new LocalAgentHostCustomizationItemProvider(this._promptsService, sessionType, syncProvider));
		const bundler = store.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));
		// Distinguish from the extension-host Copilot CLI harness, which
		// registers under the same `Copilot CLI` displayName via the chat
		// session customization provider API. Without the `[Local]` suffix
		// both harnesses render identically in the customizations view.
		// Matches the workspace-label convention from
		// `buildAgentHostSessionWorkspace` and the provider-name in
		// `getAgentSessionProviderName(AgentHostCopilot)`.
		store.add(this._customizationHarnessService.registerExternalHarness({
			id: sessionType,
			label: localize('agentHostHarnessLabel.local', "{0} [Local]", agent.displayName),
			icon: ThemeIcon.fromId(Codicon.server.id),
			hiddenSections: [],
			hideGenerateButton: true,
			getStorageSourceFilter: () => ({ sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin] }),
			syncProvider,
			itemProvider,
		}));

		const customizations = observableValue<CustomizationRef[]>('agentCustomizations', []);
		const updateCustomizations = async () => {
			const refs = await resolveCustomizationRefs(this._promptsService, syncProvider, this._agentPluginService, bundler, sessionType);
			customizations.set(refs, undefined);
		};
		store.add(syncProvider.onDidChange(() => updateCustomizations()));
		store.add(Event.any(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
		)(() => updateCustomizations()));
		updateCustomizations(); // resolve initial state

		// Session handler
		const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: agent.displayName,
			description: agent.description,
			connection: this._loggedConnection!,
			connectionAuthority: 'local',
			isNewSession: sessionResource => listController.isNewSession(sessionResource),
			resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(resources),
			customizations,
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
		return (rootState && !(rootState instanceof Error)) ? rootState.agents : [];
	}

	/**
	 * Authenticate using protectedResources from agent info in root state.
	 * Resolves tokens via the standard VS Code authentication service.
	 */
	private async _authenticateWithServer(agents: readonly AgentInfo[]): Promise<void> {
		this._agentHostService.setAuthenticationPending(true);
		try {
			await authenticateProtectedResources(agents, {
				authTokenCache: this._authTokenCache,
				authenticationService: this._authenticationService,
				logPrefix: '[AgentHost]',
				logService: this._logService,
				authenticate: request => this._loggedConnection!.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[AgentHost] Failed to authenticate with server', err);
			this._loggedConnection!.logError('authenticateWithServer', err);
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
		try {
			return await resolveAuthenticationInteractively(protectedResources, {
				authTokenCache: this._authTokenCache,
				authenticationService: this._authenticationService,
				logPrefix: '[AgentHost]',
				logService: this._logService,
				authenticate: request => this._loggedConnection!.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[AgentHost] Interactive authentication failed', err);
			this._loggedConnection!.logError('resolveAuthenticationInteractively', err);
		}
		return false;
	}
}
