/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentHostEnabledSettingId, IAgentHostService, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI, type IAgentInfo, type ICustomizationRef, type IRootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { AgentCustomizationSyncProvider } from './agentCustomizationSyncProvider.js';
import { resolveTokenForResource } from './agentHostAuth.js';
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
	private _clientState: SessionClientState | undefined;
	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	/** Model providers keyed by agent provider, for pushing model updates. */
	private readonly _modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();

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
	) {
		super();

		if (!configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		// Wrap the agent host service with logging to a dedicated output channel
		this._loggedConnection = this._register(this._instantiationService.createInstance(
			LoggingAgentConnection,
			this._agentHostService,
			'agentHostIpc.local',
			'Agent Host (Local)'));

		this._register(_agentHostFileSystemService.registerAuthority('local', this._agentHostService));

		// Shared client state for protocol reconciliation
		this._clientState = this._register(new SessionClientState(this._agentHostService.clientId, this._logService, () => this._agentHostService.nextClientSeq()));

		// Forward action envelopes from the host to client state
		this._register(this._loggedConnection.onDidAction(envelope => {
			// Only root actions are relevant here; session actions are
			// handled by individual session handlers.
			if (!isSessionAction(envelope.action)) {
				this._clientState!.receiveEnvelope(envelope);
			}
		}));

		// Forward notifications to client state
		this._register(this._loggedConnection.onDidNotification(n => {
			this._clientState!.receiveNotification(n);
		}));

		// React to root state changes (agent discovery / removal)
		this._register(this._clientState.onDidChangeRootState(rootState => {
			this._handleRootStateChange(rootState);
		}));

		this._initializeAndSubscribe();
	}

	private async _initializeAndSubscribe(): Promise<void> {
		try {
			const snapshot = await this._loggedConnection!.subscribe(URI.parse(ROOT_STATE_URI));
			if (this._store.isDisposed) {
				return;
			}
			// Feed snapshot into client state - fires onDidChangeRootState
			this._clientState!.handleSnapshot(ROOT_STATE_URI, snapshot.state, snapshot.fromSeq);
		} catch (err) {
			this._logService.error('[AgentHost] Failed to subscribe to root state', err);
			this._loggedConnection!.logError('subscribe(root)', err);
		}
	}

	private _handleRootStateChange(rootState: IRootState): void {
		const incoming = new Set(rootState.agents.map(a => a.provider));

		// Remove agents that are no longer present
		for (const [provider] of this._agentRegistrations) {
			if (!incoming.has(provider)) {
				this._agentRegistrations.deleteAndDispose(provider);
				this._modelProviders.delete(provider);
			}
		}

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

	private _registerAgent(agent: IAgentInfo): void {
		const store = new DisposableStore();
		this._agentRegistrations.set(agent.provider, store);
		const sessionType = `agent-host-${agent.provider}`;
		const agentId = sessionType;
		const vendor = sessionType;

		// Chat session contribution
		store.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName: agent.displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
		}));

		// Session list controller
		const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider, this._loggedConnection!, undefined));
		store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));

		// Customization sync provider + bundler + observable
		const syncProvider = store.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
		const bundler = store.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));
		store.add(this._customizationHarnessService.registerExternalHarness({
			id: sessionType,
			label: agent.displayName,
			icon: ThemeIcon.fromId(Codicon.server.id),
			hiddenSections: [],
			hideGenerateButton: true,
			getStorageSourceFilter: () => ({ sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin] }),
			syncProvider,
		}));

		const customizations = observableValue<ICustomizationRef[]>('agentCustomizations', []);
		const updateCustomizations = async () => {
			const refs = await this._resolveCustomizations(syncProvider, bundler);
			customizations.set(refs, undefined);
		};
		store.add(syncProvider.onDidChange(() => updateCustomizations()));
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
			resolveAuthentication: () => this._resolveAuthenticationInteractively(),
			customizations,
		}));
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider
		const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		modelProvider.updateModels(agent.models);
		this._modelProviders.set(agent.provider, modelProvider);
		store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
		store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));

		// Push auth token and refresh models from server
		this._authenticateWithServer().then(() => this._loggedConnection!.refreshModels()).catch(() => { /* best-effort */ });
		store.add(this._defaultAccountService.onDidChangeDefaultAccount(() =>
			this._authenticateWithServer().then(() => this._loggedConnection!.refreshModels()).catch(() => { /* best-effort */ })));
		store.add(this._authenticationService.onDidChangeSessions(() =>
			this._authenticateWithServer().then(() => this._loggedConnection!.refreshModels()).catch(() => { /* best-effort */ })));
	}

	/**
	 * Resolves the customizations to include in the active client set.
	 *
	 * Classifies sync provider entries as plugins (matched against
	 * installed plugins) or individual files (bundled into a synthetic
	 * Open Plugin).
	 */
	private async _resolveCustomizations(
		syncProvider: AgentCustomizationSyncProvider,
		bundler: SyncedCustomizationBundler,
	): Promise<ICustomizationRef[]> {
		const entries = syncProvider.getSelectedEntries();
		if (entries.length === 0) {
			return [];
		}

		const plugins = this._agentPluginService.plugins.get();
		const refs: ICustomizationRef[] = [];
		const individualFiles: { uri: URI; type: PromptsType }[] = [];

		for (const entry of entries) {
			const plugin = plugins.find(p => isEqualOrParent(entry.uri, p.uri));
			if (plugin) {
				refs.push({
					uri: plugin.uri.toString() as ProtocolURI,
					displayName: plugin.label,
				});
			} else if (entry.type) {
				individualFiles.push({ uri: entry.uri, type: entry.type });
			}
		}

		if (individualFiles.length > 0) {
			const result = await bundler.bundle(individualFiles);
			if (result) {
				refs.push(result.ref);
			}
		}

		return refs;
	}

	/**
	 * Discover auth requirements from the server's resource metadata
	 * and authenticate using matching tokens resolved via the standard
	 * VS Code authentication service (same flow as MCP auth).
	 */
	private async _authenticateWithServer(): Promise<void> {
		try {
			const metadata = await this._loggedConnection!.getResourceMetadata();
			this._logService.trace(`[AgentHost] Resource metadata: ${metadata.resources.length} resource(s)`);
			for (const resource of metadata.resources) {
				const resourceUri = URI.parse(resource.resource);
				const token = await this._resolveTokenForResource(resourceUri, resource.authorization_servers ?? [], resource.scopes_supported ?? []);
				if (token) {
					this._logService.info(`[AgentHost] Authenticating for resource: ${resource.resource}`);
					await this._loggedConnection!.authenticate({ resource: resource.resource, token });
				} else {
					this._logService.info(`[AgentHost] No token resolved for resource: ${resource.resource}`);
				}
			}
		} catch (err) {
			this._logService.error('[AgentHost] Failed to authenticate with server', err);
			this._loggedConnection!.logError('authenticateWithServer', err);
		}
	}

	/**
	 * Resolve a bearer token for a set of authorization servers using the
	 * standard VS Code authentication service provider resolution.
	 */
	private _resolveTokenForResource(resourceServer: URI, authorizationServers: readonly string[], scopes: readonly string[]): Promise<string | undefined> {
		return resolveTokenForResource(resourceServer, authorizationServers, scopes, this._authenticationService, this._logService, '[AgentHost]');
	}

	/**
	 * Interactively prompt the user to authenticate when the server requires it.
	 * Fetches resource metadata, resolves the auth provider, creates a session
	 * (which triggers the login UI), and pushes the token to the server.
	 * Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(): Promise<boolean> {
		try {
			const metadata = await this._loggedConnection!.getResourceMetadata();
			for (const resource of metadata.resources) {
				for (const server of resource.authorization_servers ?? []) {
					const serverUri = URI.parse(server);
					const resourceUri = URI.parse(resource.resource);
					const providerId = await this._authenticationService.getOrActivateProviderIdForServer(serverUri, resourceUri);
					if (!providerId) {
						continue;
					}

					// createSession will show the login UI if no session exists
					const scopes = [...(resource.scopes_supported ?? [])];
					const session = await this._authenticationService.createSession(providerId, scopes, {
						activateImmediate: true,
						authorizationServer: serverUri,
					});

					await this._loggedConnection!.authenticate({
						resource: resource.resource,
						token: session.accessToken,
					});
					this._logService.info(`[AgentHost] Interactive authentication succeeded for ${resource.resource}`);
					return true;
				}
			}
		} catch (err) {
			this._logService.error('[AgentHost] Interactive authentication failed', err);
			this._loggedConnection!.logError('resolveAuthenticationInteractively', err);
		}
		return false;
	}
}
