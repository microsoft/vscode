/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { AgentCustomizationSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';
import { resolveTokenForResource } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { AgentHostLanguageModelProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { LoggingAgentConnection } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
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
    constructor(clientId, name, logService, loggedConnection) {
        super();
        this.name = name;
        this.store = this._register(new DisposableStore());
        this.agents = this._register(new DisposableMap());
        this.modelProviders = new Map();
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
let RemoteAgentHostContribution = class RemoteAgentHostContribution extends Disposable {
    static { this.ID = 'sessions.contrib.remoteAgentHostContribution'; }
    constructor(_remoteAgentHostService, _chatSessionsService, _languageModelsService, _logService, _instantiationService, _authenticationService, _defaultAccountService, _sessionsManagementService, _sessionsProvidersService, _configurationService, _agentHostFileSystemService, _sshService, _customizationHarnessService, _storageService, _agentPluginService) {
        super();
        this._remoteAgentHostService = _remoteAgentHostService;
        this._chatSessionsService = _chatSessionsService;
        this._languageModelsService = _languageModelsService;
        this._logService = _logService;
        this._instantiationService = _instantiationService;
        this._authenticationService = _authenticationService;
        this._defaultAccountService = _defaultAccountService;
        this._sessionsManagementService = _sessionsManagementService;
        this._sessionsProvidersService = _sessionsProvidersService;
        this._configurationService = _configurationService;
        this._agentHostFileSystemService = _agentHostFileSystemService;
        this._sshService = _sshService;
        this._customizationHarnessService = _customizationHarnessService;
        this._storageService = _storageService;
        this._agentPluginService = _agentPluginService;
        /** Per-connection state: client state + per-agent registrations. */
        this._connections = this._register(new DisposableMap());
        /** Per-address sessions providers, registered for all configured entries. */
        this._providerStores = this._register(new DisposableMap());
        this._providerInstances = new Map();
        this._pendingSSHReconnects = new Set();
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
    _reconcile() {
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
            }
            else {
                provider.setConnectionStatus("disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */);
            }
        }
    }
    _reconcileProviders() {
        const enabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
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
    _createProvider(entry) {
        const store = new DisposableStore();
        const provider = this._instantiationService.createInstance(RemoteAgentHostSessionsProvider, { address: entry.address, name: entry.name });
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
    _reconnectSSHEntries() {
        const entries = this._remoteAgentHostService.configuredEntries;
        for (const entry of entries) {
            if (!entry.sshConfigHost) {
                continue;
            }
            // Skip if already connected or reconnecting
            const hasConnection = this._remoteAgentHostService.connections.some(c => c.address === entry.address && c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */);
            if (hasConnection || this._pendingSSHReconnects.has(entry.sshConfigHost)) {
                continue;
            }
            this._pendingSSHReconnects.add(entry.sshConfigHost);
            this._logService.info(`[RemoteAgentHost] Re-establishing SSH tunnel for ${entry.sshConfigHost}`);
            this._sshService.reconnect(entry.sshConfigHost, entry.name).then(() => {
                this._pendingSSHReconnects.delete(entry.sshConfigHost);
                this._logService.info(`[RemoteAgentHost] SSH tunnel re-established for ${entry.sshConfigHost}`);
            }).catch(err => {
                this._pendingSSHReconnects.delete(entry.sshConfigHost);
                this._logService.error(`[RemoteAgentHost] SSH reconnect failed for ${entry.sshConfigHost}`, err);
            });
        }
    }
    _reconcileConnections() {
        const currentConnections = this._remoteAgentHostService.connections;
        const connectedAddresses = new Set(currentConnections
            .filter(c => c.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */)
            .map(c => c.address));
        const allAddresses = new Set(currentConnections.map(c => c.address));
        // Remove contribution state for connections that are no longer present at all
        for (const [address] of this._connections) {
            if (!allAddresses.has(address)) {
                this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
                this._providerInstances.get(address)?.clearConnection();
                this._connections.deleteAndDispose(address);
            }
            else if (!connectedAddresses.has(address)) {
                // Connection exists but is not connected (reconnecting or disconnected).
                // Keep the contribution state but don't clear the provider —
                // the session cache is preserved during reconnect.
            }
        }
        // Add or update connections
        for (const connectionInfo of currentConnections) {
            // Only set up contribution state for connected entries
            if (connectionInfo.status !== "connected" /* RemoteAgentHostConnectionStatus.Connected */) {
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
            }
            else {
                this._setupConnection(connectionInfo);
            }
        }
    }
    _setupConnection(connectionInfo) {
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
        this._authenticateWithConnection(loggedConnection).then(() => loggedConnection.refreshModels()).catch(() => { });
        // Wire connection to existing sessions provider
        this._providerInstances.get(address)?.setConnection(loggedConnection, connectionInfo.defaultDirectory);
        // Expose the output channel ID so the workspace picker can offer "Show Output"
        this._providerInstances.get(address)?.setOutputChannelId(channelId);
    }
    _handleRootStateChange(address, loggedConnection, rootState) {
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
            }
            else {
                const modelProvider = connState.modelProviders.get(agent.provider);
                modelProvider?.updateModels(agent.models);
            }
        }
    }
    _registerAgent(address, loggedConnection, agent, configuredName) {
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
        const sessionWorkingDirs = new Map();
        agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));
        // Capture the working directory from the active session for new sessions
        const resolveWorkingDirectory = (resourceKey) => {
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
            capabilities: {
                supportsCheckpoints: true,
            },
        }));
        // Customization harness for this remote agent
        const itemProvider = agentStore.add(new RemoteAgentCustomizationItemProvider(agent, connState.clientState));
        const syncProvider = agentStore.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
        const harnessDescriptor = createRemoteAgentHarnessDescriptor(sessionType, displayName, itemProvider, syncProvider);
        agentStore.add(this._customizationHarnessService.registerExternalHarness(harnessDescriptor));
        // Bundler for packaging individual files into a virtual Open Plugin
        const bundler = agentStore.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));
        // Agent-level customizations observable
        const customizations = observableValue('agentCustomizations', []);
        const updateCustomizations = async () => {
            const refs = await this._resolveCustomizations(syncProvider, bundler);
            customizations.set(refs, undefined);
        };
        agentStore.add(syncProvider.onDidChange(() => updateCustomizations()));
        updateCustomizations(); // resolve initial state
        // Session handler (unified)
        const sessionHandler = agentStore.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
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
    async _resolveCustomizations(syncProvider, bundler) {
        const entries = syncProvider.getSelectedEntries();
        if (entries.length === 0) {
            return [];
        }
        const plugins = this._agentPluginService.plugins.get();
        const refs = [];
        const individualFiles = [];
        for (const entry of entries) {
            const plugin = plugins.find(p => isEqualOrParent(entry.uri, p.uri));
            if (plugin) {
                refs.push({
                    uri: plugin.uri.toString(),
                    displayName: plugin.label,
                });
            }
            else if (entry.type) {
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
    _authenticateAllConnections() {
        for (const [, connState] of this._connections) {
            this._authenticateWithConnection(connState.loggedConnection).then(() => connState.loggedConnection.refreshModels()).catch(() => { });
        }
    }
    /**
     * Discover auth requirements from the connection's resource metadata
     * and authenticate using matching tokens resolved via the standard
     * VS Code authentication service (same flow as MCP auth).
     */
    async _authenticateWithConnection(loggedConnection) {
        try {
            const metadata = await loggedConnection.getResourceMetadata();
            for (const resource of metadata.resources) {
                const resourceUri = URI.parse(resource.resource);
                const token = await this._resolveTokenForResource(resourceUri, resource.authorization_servers ?? [], resource.scopes_supported ?? []);
                if (token) {
                    this._logService.info(`[RemoteAgentHost] Authenticating for resource: ${resource.resource}`);
                    await loggedConnection.authenticate({ resource: resource.resource, token });
                }
                else {
                    this._logService.info(`[RemoteAgentHost] No token resolved for resource: ${resource.resource}`);
                }
            }
        }
        catch (err) {
            this._logService.error('[RemoteAgentHost] Failed to authenticate with connection', err);
            loggedConnection.logError('authenticateWithConnection', err);
        }
    }
    /**
     * Resolve a bearer token for a set of authorization servers using the
     * standard VS Code authentication service provider resolution.
     */
    _resolveTokenForResource(resourceServer, authorizationServers, scopes) {
        return resolveTokenForResource(resourceServer, authorizationServers, scopes, this._authenticationService, this._logService, '[RemoteAgentHost]');
    }
    /**
     * Interactively prompt the user to authenticate when the server requires it.
     * Returns true if authentication succeeded.
     */
    async _resolveAuthenticationInteractively(loggedConnection) {
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
        }
        catch (err) {
            this._logService.error('[RemoteAgentHost] Interactive authentication failed', err);
            loggedConnection.logError('resolveAuthenticationInteractively', err);
        }
        return false;
    }
};
RemoteAgentHostContribution = __decorate([
    __param(0, IRemoteAgentHostService),
    __param(1, IChatSessionsService),
    __param(2, ILanguageModelsService),
    __param(3, ILogService),
    __param(4, IInstantiationService),
    __param(5, IAuthenticationService),
    __param(6, IDefaultAccountService),
    __param(7, ISessionsManagementService),
    __param(8, ISessionsProvidersService),
    __param(9, IConfigurationService),
    __param(10, IAgentHostFileSystemService),
    __param(11, ISSHRemoteAgentHostService),
    __param(12, ICustomizationHarnessService),
    __param(13, IStorageService),
    __param(14, IAgentPluginService)
], RemoteAgentHostContribution);
export { RemoteAgentHostContribution };
registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, 3 /* WorkbenchPhase.AfterRestored */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    properties: {
        [RemoteAgentHostsEnabledSettingId]: {
            type: 'boolean',
            description: nls.localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
            default: false,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['experimental', 'advanced'],
        },
        'chat.sshRemoteAgentHostCommand': {
            type: 'string',
            description: nls.localize('chat.sshRemoteAgentHostCommand', "For development: Override the command used to start the remote agent host over SSH. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr./"),
            default: '',
            scope: 1 /* ConfigurationScope.APPLICATION */,
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
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['experimental', 'advanced'],
        },
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0LmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvcmVtb3RlQWdlbnRIb3N0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0LmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUUzRixPQUFPLEVBQXlELHVCQUF1QixFQUFtQyxnQ0FBZ0MsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRS9QLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN2RyxPQUFPLEVBQUUsY0FBYyxFQUE0RCxNQUFNLDZEQUE2RCxDQUFDO0FBQ3ZKLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBc0IsVUFBVSxJQUFJLHVCQUF1QixFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3ZLLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFB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