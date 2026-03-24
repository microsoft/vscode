/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { AgentHostFileSystemProvider } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { type AgentProvider, type IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI, type IAgentInfo, type IRootState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { resolveTokenForResource } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { AgentHostLanguageModelProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { AgentHostSessionListController } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionListController.js';
import { LoggingAgentConnection } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { ISessionsManagementService } from '../../../contrib/sessions/browser/sessionsManagementService.js';

/**
 * Given a sanitized URI authority, resolves the corresponding agent host
 * session target string by looking up the matching connection.
 *
 * Returns `undefined` if no connection matches the authority.
 */
export function getRemoteAgentHostSessionTarget(
	connections: readonly IRemoteAgentHostConnectionInfo[],
	authority: string,
): AgentSessionTarget | undefined {
	for (const conn of connections) {
		if (agentHostAuthority(conn.address) === authority) {
			return `remote-${agentHostAuthority(conn.address)}-copilot`;
		}
	}
	return undefined;
}

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
		this.clientState = this.store.add(new SessionClientState(clientId, logService));
		this.loggedConnection = this.store.add(loggedConnection);
	}
}

/**
 * Discovers available agents from each connected remote agent host and
 * dynamically registers each one as a chat session type with its own
 * session handler, list controller, and language model provider.
 *
 * Uses the same unified {@link AgentHostSessionHandler} and
 * {@link AgentHostSessionListController} as the local agent host,
 * obtaining per-connection {@link IAgentConnection} instances from
 * {@link IRemoteAgentHostService.getConnection}.
 */
export class RemoteAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.remoteAgentHostContribution';

	/** Per-connection state: client state + per-agent registrations. */
	private readonly _connections = this._register(new DisposableMap<string, ConnectionState>());

	/** Maps sanitized authority strings back to original addresses. */
	private readonly _fsProvider: AgentHostFileSystemProvider;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		super();

		// Register a single read-only filesystem provider for all remote agent
		// hosts. Individual connections are identified by the URI authority.
		this._fsProvider = this._register(new AgentHostFileSystemProvider());
		this._register(this._fileService.registerProvider(AGENT_HOST_SCHEME, this._fsProvider));

		// Display agent-host URIs with the original file path
		this._register(this._labelService.registerFormatter(AGENT_HOST_LABEL_FORMATTER));

		// Reconcile when connections change (added/removed/reconnected)
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._reconcileConnections();
		}));

		// Push auth token whenever the default account or sessions change
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._authenticateAllConnections()));
		this._register(this._authenticationService.onDidChangeSessions(() => this._authenticateAllConnections()));

		// Initial setup for already-connected remotes
		this._reconcileConnections();
	}

	private _reconcileConnections(): void {
		const currentAddresses = new Set(this._remoteAgentHostService.connections.map(c => c.address));

		// Remove connections no longer present
		for (const [address] of this._connections) {
			if (!currentAddresses.has(address)) {
				this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
				this._connections.deleteAndDispose(address);
			}
		}

		// Add or update connections
		for (const connectionInfo of this._remoteAgentHostService.connections) {
			const existing = this._connections.get(connectionInfo.address);
			if (existing) {
				// If the name changed, tear down and re-register with new name
				if (existing.name !== connectionInfo.name) {
					this._logService.info(`[RemoteAgentHost] Name changed for ${connectionInfo.address}: ${existing.name} -> ${connectionInfo.name}`);
					this._connections.deleteAndDispose(connectionInfo.address);
					this._setupConnection(connectionInfo.address, connectionInfo.name);
				}
			} else {
				this._setupConnection(connectionInfo.address, connectionInfo.name);
			}
		}
	}

	private _setupConnection(address: string, name: string | undefined): void {
		const connection = this._remoteAgentHostService.getConnection(address);
		if (!connection) {
			return;
		}

		const sanitized = agentHostAuthority(address);
		const channelId = `agentHostIpc.remote.${sanitized}`;
		const channelLabel = `Agent Host (${name || address})`;
		const loggedConnection = this._instantiationService.createInstance(LoggingAgentConnection, connection, channelId, channelLabel);
		const connState = new ConnectionState(connection.clientId, name, this._logService, loggedConnection);
		this._connections.set(address, connState);
		const store = connState.store;

		// Track authority -> connection mapping for FS provider routing
		const authority = agentHostAuthority(address);
		store.add(this._fsProvider.registerAuthority(authority, connection));

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

		// Authenticate with this new connection
		this._authenticateWithConnection(loggedConnection);
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
		const sessionWorkingDirs = new Map<string, string>();
		agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));

		// Capture the working directory from the active session for new sessions
		const resolveWorkingDirectory = (resourceKey: string): string | undefined => {
			const cached = sessionWorkingDirs.get(resourceKey);
			if (cached) {
				return cached;
			}
			const activeSessionItem = this._sessionsManagementService.getActiveSession();
			if (activeSessionItem?.repository) {
				// The repository URI's path is the remote filesystem path
				// (set via agentHostRemotePath in the folder picker callback)
				const dir = activeSessionItem.repository.path;
				sessionWorkingDirs.set(resourceKey, dir);
				return dir;
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

		// Session list controller (unified)
		const listController = agentStore.add(this._instantiationService.createInstance(
			AgentHostSessionListController, sessionType, agent.provider, loggedConnection, displayName));
		agentStore.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));

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

	private _authenticateAllConnections(): void {
		for (const [, connState] of this._connections) {
			this._authenticateWithConnection(connState.loggedConnection);
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
			tags: ['experimental'],
		},
		[RemoteAgentHostsSettingId]: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					address: { type: 'string', description: nls.localize('chat.remoteAgentHosts.address', "The address of the remote agent host (e.g. \"localhost:3000\").") },
					name: { type: 'string', description: nls.localize('chat.remoteAgentHosts.name', "A display name for this remote agent host.") },
					connectionToken: { type: 'string', description: nls.localize('chat.remoteAgentHosts.connectionToken', "An optional connection token for authenticating with the remote agent host.") },
				},
				required: ['address', 'name'],
			},
			description: nls.localize('chat.remoteAgentHosts', "A list of remote agent host addresses to connect to (e.g. \"localhost:3000\")."),
			default: [],
			tags: ['experimental', 'advanced'],
		},
	},
});
