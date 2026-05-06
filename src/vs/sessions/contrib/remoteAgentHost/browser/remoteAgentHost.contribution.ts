/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { type AgentProvider, type IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, getEntryAddress } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TunnelAgentHostsSettingId } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { PROTOCOL_VERSION } from '../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { AgentHostLocalFilePermissionsSettingId } from '../../../../platform/agentHost/common/agentHostPermissionService.js';
import { type ProtectedResourceMetadata } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo, type CustomizationRef, type RootState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { OpenSessionEventsFileAction } from '../../agentHost/browser/openSessionEventsFileActions.js';
import { AgentCustomizationSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';
import { authenticateProtectedResources, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { AgentHostLanguageModelProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { LoggingAgentConnection } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { resolveCustomizationRefs } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLocalCustomizations.js';
import { IAgentHostFileSystemService } from '../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { remoteAgentHostSessionTypeId } from '../common/remoteAgentHostSessionType.js';
import { createRemoteAgentHarnessDescriptor, RemoteAgentCustomizationItemProvider, RemoteAgentPluginController } from './remoteAgentHostCustomizationHarness.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
import { ISSHRemoteAgentHostService } from '../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logTerminalRecovery } from '../../../common/sessionsTelemetry.js';

/** Per-connection state bundle, disposed when a connection is removed. */
class ConnectionState extends Disposable {
	readonly store = this._register(new DisposableStore());
	readonly agents = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	readonly modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();
	readonly loggedConnection: LoggingAgentConnection;
	/** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
	readonly authTokenCache = new AgentHostAuthTokenCache();

	constructor(
		readonly name: string | undefined,
		connection: IAgentConnection,
		channelId: string,
		channelLabel: string,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.loggedConnection = this._register(instantiationService.createInstance(LoggingAgentConnection, connection, channelId, channelLabel));
	}
}

/**
 * Discovers available agents from each connected remote agent host and
 * dynamically registers each one as a chat session type with its own
 * session handler and language model provider.
 *
 * Uses the same unified {@link AgentHostSessionHandler} as the local
 * agent host, obtaining per-connection {@link IAgentConnection}
 * instances from {@link IRemoteAgentHostService.getConnection}.
 */
export class RemoteAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.remoteAgentHostContribution';

	/** Per-connection state: client state + per-agent registrations. */
	private readonly _connections = this._register(new DisposableMap<string, ConnectionState>());

	/** Per-address sessions provider, registered for all configured entries. */
	private readonly _providerStores = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _providerInstances = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _pendingSSHReconnects = new Set<string>();

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostFileSystemService private readonly _agentHostFileSystemService: IAgentHostFileSystemService,
		@ISSHRemoteAgentHostService private readonly _sshService: ISSHRemoteAgentHostService,
		@IAICustomizationWorkspaceService private readonly _customizationWorkspaceService: IAICustomizationWorkspaceService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IPromptsService private readonly _promptsService: IPromptsService,
	) {
		super();

		// Reconcile providers when configured entries change
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostAutoConnectSettingId)) {
				this._reconcile();
			}
		}));

		// Reconcile when connections change (added/removed/reconnected)
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._reconcile();
		}));

		// Push auth token whenever the default account or sessions change
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._authenticateAllConnections()));
		this._register(this._authenticationService.onDidChangeSessions(() => this._authenticateAllConnections()));

		// Initial setup for configured entries and connected remotes
		this._reconcile();
	}

	private _reconcile(): void {
		this._reconcileProviders();
		this._reconcileConnections();
		this._reconnectSSHEntries();

		// Ensure every live connection is wired to its provider.
		// This covers the case where a provider was recreated (e.g. name
		// change) while a connection for that address already existed —
		// we need to re-expose both the connection and the output channel,
		// otherwise `Show Output` on the recreated provider would break.
		for (const [address, connState] of this._connections) {
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			const provider = this._providerInstances.get(address);
			if (provider) {
				provider.setConnection(connState.loggedConnection, connectionInfo?.defaultDirectory);
				provider.setOutputChannelId(connState.loggedConnection.channelId);
			}
		}

		// Update connection status on all providers (including those
		// that are reconnecting and don't have an active connection).
		for (const [address, provider] of this._providerInstances) {
			// Preserve incompatible state — set by the SSH catch and the
			// generic WebSocket connect failure path. Otherwise this loop
			// would overwrite it back to `disconnected` on the next event.
			if (RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
				continue;
			}
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo) {
				provider.setConnectionStatus(connectionInfo.status);
			} else {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}

	private _reconcileProviders(): void {
		const enabled = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		const entries = enabled ? this._remoteAgentHostService.configuredEntries : [];
		const desiredAddresses = new Set(entries.map(e => getEntryAddress(e)));

		// Remove providers no longer configured
		for (const [address] of this._providerStores) {
			if (!desiredAddresses.has(address)) {
				this._providerStores.deleteAndDispose(address);
			}
		}

		// Add or recreate providers for configured entries
		for (const entry of entries) {
			const address = getEntryAddress(entry);
			const existing = this._providerInstances.get(address);
			if (existing && existing.label !== (entry.name || address)) {
				// Name changed — recreate since ISessionsProvider.label is readonly
				this._providerStores.deleteAndDispose(address);
			}
			if (!this._providerStores.has(address)) {
				this._createProvider(entry);
			}
		}
	}

	private _createProvider(entry: IRemoteAgentHostEntry): void {
		const address = getEntryAddress(entry);
		const store = new DisposableStore();
		const provider = this._instantiationService.createInstance(
			RemoteAgentHostSessionsProvider, { address, name: entry.name });
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(address)));
		this._providerStores.set(address, store);
	}

	/**
	 * Re-establish SSH connections for configured entries that have an
	 * sshConfigHost but no active connection.
	 */
	private _reconnectSSHEntries(): void {
		const autoConnect = this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId);
		const entries = this._remoteAgentHostService.configuredEntries;
		for (const entry of entries) {
			if (entry.connection.type !== RemoteAgentHostEntryType.SSH || !entry.connection.sshConfigHost) {
				continue;
			}
			const address = getEntryAddress(entry);
			const sshConfigHost = entry.connection.sshConfigHost;
			// Skip if already connected or reconnecting
			const hasConnection = this._remoteAgentHostService.connections.some(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
			);
			if (hasConnection || this._pendingSSHReconnects.has(sshConfigHost)) {
				continue;
			}
			if (!autoConnect) {
				continue;
			}
			this._pendingSSHReconnects.add(sshConfigHost);
			this._logService.info(`[RemoteAgentHost] Re-establishing SSH tunnel for ${sshConfigHost}`);
			this._sshService.reconnect(sshConfigHost, entry.name).then(() => {
				this._pendingSSHReconnects.delete(sshConfigHost);
				this._logService.info(`[RemoteAgentHost] SSH tunnel re-established for ${sshConfigHost}`);
			}).catch(err => {
				this._pendingSSHReconnects.delete(sshConfigHost);
				this._logService.error(`[RemoteAgentHost] SSH reconnect failed for ${sshConfigHost}`, err);
				const provider = this._providerInstances.get(address);
				// Surface protocol-version mismatches on the provider so the
				// workspace picker can show the host's message and the user
				// can read it. Other errors stay as the existing disconnected
				// state.
				const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
				if (incompatible) {
					provider?.setConnectionStatus(incompatible);
				}
				// Host is unreachable — unpublish any cached sessions we
				// were showing so the UI doesn't list stale entries for a
				// host we cannot currently reach.
				provider?.unpublishCachedSessions();
			});
		}
	}

	private _reconcileConnections(): void {
		const currentConnections = this._remoteAgentHostService.connections;
		const connectedAddresses = new Set(
			currentConnections
				.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status))
				.map(c => c.address)
		);
		const allAddresses = new Set(currentConnections.map(c => c.address));

		// Remove contribution state for connections that are no longer present at all
		for (const [address] of this._connections) {
			if (!allAddresses.has(address)) {
				this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
				this._providerInstances.get(address)?.clearConnection();
				this._connections.deleteAndDispose(address);
			} else if (!connectedAddresses.has(address)) {
				// Connection exists but is not connected (reconnecting or disconnected).
				// Keep the contribution state but don't clear the provider —
				// the session cache is preserved during reconnect.
			}
		}

		// Add or update connections
		for (const connectionInfo of currentConnections) {
			// Only set up contribution state for connected entries
			if (!RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
				continue;
			}
			const existing = this._connections.get(connectionInfo.address);
			if (existing) {
				const nameChanged = existing.name !== connectionInfo.name;
				const clientIdChanged = existing.loggedConnection.clientId !== connectionInfo.clientId;

				// If the name or clientId changed, tear down and re-register
				if (nameChanged || clientIdChanged) {
					this._logService.info(`[RemoteAgentHost] Reconnecting contribution for ${connectionInfo.address}: oldClientId=${existing.loggedConnection.clientId}, newClientId=${connectionInfo.clientId}, nameChanged=${nameChanged}`);
					const oldClientId = existing.loggedConnection.clientId;
					this._connections.deleteAndDispose(connectionInfo.address);
					this._setupConnection(connectionInfo);

					// Reconnect active terminals only when the backing
					// client changed. Name-only updates don't invalidate
					// subscriptions and would cause unnecessary buffer
					// clear/replay flicker.
					if (clientIdChanged) {
						const newConnection = this._remoteAgentHostService.getConnection(connectionInfo.address);
						if (newConnection) {
							this._agentHostTerminalService.reconnectTerminals(newConnection, oldClientId).then(
								({ recovered, total }) => {
									if (total > 0) {
										this._logService.info(`[RemoteAgentHost] Terminal reconnection: ${recovered}/${total} recovered`);
										logTerminalRecovery(this._telemetryService, { recoveredCount: recovered, totalCount: total });
									}
								},
								err => this._logService.warn('[RemoteAgentHost] Terminal reconnection failed', err)
							);
						}
					}
				}
			} else {
				this._setupConnection(connectionInfo);
			}
		}
	}

	private _setupConnection(connectionInfo: IRemoteAgentHostConnectionInfo): void {
		const connection = this._remoteAgentHostService.getConnection(connectionInfo.address);
		if (!connection) {
			return;
		}

		const { address, name } = connectionInfo;
		const channelLabel = `Agent Host (${name || address})`;
		const connState = this._instantiationService.createInstance(ConnectionState, name, connection, `agenthost.${connection.clientId}`, channelLabel);
		const loggedConnection = connState.loggedConnection;
		this._connections.set(address, connState);
		const store = connState.store;

		// Track authority -> connection mapping for FS provider routing
		const authority = agentHostAuthority(address);
		store.add(this._agentHostFileSystemService.registerAuthority(authority, connection));

		// React to root state changes (agent discovery)
		store.add(loggedConnection.rootState.onDidChange(rootState => {
			this._handleRootStateChange(address, loggedConnection, rootState);
		}));

		// If root state is already available, process it immediately
		const initialRootState = loggedConnection.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(address, loggedConnection, initialRootState);
		}

		// Wire connection to existing sessions provider
		const provider = this._providerInstances.get(address);
		if (provider) {
			provider.setConnection(loggedConnection, connectionInfo.defaultDirectory);
			// Expose the output channel ID so the workspace picker can offer "Show Output"
			provider.setOutputChannelId(loggedConnection.channelId);
		}
	}

	private _handleRootStateChange(address: string, loggedConnection: LoggingAgentConnection, rootState: RootState): void {
		const connState = this._connections.get(address);
		if (!connState) {
			return;
		}

		const incoming = new Set(rootState.agents.map(a => a.provider));

		// Remove agents no longer present
		for (const [provider] of connState.agents) {
			if (!incoming.has(provider)) {
				connState.agents.deleteAndDispose(provider);
				connState.modelProviders.delete(provider);
			}
		}

		// Authenticate using protectedResources from agent info
		this._authenticateWithConnection(address, loggedConnection, rootState.agents)
			.catch(() => { /* best-effort */ });

		// Register new agents, push model updates to existing ones
		for (const agent of rootState.agents) {
			if (!connState.agents.has(agent.provider)) {
				this._registerAgent(address, loggedConnection, agent, connState.name);
			} else {
				const modelProvider = connState.modelProviders.get(agent.provider);
				modelProvider?.updateModels(agent.models);
			}
		}
	}

	private _registerAgent(address: string, loggedConnection: LoggingAgentConnection, agent: AgentInfo, configuredName: string | undefined): void {
		const connState = this._connections.get(address);
		if (!connState) {
			return;
		}

		const agentStore = new DisposableStore();
		connState.agents.set(agent.provider, agentStore);
		connState.store.add(agentStore);

		const sanitized = agentHostAuthority(address);
		const providerId = `agenthost-${sanitized}`;
		const sessionType = remoteAgentHostSessionTypeId(sanitized, agent.provider);
		const agentId = sessionType;
		const vendor = sessionType;

		// User-facing display name for this agent. We always include the
		// agent's own name so that a host exposing multiple agents (e.g.
		// `copilot` + `openai` from the same machine) produces distinct
		// labels instead of collapsing to a single `configuredName`.
		const hostLabel = configuredName || address;
		const agentLabel = agent.displayName?.trim() || agent.provider;
		const displayName = `${agentLabel} [${hostLabel}]`;

		// Per-agent working directory cache, scoped to the agent store lifetime
		const sessionWorkingDirs = new Map<string, URI>();
		agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));

		// Capture the working directory from the session that is being created.
		const resolveWorkingDirectory = (sessionResource: URI): URI | undefined => {
			const resourceKey = sessionResource.toString();
			const cached = sessionWorkingDirs.get(resourceKey);
			if (cached) {
				return cached;
			}
			const provider = this._sessionsProvidersService.getProvider<RemoteAgentHostSessionsProvider>(providerId);
			const session = provider?.getSessionByResource(sessionResource);
			const repository = session?.workspace.get()?.repositories[0];
			const workingDirectory = repository?.workingDirectory ?? repository?.uri;
			if (workingDirectory) {
				sessionWorkingDirs.set(resourceKey, workingDirectory);
				return workingDirectory;
			}
			return undefined;
		};
		const isNewSession = (sessionResource: URI): boolean => {
			const provider = this._sessionsProvidersService.getProvider<RemoteAgentHostSessionsProvider>(providerId);
			return provider?.getSessionByResource(sessionResource)?.status.get() === SessionStatus.Untitled;
		};

		// Chat session contribution
		agentStore.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
			supportsDelegation: false,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
			},
		}));

		// Customization harness for this remote agent
		const pluginController = agentStore.add(new RemoteAgentPluginController(
			hostLabel,
			sanitized,
			loggedConnection,
			this._fileDialogService,
			this._notificationService,
			this._customizationWorkspaceService,
		));
		const itemProvider = agentStore.add(new RemoteAgentCustomizationItemProvider(agent, loggedConnection, sanitized, pluginController, this._fileService, this._logService));
		const syncProvider = agentStore.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
		const harnessDescriptor = createRemoteAgentHarnessDescriptor(sessionType, displayName, pluginController, itemProvider, syncProvider);
		agentStore.add(this._customizationHarnessService.registerExternalHarness(harnessDescriptor));

		// Bundler for packaging individual files into a virtual Open Plugin
		const bundler = agentStore.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));

		// Agent-level customizations observable
		const customizations = observableValue<CustomizationRef[]>('agentCustomizations', []);
		const updateCustomizations = async () => {
			const refs = await resolveCustomizationRefs(this._promptsService, syncProvider, this._agentPluginService, bundler, sessionType);
			customizations.set(refs, undefined);
		};
		agentStore.add(syncProvider.onDidChange(() => updateCustomizations()));
		agentStore.add(Event.any(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
		)(() => updateCustomizations()));
		updateCustomizations(); // resolve initial state

		// Session handler (unified)
		const sessionHandler = agentStore.add(this._instantiationService.createInstance(
			AgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: displayName,
			description: agent.description,
			connection: loggedConnection,
			connectionAuthority: sanitized,
			extensionId: 'vscode.remote-agent-host',
			extensionDisplayName: 'Remote Agent Host',
			resolveWorkingDirectory,
			isNewSession,
			resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(address, loggedConnection, resources),
			customizations,
		}));
		agentStore.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider.
		// Order matters: `updateModels` must be called after
		// `registerLanguageModelProvider` so the initial `onDidChange` is observed.
		const vendorDescriptor = { vendor, displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		agentStore.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = agentStore.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		connState.modelProviders.set(agent.provider, modelProvider);
		agentStore.add(toDisposable(() => connState.modelProviders.delete(agent.provider)));
		agentStore.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
		modelProvider.updateModels(agent.models);

		this._logService.info(`[RemoteAgentHost] Registered agent ${agent.provider} from ${address} as ${sessionType}`);
	}

	private _authenticateAllConnections(): void {
		for (const [address, connState] of this._connections) {
			const rootState = connState.loggedConnection.rootState.value;
			if (rootState && !(rootState instanceof Error)) {
				this._authenticateWithConnection(address, connState.loggedConnection, rootState.agents).catch(() => { /* best-effort */ });
			}
		}
	}

	/**
	 * Authenticate using protectedResources from agent info in root state.
	 * Resolves tokens via the standard VS Code authentication service.
	 *
	 * Marks the matching provider's `authenticationPending` observable while
	 * the auth pass is in flight so that sessions surface as still loading.
	 */
	private async _authenticateWithConnection(address: string, loggedConnection: LoggingAgentConnection, agents: readonly AgentInfo[]): Promise<void> {
		const providerId = `agenthost-${agentHostAuthority(address)}`;
		const provider = this._sessionsProvidersService.getProvider<RemoteAgentHostSessionsProvider>(providerId);
		const authTokenCache = this._connections.get(address)?.authTokenCache;
		provider?.setAuthenticationPending(true);
		try {
			await authenticateProtectedResources(agents, {
				authTokenCache,
				authenticationService: this._authenticationService,
				logPrefix: '[RemoteAgentHost]',
				logService: this._logService,
				authenticate: request => loggedConnection.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[RemoteAgentHost] Failed to authenticate with connection', err);
			loggedConnection.logError('authenticateWithConnection', err);
		} finally {
			provider?.setAuthenticationPending(false);
		}
	}

	/**
	 * Interactively prompt the user to authenticate when the server requires it.
	 * Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(address: string, loggedConnection: LoggingAgentConnection, protectedResources: readonly ProtectedResourceMetadata[]): Promise<boolean> {
		const authTokenCache = this._connections.get(address)?.authTokenCache;
		try {
			return await resolveAuthenticationInteractively(protectedResources, {
				authTokenCache,
				authenticationService: this._authenticationService,
				logPrefix: '[RemoteAgentHost]',
				logService: this._logService,
				authenticate: request => loggedConnection.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[RemoteAgentHost] Interactive authentication failed', err);
			loggedConnection.logError('resolveAuthenticationInteractively', err);
		}
		return false;
	}
}

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);

registerAction2(OpenSessionEventsFileAction);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[RemoteAgentHostsEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
			default: product.quality !== 'stable',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[RemoteAgentHostAutoConnectSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.remoteAgentHosts.autoConnect', "Automatically connect to online dev tunnel and SSH-configured remote agent hosts on startup. When disabled, cached sessions are still shown but connections are established only on demand."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		'chat.sshRemoteAgentHostCommand': {
			type: 'string',
			description: nls.localize('chat.sshRemoteAgentHostCommand', "For development: Override the command used to start the remote agent host over SSH. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr./"),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		'chat.agentHost.forwardSSHAgent': {
			type: 'boolean',
			description: nls.localize('chat.agentHost.forwardSSHAgent', "When enabled, forwards the local SSH agent to the remote machine during SSH agent host connections to hosts whose SSH config has `ForwardAgent yes`. Only enable this for trusted hosts. The remote agent host process must be restarted for this setting to take effect."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[RemoteAgentHostsSettingId]: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					address: { type: 'string', description: nls.localize('chat.remoteAgentHosts.address', "The address of the remote agent host (e.g. \"localhost:3000\").") },
					name: { type: 'string', description: nls.localize('chat.remoteAgentHosts.name', "A display name for this remote agent host.") },
					connectionToken: { type: 'string', description: nls.localize('chat.remoteAgentHosts.connectionToken', "An optional connection token for authenticating with the remote agent host.") },
					sshConfigHost: { type: 'string', description: nls.localize('chat.remoteAgentHosts.sshConfigHost', "SSH config host alias for automatic reconnection via SSH tunnel.") },
				},
				required: ['address', 'name'],
			},
			description: nls.localize('chat.remoteAgentHosts', "A list of remote agent host addresses to connect to (e.g. \"localhost:3000\")."),
			default: [],
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[TunnelAgentHostsSettingId]: {
			type: 'array',
			items: { type: 'string' },
			description: nls.localize('chat.remoteAgentTunnels', "Additional dev tunnel names to look for when connecting to remote agent hosts. These are looked up in addition to tunnels automatically enumerated from your account."),
			default: [],
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostLocalFilePermissionsSettingId]: {
			type: 'object',
			description: nls.localize('chat.agentHost.localFilePermissions', "Per-host filesystem grants for remote agent hosts. Maps a remote agent host address to URI strings and the access mode the host has been granted (`r` for read, `rw` for read and write). Hosts cannot read or write any files outside the granted URIs without prompting; a URI grant covers descendants. This setting is normally maintained by the agent-host permission prompts and rarely edited by hand."),
			additionalProperties: {
				type: 'object',
				additionalProperties: {
					type: 'string',
					enum: ['r', 'rw'],
					enumDescriptions: [
						nls.localize('chat.agentHost.localFilePermissions.read', "Read-only access."),
						nls.localize('chat.agentHost.localFilePermissions.readWrite', "Read and write access."),
					],
				},
			},
			default: {},
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
	},
});

// Side-effect registrations for the remote agent host feature
import './remoteAgentHostActions.js';
import './manageRemoteAgentHosts.js';
import '../../chat/browser/agentHost/agentHostModelPicker.js';
