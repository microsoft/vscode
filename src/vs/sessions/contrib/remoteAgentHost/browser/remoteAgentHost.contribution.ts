/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { type AgentProvider, type IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { type URI as ProtocolURI } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI, type IAgentInfo, type ICustomizationRef, type IRootState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AgentCustomizationSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';
import { resolveTokenForResource } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { AgentHostLanguageModelProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { LoggingAgentConnection } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IAgentHostFileSystemService } from '../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { ISessionsManagementService } from '../../../contrib/sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { createRemoteAgentHarnessDescriptor, RemoteAgentCustomizationItemProvider } from './remoteAgentHostCustomizationHarness.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
import { ISSHRemoteAgentHostService } from '../../../../platform/agentHost/common/sshRemoteAgentHost.js';

/** Per-connection state bundle, disposed when a connection is removed. */
class ConnectionState extends Disposable {
	readonly store = this._register(new DisposableStore());
	readonly clientState: SessionClientState;
	readonly agents = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	readonly modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();
	readonly loggedConnection: LoggingAgentConnection;

	constructor(
		clientId: string,
		readonly name: string | undefined,
		logService: ILogService,
		loggedConnection: LoggingAgentConnection,
	) {
		super();
		this.clientState = this.store.add(new SessionClientState(clientId, logService, () => loggedConnection.nextClientSeq()));
		this.loggedConnection = this.store.add(loggedConnection);
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

	/** Per-address sessions providers, registered for all configured entries. */
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
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostFileSystemService private readonly _agentHostFileSystemService: IAgentHostFileSystemService,
		@ISSHRemoteAgentHostService private readonly _sshService: ISSHRemoteAgentHostService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
	) {
		super();

		// Reconcile providers when configured entries change
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
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
		// change) while a connection for that address already existed.
		for (const [address, connState] of this._connections) {
			const provider = this._providerInstances.get(address);
			if (provider) {
				const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
				provider.setConnection(connState.loggedConnection, connectionInfo?.defaultDirectory);
			}
		}

		// Update connection status on all providers (including those
		// that are reconnecting and don't have an active connection).
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo) {
				provider.setConnectionStatus(connectionInfo.status);
			} else {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.Disconnected);
			}
		}
	}

	private _reconcileProviders(): void {
		const enabled = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		const entries = enabled ? this._remoteAgentHostService.configuredEntries : [];
		const desiredAddresses = new Set(entries.map(e => e.address));

		// Remove providers no longer configured
		for (const [address] of this._providerStores) {
			if (!desiredAddresses.has(address)) {
				this._providerStores.deleteAndDispose(address);
			}
		}

		// Add or recreate providers for configured entries
		for (const entry of entries) {
			const existing = this._providerInstances.get(entry.address);
			if (existing && existing.label !== (entry.name || entry.address)) {
				// Name changed — recreate since ISessionsProvider.label is readonly
				this._providerStores.deleteAndDispose(entry.address);
			}
			if (!this._providerStores.has(entry.address)) {
				this._createProvider(entry);
			}
		}
	}

	private _createProvider(entry: IRemoteAgentHostEntry): void {
		const store = new DisposableStore();
		const provider = this._instantiationService.createInstance(
			RemoteAgentHostSessionsProvider, { address: entry.address, name: entry.name });
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		this._providerInstances.set(entry.address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(entry.address)));
		this._providerStores.set(entry.address, store);
	}

	/**
	 * Re-establish SSH connections for configured entries that have an
	 * sshConfigHost but no active connection.
	 */
	private _reconnectSSHEntries(): void {
		const entries = this._remoteAgentHostService.configuredEntries;
		for (const entry of entries) {
			if (!entry.sshConfigHost) {
				continue;
			}
			// Skip if already connected or reconnecting
			const hasConnection = this._remoteAgentHostService.connections.some(
				c => c.address === entry.address && c.status === RemoteAgentHostConnectionStatus.Connected
			);
			if (hasConnection || this._pendingSSHReconnects.has(entry.sshConfigHost)) {
				continue;
			}
			this._pendingSSHReconnects.add(entry.sshConfigHost);
			this._logService.info(`[RemoteAgentHost] Re-establishing SSH tunnel for ${entry.sshConfigHost}`);
			this._sshService.reconnect(entry.sshConfigHost, entry.name).then(() => {
				this._pendingSSHReconnects.delete(entry.sshConfigHost!);
				this._logService.info(`[RemoteAgentHost] SSH tunnel re-established for ${entry.sshConfigHost}`);
			}).catch(err => {
				this._pendingSSHReconnects.delete(entry.sshConfigHost!);
				this._logService.error(`[RemoteAgentHost] SSH reconnect failed for ${entry.sshConfigHost}`, err);
			});
		}
	}

	private _reconcileConnections(): void {
		const currentConnections = this._remoteAgentHostService.connections;
		const connectedAddresses = new Set(
			currentConnections
				.filter(c => c.status === RemoteAgentHostConnectionStatus.Connected)
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
			if (connectionInfo.status !== RemoteAgentHostConnectionStatus.Connected) {
				continue;
			}
			const existing = this._connections.get(connectionInfo.address);
			if (existing) {
				// If the name or clientId changed, tear down and re-register
				if (existing.name !== connectionInfo.name || existing.clientState.clientId !== connectionInfo.clientId) {
					this._logService.info(`[RemoteAgentHost] Reconnecting contribution for ${connectionInfo.address}`);
					this._connections.deleteAndDispose(connectionInfo.address);
					this._setupConnection(connectionInfo);
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
		const sanitized = agentHostAuthority(address);
		const channelId = `agentHostIpc.remote.${sanitized}`;
		const channelLabel = `Agent Host (${name || address})`;
		const loggedConnection = this._instantiationService.createInstance(LoggingAgentConnection, connection, channelId, channelLabel);
		const connState = new ConnectionState(connection.clientId, name, this._logService, loggedConnection);
		this._connections.set(address, connState);
		const store = connState.store;

		// Track authority -> connection mapping for FS provider routing
		const authority = agentHostAuthority(address);
		store.add(this._agentHostFileSystemService.registerAuthority(authority, connection));

		// Forward non-session actions to client state
		store.add(loggedConnection.onDidAction(envelope => {
			if (!isSessionAction(envelope.action)) {
				connState.clientState.receiveEnvelope(envelope);
			}
		}));

		// Forward notifications to client state
		store.add(loggedConnection.onDidNotification(n => {
			connState.clientState.receiveNotification(n);
		}));

		// React to root state changes (agent discovery)
		store.add(connState.clientState.onDidChangeRootState(rootState => {
			this._handleRootStateChange(address, loggedConnection, rootState);
		}));

		// Subscribe to root state
		loggedConnection.subscribe(URI.parse(ROOT_STATE_URI)).then(snapshot => {
			if (store.isDisposed) {
				return;
			}
			connState.clientState.handleSnapshot(ROOT_STATE_URI, snapshot.state, snapshot.fromSeq);
		}).catch(err => {
			this._logService.error(`[RemoteAgentHost] Failed to subscribe to root state for ${address}`, err);
			loggedConnection.logError('subscribe(root)', err);
		});

		// Authenticate with this new connection and refresh models afterward
		this._authenticateWithConnection(loggedConnection).then(() => loggedConnection.refreshModels()).catch(() => { /* best-effort */ });

		// Wire connection to existing sessions provider
		this._providerInstances.get(address)?.setConnection(loggedConnection, connectionInfo.defaultDirectory);

		// Expose the output channel ID so the workspace picker can offer "Show Output"
		this._providerInstances.get(address)?.setOutputChannelId(channelId);
	}

	private _handleRootStateChange(address: string, loggedConnection: LoggingAgentConnection, rootState: IRootState): void {
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

	private _registerAgent(address: string, loggedConnection: LoggingAgentConnection, agent: IAgentInfo, configuredName: string | undefined): void {
		// Only register copilot agents; other provider types are not supported
		if (agent.provider !== 'copilot') {
			this._logService.warn(`[RemoteAgentHost] Ignoring unsupported agent provider '${agent.provider}' from ${address}`);
			return;
		}

		const connState = this._connections.get(address);
		if (!connState) {
			return;
		}

		const agentStore = new DisposableStore();
		connState.agents.set(agent.provider, agentStore);
		connState.store.add(agentStore);

		const sanitized = agentHostAuthority(address);
		const sessionType = `remote-${sanitized}-${agent.provider}`;
		const agentId = sessionType;
		const vendor = sessionType;

		const displayName = configuredName || `${agent.displayName} (${address})`;

		// Per-agent working directory cache, scoped to the agent store lifetime
		const sessionWorkingDirs = new Map<string, URI>();
		agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));

		// Capture the working directory from the active session for new sessions
		const resolveWorkingDirectory = (resourceKey: string): URI | undefined => {
			const cached = sessionWorkingDirs.get(resourceKey);
			if (cached) {
				return cached;
			}
			const activeSession = this._sessionsManagementService.activeSession.get();
			const repoUri = activeSession?.workspace.get()?.repositories[0]?.uri;
			if (repoUri) {
				sessionWorkingDirs.set(resourceKey, repoUri);
				return repoUri;
			}
			return undefined;
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
		}));

		// Customization harness for this remote agent
		const itemProvider = agentStore.add(new RemoteAgentCustomizationItemProvider(agent, connState.clientState));
		const syncProvider = agentStore.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
		const harnessDescriptor = createRemoteAgentHarnessDescriptor(sessionType, displayName, itemProvider, syncProvider);
		agentStore.add(this._customizationHarnessService.registerExternalHarness(harnessDescriptor));

		// Bundler for packaging individual files into a virtual Open Plugin
		const bundler = agentStore.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));

		// Agent-level customizations observable
		const customizations = observableValue<ICustomizationRef[]>('agentCustomizations', []);
		const updateCustomizations = async () => {
			const refs = await this._resolveCustomizations(syncProvider, bundler);
			customizations.set(refs, undefined);
		};
		agentStore.add(syncProvider.onDidChange(() => updateCustomizations()));
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
			resolveAuthentication: () => this._resolveAuthenticationInteractively(loggedConnection),
			customizations,
		}));
		agentStore.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider
		const vendorDescriptor = { vendor, displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		agentStore.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = agentStore.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		modelProvider.updateModels(agent.models);
		connState.modelProviders.set(agent.provider, modelProvider);
		agentStore.add(toDisposable(() => connState.modelProviders.delete(agent.provider)));
		agentStore.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));

		this._logService.info(`[RemoteAgentHost] Registered agent ${agent.provider} from ${address} as ${sessionType}`);
	}

	/**
	 * Resolves the customizations to include in the active client set.
	 *
	 * Entries are classified as either:
	 * - **Plugin**: A selected URI matches an installed plugin's root URI.
	 * - **Individual file**: All other selected files are bundled into a
	 *   synthetic Open Plugin via {@link SyncedCustomizationBundler}.
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

	private _authenticateAllConnections(): void {
		for (const [, connState] of this._connections) {
			this._authenticateWithConnection(connState.loggedConnection).then(() => connState.loggedConnection.refreshModels()).catch(() => { /* best-effort */ });
		}
	}

	/**
	 * Discover auth requirements from the connection's resource metadata
	 * and authenticate using matching tokens resolved via the standard
	 * VS Code authentication service (same flow as MCP auth).
	 */
	private async _authenticateWithConnection(loggedConnection: LoggingAgentConnection): Promise<void> {
		try {
			const metadata = await loggedConnection.getResourceMetadata();
			for (const resource of metadata.resources) {
				const resourceUri = URI.parse(resource.resource);
				const token = await this._resolveTokenForResource(resourceUri, resource.authorization_servers ?? [], resource.scopes_supported ?? []);
				if (token) {
					this._logService.info(`[RemoteAgentHost] Authenticating for resource: ${resource.resource}`);
					await loggedConnection.authenticate({ resource: resource.resource, token });
				} else {
					this._logService.info(`[RemoteAgentHost] No token resolved for resource: ${resource.resource}`);
				}
			}
		} catch (err) {
			this._logService.error('[RemoteAgentHost] Failed to authenticate with connection', err);
			loggedConnection.logError('authenticateWithConnection', err);
		}
	}

	/**
	 * Resolve a bearer token for a set of authorization servers using the
	 * standard VS Code authentication service provider resolution.
	 */
	private _resolveTokenForResource(resourceServer: URI, authorizationServers: readonly string[], scopes: readonly string[]): Promise<string | undefined> {
		return resolveTokenForResource(resourceServer, authorizationServers, scopes, this._authenticationService, this._logService, '[RemoteAgentHost]');
	}

	/**
	 * Interactively prompt the user to authenticate when the server requires it.
	 * Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(loggedConnection: LoggingAgentConnection): Promise<boolean> {
		try {
			const metadata = await loggedConnection.getResourceMetadata();
			for (const resource of metadata.resources) {
				for (const server of resource.authorization_servers ?? []) {
					const serverUri = URI.parse(server);
					const resourceUri = URI.parse(resource.resource);
					const providerId = await this._authenticationService.getOrActivateProviderIdForServer(serverUri, resourceUri);
					if (!providerId) {
						continue;
					}

					const scopes = [...(resource.scopes_supported ?? [])];
					const session = await this._authenticationService.createSession(providerId, scopes, {
						activateImmediate: true,
						authorizationServer: serverUri,
					});

					await loggedConnection.authenticate({
						resource: resource.resource,
						token: session.accessToken,
					});
					this._logService.info(`[RemoteAgentHost] Interactive authentication succeeded for ${resource.resource}`);
					return true;
				}
			}
		} catch (err) {
			this._logService.error('[RemoteAgentHost] Interactive authentication failed', err);
			loggedConnection.logError('resolveAuthenticationInteractively', err);
		}
		return false;
	}
}

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[RemoteAgentHostsEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
			default: false,
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
	},
});
